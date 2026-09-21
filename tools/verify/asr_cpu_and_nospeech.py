#!/usr/bin/env python3
"""หลักฐานสำหรับ D8 (จะเก็บ profile medium ไว้ไหม) และ D14 (ใช้ no_speech_prob แทน VAD ได้ไหม).

รันนอก voice worker ไม่แตะ contract. ต้องรันใน `apps/api/.venv-speech`.

A) CPU benchmark — turbo vs medium บน `compute_type=int8` (อย่างเดียวที่ใช้ได้บน CPU)
   ตอบคำถาม D8: medium มีเหตุผลอยู่ต่อในฐานะ CPU fallback จริงไหม ถ้า turbo บน CPU ก็ทำได้และดีกว่า
   วัด: RTF, peak RSS, ความยาวผล, ศัพท์ที่ถูก, อักขระต่างภาษา — รันซ้ำ (engine ไม่ deterministic)

B) no_speech_prob — ดูว่าค่านี้แยก "ความเงียบ/ไม่มีเสียงพูด" ออกจาก "เสียงพูดจริง" ได้ไหม
   ตอบคำถาม D14: ถ้าแยกได้ engine ตอบ NO_SPEECH ได้โดยไม่ต้องเพิ่มโมเดล VAD
   input: ความเงียบหลายความยาว, noise ขาว, โทนไซน์, เสียงพูดจริงทั้ง 4 คลิป

ใช้:
  .venv-speech\\Scripts\\python.exe tools/verify/asr_cpu_and_nospeech.py --clips apps/api/runtime/eval/asr-th --out <dir>
  (ข้าม A ด้วย --skip-cpu เพราะกินเวลาหลายนาที)
"""
from __future__ import annotations

import argparse
import ctypes
import glob
import json
import os
import re
import sys
import time
from ctypes import wintypes
from pathlib import Path

def _declare_win32_types() -> None:
    """ctypes ต้องรู้ว่าเป็น HANDLE 64-bit — ไม่งั้น pseudo-handle ของ GetCurrentProcess (-1) ถูกส่งเป็น int 32-bit
    กลายเป็น 0x00000000FFFFFFFF แล้ว call ล้มเงียบ ๆ (เจอจริง 2026-09-21: RAM ของ benchmark CPU และ memtrace อ่านไม่ได้ทั้งคู่)"""
    kernel32 = ctypes.windll.kernel32
    kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.K32GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
    kernel32.K32GetProcessMemoryInfo.restype = wintypes.BOOL


if os.name == "nt":
    _declare_win32_types()


FOREIGN_RE = re.compile(r"[一-鿿぀-ヿЀ-ӿ가-힯ऀ-ॿ]")


def register_cuda_dlls() -> None:
    if os.name != "nt":
        return
    for directory in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
        try:
            os.add_dll_directory(directory)
        except OSError:
            continue
        os.environ["PATH"] = directory + os.pathsep + os.environ.get("PATH", "")


def peak_rss_mib() -> float:
    """Windows: peak working set ของ process นี้ (ไม่ต้องพึ่ง psutil)."""
    if os.name != "nt":
        return 0.0

    class COUNTERS(ctypes.Structure):
        _fields_ = [("cb", ctypes.c_uint32), ("PageFaultCount", ctypes.c_uint32),
                    ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]

    counters = COUNTERS()
    counters.cb = ctypes.sizeof(COUNTERS)
    handle = ctypes.windll.kernel32.GetCurrentProcess()
    ok = 0
    for dll, name in ((ctypes.windll.kernel32, "K32GetProcessMemoryInfo"), (ctypes.windll.psapi, "GetProcessMemoryInfo")):
        func = getattr(dll, name, None)
        if func is not None:
            ok = func(handle, ctypes.byref(counters), counters.cb)
            if ok:
                break
    if not ok:
        return -1.0  # วัดไม่ได้ — อย่ารายงานเป็น 0
    return round(counters.PeakWorkingSetSize / 2**20, 1)


def transcribe(model, audio, *, language: str = "th") -> tuple[str, list, float]:
    started = time.perf_counter()
    seg_iter, info = model.transcribe(audio, language=language, beam_size=5, vad_filter=False)
    segments = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(),
                 "avg_logprob": round(s.avg_logprob, 3), "no_speech_prob": round(s.no_speech_prob, 4)} for s in seg_iter]
    return " ".join(s["text"] for s in segments), segments, time.perf_counter() - started, info.duration


