# @req FR-19.3 (candidate, CR-005) — Slice B ASR engine: faster-whisper ใน child process ของ supervisor
"""**faster-whisper engine** (CTranslate2) — Slice B ฝั่ง ASR. ไม่ใช้ torch; ไม่มี network fetch (local_files_only)

โปรโตคอลกับ supervisor เหมือน ``engine_stub`` ทุกประการ (hello/heartbeat/started/result, cancel/shutdown)

options ที่ supervisor ส่งมา = manifest.engine_options + ที่ supervisor เติม:
  device (จาก manifest)   "cpu" | "cuda:N" — รายงานกลับเป็น effective_device เฉพาะเมื่อโหลดลงอุปกรณ์นั้นได้จริง
  assets (จาก manifest)   {role: absolute path} — ต้องมี role "model.bin"; โหลดจาก directory ของไฟล์นั้น
  compute_type            int8 | int8_float16 | float16 | float32 (ตรวจใน profile.py)
  beam_size (5)           cpu_threads (0 = ctranslate2 default)
  heartbeat_seconds (0.25)  warmup (True) — ถอดเสียงเงียบ 1 s หลัง hello เพื่อให้ CUDA kernel JIT เสร็จก่อนรับงานจริง
  vad_filter (False) · vad_min_silence_ms (700) · vad_model_sha256 — D14: ตัดช่วงที่ไม่มีคำพูดก่อนเข้า decoder
      ถ้าเปิด engine ตรวจ sha256 ของ silero VAD ที่มากับ wheel และโหลดล่วงหน้าตอนบูต (ไม่ตรง/โหลดไม่ได้ → exit ไม่ส่ง hello)
      เหตุผล: ไม่เปิด VAD → ความเงียบ/noise/โทน/ฮัม ถูกถอดเป็น "ประโยคไทยที่ดูเหมือนจริง" แล้วตอบ SUCCEEDED

fail-closed: import/โหลดโมเดล/อุปกรณ์ไม่ตรง → child exit non-zero โดยไม่ส่ง hello → supervisor รายงาน EngineStartError
Windows: ลงทะเบียน ``<venv>/Lib/site-packages/nvidia/*/bin`` ด้วย ``os.add_dll_directory`` ก่อนแตะ CUDA
"""
from __future__ import annotations

import glob
import os
import queue
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ENGINE_NAME = "faster-whisper"
EXIT_IMPORT = 3
EXIT_MODEL = 4
EXIT_DEVICE = 5
ALLOWED_COMPUTE_TYPES = frozenset({"int8", "int8_float16", "float16", "float32"})

_DEFAULTS: dict[str, Any] = {
    "device": "cpu",
    "assets": {},
    "compute_type": "int8",
    "beam_size": 5,
    "cpu_threads": 0,
    "heartbeat_seconds": 0.25,
    "warmup": True,
    "vad_filter": False,
    "vad_min_silence_ms": 700,
    "vad_model_sha256": None,
}
VAD_ASSET_NAME = "silero_vad_v6.onnx"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _send(conn: Any, message: dict[str, Any]) -> bool:
    try:
        conn.send(message)
        return True
    except (BrokenPipeError, EOFError, OSError):
        return False


def register_cuda_dlls() -> list[str]:
    """Windows: CTranslate2 หา cublas64_12/cudnn64_9 จาก nvidia pip wheels ไม่เจอถ้าไม่เพิ่ม DLL dir (สังเกต 2026-09-20)."""
    added: list[str] = []
    if os.name != "nt":
        return added
    for directory in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
        try:
            os.add_dll_directory(directory)
        except OSError:
            continue
        os.environ["PATH"] = directory + os.pathsep + os.environ.get("PATH", "")
        added.append(directory)
    return added


_OOM_MARKERS = ("out of memory", "bad allocation", "bad_alloc")


