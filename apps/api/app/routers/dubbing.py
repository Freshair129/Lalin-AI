"""พากย์เสียง (dubbing) — รันไปป์ไลน์เต็มเป็น job พร้อมรายงานความคืบหน้า"""
# @req FR-03 — AI dubbing เต็มไปป์ไลน์ + refine บทต่อบรรทัด (FR-03.6)
from __future__ import annotations

import asyncio
import math
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..config import get_settings
from ..jobs import jobs
from ..jobs.resources import resource_for_requested_device
from ..pipelines.asr import transcribe
from ..pipelines.dubbing import (
    SpeakerSegment,
    refine_line_for_duration,
    run_dubbing,
    run_multispeaker_dubbing,
    write_srt,
    write_vtt,
)
from ..runtime_devices import resolve_asr_runtime, resolve_tts_runtime
from ..schemas import DubbingRenderRequest, DubbingRequest
from ..services import voices
from .files import resolve_upload

router = APIRouter(prefix="/dubbing", tags=["dubbing"])


class AnalyzeRequest(BaseModel):
    source_audio: str = Field(min_length=1, max_length=255)
    source_lang: str | None = None


class RefineLineRequest(BaseModel):
    """คำขอ "เกลาบทให้พอดีเวลา" — ให้สมองเขียนประโยคใหม่ให้ยาวพูดพอดีช่องเวลา"""

    text: str
    target_sec: float = Field(gt=0, description="ความยาวช่องเวลาที่มีให้พูด (วินาที)")
    tone: str = Field(default="formal", pattern="^(formal|casual)$")


class RefineLineResponse(BaseModel):
    refined: str


@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    """ถอดเสียงต้นฉบับเป็น transcript แยกจากงานพากย์และเก็บผลไว้กับ job."""
    source = resolve_upload(req.source_audio)

    async def task(job, report):
        await report(job, 0.05, "กำลังถอดเสียงต้นฉบับ")
        loop = asyncio.get_running_loop()
        transcript = await loop.run_in_executor(
            None, transcribe, source, req.source_lang
        )

        segments: list[dict] = []
        subtitle_segments: list[dict] = []
        for segment in transcript.segments:
            text = str(segment.text).strip()
            if not text:
                continue
            start = float(segment.start)
            end = float(segment.end)
            if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end < start:
                raise ValueError("ASR คืน timestamp ของ transcript ไม่ถูกต้อง")
            segments.append({
                "id": f"seg_{len(segments) + 1:06d}",
                "start": start,
                "end": end,
                "text": text,
            })
            subtitle_segments.append({"start": start, "end": end, "original": text})

        duration = float(transcript.duration)
        if not math.isfinite(duration) or duration < 0:
            duration = max((segment["end"] for segment in segments), default=0.0)

        await report(job, 0.85, "กำลังบันทึกไฟล์คำบรรยาย")
        outputs_dir = Path(get_settings().outputs_dir)
        outputs_dir.mkdir(parents=True, exist_ok=True)
        artifact_id = uuid.uuid4().hex
        subtitle_srt = f"transcript_{artifact_id}.srt"
        subtitle_vtt = f"transcript_{artifact_id}.vtt"
        srt_path = outputs_dir / subtitle_srt
        vtt_path = outputs_dir / subtitle_vtt

        try:
            await loop.run_in_executor(None, write_srt, subtitle_segments, str(srt_path))
            await loop.run_in_executor(None, write_vtt, subtitle_segments, str(vtt_path))
        except Exception:
            srt_path.unlink(missing_ok=True)
            vtt_path.unlink(missing_ok=True)
            raise

        return {
            "source_audio": req.source_audio,
            "detected_language": transcript.language or None,
            "segment_count": len(segments),
            "duration_sec": duration,
            "transcript": {"segments": segments},
            "subtitle_srt": subtitle_srt,
            "subtitle_vtt": subtitle_vtt,
        }

    settings = get_settings()
    resource = resource_for_requested_device(
        settings.asr_device,
        resolve_auto=lambda: resolve_asr_runtime(settings.asr_device)[0],
    )
    job = jobs.spawn("dubbing-analyze", task, resource=resource)
    return {"job_id": job.id}


@router.post("")
async def dub(req: DubbingRequest):
    source = resolve_upload(req.source_audio)
    ref_audio, ref_text = voices.resolve_ref(req.voice_id)
    tts_lang = "th" if req.target_lang in ("ไทย", "th", "Thai") else "en"

    async def task(job, report):
        return await run_dubbing(
            source_audio=source,
            voice_ref=ref_audio,
            voice_ref_text=ref_text,
            target_lang=req.target_lang,
            translate=req.translate,
            source_lang=req.source_lang,
            tts_language=tts_lang,
            report=lambda p, m: report(job, p, m),
        )

    settings = get_settings()
    asr_resource = resource_for_requested_device(
        settings.asr_device,
        resolve_auto=lambda: resolve_asr_runtime(settings.asr_device)[0],
    )
    tts_resource = resource_for_requested_device(
        settings.tts_device,
        resolve_auto=lambda: resolve_tts_runtime(settings.tts_device),
    )
    job = jobs.spawn(
        "dubbing",
        task,
        resource="gpu" if "gpu" in {asr_resource, tts_resource} else "cpu",
    )
    return {"job_id": job.id}


