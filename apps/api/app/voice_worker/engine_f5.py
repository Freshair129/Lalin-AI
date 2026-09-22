# @req FR-19.3 (candidate, CR-005) — Slice B TTS engine: F5-TTS-THAI ใน child process ของ supervisor (D9 approve 2026-09-22)
"""**F5-TTS engine** — โคลนเสียงจาก preset ที่ pin ไว้ ภาษาไทย/อังกฤษ 24 kHz

โปรโตคอลกับ supervisor เหมือน ``engine_faster_whisper`` ทุกประการ (hello/heartbeat/started/result, cancel/shutdown)
และใช้ ``_JobRunner`` ตัวเดียวกัน: ทุกการเรียก torch (warm-up + ทุก job) วิ่งบน thread เดียวตลอดอายุ engine

ทำไมไม่เรียก ``f5_tts.api`` / ``f5_tts.infer.utils_infer`` ตรง ๆ:
- ``f5_tts.model`` import ``Trainer`` ตอน import package (→ wandb, accelerate, datasets) และ ``utils_infer`` import
  matplotlib, transformers, pydub ที่ top level — worker ห้ามพก stack ฝึกโมเดล/ASR/network client ที่ไม่ได้ใช้
- ``load_vocoder``/``F5TTS`` จะดาวน์โหลดจาก HF ถ้าไม่ได้ส่ง path — worker ต้องโหลดจาก asset ที่ pin เท่านั้น
จึงใส่ stub ของ ``f5_tts.model.trainer`` (และ ``librosa``/``encodec`` ถ้าไม่ได้ติดตั้ง — ใช้เฉพาะ mel แบบ bigvgan / feature แบบ encodec ซึ่งเราไม่ใช้)
แล้วทำ loop เดียวกับ ``infer_batch_process`` ของ f5-tts 1.1.22 (non-streaming) เอง: แบ่งข้อความ → sample → vocos → cross-fade
ข้อดีเพิ่ม: เช็ก cancel/deadline ได้ระหว่างก้อนข้อความ

options (manifest.engine_options + ที่ supervisor เติม):
  device "cpu" | "cuda:N" · assets {role: path}: f5.ckpt, f5.vocab, vocos.config, vocos.weights, voice.* (เสียงต้นแบบ)
  nfe_step (32) · cfg_strength (2.0) · sway_sampling_coef (-1.0) · cross_fade_seconds (0.15) · seed (None) · cpu_threads (0)
  heartbeat_seconds (0.25) · warmup (True)

fail-closed: import/โหลด/อุปกรณ์/เสียงต้นแบบอ่านไม่ได้ → child exit non-zero โดยไม่ส่ง hello
"""
from __future__ import annotations

import os
import re
import sys
import threading
import time
import types
from pathlib import Path
from typing import Any

from .engine_faster_whisper import _JobRunner, _now_iso, _send

ENGINE_NAME = "f5-tts"
EXIT_IMPORT = 3
EXIT_MODEL = 4
EXIT_DEVICE = 5

# สถาปัตยกรรม F5TTS_Base จาก configs/F5TTS_Base.yaml ของ f5-tts 1.1.22 (VIZINTZOR/F5-TTS-THAI ต่อยอดจาก base นี้;
# Studio โหลดด้วย model="F5TTS_Base") — เขียนตรงนี้เพื่อไม่ต้องพึ่ง omegaconf/hydra
F5TTS_BASE_ARCH = {"dim": 1024, "depth": 22, "heads": 16, "ff_mult": 2, "text_dim": 512,
                   "text_mask_padding": False, "conv_layers": 4, "pe_attn_head": 1}
SAMPLE_RATE = 24000
N_MEL = 100
HOP = 256
WIN = 1024
N_FFT = 1024
TARGET_RMS = 0.1
MAX_CHUNK_SECONDS = 22.0  # ตามสูตรเดิมของ infer_process: ref + gen ต่อก้อน ≤ ~22 s
MAX_REF_SECONDS = 12.0  # preprocess_ref_audio_text ตัดเสียงต้นแบบที่ 12 s — worker ปฏิเสธแทนการตัดเงียบ ๆ (preset ต้องแก้ที่ต้นทาง)
REF_SILENCE_DBFS = -42.0  # remove_silence_edges ของ f5-tts (pydub, ช่วง 10 ms)
REF_TAIL_PAD_SECONDS = 0.05

_DEFAULTS: dict[str, Any] = {
    "device": "cpu",
    "assets": {},
    "nfe_step": 32,
    "cfg_strength": 2.0,
    "sway_sampling_coef": -1.0,
    "cross_fade_seconds": 0.15,
    "seed": None,
    "cpu_threads": 0,
    "heartbeat_seconds": 0.25,
    "warmup": True,
}