def classify_engine_error(exc: BaseException, *, stage: str) -> str:
    """map exception ของ engine → รหัสใน error contract

    - ``RUNTIME_OOM``: ``MemoryError`` (CTranslate2 ยก C++ ``std::bad_alloc`` มาเป็น ``MemoryError("bad allocation")``)
      หรือข้อความ CUDA OOM — เจอจริงระหว่าง A/B 2026-09-21 และเดิมถูกรายงานเป็น ``RUNTIME_FAILED``
    - ``AUDIO_FORMAT_UNSUPPORTED``: ตอน decode (stage="decode") และ exception มาจาก PyAV จริง
      (โมดูล ``av`` หรือ ``av.*`` — เดิมเช็ค ``"av" in module`` ซึ่งจับโมดูลใดก็ได้ที่มีตัวอักษร av)
    - อื่น ๆ: ``RUNTIME_FAILED``
    """
    message = str(exc).lower()
    if isinstance(exc, MemoryError) or any(marker in message for marker in _OOM_MARKERS):
        return "RUNTIME_OOM"
    if stage == "decode":
        module = type(exc).__module__ or ""
        if module == "av" or module.startswith("av.") or "decode" in message:
            return "AUDIO_FORMAT_UNSUPPORTED"
    return "RUNTIME_FAILED"


def _split_device(device: str) -> tuple[str, int]:
    if device == "cpu":
        return "cpu", 0
    if device.startswith("cuda:"):
        return "cuda", int(device.split(":", 1)[1])
    raise ValueError(device)


