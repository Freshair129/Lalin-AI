#!/usr/bin/env python3
"""In-process memory trace สำหรับเงื่อนไขที่เคยทำให้เกิด ``MemoryError: bad allocation`` (ระหว่าง A/B ของ D14/D15).

ต่างจาก ``voice_worker_soak.py`` (วัดเส้นทางที่ ship: worker, VAD เปิด, ไม่มี glossary) ตัวนี้จำลองสภาพตอนพังจริง:
process เดียว โหลด turbo ครั้งเดียว วนเงื่อนไข A/B ทั้ง 5 แบบ (รวม glossary prompt และ VAD ปิด) บนคลิปที่ให้มา
แล้วอ่าน private bytes ของตัวเองหลังทุก call — แยกได้ว่าเป็น (ก) รั่วสะสมทีละ call (ข) พุ่งครั้งเดียวจาก decode ที่ผิดปกติ
หรือ (ค) ไม่เกิดซ้ำ = น่าจะมาจากความกดดันหน่วยความจำของเครื่อง (ไม่ใช่โค้ด)

เรียก ``MemoryError`` ได้ → บันทึก call ที่พังและสถานะหน่วยความจำ แทนการ crash ทิ้งข้อมูล

ใช้ (Windows, ใน .venv-speech):
  .venv-speech\\Scripts\\python.exe ..\\..\\tools\\verify\\asr_inprocess_memory.py --clips runtime\\eval\\asr-th --calls 120 --out runtime\\eval\\memtrace
"""
from __future__ import annotations

import argparse
import ctypes
import glob
import json
import os
import sys
import time
from ctypes import wintypes
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from asr_prompt_vad_ab import GLOSSARY_REAL, GLOSSARY_WRONG, prompt_from  # noqa: E402

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


class PROCESS_MEMORY_COUNTERS_EX(ctypes.Structure):
    _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
                ("PrivateUsage", ctypes.c_size_t)]