@router.post("/render")
async def render(req: DubbingRenderRequest):
    """พากย์จากผล analyze เดิม โดยกำหนด voice แยกตาม speaker ที่ผู้ใช้จัดเอง."""
    analysis_job = jobs.get(req.analysis_job_id)
    if not analysis_job:
        raise HTTPException(404, "ไม่พบงานวิเคราะห์ transcript")
    if analysis_job.kind != "dubbing-analyze":
        raise HTTPException(422, "งานที่ระบุไม่ใช่งานวิเคราะห์ transcript")
    if analysis_job.status != "done" or not isinstance(analysis_job.result, dict):
        raise HTTPException(409, "งานวิเคราะห์ transcript ยังไม่สำเร็จ")

    analysis_result = analysis_job.result
    source_name = analysis_result.get("source_audio")
    transcript_result = analysis_result.get("transcript")
    raw_segments = (
        transcript_result.get("segments")
        if isinstance(transcript_result, dict)
        else None
    )
    if not isinstance(source_name, str) or not isinstance(raw_segments, list) or not raw_segments:
        raise HTTPException(422, "งานวิเคราะห์ไม่มี transcript ที่นำไปพากย์ได้")
    source = resolve_upload(source_name)

    segments_by_id: dict[str, dict] = {}
    for raw_segment in raw_segments:
        if not isinstance(raw_segment, dict):
            raise HTTPException(422, "ข้อมูล transcript ไม่ถูกต้อง")
        segment_id = raw_segment.get("id")
        text = raw_segment.get("text")
        start = raw_segment.get("start")
        end = raw_segment.get("end")
        if (
            not isinstance(segment_id, str)
            or not segment_id
            or segment_id in segments_by_id
            or not isinstance(text, str)
            or not text.strip()
            or not isinstance(start, (int, float))
            or not isinstance(end, (int, float))
            or not math.isfinite(start)
            or not math.isfinite(end)
            or start < 0
            or end <= start
        ):
            raise HTTPException(422, "ข้อมูล transcript มีช่วงเวลาไม่ถูกต้อง")
        segments_by_id[segment_id] = raw_segment

    assignments: dict[str, str] = {}
    for item in req.segment_speakers:
        if item.segment_id in assignments:
            raise HTTPException(422, f"segment ถูกกำหนด speaker ซ้ำ: {item.segment_id}")
        assignments[item.segment_id] = item.speaker_id
    if set(assignments) != set(segments_by_id):
        raise HTTPException(422, "ต้องกำหนด speaker ให้ทุก segment ของ transcript")

    voice_ids_by_speaker: dict[str, str] = {}
    for item in req.speaker_voices:
        if item.speaker_id in voice_ids_by_speaker:
            raise HTTPException(422, f"speaker ถูกกำหนด voice ซ้ำ: {item.speaker_id}")
        voice_ids_by_speaker[item.speaker_id] = item.voice_id
    assigned_speakers = set(assignments.values())
    if set(voice_ids_by_speaker) != assigned_speakers:
        raise HTTPException(422, "ต้องกำหนด voice ให้ speaker ที่ใช้ใน transcript ทุกคน")

    settings = get_settings()
    voice_root = settings.voices_dir.resolve()
    speaker_voices: dict[str, tuple[str, str]] = {}
    for speaker_id, voice_id in voice_ids_by_speaker.items():
        try:
            voice_ref, voice_ref_text = voices.resolve_ref(voice_id)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except (KeyError, OSError) as exc:
            raise HTTPException(422, f"voice profile ใช้งานไม่ได้: {voice_id}") from exc
        if not isinstance(voice_ref, str) or not voice_ref:
            raise HTTPException(422, f"voice profile ใช้งานไม่ได้: {voice_id}")
        voice_path = Path(voice_ref).resolve()
        if voice_path.parent != voice_root or not voice_path.is_file():
            raise HTTPException(422, f"ไม่พบไฟล์เสียงของ voice profile: {voice_id}")
        speaker_voices[speaker_id] = (str(voice_path), str(voice_ref_text or ""))

    segments = [
        SpeakerSegment(
            id=segment_id,
            start=float(raw_segment["start"]),
            end=float(raw_segment["end"]),
            text=raw_segment["text"],
            speaker_id=assignments[segment_id],
        )
        for segment_id, raw_segment in segments_by_id.items()
    ]
    detected_language = analysis_result.get("detected_language")
    if not isinstance(detected_language, str):
        detected_language = None
    duration = analysis_result.get("duration_sec")
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration < 0:
        duration = max(segment.end for segment in segments)
    duration = max(float(duration), max(segment.end for segment in segments))
    tts_language = "th" if req.target_lang in ("ไทย", "th", "Thai") else "en"

    async def task(job, report):
        result = await run_multispeaker_dubbing(
            source_audio=source,
            segments=segments,
            duration=float(duration),
            detected_language=detected_language,
            speaker_voices=speaker_voices,
            target_lang=req.target_lang,
            translate=req.translate,
            tts_language=tts_language,
            report=lambda progress, message: report(job, progress, message),
        )
        result["analysis_job_id"] = req.analysis_job_id
        result["source_audio"] = source_name
        result["speaker_voice_map"] = voice_ids_by_speaker
        return result

    tts_resource = resource_for_requested_device(
        settings.tts_device,
        resolve_auto=lambda: resolve_tts_runtime(settings.tts_device),
    )
    job = jobs.spawn("dubbing-render", task, resource=tts_resource)
    return {"job_id": job.id}


@router.post("/refine", response_model=RefineLineResponse)
async def refine(req: RefineLineRequest):
    """เกลาบทพากย์บรรทัดเดียวให้ความยาวคำพูดพอดีกับช่องเวลา (ช่วยแก้ปัญหาแปลแล้วยาวเกิน)

    เรียกสมอง (cloud/ollama ตามที่ตั้งค่าไว้) — ถ้าสมองพัง/error จะคืนข้อความเดิมกลับไป
    (ไม่ throw ให้ endpoint นี้ล้มเหลว เพราะเป็นแค่ตัวช่วยเสริม)
    """
    refined = await refine_line_for_duration(
        req.text, target_sec=req.target_sec, tone=req.tone
    )
    return {"refined": refined}
