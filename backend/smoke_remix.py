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

from app.pipelines.music import run_remix

SOURCE = Path("data/uploads/desire.mp3")
BEAT = Path("data/uploads/beat.mp4")


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
        target_lufs=-14.0,
    )
    dt = time.time() - t0

    output = Path(result["output"])
    payload = {
        "elapsed_sec": round(dt, 1),
        "output_exists": output.exists(),
        "output_size": output.stat().st_size if output.exists() else 0,
        "result": result,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
