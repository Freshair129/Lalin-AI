# @req FR-03 — dubbing เต็มสาย: ASR → แปล → clone → fit → mix → subtitle → mux
"""Dubbing pipeline — พากย์เสียงทับวิดีโอ/เสียงต้นฉบับ

ขั้นตอน:
  1. ASR        ถอดเสียงต้นฉบับเป็น segments + timestamp (faster-whisper)
  2. Translate  แปลแต่ละ segment ด้วย "สมอง" (cloud/ollama) — ถ้าเปิด translate
  3. TTS clone  พากย์แต่ละ segment ด้วยเสียงที่โคลน (F5-TTS)
  4. Fit + mix  ปรับความยาวให้พอดีจังหวะ แล้ววางบนไทม์ไลน์เดิม
  5. Subtitles  ส่งออก .srt/.vtt จาก segment เดิม (ต้นฉบับ+คำแปล) ไว้ข้างไฟล์ผลลัพธ์
  6. Mux video  ถ้าไฟล์ต้นฉบับเป็นวิดีโอ → รวมเสียงพากย์ใหม่กลับเข้าไฟล์วิดีโอเดิม (ffmpeg)

ฟังก์ชันนี้ออกแบบให้เรียกจาก job (async) พร้อมรายงานความคืบหน้า
"""
# @req FR-03 — dubbing เต็มสาย: ASR -> แปล -> clone -> fit -> mix
from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path

from ..brain import get_brain
from ..brain.base import Message
from ..config import get_settings
from ..utils.audio import fit_duration, overlay_on_timeline
from ..utils.ffmpeg import configure as configure_ffmpeg
from ..utils.ids import short_id
from . import asr, tts

VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}

# อัตราคำพูดไทยโดยประมาณ (ตัวอักษร/วินาที) ไว้ประเมินว่าประโยคยาวเกินช่องเวลาไหม
_THAI_CHARS_PER_SEC = 12.0


async def refine_line_for_duration(
    text: str,
    *,
    target_sec: float,
    tone: str = "formal",
    brain=None,
) -> str:
    """ให้ "สมอง" เกลาบทพากย์ให้ความยาวคำพูดพอดีกับช่องเวลา (target_sec วินาที)

    ใช้ตอนแปล/เขียนบทแล้วยาวเกินช่วงเวลาเดิม ทำให้ fit_duration ต้องยืด/บีบเสียงมากไป
    คงความหมายเดิมไว้ ตัดให้กระชับขึ้นถ้ายาวเกิน — ถ้าสมองตอบผิดพลาด คืนข้อความเดิม (ไม่ throw)

    tone: "formal" (ทางการ) | "casual" (กันเอง)
    """
    text = (text or "").strip()
    if not text:
        return text

    brain = brain or get_brain()
    tone_desc = "เป็นกันเอง พูดคุยธรรมชาติ" if tone == "casual" else "ทางการ สุภาพ เหมาะกับงานพากย์"
    est_chars = max(1, round(target_sec * _THAI_CHARS_PER_SEC))

    system = (
        "คุณคือนักเขียนบทพากย์เสียงมืออาชีพ หน้าที่คือเกลาประโยคให้ความยาวเวลาพูด "
        "พอดีกับช่องเวลาที่กำหนด โดยคงความหมายเดิมไว้ให้มากที่สุด "
        "ถ้าประโยคยาวเกินช่องเวลา ให้ตัดคำฟุ่มเฟือย/กระชับประโยคลง "
        "ถ้าสั้นกว่าช่องเวลามากให้ปล่อยตามเดิมได้ (ไม่ต้องเติมคำให้ยาวขึ้นโดยไม่จำเป็น) "
        "ห้ามใส่คำอธิบาย หมายเหตุ หรือเครื่องหมายคำพูดครอบ — ตอบกลับเฉพาะประโยคที่เกลาแล้วบรรทัดเดียวเท่านั้น"
    )
    user = (
        f"ช่องเวลาที่มีให้พูด: ประมาณ {target_sec:.1f} วินาที "
        f"(กะคร่าวๆ ว่าพูดได้ราว {est_chars} ตัวอักษรภาษาไทย)\n"
        f"โทนเสียง: {tone_desc}\n\n"
        f"ประโยคเดิม:\n{text}\n\n"
        "เกลาประโยคนี้ให้พอดีเวลาข้างต้น ตอบกลับเฉพาะประโยคที่เกลาแล้วเท่านั้น:"
    )
    try:
        res = await brain.chat(
            [Message("system", system), Message("user", user)],
            temperature=0.3,
        )
        refined = (res.text or "").strip().strip('"').strip("“”").strip()
        return refined or text
    except Exception:  # noqa: BLE001 — สมองพังไม่ควรทำให้ผู้ใช้เสียบทเดิม
        return text


