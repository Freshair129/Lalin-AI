"""สังเคราะห์เสียงจากข้อความด้วยเสียงที่โคลน (รันเป็น job)"""
# @req FR-02 — TTS + voice cloning (progress ผ่าน job/WS ตาม FR-02.7)
from __future__ import annotations

import asyncio

from fastapi import APIRouter

from ..config import get_settings
from ..jobs import jobs
from ..jobs.manager import JobTaskError
from ..jobs.resources import resource_for_requested_device
from ..pipelines import tts
from ..runtime_devices import resolve_tts_runtime
from ..schemas import TTSRequest
from ..services import voices
from ..utils.ids import short_id

router = APIRouter(prefix="/tts", tags=["tts"])


@router.post("")
async def synthesize(req: TTSRequest):
    ref_audio, ref_text = voices.resolve_ref(req.voice_id)
    settings = get_settings()
    out_path = str(settings.outputs_dir / f"tts_{short_id()}.wav")
    engine = tts.selected_engine(req.language, settings.tts_engine)
    resource = resource_for_requested_device(
        settings.tts_device,
        resolve_auto=lambda: resolve_tts_runtime(settings.tts_device),
    )

    def receipt(status: str, reason: str | None = None) -> dict:
        return {
            "requested": req.release_gpu_model,
            "model": engine,
            "status": status,
            "reason": reason,
        }

    async def task(job, report):
        was_cached = False
        baseline_allocated = None
        if req.release_gpu_model and resource == "gpu":
            # This task runs inside JobManager's GPU FIFO lock. Snapshot cache
            # ownership here so a model retained from an earlier job is never evicted.
            was_cached = tts.has_cached_model(engine)
            if not was_cached:
                loop = asyncio.get_running_loop()
                try:
                    baseline_allocated = await loop.run_in_executor(
                        None, tts.cuda_memory_allocated
                    )
                except Exception:  # noqa: BLE001
                    baseline_allocated = None

        await report(job, 0.2, "กำลังโหลดโมเดล + สังเคราะห์…")
        loop = asyncio.get_running_loop()
        synthesis_error: str | None = None
        try:
            await loop.run_in_executor(
                None,
                lambda: tts.synthesize(
                    req.text, out_path, ref_audio=ref_audio, ref_text=ref_text,
                    language=req.language, speed=req.speed, engine=engine,
                ),
            )
        except Exception as exc:  # noqa: BLE001
            synthesis_error = str(exc)

        if not req.release_gpu_model:
            gpu_release = receipt("not_requested")
        elif resource != "gpu":
            gpu_release = receipt("not_applicable", "tts_device_is_cpu")
        elif was_cached:
            gpu_release = receipt("preexisting_model_retained", "model_cached_before_job")
        else:
            identity = tts.cached_model_identity(engine)
            if identity is None:
                try:
                    release = await loop.run_in_executor(
                        None,
                        lambda: tts.verify_no_model_loaded_by_job(
                            engine, baseline_allocated
                        ),
                    )
                except Exception:  # noqa: BLE001
                    release = {
                        "status": "unknown",
                        "reason": "cuda_release_verification_failed",
                    }
                gpu_release = receipt(release["status"], release["reason"])
            else:
                try:
                    release = await loop.run_in_executor(
                        None,
                        lambda: tts.release_cached_model(
                            engine, identity, baseline_allocated
                        ),
                    )
                except Exception:  # noqa: BLE001
                    release = {
                        "status": "unknown",
                        "reason": "cuda_release_verification_failed",
                    }
                gpu_release = receipt(release["status"], release["reason"])

        result = {
            "output": out_path if synthesis_error is None else None,
            "gpu_release": gpu_release,
        }
        if synthesis_error is not None:
            raise JobTaskError(synthesis_error, result)
        return result

    job = jobs.spawn("tts", task, resource=resource)
    return {"job_id": job.id}
