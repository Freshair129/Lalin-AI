"""Smoke test for the dubbing pipeline using a short local Thai audio sample."""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

# Keep this smoke deterministic on machines where CUDA speech libraries are
# present but incompatible. Production defaults remain unchanged.
os.environ["ASR_DEVICE"] = "cpu"
os.environ["ASR_COMPUTE_TYPE"] = "int8"
os.environ["TTS_DEVICE"] = "cpu"

import soundfile as sf
from huggingface_hub import hf_hub_download

from app.pipelines.dubbing import run_dubbing
from app.pipelines.tts import synthesize

REF_TEXT = "ฉันเดินทางไปเที่ยวที่จังหวัดเชียงใหม่ในช่วงฤดูหนาวเพื่อสัมผัสอากาศเย็นสบาย"
GEN_TEXT = "สวัสดีครับ นี่คือการทดสอบพากย์เสียงแบบครบวงจรของโปรแกรมจีมิวสิค"
SOURCE = Path("data/outputs/smoke_thai.wav")
MIN_OUTPUT_SECONDS = 1.0


def ensure_source() -> tuple[str, str]:
    """Ensure the short source clip exists and return the reference voice."""
    ref = hf_hub_download("VIZINTZOR/F5-TTS-THAI", "sample/ref_audio.wav")
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    if not SOURCE.exists():
        synthesize(
            GEN_TEXT,
            str(SOURCE.resolve()),
            ref_audio=ref,
            ref_text=REF_TEXT,
            language="th",
            engine="f5",
        )
    return str(SOURCE.resolve()), ref


async def main_async() -> int:
    source, ref = ensure_source()

    print(">>> dubbing smoke test")
    print(f"    source: {source}")
    print(f"    ref:    {ref}")

    progress: list[dict] = []

    async def report(progress_value: float, message: str) -> None:
        progress.append({"progress": round(progress_value, 3), "message": message})

    t0 = time.time()
    result = await run_dubbing(
        source_audio=source,
        voice_ref=ref,
        voice_ref_text=REF_TEXT,
        target_lang="ไทย",
        translate=False,
        source_lang="th",
        tts_language="th",
        report=report,
    )
    dt = time.time() - t0

    output = Path(result["output"])
    output_duration = None
    if output.exists():
        data, sr = sf.read(output)
        output_duration = len(data) / sr

    srt_name = result.get("subtitle_srt")
    vtt_name = result.get("subtitle_vtt")
    srt_path = Path("data/outputs") / srt_name if srt_name else None
    vtt_path = Path("data/outputs") / vtt_name if vtt_name else None

    payload = {
        "elapsed_sec": round(dt, 1),
        "output_exists": output.exists(),
        "output_duration_sec": round(output_duration, 2) if output_duration is not None else None,
        "segments": result.get("segments"),
        "detected_language": result.get("detected_language"),
        "translated": result.get("translated"),
        "subtitle_srt_exists": bool(srt_path and srt_path.exists()),
        "subtitle_vtt_exists": bool(vtt_path and vtt_path.exists()),
        "progress_events": progress[-6:],
        "result": result,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))

    if not output.exists():
        print("FAIL: dubbing output was not written")
        return 1
    if output_duration is None or output_duration < MIN_OUTPUT_SECONDS:
        print(f"FAIL: output duration {output_duration} is shorter than {MIN_OUTPUT_SECONDS}s")
        return 1
    if not result.get("segments"):
        print("FAIL: dubbing pipeline produced zero segments")
        return 1
    if result.get("translated") is not False:
        print("FAIL: smoke expected translation to be disabled")
        return 1
    if not (srt_path and srt_path.exists() and vtt_path and vtt_path.exists()):
        print("FAIL: subtitle artifacts were not written")
        return 1

    print("PASS: dubbing output, segments, and subtitles were written")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main_async()))