def _install_import_stubs() -> None:
    """กัน import ที่ inference ไม่ใช้ (ดู docstring) — stub เฉพาะชื่อที่ยังไม่ได้ import จริง"""
    if "f5_tts.model.trainer" not in sys.modules:
        trainer = types.ModuleType("f5_tts.model.trainer")
        trainer.Trainer = None  # type: ignore[attr-defined]
        sys.modules["f5_tts.model.trainer"] = trainer
    try:
        import encodec  # noqa: F401
    except ImportError:
        # vocos import EncodecModel ที่ top level แต่ใช้เฉพาะ feature extractor แบบ encodec — เราใช้ mel
        # encodec 0.1.1 ไม่มี wheel (build จาก sdist) จึงไม่ติดตั้งใน worker
        encodec = types.ModuleType("encodec")
        encodec.EncodecModel = None  # type: ignore[attr-defined]
        sys.modules["encodec"] = encodec
    try:
        import librosa  # noqa: F401
    except ImportError:
        librosa = types.ModuleType("librosa")
        filters = types.ModuleType("librosa.filters")

        def mel(*_args: Any, **_kwargs: Any) -> Any:
            raise RuntimeError("librosa mel filters are only used by the bigvgan mel type, which this worker does not load")

        filters.mel = mel  # type: ignore[attr-defined]
        librosa.filters = filters  # type: ignore[attr-defined]
        sys.modules["librosa"] = librosa
        sys.modules["librosa.filters"] = filters


def chunk_text(text: str, max_chars: int) -> list[str]:
    """เหมือน ``f5_tts.infer.utils_infer.chunk_text`` (1.1.22): ตัดที่เครื่องหมายวรรคตอน นับความยาวเป็น byte UTF-8
    เพิ่มจากต้นฉบับหนึ่งข้อ: ภาษาไทยมักไม่มีวรรคตอน ประโยคที่ยาวเกิน ``max_chars`` จึงตัดต่อที่ช่องว่าง (ที่แบ่งวลีไทย)
    และต่อกลับด้วยช่องว่างเสมอ — ต้นฉบับไม่เติมช่องว่างหลังอักษรหลาย byte ซึ่งจะกลืนช่วงหยุดระหว่างวลีไทยทิ้ง"""
    chunks: list[str] = []
    current = ""
    for sentence in re.split(r"(?<=[;:,.!?])\s+|(?<=[；：，。！？])", text):
        if not sentence:
            continue
        oversized = len(sentence.encode("utf-8")) > max_chars
        pieces = [word for word in sentence.split(" ") if word] if oversized else [sentence]
        for piece in pieces:
            spaced = oversized or len(piece[-1].encode("utf-8")) == 1
            addition = piece + " " if spaced else piece
            if current and len(current.encode("utf-8")) + len(piece.encode("utf-8")) > max_chars:
                chunks.append(current.strip())
                current = ""
            current += addition
    if current.strip():
        chunks.append(current.strip())
    return chunks


def prepare_ref_text(ref_text: str) -> str:
    """เหมือน ``preprocess_ref_audio_text`` (1.1.22): ข้อความต้นแบบต้องจบด้วย ". " — เป็นเส้นแบ่งประโยคระหว่างเสียงต้นแบบ
    กับข้อความใหม่ (วัด 2026-09-22: ไม่มีเส้นแบ่งนี้ ท้ายข้อความต้นแบบหลุดมาต้นเสียงใหม่ และพยางค์แรกหาย)"""
    text = ref_text.strip()
    if text.endswith("。"):
        return text
    return text + " " if text.endswith(".") else text + ". "


def trim_silence_edges(samples: Any, sample_rate: int, threshold_dbfs: float = REF_SILENCE_DBFS) -> Any:
    """``remove_silence_edges`` ของ f5-tts โดยไม่ใช้ pydub: ตัดช่วงต้น/ท้ายที่ทุกช่วง 10 ms เบากว่า ``threshold_dbfs``"""
    import numpy as np

    step = max(1, int(sample_rate * 0.01))
    frames = len(samples) // step
    if frames == 0:
        return samples
    blocks = samples[: frames * step].reshape(frames, step)
    rms = np.sqrt(np.mean(np.square(blocks, dtype=np.float64), axis=1))
    loud = np.nonzero(20 * np.log10(np.maximum(rms, 1e-12)) >= threshold_dbfs)[0]
    if loud.size == 0:
        return samples
    return samples[loud[0] * step: (loud[-1] + 1) * step]