def part_a(clips: list[Path], api_dir: Path, repeats: int) -> dict:
    """CPU: turbo vs medium (int8). GPU turbo เป็นเส้นอ้างอิง."""
    from faster_whisper import WhisperModel

    out: dict = {}
    configs = [("turbo", "cpu", "int8"), ("medium", "cpu", "int8"), ("turbo", "cuda", "int8_float16")]
    for model_name, device, compute in configs:
        directory = api_dir / "models" / "faster-whisper" / ("large-v3-turbo" if model_name == "turbo" else "medium")
        if not (directory / "model.bin").is_file():
            # medium weights were deleted after D8 dropped that profile (2026-09-21); results kept in the proposal doc
            print(f"  skip {model_name}-{device}-{compute}: weights not present at {directory}", flush=True)
            out[f"{model_name}-{device}-{compute}"] = {"skipped": "weights not present"}
            continue
        if device == "cuda":
            register_cuda_dlls()
        before = peak_rss_mib()
        load0 = time.perf_counter()
        model = WhisperModel(str(directory), device=device, compute_type=compute, local_files_only=True)
        load_s = round(time.perf_counter() - load0, 2)
        key = f"{model_name}-{device}-{compute}"
        out[key] = {"load_seconds": load_s, "rss_before_mib": before, "clips": {}}
        for wav in clips:
            runs = []
            for _ in range(repeats):
                text, segments, took, duration = transcribe(model, str(wav))
                runs.append({"seconds": round(took, 2), "rtf": round(took / duration, 3), "chars": len(text),
                             "foreign_chars": len(FOREIGN_RE.findall(text)), "n_segments": len(segments), "text": text})
            med = sorted(r["rtf"] for r in runs)[len(runs) // 2]
            out[key]["clips"][wav.stem] = {"runs": runs, "median_rtf": med,
                                           "median_chars": sorted(r["chars"] for r in runs)[len(runs) // 2],
                                           "identical_across_runs": len({r["text"] for r in runs}) == 1}
            print(f"  {key:26s} {wav.stem:16s} rtf={med:6.3f} chars={out[key]['clips'][wav.stem]['median_chars']:5d} "
                  f"{[r['seconds'] for r in runs]}", flush=True)
        out[key]["rss_peak_mib"] = peak_rss_mib()
        print(f"  {key:26s} load={load_s}s peak_rss={out[key]['rss_peak_mib']} MiB", flush=True)
        del model
    return out


def part_b(clips: list[Path], api_dir: Path, repeats: int) -> dict:
    """no_speech_prob: เสียงเงียบ/ไม่ใช่เสียงพูด เทียบกับเสียงพูดจริง."""
    import numpy as np
    import soundfile as sf
    from faster_whisper import WhisperModel

    register_cuda_dlls()
    model = WhisperModel(str(api_dir / "models" / "faster-whisper" / "large-v3-turbo"),
                         device="cuda", compute_type="int8_float16", local_files_only=True)
    sr = 16000
    rng = np.random.default_rng(7)
    synthetic = {
        "silence-3s": np.zeros(3 * sr, dtype=np.float32),
        "silence-10s": np.zeros(10 * sr, dtype=np.float32),
        "silence-30s": np.zeros(30 * sr, dtype=np.float32),
        "dither-10s": (rng.standard_normal(10 * sr) * 1e-4).astype(np.float32),
        "white-noise-10s": (rng.standard_normal(10 * sr) * 0.05).astype(np.float32),
        "tone-440hz-10s": (0.2 * np.sin(2 * np.pi * 440 * np.arange(10 * sr) / sr)).astype(np.float32),
    }
    out: dict = {"non_speech": {}, "speech": {}}
    for name, audio in synthetic.items():
        runs = []
        for _ in range(repeats):
            text, segments, _took, _dur = transcribe(model, audio)
            probs = [s["no_speech_prob"] for s in segments]
            runs.append({"n_segments": len(segments), "text": text,
                         "no_speech_prob_min": min(probs) if probs else None,
                         "no_speech_prob_max": max(probs) if probs else None})
        out["non_speech"][name] = runs
        shown = [f"{r['no_speech_prob_min']}" if r["no_speech_prob_min"] is not None else "-" for r in runs]
        print(f"  {name:18s} segs={[r['n_segments'] for r in runs]} min_nsp={shown} text={runs[0]['text'][:48]!r}", flush=True)
    for wav in clips:
        runs = []
        for _ in range(repeats):
            text, segments, _took, _dur = transcribe(model, str(wav))
            probs = [s["no_speech_prob"] for s in segments]
            runs.append({"n_segments": len(segments),
                         "no_speech_prob_min": min(probs) if probs else None,
                         "no_speech_prob_max": max(probs) if probs else None,
                         "no_speech_prob_mean": round(sum(probs) / len(probs), 4) if probs else None,
                         "segments_over_0_6": sum(1 for p in probs if p > 0.6)})
        out["speech"][wav.stem] = runs
        print(f"  {wav.stem:18s} segs={[r['n_segments'] for r in runs]} "
              f"max_nsp={[r['no_speech_prob_max'] for r in runs]} "
              f"mean_nsp={[r['no_speech_prob_mean'] for r in runs]}", flush=True)
    return out


def main(argv: list[str] | None = None) -> int:
    api_dir = Path(__file__).resolve().parents[2] / "apps" / "api"
    parser = argparse.ArgumentParser(description="D8 CPU benchmark and D14 no_speech_prob evidence")
    parser.add_argument("--clips", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--skip-cpu", action="store_true")
    parser.add_argument("--skip-nsp", action="store_true")
    args = parser.parse_args(argv)
    clips = sorted(args.clips.glob("*.wav"))
    if not clips:
        print(f"no *.wav in {args.clips}", file=sys.stderr)
        return 2
    args.out.mkdir(parents=True, exist_ok=True)
    report: dict = {"repeats": args.repeats, "cpu_count": os.cpu_count()}
    if not args.skip_cpu:
        print("== A. CPU benchmark (turbo vs medium, int8) + GPU reference")
        report["cpu_benchmark"] = part_a(clips, api_dir, args.repeats)
    if not args.skip_nsp:
        print("\n== B. no_speech_prob separation")
        report["no_speech_prob"] = part_b(clips, api_dir, args.repeats)
    (args.out / "cpu-nsp-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\nwrote", args.out / "cpu-nsp-results.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
