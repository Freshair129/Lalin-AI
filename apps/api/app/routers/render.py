# @req FR-09 — render timeline arrangement เป็นไฟล์ (แทน export ที่เบคได้แค่ไฟล์เดียว)
"""Render — รับ project ทั้งก้อน แล้ว mix arrangement ลงไฟล์เป็น job"""
from __future__ import annotations

import asyncio
import importlib.util
import os
import subprocess

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..config import get_settings
from ..jobs import jobs
from ..pipelines.render import DEFAULT_SR, build_render_plan, render_plan
from ..utils.ids import short_id

router = APIRouter(prefix="/render", tags=["render"])


class MasterFx(BaseModel):
    reverb: float = 0.0
    echo: float = 0.0
    comp: bool = False

    def is_active(self) -> bool:
        return self.comp or self.reverb > 0 or self.echo > 0


class RenderRequest(BaseModel):
    project: dict = Field(description="state ของ project (tracks/clips/assets) ตรงจาก snapshot")
    format: str = Field(default="wav", pattern="^(wav|mp3)$")
    sample_rate: int = DEFAULT_SR
    master: MasterFx = Field(default_factory=MasterFx)


def _pedalboard_available() -> bool:
    """แยกเป็นฟังก์ชันเพื่อให้เทสต์ monkeypatch ได้"""
    try:
        return importlib.util.find_spec("pedalboard") is not None
    except (ImportError, ValueError):
        return False


@router.post("")
async def render(req: RenderRequest):
    """mix arrangement ทั้งหมดลงไฟล์เดียว (เคารพ start/offset/gain/fade/mute/solo/pan)"""
    settings = get_settings()
    loop = asyncio.get_event_loop()

    async def task(job, report):
        await report(job, 0.05, "กำลังวางแผน render…")

        # กันคำโกหก: ถ้าขอ master FX แต่ไม่มี pedalboard ให้ล้มพร้อมบอกเหตุผล
        # (ห้ามคืนไฟล์ที่ไม่มี FX แล้วรายงานว่าสำเร็จ)
        if req.master.is_active() and not _pedalboard_available():
            raise RuntimeError(
                "ขอ master FX (reverb/echo/compressor) แต่ยังไม่ได้ติดตั้งปลั๊กอิน pedalboard "
                "— ติดตั้งด้วย `uv pip install pedalboard` (license GPLv3) แล้วลองใหม่ "
                "หรือปิด master FX แล้ว render ใหม่"
            )

        def on_progress(frac: float, msg: str) -> None:
            asyncio.run_coroutine_threadsafe(report(job, frac, msg), loop)

        plan = await loop.run_in_executor(
            None, lambda: build_render_plan(req.project, req.sample_rate)
        )
        wav_out = str(settings.outputs_dir / f"render_{short_id()}.wav")
        result = await loop.run_in_executor(
            None, lambda: render_plan(plan, wav_out, progress=on_progress)
        )

        final = wav_out
        if req.master.is_active():
            await report(job, 0.9, "กำลังเบค master FX…")
            from ..pipelines.music import apply_master_fx

            fx_out = str(settings.outputs_dir / f"render_{short_id()}_fx.wav")
            final = await loop.run_in_executor(None, lambda: apply_master_fx(
                input_path=wav_out, out_path=fx_out,
                reverb=req.master.reverb, echo=req.master.echo, comp=req.master.comp,
            ))

        if req.format == "mp3":
            await report(job, 0.95, "กำลังแปลงเป็น MP3…")
            import imageio_ffmpeg

            ff = imageio_ffmpeg.get_ffmpeg_exe()
            mp3 = final[:-4] + ".mp3"
            await loop.run_in_executor(None, lambda: subprocess.run(
                [ff, "-y", "-i", final, "-b:a", "320k", mp3], capture_output=True, check=True))
            final = mp3

        result["output"] = os.path.basename(final)
        return result

    job = jobs.spawn("render", task)
    return {"job_id": job.id}