def own_memory() -> dict:
    counters = PROCESS_MEMORY_COUNTERS_EX()
    counters.cb = ctypes.sizeof(PROCESS_MEMORY_COUNTERS_EX)
    kernel32 = ctypes.windll.kernel32
    if not kernel32.K32GetProcessMemoryInfo(kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        return {"private": -1.0, "peak_working_set": -1.0}
    mib = 2**20
    return {"private": round(counters.PrivateUsage / mib, 1), "peak_working_set": round(counters.PeakWorkingSetSize / mib, 1)}


def system_commit() -> dict:
    """commit charge ของทั้งเครื่อง (GB) — bad_alloc บน Windows มักเกิดเมื่อชนเพดานนี้."""

    class PERFORMANCE_INFORMATION(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("CommitTotal", ctypes.c_size_t), ("CommitLimit", ctypes.c_size_t),
                    ("CommitPeak", ctypes.c_size_t), ("PhysicalTotal", ctypes.c_size_t), ("PhysicalAvailable", ctypes.c_size_t),
                    ("SystemCache", ctypes.c_size_t), ("KernelTotal", ctypes.c_size_t), ("KernelPaged", ctypes.c_size_t),
                    ("KernelNonpaged", ctypes.c_size_t), ("PageSize", ctypes.c_size_t), ("HandleCount", wintypes.DWORD),
                    ("ProcessCount", wintypes.DWORD), ("ThreadCount", wintypes.DWORD)]

    info = PERFORMANCE_INFORMATION()
    info.cb = ctypes.sizeof(PERFORMANCE_INFORMATION)
    if not ctypes.windll.kernel32.K32GetPerformanceInfo(ctypes.byref(info), info.cb):
        return {}
    gb = info.PageSize / 2**30
    return {"commit_used_gb": round(info.CommitTotal * gb, 1), "commit_limit_gb": round(info.CommitLimit * gb, 1),
            "physical_available_gb": round(info.PhysicalAvailable * gb, 1)}


def _slope(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    den = sum((x - mx) ** 2 for x in xs)
    return 0.0 if den == 0 else sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den


def register_cuda_dlls() -> None:
    for directory in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
        try:
            os.add_dll_directory(directory)
        except OSError:
            continue
        os.environ["PATH"] = directory + os.pathsep + os.environ.get("PATH", "")


def main(argv: list[str] | None = None) -> int:
    if os.name != "nt":
        print("Windows only (reads process memory through the Windows API)", file=sys.stderr)
        return 2
    api_dir = Path(__file__).resolve().parents[2] / "apps" / "api"
    parser = argparse.ArgumentParser(description="in-process memory trace under the A/B conditions that once hit bad_alloc")
    parser.add_argument("--clips", type=Path, required=True)
    parser.add_argument("--calls", type=int, default=120)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    clips = sorted(args.clips.glob("*.wav"))
    if not clips:
        print(f"no *.wav in {args.clips}", file=sys.stderr)
        return 2
    args.out.mkdir(parents=True, exist_ok=True)

    register_cuda_dlls()
    from faster_whisper import WhisperModel

    model = WhisperModel(str(api_dir / "models" / "faster-whisper" / "large-v3-turbo"), device="cuda",
                         compute_type="int8_float16", local_files_only=True)
    conditions = [("baseline_novad", None, False), ("glossary_novad", prompt_from(GLOSSARY_REAL), False),
                  ("wrong_novad", prompt_from(GLOSSARY_WRONG), False), ("baseline_vad", None, True),
                  ("glossary_vad", prompt_from(GLOSSARY_REAL), True)]
    schedule = [(clip, cond) for clip in clips for cond in conditions]  # same order the A/B used
    rows: list[dict] = []
    crashed: dict | None = None
    base = own_memory()
    print(f"loaded. private={base['private']} MiB  system={system_commit()}", flush=True)
    for i in range(args.calls):
        clip, (name, prompt, vad) = schedule[i % len(schedule)]
        kwargs: dict = {"language": "th", "beam_size": 5, "vad_filter": vad}
        if vad:
            kwargs["vad_parameters"] = {"min_silence_duration_ms": 700}
        if prompt:
            kwargs["initial_prompt"] = prompt
        started = time.perf_counter()
        try:
            segments, _info = model.transcribe(str(clip), **kwargs)
            n = sum(1 for _ in segments)
        except MemoryError as exc:
            crashed = {"call": i, "clip": clip.stem, "condition": name, "error": repr(exc),
                       "memory": own_memory(), "system": system_commit()}
            print(f"MemoryError at call {i} ({clip.stem}/{name}): {crashed}", flush=True)
            break
        mem = own_memory()
        row = {"call": i, "clip": clip.stem, "condition": name, "segments": n,
               "seconds": round(time.perf_counter() - started, 2), "private_mib": mem["private"],
               "delta_from_start_mib": round(mem["private"] - base["private"], 1), **system_commit()}
        rows.append(row)
        print(f"{i:4d} {clip.stem:16s} {name:15s} segs={n:3d} private={mem['private']:8.1f} "
              f"d={row['delta_from_start_mib']:+7.1f}  commit={row.get('commit_used_gb')}/{row.get('commit_limit_gb')} GB", flush=True)

    privs = [r["private_mib"] for r in rows if r["private_mib"] >= 0]
    measured = base["private"] >= 0 and len(privs) == len(rows) and bool(rows)
    # วัดไม่ได้ (-1) → รายงานว่าไม่มีข้อมูล ห้ามคำนวณ growth จากค่า sentinel (เคยได้ "0.0" ที่ไม่มีความหมาย)
    # แยก 2 อย่างที่ตัวเลขรวมปนกัน: (1) การจองครั้งเดียวตอน inference แรก (CUDA/cuBLAS/cuDNN workspace ถูกจองแบบ lazy)
    # กับ (2) การโตต่อ call หลังจากนั้น ซึ่งเป็นตัวบอก leak จริง — ถ้ารายงานแค่ end-start จะดูเหมือนรั่ว ~1 GB
    steady = privs[1:] if measured and len(privs) > 2 else []
    summary = {"calls_completed": len(rows), "crashed": crashed, "memory_measured": measured,
               "private_mib_after_load": base["private"] if measured else None,
               "private_mib_after_first_call": privs[0] if measured else None,
               "first_inference_setup_mib": round(privs[0] - base["private"], 1) if measured else None,
               "private_mib_end": privs[-1] if measured else None,
               "private_mib_max": max(privs) if measured else None,
               "steady_state_growth_mib": round(privs[-1] - privs[0], 1) if measured else None,
               "steady_state_slope_mib_per_call": round(_slope(list(range(len(steady))), steady), 4) if steady else None,
               "transient_peak_above_steady_mib": round(max(privs) - privs[-1], 1) if measured else None}
    (args.out / "memtrace.json").write_text(json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=1),
                                           encoding="utf-8")
    print("\nSUMMARY", json.dumps(summary, ensure_ascii=False, indent=1), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
