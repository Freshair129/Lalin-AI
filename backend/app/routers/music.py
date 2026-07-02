"""Music remix — "Suno finishing studio" (รันเป็น job)

แยกเสียงร้องจากเพลง/เดโม่ → วางบน beat อื่น พร้อม BPM-sync/auto-tune/FX → มาสเตอร์
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..jobs import jobs
from ..pipelines.music import run_remix
from ..schemas import RemixRequest
from .files import resolve_upload

router = APIRouter(prefix="/music", tags=["music"])


@router.post("/remix")
async def remix(req: RemixRequest):
    source = resolve_upload(req.source_audio)
    beat = resolve_upload(req.beat_audio)
    loop = asyncio.get_event_loop()

    async def task(job, report):
        await report(job, 0.02, "เริ่มงาน remix…")

        # bridge: pipeline (sync, รันใน executor) -> report (async)
        def on_progress(frac: float, msg: str) -> None:
            asyncio.run_coroutine_threadsafe(report(job, frac, msg), loop)

        return await loop.run_in_executor(
            None,
            lambda: run_remix(
                source_audio=source,
                beat_audio=beat,
                target_lufs=req.target_lufs,
                do_autotune=req.do_autotune,
                do_fx=req.do_fx,
                offset_ms=req.offset_ms,
                reverb=req.reverb,
                delay=req.delay,
                progress=on_progress,
            ),
        )

    job = jobs.spawn("remix", task)
    return {"job_id": job.id}


class ExportFxBody(BaseModel):
    name: str               # ชื่อไฟล์ใน outputs/ (เช่น remix_xxx.wav)
    fmt: str = "wav"        # wav | mp3
    reverb: float = 0.0
    echo: float = 0.0
    comp: bool = False

@router.post("/export")
async def export_fx(req: ExportFxBody):
    from ..config import get_settings
    from ..utils.ids import short_id
    from ..pipelines.music import apply_master_fx
    s = get_settings()
    src = (s.outputs_dir / req.name).resolve()
    if not str(src).startswith(str(s.outputs_dir.resolve())) or not src.exists():
        raise HTTPException(404, "ไม่พบไฟล์")
    loop = asyncio.get_event_loop()

    async def task(job, report):
        await report(job, 0.3, "กำลังเบค master FX…")
        wav_out = str(s.outputs_dir / f"export_{short_id()}.wav")
        await loop.run_in_executor(None, lambda: apply_master_fx(
            input_path=str(src), out_path=wav_out,
            reverb=req.reverb, echo=req.echo, comp=req.comp))
        final = wav_out
        if req.fmt == "mp3":
            import subprocess, imageio_ffmpeg
            ff = imageio_ffmpeg.get_ffmpeg_exe()
            mp3 = wav_out[:-4] + ".mp3"
            await loop.run_in_executor(None, lambda: subprocess.run(
                [ff, "-y", "-i", wav_out, "-b:a", "320k", mp3], capture_output=True, check=True))
            final = mp3
        import os
        return {"output": os.path.basename(final)}

    job = jobs.spawn("export", task)
    return {"job_id": job.id}