def classify_engine_error(exc: BaseException) -> str:
    name = type(exc).__name__
    message = str(exc).lower()
    if isinstance(exc, MemoryError) or name == "OutOfMemoryError" or "out of memory" in message:
        return "RUNTIME_OOM"
    return "RUNTIME_FAILED"


class _Engine:
    def __init__(self, opts: dict[str, Any]) -> None:
        self.opts = opts
        self.device_str = str(opts["device"])
        self.torch: Any = None
        self.model: Any = None
        self.vocoder: Any = None
        self.version: str | None = None
        self.refs: dict[str, tuple[Any, float]] = {}  # path → (audio 24 kHz บน device, rms เดิม)
        self.warm = not bool(opts.get("warmup", True))

    # ── load ───────────────────────────────────────────────
    def load(self) -> int:
        assets = self.opts.get("assets") or {}
        try:
            _install_import_stubs()
            import numpy as np  # noqa: F401
            import soundfile  # noqa: F401
            import torch
            import torchaudio  # noqa: F401
            from f5_tts.model.backbones.dit import DiT
            from f5_tts.model.cfm import CFM
            from f5_tts.model.utils import get_tokenizer
            from vocos import Vocos
        except Exception:  # noqa: BLE001 — ไม่มี TTS stack ใน venv นี้
            return EXIT_IMPORT
        self.torch = torch
        try:
            from importlib.metadata import version

            self.version = version("f5-tts")
        except Exception:  # noqa: BLE001
            self.version = None
        if self.device_str.startswith("cuda:"):
            index = int(self.device_str.split(":", 1)[1])
            if not torch.cuda.is_available() or torch.cuda.device_count() <= index:
                return EXIT_DEVICE
        elif self.device_str != "cpu":
            return EXIT_DEVICE
        threads = int(self.opts.get("cpu_threads") or 0)
        if threads > 0:
            torch.set_num_threads(threads)
        try:
            vocab_map, vocab_size = get_tokenizer(str(assets["f5.vocab"]), "custom")
            model = CFM(
                transformer=DiT(**F5TTS_BASE_ARCH, text_num_embeds=vocab_size, mel_dim=N_MEL),
                mel_spec_kwargs={"n_fft": N_FFT, "hop_length": HOP, "win_length": WIN, "n_mel_channels": N_MEL,
                                 "target_sample_rate": SAMPLE_RATE, "mel_spec_type": "vocos"},
                odeint_kwargs={"method": "euler"},
                vocab_char_map=vocab_map,
            )
            # fp16 บน GPU (compute capability ≥ 7) เหมือน load_checkpoint ของ f5-tts · fp32 บน CPU
            dtype = torch.float16 if self.device_str.startswith("cuda") else torch.float32
            checkpoint = torch.load(str(assets["f5.ckpt"]), map_location="cpu", weights_only=True)
            state = {k.replace("ema_model.", ""): v for k, v in checkpoint["ema_model_state_dict"].items()
                     if k not in ("initted", "step")}
            for key in ("mel_spec.mel_stft.mel_scale.fb", "mel_spec.mel_stft.spectrogram.window"):
                state.pop(key, None)
            model.load_state_dict(state)
            del checkpoint, state
            self.model = model.to(dtype).to(self.device_str).eval()
            vocos_dir = Path(assets["vocos.config"]).parent
            vocoder = Vocos.from_hparams(str(vocos_dir / "config.yaml"))
            vocoder.load_state_dict(torch.load(str(vocos_dir / "pytorch_model.bin"), map_location="cpu", weights_only=True))
            self.vocoder = vocoder.eval().to(self.device_str)
            for role, path in assets.items():
                if role.startswith("voice."):
                    self._ref(str(path))  # อ่าน/แปลงเสียงต้นแบบตอนบูต — ไฟล์เสียจะ fail ตอนนี้ ไม่ใช่ตอน request
        except Exception:  # noqa: BLE001 — ckpt/vocab/vocoder/เสียงต้นแบบเสีย หรือหน่วยความจำไม่พอ
            return EXIT_MODEL
        return 0

    def _ref(self, path: str) -> tuple[Any, float]:
        cached = self.refs.get(path)
        if cached is not None:
            return cached
        import numpy as np
        import soundfile as sf
        import torchaudio

        torch = self.torch
        data, sr = sf.read(path, dtype="float32", always_2d=True)
        mono = data.mean(axis=1)
        if len(mono) / sr > MAX_REF_SECONDS:
            raise ValueError(f"reference audio longer than {MAX_REF_SECONDS:.0f} s")
        mono = trim_silence_edges(mono, sr)
        mono = np.concatenate([mono, np.zeros(int(sr * REF_TAIL_PAD_SECONDS), dtype=mono.dtype)])
        audio = torch.from_numpy(np.ascontiguousarray(mono)).unsqueeze(0)
        rms = float(torch.sqrt(torch.mean(torch.square(audio))))
        if rms < TARGET_RMS:
            audio = audio * TARGET_RMS / max(rms, 1e-8)
        if sr != SAMPLE_RATE:
            audio = torchaudio.functional.resample(audio, sr, SAMPLE_RATE)
        entry = (audio.to(self.device_str), rms)
        self.refs[path] = entry
        return entry

    def residency(self, *, busy: bool = False) -> dict[str, Any]:
        allocated = reserved = None
        torch = self.torch
        if torch is not None and self.device_str.startswith("cuda") and torch.cuda.is_available():
            allocated = int(torch.cuda.memory_allocated(self.device_str))
            reserved = int(torch.cuda.memory_reserved(self.device_str))
        return {
            "engine": ENGINE_NAME,
            "model_loaded": self.model is not None,
            "device": self.device_str,
            "vram_bytes_allocated": allocated,
            "vram_bytes_reserved": reserved,
            "warm": self.warm,
            "provenance": "measured" if self.model is not None else "unavailable",
        }

    def warmup(self) -> None:
        voices = [p for r, p in (self.opts.get("assets") or {}).items() if r.startswith("voice.")]
        if not voices:
            self.warm = True
            return
        try:
            ref_audio, _ = self._ref(str(voices[0]))
            self._generate(ref_audio, "สวัสดี ", "ทดสอบระบบ", 1.0)
        except Exception:  # noqa: BLE001 — warm-up ล้มไม่ใช่เหตุหยุด; งานจริงจะรายงานเอง
            return
        self.warm = True

    # ── synthesis ──────────────────────────────────────────
    def _generate(self, ref_audio: Any, ref_text: str, gen_text: str, speed: float) -> Any:
        """หนึ่งก้อนข้อความ = ``_infer_basic`` ของ f5-tts 1.1.22 (คืน numpy float32 ที่ 24 kHz)"""
        from f5_tts.model.utils import convert_char_to_pinyin

        torch = self.torch
        local_speed = 0.3 if len(gen_text.encode("utf-8")) < 10 else speed
        ref_len = ref_audio.shape[-1] // HOP
        duration = ref_len + int(ref_len / len(ref_text.encode("utf-8")) * len(gen_text.encode("utf-8")) / local_speed)
        with torch.inference_mode():
            generated, _ = self.model.sample(
                cond=ref_audio,
                text=convert_char_to_pinyin([ref_text + gen_text]),
                duration=duration,
                steps=int(self.opts["nfe_step"]),
                cfg_strength=float(self.opts["cfg_strength"]),
                sway_sampling_coef=float(self.opts["sway_sampling_coef"]),
            )
            mel = generated.to(torch.float32)[:, ref_len:, :].permute(0, 2, 1)
            wave = self.vocoder.decode(mel)
        return wave.squeeze().cpu().numpy()

    def synthesize(self, payload: dict[str, Any], cancel: threading.Event, deadline: float) -> dict[str, Any]:
        import numpy as np
        import soundfile as sf

        out_path = payload.get("output_path")
        ref_path = payload.get("ref_audio")
        text = str(payload.get("text") or "")
        ref_text = str(payload.get("ref_text") or "")
        speed = float(payload.get("speed") or 1.0)
        if not out_path or not ref_path or not text or not ref_text.strip():
            return {"outcome": "FAILED", "error": {"code": "RUNTIME_FAILED", "message": "tts payload incomplete at dispatch"}}
        try:
            ref_audio, ref_rms = self._ref(str(ref_path))
        except Exception as exc:  # noqa: BLE001
            return {"outcome": "FAILED", "error": {"code": classify_engine_error(exc), "message": f"reference audio failed: {type(exc).__name__}"}}
        ref_text = prepare_ref_text(ref_text)
        ref_seconds = ref_audio.shape[-1] / SAMPLE_RATE
        max_chars = int(len(ref_text.encode("utf-8")) / ref_seconds * (MAX_CHUNK_SECONDS - ref_seconds) * speed)
        chunks = chunk_text(text, max(max_chars, 16))
        if not chunks:
            return {"outcome": "FAILED", "error": {"code": "INVALID_REQUEST", "message": "text produced no chunks"}}
        seed = self.opts.get("seed")
        if seed is not None:
            self.torch.manual_seed(int(seed))  # ต่อ job: request เดิม + seed เดิม → ผลเดิม (บน CPU; GPU ยังอาจต่างเล็กน้อย)
        waves: list[Any] = []
        for chunk in chunks:
            if cancel.is_set():
                return {"outcome": "CANCELLED", "error": {"code": "CANCEL_REQUESTED", "message": "cancelled cooperatively by engine"}}
            if time.monotonic() >= deadline:
                return {"outcome": "FAILED", "error": {"code": "DEADLINE_EXCEEDED", "message": "engine budget exhausted before completion"}}
            try:
                wave = self._generate(ref_audio, ref_text, chunk, speed)
            except Exception as exc:  # noqa: BLE001
                return {"outcome": "FAILED", "error": {"code": classify_engine_error(exc), "message": f"synthesis failed: {type(exc).__name__}"}}
            if ref_rms < TARGET_RMS:
                wave = wave * ref_rms / TARGET_RMS
            waves.append(wave)
        final = waves[0]
        fade = int(float(self.opts["cross_fade_seconds"]) * SAMPLE_RATE)
        for nxt in waves[1:]:
            n = min(fade, len(final), len(nxt))
            if n <= 0:
                final = np.concatenate([final, nxt])
                continue
            overlap = final[-n:] * np.linspace(1, 0, n) + nxt[:n] * np.linspace(0, 1, n)
            final = np.concatenate([final[:-n], overlap, nxt[n:]])
        try:
            sf.write(str(out_path), np.clip(final, -1.0, 1.0), SAMPLE_RATE, subtype="PCM_16")
        except Exception as exc:  # noqa: BLE001
            return {"outcome": "FAILED", "error": {"code": "RUNTIME_FAILED", "message": f"could not write output: {type(exc).__name__}"}}
        return {
            "outcome": "SUCCEEDED",
            "result": {"kind": "tts", "engine": ENGINE_NAME, "format": "wav", "output_path": str(out_path),
                       "provenance": "measured", "chunks": len(chunks)},
        }