class _Engine:
    def __init__(self, opts: dict[str, Any]) -> None:
        self.opts = opts
        self.device_str = str(opts["device"])
        self.model: Any = None
        self.model_dir: Path | None = None
        self.version: str | None = None
        self.warm = not bool(opts.get("warmup", True))  # ปิด warm-up = ถือว่าพร้อมทันที (เทส/CPU)
        self.vad_sha256: str | None = None

    # ── load ───────────────────────────────────────────────
    def load(self) -> int:
        register_cuda_dlls()
        try:
            import ctranslate2  # noqa: F401
            import faster_whisper
        except Exception:  # noqa: BLE001 — ไม่มี speech stack ใน venv นี้
            return EXIT_IMPORT
        self.version = getattr(faster_whisper, "__version__", None)
        model_bin = (self.opts.get("assets") or {}).get("model.bin")
        if not model_bin:
            return EXIT_MODEL
        self.model_dir = Path(model_bin).parent
        try:
            kind, index = _split_device(self.device_str)
        except ValueError:
            return EXIT_DEVICE
        if kind == "cuda" and ctranslate2.get_cuda_device_count() <= index:
            return EXIT_DEVICE
        try:
            self.model = faster_whisper.WhisperModel(
                str(self.model_dir),
                device=kind,
                device_index=index,
                compute_type=str(self.opts["compute_type"]),
                cpu_threads=int(self.opts.get("cpu_threads") or 0),
                local_files_only=True,
            )
        except Exception:  # noqa: BLE001 — ckpt เสีย / compute_type ไม่รองรับบนอุปกรณ์ / VRAM ไม่พอ
            return EXIT_MODEL
        if self.opts.get("vad_filter"):
            if not self._load_vad():
                return EXIT_MODEL
        return 0

    def _load_vad(self) -> bool:
        """D14: ตรวจ sha256 ของ VAD ที่มากับ wheel แล้วโหลดตอนบูต — fail-closed ก่อนรับงาน ไม่ใช่ตอน request แรก"""
        import hashlib

        from faster_whisper.utils import get_assets_path

        expected = str(self.opts.get("vad_model_sha256") or "").lower()
        path = Path(get_assets_path()) / VAD_ASSET_NAME
        try:
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:
            return False
        if not expected or actual != expected:
            return False
        try:
            from faster_whisper.vad import get_vad_model

            get_vad_model()  # ต้องมี onnxruntime; cache ไว้ให้ transcribe ใช้
        except Exception:  # noqa: BLE001
            return False
        self.vad_sha256 = actual
        return True

    def residency(self, *, busy: bool = False) -> dict[str, Any]:
        return {
            "engine": ENGINE_NAME,
            "model_loaded": self.model is not None,
            "device": self.device_str,
            "vram_bytes_allocated": None,
            "vram_bytes_reserved": None,
            "warm": self.warm,
            "provenance": "measured" if self.model is not None else "unavailable",
        }

    def warmup(self) -> None:
        import numpy as np

        silence = np.zeros(16000, dtype=np.float32)
        try:
            # vad_filter=False โดยเจตนา: warm-up ป้อนความเงียบ ถ้าเปิด VAD ช่วงนี้จะถูกตัดทิ้งหมด
            # decoder ไม่ได้รัน CUDA kernel ไม่ถูก JIT และ request แรกจะช้า 20 s เหมือนไม่มี warm-up
            segments, _ = self.model.transcribe(silence, language="en", beam_size=1, vad_filter=False)
            for _ in segments:
                pass
        except Exception:  # noqa: BLE001 — warmup ล้มเหลวไม่ใช่เหตุหยุด; งานจริงจะรายงาน RUNTIME_FAILED เอง
            return
        self.warm = True

    # ── one job ────────────────────────────────────────────
    def transcribe(self, payload: dict[str, Any], cancel: threading.Event, deadline: float) -> dict[str, Any]:
        """รันใน worker thread; คืน {"outcome", "result", "error", "audio_seconds"}."""
        language = payload.get("language")
        lang_arg = None if language in (None, "", "auto") else str(language)
        input_path = payload.get("input_path")
        if not input_path or not Path(input_path).is_file():
            return {"outcome": "FAILED", "error": {"code": "RUNTIME_FAILED", "message": "input payload missing at dispatch"}}
        try:
            vad = bool(self.opts.get("vad_filter"))
            kwargs: dict[str, Any] = {"language": lang_arg, "beam_size": int(self.opts.get("beam_size") or 5), "vad_filter": vad}
            if vad:
                kwargs["vad_parameters"] = {"min_silence_duration_ms": int(self.opts.get("vad_min_silence_ms") or 700)}
            prompt = payload.get("initial_prompt")
            if prompt:
                kwargs["initial_prompt"] = str(prompt)  # D15: glossary ของ request นี้ — bias ของ decoder เท่านั้น
            segments_iter, info = self.model.transcribe(input_path, **kwargs)
        except Exception as exc:  # noqa: BLE001 — MemoryError เป็น subclass ของ Exception จึงถูกจับที่นี่
            code = classify_engine_error(exc, stage="decode")
            return {"outcome": "FAILED", "error": {"code": code, "message": f"decode/transcribe failed: {type(exc).__name__}"}}
        max_seconds = float(payload.get("max_audio_seconds") or 0.0)
        if max_seconds and info.duration > max_seconds + 0.5:
            return {"outcome": "FAILED", "error": {"code": "AUDIO_TOO_LARGE", "message": "decoded duration exceeds profile limit"},
                    "audio_seconds": float(info.duration)}
        segments: list[dict[str, Any]] = []
        try:
            for segment in segments_iter:
                if cancel.is_set():
                    return {"outcome": "CANCELLED", "error": {"code": "CANCEL_REQUESTED", "message": "cancelled cooperatively by engine"},
                            "audio_seconds": float(info.duration)}
                if time.monotonic() >= deadline:
                    return {"outcome": "FAILED", "error": {"code": "DEADLINE_EXCEEDED", "message": "engine budget exhausted before completion"},
                            "audio_seconds": float(info.duration)}
                segments.append({"start": round(float(segment.start), 3), "end": round(float(segment.end), 3), "text": segment.text.strip()})
        except Exception as exc:  # noqa: BLE001
            code = classify_engine_error(exc, stage="generate")
            return {"outcome": "FAILED", "error": {"code": code, "message": f"transcribe failed: {type(exc).__name__}"},
                    "audio_seconds": float(info.duration)}
        text = " ".join(s["text"] for s in segments if s["text"]).strip()
        if not text:
            return {"outcome": "FAILED", "error": {"code": "NO_SPEECH", "message": "no speech recognised in input"},
                    "audio_seconds": float(info.duration)}
        return {
            "outcome": "SUCCEEDED",
            "audio_seconds": float(info.duration),
            "result": {
                "kind": "asr",
                "engine": ENGINE_NAME,
                "text": text,
                "language": lang_arg or getattr(info, "language", None),
                "duration_seconds": round(float(info.duration), 3),
                "segments": segments,
                "provenance": "measured",
                "glossary_applied": bool(payload.get("initial_prompt")),
            },
        }


