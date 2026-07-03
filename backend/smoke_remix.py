"""Smoke test for the remix pipeline using local sample files.

Runs a lightweight remix pass against the repo's bundled sample inputs and
prints the resulting output metadata for quick regression checks.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

import numpy as np
import pyloudnorm as pyln
import soundfile as sf

from app.pipelines.music import run_remix

SOURCE = Path("data/uploads/desire.mp3")
BEAT = Path("data/uploads/beat.mp4")
TARGET_LUFS = -14.0
LUFS_TOLERANCE = 0.5
PEAK_CEILING_DB = -1.0


def main() -> int:
    if not SOURCE.exists():
        print(f"missing source file: {SOURCE}")
        return 1
    if not BEAT.exists():
        print(f"missing beat file: {BEAT}")
        return 1

    print(">>> remix smoke test")
    print(f"    source: {SOURCE}")
    print(f"    beat:   {BEAT}")

    t0 = time.time()
    result = run_remix(
        source_audio=str(SOURCE),
        beat_audio=str(BEAT),
        do_autotune=False,
        do_fx=False,
        offset_ms=-500,
        target_lufs=TARGET_LUFS,
    )
    dt = time.time() - t0

    output = Path(result["output"])
    measured_lufs = None
    peak_db = None
    if output.exists():
        data, sr = sf.read(output)
        meter = pyln.Meter(sr)
        measured_lufs = float(meter.integrated_loudness(data))
        peak = float(np.max(np.abs(data)))
        peak_db = 20 * np.log10(max(peak, 1e-12))

    payload = {
        "elapsed_sec": round(dt, 1),
        "output_exists": output.exists(),
        "output_size": output.stat().st_size if output.exists() else 0,
        "measured_lufs": round(measured_lufs, 2) if measured_lufs is not None else None,
        "peak_dbfs": round(peak_db, 2) if peak_db is not None else None,
        "result": result,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))

    if not output.exists():
        print("FAIL: remix output was not written")
        return 1
    if measured_lufs is None or abs(measured_lufs - TARGET_LUFS) > LUFS_TOLERANCE:
        print(f"FAIL: LUFS {measured_lufs:.2f} is outside target {TARGET_LUFS} +/- {LUFS_TOLERANCE}")
        return 1
    if peak_db is None or peak_db > PEAK_CEILING_DB + 0.1:
        print(f"FAIL: peak {peak_db:.2f} dBFS exceeds ceiling {PEAK_CEILING_DB} dBFS")
        return 1
    print("PASS: remix output meets LUFS and peak gates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