def _execute(conn: Any, engine: _Engine, message: dict[str, Any], opts: dict[str, Any], runner: _JobRunner) -> bool:
    request_id = message["request_id"]
    budget = float(message.get("budget_seconds") or 0.0)
    payload = message.get("input") or {}
    started = time.monotonic()
    deadline = started + budget
    cancel = threading.Event()

    if message.get("kind") != "tts":
        _send(conn, {"op": "result", "request_id": request_id, "outcome": "FAILED", "result": None,
                     "error": {"code": "INVALID_REQUEST", "message": "f5-tts engine serves kind=tts only"},
                     "usage": None, "stop_evidence": {"kind": "engine_returned", "observed_at": _now_iso()}})
        return True

    _send(conn, {"op": "started", "request_id": request_id, "observed_at": _now_iso()})
    done, job = runner.submit(lambda: engine.synthesize(payload, cancel, deadline))
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

    box: dict[str, Any] = {}
    if "error" in job:
        exc = job["error"]
        box = {"outcome": "FAILED", "error": {"code": classify_engine_error(exc), "message": f"engine thread crashed: {type(exc).__name__}"}}
    else:
        box = job.get("value") or {}
    outcome = box.get("outcome", "FAILED")
    if shutdown and outcome != "SUCCEEDED":
        outcome = "CANCELLED"
    _send(conn, {
        "op": "result",
        "request_id": request_id,
        "outcome": outcome,
        "result": box.get("result") if outcome == "SUCCEEDED" else None,
        "error": None if outcome == "SUCCEEDED" else box.get("error") or {"code": "RUNTIME_FAILED", "message": "engine returned no result"},
        "usage": {"processing_seconds": round(time.monotonic() - started, 6), "audio_input_seconds": None, "provenance": "measured"},
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
            os._exit(code)
    if not _send(conn, {"op": "hello", "engine": ENGINE_NAME, "engine_version": engine.version, "labeled_stub": False,
                        "effective_device": engine.device_str, "pid": os.getpid(), "observed_at": _now_iso(),
                        "residency": engine.residency()}):
        return
    heartbeat = float(opts["heartbeat_seconds"])
    runner = _JobRunner()
    if opts.get("warmup", True):
        warm_done, _ = runner.submit(engine.warmup)
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


__all__ = ["ENGINE_NAME", "F5TTS_BASE_ARCH", "chunk_text", "classify_engine_error", "prepare_ref_text", "serve", "trim_silence_edges"]