class _JobRunner:
    """thread เดียวที่อยู่ตลอดอายุ engine — การเรียก CTranslate2 ทุกครั้ง (warm-up และทุก job) วิ่งบน thread นี้

    เหตุผล (วัด 2026-09-22): เดิมสร้าง thread ใหม่ทุก job และ CTranslate2 จอง host memory ต่อ thread ที่เรียกมัน
    แล้วไม่คืนเมื่อ thread จบ → +0.122 MiB/call เมื่อสร้าง thread ใหม่ทุกครั้ง เทียบกับ +0.006 MiB/call บน thread เดิม
    ซึ่งตรงกับ soak ผ่าน worker (+0.135 MiB/request, 1,700 request, ไม่นิ่งลง) · อีกเหตุผล: warm-up ต้องอุ่น thread เดียวกับ
    ที่รับงานจริง ถ้า workspace ของ CTranslate2 แยกตาม thread การอุ่นอีก thread จะไม่มีผล
    max_concurrency = 1 อยู่แล้ว จึงไม่เสีย parallelism
    """

    def __init__(self) -> None:
        self._jobs: queue.Queue = queue.Queue()
        self._thread = threading.Thread(target=self._loop, name="faster-whisper-runner", daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        while True:
            fn, done, box = self._jobs.get()
            if fn is None:
                return
            try:
                box["value"] = fn()
            except BaseException as exc:  # noqa: BLE001 — ส่งกลับให้ caller จัดการ ไม่ให้ runner ตาย
                box["error"] = exc
            finally:
                done.set()

    def submit(self, fn: Any) -> tuple[threading.Event, dict[str, Any]]:
        done: threading.Event = threading.Event()
        box: dict[str, Any] = {}
        self._jobs.put((fn, done, box))
        return done, box

    @property
    def ident(self) -> int | None:
        return self._thread.ident

    def stop(self, timeout: float = 5.0) -> None:
        self._jobs.put((None, None, None))
        self._thread.join(timeout)


def _execute(conn: Any, engine: _Engine, message: dict[str, Any], opts: dict[str, Any], runner: _JobRunner) -> bool:
    """ทำงานหนึ่งชิ้นใน thread; main loop ส่ง heartbeat + รับ cancel/shutdown; คืน False เมื่อ shutdown."""
    request_id = message["request_id"]
    budget = float(message.get("budget_seconds") or 0.0)
    payload = message.get("input") or {}
    started = time.monotonic()
    deadline = started + budget
    cancel = threading.Event()
    box: dict[str, Any] = {}

    if message.get("kind") != "asr":
        _send(conn, {"op": "result", "request_id": request_id, "outcome": "FAILED", "result": None,
                     "error": {"code": "INVALID_REQUEST", "message": "faster-whisper engine serves kind=asr only"},
                     "usage": None, "stop_evidence": {"kind": "engine_returned", "observed_at": _now_iso()}})
        return True

    _send(conn, {"op": "started", "request_id": request_id, "observed_at": _now_iso()})
    done, job = runner.submit(lambda: engine.transcribe(payload, cancel, deadline))
    heartbeat = float(opts["heartbeat_seconds"])
    shutdown = False
    while not done.is_set():
        try:
            if conn.poll(heartbeat):
                incoming = conn.recv()
                if incoming.get("op") == "shutdown":
                    cancel.set()
                    shutdown = True
                elif incoming.get("op") == "cancel" and incoming.get("request_id") == request_id:
                    cancel.set()
                continue
        except (EOFError, OSError):
            cancel.set()
            done.wait(5.0)
            return False
        _send(conn, {"op": "heartbeat", "busy": True, "observed_at": _now_iso(), "residency": engine.residency(busy=True)})

    if "error" in job:  # exception ที่หลุดจาก transcribe — จัดการเหมือนเดิม (เดิมอยู่ใน run() ของ thread ต่อ job)
        exc = job["error"]
        box.update({"outcome": "FAILED", "error": {"code": classify_engine_error(exc, stage="thread"),
                                                   "message": f"engine thread crashed: {type(exc).__name__}"}})
    else:
        box.update(job.get("value") or {})

    outcome = box.get("outcome", "FAILED")
    if shutdown and outcome != "SUCCEEDED":
        outcome = "CANCELLED"
    processing = time.monotonic() - started
    _send(conn, {
        "op": "result",
        "request_id": request_id,
        "outcome": outcome,
        "result": box.get("result") if outcome == "SUCCEEDED" else None,
        "error": None if outcome == "SUCCEEDED" else box.get("error") or {"code": "RUNTIME_FAILED", "message": "engine returned no result"},
        "usage": {"processing_seconds": round(processing, 6), "audio_input_seconds": box.get("audio_seconds"), "provenance": "measured"},
        "stop_evidence": {"kind": "engine_returned", "observed_at": _now_iso()},
    })
    return not shutdown


def serve(conn: Any, options: dict[str, Any] | None = None) -> None:
    """entrypoint ของ child process (multiprocessing spawn)."""
    opts = {**_DEFAULTS, **(options or {})}
    engine = _Engine(opts)
    code = engine.load()
    if code != 0:
        try:
            conn.close()
        finally:
            os._exit(code)  # ไม่ส่ง hello → supervisor fail-closed พร้อม exitcode เป็น evidence
    if not _send(conn, {
        "op": "hello",
        "engine": ENGINE_NAME,
        "engine_version": engine.version,
        "labeled_stub": False,
        "effective_device": engine.device_str,
        "pid": os.getpid(),
        "observed_at": _now_iso(),
        "residency": engine.residency(),
    }):
        return
    heartbeat = float(opts["heartbeat_seconds"])
    runner = _JobRunner()  # thread เดียวตลอดอายุ engine: warm-up + ทุก job (กัน per-thread leak ของ CTranslate2)
    if opts.get("warmup", True):
        # warm-up บน runner; main loop ส่ง heartbeat busy=True ต่อเนื่อง (CUDA JIT รอบแรกอาจนาน ~20 s)
        warm_done, _ = runner.submit(engine.warmup)  # อุ่นบน thread เดียวกับที่รับงานจริง
        while not warm_done.wait(heartbeat):
            if not _send(conn, {"op": "heartbeat", "busy": True, "observed_at": _now_iso(), "residency": engine.residency(busy=True)}):
                return
    while True:
        try:
            if conn.poll(heartbeat):
                message = conn.recv()
            else:
                if not _send(conn, {"op": "heartbeat", "busy": False, "observed_at": _now_iso(), "residency": engine.residency()}):
                    return
                continue
        except (EOFError, OSError):
            return
        op = message.get("op")
        if op == "shutdown":
            return
        if op == "execute":
            if not _execute(conn, engine, message, opts, runner):
                return


__all__ = ["ALLOWED_COMPUTE_TYPES", "ENGINE_NAME", "classify_engine_error", "register_cuda_dlls", "serve"]