async def run_dubbing(
    *,
    source_audio: str,
    voice_ref: str,
    voice_ref_text: str = "",
    target_lang: str = "ไทย",
    translate: bool = True,
    source_lang: str | None = None,
    tts_language: str = "th",
    refine_fit: bool = False,
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
    sub_segments: list[dict] = []  # เก็บไว้ทำ .srt/.vtt (start, end, original, translated)
    brain = get_brain()

    # 2-3) ต่อ segment: แปล → พากย์ → ปรับความยาว ────────────
    for i, seg in enumerate(transcript.segments):
        base = 0.10 + 0.80 * (i / n)
        original_text = seg.text.strip()
        text = original_text
        if not text:
            continue

        if translate:
            await say(base, f"แปล {i+1}/{n}…")
            text = await brain.translate(
                text, target_lang=target_lang, source_lang=source_lang
            )

        if refine_fit:
            seg_dur = seg.end - seg.start
            if seg_dur > 0:
                await say(base + 0.01, f"เกลาบท {i+1}/{n}…")
                text = await refine_line_for_duration(
                    text, target_sec=seg_dur, brain=brain
                )

        sub_segments.append({
            "start": seg.start,
            "end": seg.end,
            "original": original_text,
            "translated": text if translate else original_text,
        })

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
    out_id = short_id()
    out_path = str(settings.outputs_dir / f"dubbed_{out_id}.wav")
    total_ms = int(transcript.duration * 1000) + 500
    await loop.run_in_executor(
        None, overlay_on_timeline, clips, total_ms, out_path
    )

    # 5) subtitles (.srt/.vtt) ──────────────────────────────
    await say(0.95, "สร้างไฟล์ซับไตเติล…")
    srt_name = f"dubbed_{out_id}.srt"
    vtt_name = f"dubbed_{out_id}.vtt"
    srt_path = str(settings.outputs_dir / srt_name)
    vtt_path = str(settings.outputs_dir / vtt_name)
    try:
        await loop.run_in_executor(None, write_srt, sub_segments, srt_path)
        await loop.run_in_executor(None, write_vtt, sub_segments, vtt_path)
    except Exception:  # noqa: BLE001 — ซับไตเติลพังไม่ควรทำให้ job ทั้งงานล้ม
        srt_name = None
        vtt_name = None

    result: dict = {
        "output": out_path,
        "segments": len(clips),
        "detected_language": transcript.language,
        "duration": transcript.duration,
        "translated": translate,
        "target_lang": target_lang,
        "subtitle_srt": srt_name,
        "subtitle_vtt": vtt_name,
        "refine_fit": refine_fit,
    }

    # 6) ถ้าต้นฉบับเป็นวิดีโอ → mux เสียงพากย์ใหม่กลับเข้าไฟล์วิดีโอ ─
    if Path(source_audio).suffix.lower() in VIDEO_EXTS:
        await say(0.97, "รวมเสียงพากย์กลับเข้าไฟล์วิดีโอ…")
        video_out = str(settings.outputs_dir / f"dubbed_{out_id}.mp4")
        muxed = await loop.run_in_executor(
            None, _mux_audio_into_video, source_audio, out_path, video_out
        )
        if muxed:
            result["video_output"] = video_out
        else:
            result["video_mux_error"] = (
                "ไม่สามารถรวมเสียงกลับเข้าไฟล์วิดีโอได้ (ffmpeg ไม่พร้อมใช้งาน) "
                "— ได้เฉพาะไฟล์เสียงพากย์เท่านั้น"
            )

    await say(1.0, "เสร็จสิ้น")
    return result


def _mux_audio_into_video(video_path: str, audio_path: str, out_path: str) -> bool:
    """รวมเสียงพากย์ใหม่ (audio_path) เข้ากับสตรีมวิดีโอเดิม (video_path) → out_path (.mp4)

    ใช้ ffmpeg ที่ฝังมากับ imageio-ffmpeg: คัดลอกสตรีมวิดีโอ (-c:v copy) เข้ารหัสเสียงใหม่
    คืน True ถ้าสำเร็จ, False ถ้า ffmpeg ใช้งานไม่ได้หรือ mux ล้มเหลว (ไม่ throw — degrade gracefully)
    """
    try:
        import imageio_ffmpeg

        configure_ffmpeg()
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return False

    try:
        subprocess.run(
            [
                ffmpeg_exe, "-y",
                "-i", video_path,
                "-i", audio_path,
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "copy",
                "-c:a", "aac",
                "-shortest",
                out_path,
            ],
            capture_output=True,
            check=True,
        )
        return Path(out_path).exists()
    except Exception:  # noqa: BLE001 — mux ล้มเหลวไม่ควรทำให้งาน dubbing ทั้งหมดพัง
        return False


# ── Subtitle formatting (SRT / WebVTT) ──────────────────────────
def _srt_timestamp(sec: float) -> str:
    """HH:MM:SS,mmm ตามสเปก SubRip"""
    sec = max(0.0, sec)
    ms_total = round(sec * 1000)
    hh, rem = divmod(ms_total, 3_600_000)
    mm, rem = divmod(rem, 60_000)
    ss, ms = divmod(rem, 1000)
    return f"{hh:02d}:{mm:02d}:{ss:02d},{ms:03d}"


def _vtt_timestamp(sec: float) -> str:
    """HH:MM:SS.mmm ตามสเปก WebVTT"""
    sec = max(0.0, sec)
    ms_total = round(sec * 1000)
    hh, rem = divmod(ms_total, 3_600_000)
    mm, rem = divmod(rem, 60_000)
    ss, ms = divmod(rem, 1000)
    return f"{hh:02d}:{mm:02d}:{ss:02d}.{ms:03d}"


def _subtitle_text(seg: dict) -> str:
    """ข้อความที่จะแสดงต่อ cue — ถ้ามีคำแปลต่างจากต้นฉบับ แสดงทั้งคู่ (แปล/ต้นฉบับ)"""
    translated = (seg.get("translated") or "").strip()
    original = (seg.get("original") or "").strip()
    if translated and original and translated != original:
        return f"{translated}\n{original}"
    return translated or original


def write_srt(segments: list[dict], out_path: str) -> str:
    """เขียนไฟล์ .srt จาก segment list (start/end/original/translated)"""
    lines: list[str] = []
    for i, seg in enumerate(segments, start=1):
        text = _subtitle_text(seg)
        if not text:
            continue
        lines.append(str(i))
        lines.append(f"{_srt_timestamp(seg['start'])} --> {_srt_timestamp(seg['end'])}")
        lines.append(text)
        lines.append("")
    Path(out_path).write_text("\n".join(lines), encoding="utf-8")
    return out_path


def write_vtt(segments: list[dict], out_path: str) -> str:
    """เขียนไฟล์ .vtt (WebVTT) จาก segment list เดียวกับ SRT"""
    lines: list[str] = ["WEBVTT", ""]
    for seg in segments:
        text = _subtitle_text(seg)
        if not text:
            continue
        lines.append(f"{_vtt_timestamp(seg['start'])} --> {_vtt_timestamp(seg['end'])}")
        lines.append(text)
        lines.append("")
    Path(out_path).write_text("\n".join(lines), encoding="utf-8")
    return out_path
