"""Dubbing pipeline — พากย์เสียงทับวิดีโอ/เสียงต้นฉบับ

ขั้นตอน:
  1. ASR        ถอดเสียงต้นฉบับเป็น segments + timestamp (faster-whisper)
  2. Translate  แปลแต่ละ segment ด้วย "สมอง" (cloud/ollama) — ถ้าเปิด translate
  3. TTS clone  พากย์แต่ละ segment ด้วยเสียงที่โคลน (F5-TTS)
  4. Fit + mix  ปรับความยาวให้พอดีจังหวะ แล้ววางบนไทม์ไลน์เดิม

ฟังก์ชันนี้ออกแบบให้เรียกจาก job (async) พร้อมรายงานความคืบหน้า
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from ..brain import get_brain
from ..config import get_settings
from ..utils.audio import fit_duration, overlay_on_timeline
from ..utils.ids import short_id
from . import asr, tts


async def run_dubbing(
    *,
    source_audio: str,
    voice_ref: str,
    voice_ref_text: str = "",
    target_lang: str = "ไทย",
    translate: bool = True,
    source_lang: str | None = None,
    tts_language: str = "th",
    report=None,
) -> dict:
    """รันไปป์ไลน์พากย์เสียงทั้งหมด คืน dict ผลลัพธ์ (path ไฟล์ออก)

    report: async callable(progress: float, message: str) — optional
    """
    settings = get_settings()
    loop = asyncio.get_event_loop()

    async def say(p, m):
        if report:
            await report(p, m)

    # 1) ASR ────────────────────────────────────────────────
    await say(0.05, "กำลังถอดเสียงต้นฉบับ (ASR)…")
    transcript = await loop.run_in_executor(
        None, asr.transcribe, source_audio, source_lang
    )
    n = len(transcript.segments) or 1

    work = settings.outputs_dir / f"dub_{short_id()}"
    work.mkdir(parents=True, exist_ok=True)
    clips: list[tuple[float, str]] = []
    brain = get_brain()

    # 2-3) ต่อ segment: แปล → พากย์ → ปรับความยาว ────────────
    for i, seg in enumerate(transcript.segments):
        base = 0.10 + 0.80 * (i / n)
        text = seg.text.strip()
        if not text:
            continue

        if translate:
            await say(base, f"แปล {i+1}/{n}…")
            text = await brain.translate(
                text, target_lang=target_lang, source_lang=source_lang
            )

        await say(base + 0.02, f"พากย์ {i+1}/{n}…")
        raw = str(work / f"seg_{i:04d}_raw.wav")
        await loop.run_in_executor(
            None,
            lambda t=text, o=raw: tts.synthesize(
                t, o, ref_audio=voice_ref, ref_text=voice_ref_text,
                language=tts_language,
            ),
        )

        # ปรับความยาวให้พอดีช่วงต้นฉบับ
        fitted = str(work / f"seg_{i:04d}.wav")
        dur = seg.end - seg.start
        await loop.run_in_executor(None, fit_duration, raw, dur, fitted)
        clips.append((seg.start, fitted))

    # 4) mix ลงไทม์ไลน์ ─────────────────────────────────────
    await say(0.92, "รวมเสียงลงไทม์ไลน์…")
    out_path = str(settings.outputs_dir / f"dubbed_{short_id()}.wav")
    total_ms = int(transcript.duration * 1000) + 500
    await loop.run_in_executor(
        None, overlay_on_timeline, clips, total_ms, out_path
    )

    await say(1.0, "เสร็จสิ้น")
    return {
        "output": out_path,
        "segments": len(clips),
        "detected_language": transcript.language,
        "duration": transcript.duration,
        "translated": translate,
        "target_lang": target_lang,
    }
