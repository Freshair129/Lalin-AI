"""Music remix — "Suno finishing studio" (รันเป็น job)

แยกเสียงร้องจากเพลง/เดโม่ → วางบน beat อื่น พร้อม BPM-sync/auto-tune/FX → มาสเตอร์
"""
# @req FR-04b — music remix (Suno finishing studio) + export master FX
from __future__ import annotations

import asyncio
import shutil
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..jobs import jobs
from ..jobs.resources import automatic_torch_resource
from ..pipelines.music import run_remix
from ..pipelines.music_warp import analyze_drift, validate_manual_anchors
from ..schemas import RemixPreviewRequest, RemixRequest
from ..services import music_previews
from ..services.music_previews import MusicPreviewError
from .files import resolve_upload

router = APIRouter(prefix="/music", tags=["music"])


@router.post("/remix")
async def remix(req: RemixRequest):
    source = resolve_upload(req.source_audio)
    beat = resolve_upload(req.beat_audio)
    if req.preview_id:
        if req.preview_revision is None or not req.map_digest:
            raise HTTPException(422, "preview_id requires preview_revision and map_digest")
        try:
            manifest, _ = music_previews.load_revision(req.preview_id, req.preview_revision)
            _validate_preview_fingerprints(manifest, source, beat, _remix_settings(req))
            mode = "warp_candidate" if req.accept_warp else "global_only"
            if req.accept_warp and not manifest.get("warp_candidate", {}).get("available"):
                raise MusicPreviewError(409, "warp_candidate_unavailable")
            expected_digest = manifest.get("render_map_digests", {}).get(mode)
            if not expected_digest or req.map_digest != expected_digest:
                raise MusicPreviewError(409, "stale_warp_preview")
            _, preview_audio = music_previews.audio_file(req.preview_id, req.preview_revision, mode)
        except MusicPreviewError as exc:
            raise HTTPException(exc.status_code, exc.code) from exc

        loop = asyncio.get_event_loop()

        async def preview_task(job, report):
            await report(job, 0.2, "ตรวจ fingerprint และ revision ของ preview…")
            try:
                current, current_audio = music_previews.audio_file(req.preview_id, req.preview_revision, mode)
                _validate_preview_fingerprints(current, source, beat, _remix_settings(req))
            except MusicPreviewError as exc:
                raise RuntimeError(exc.code) from exc
            await report(job, 0.65, "กำลังเพิ่มเสียง preview เข้า outputs…")
            from ..config import get_settings
            from ..utils.ids import short_id

            final_path = get_settings().outputs_dir / f"remix_{short_id()}.wav"
            await loop.run_in_executor(None, lambda: shutil.copy2(current_audio, final_path))
            result = current.get("render_summaries", {}).get(mode, {})
            return {
                **result,
                "output": str(final_path),
                "preview_id": req.preview_id,
                "preview_revision": req.preview_revision,
                "map_digest": req.map_digest,
                "warp_applied": req.accept_warp,
            }

        job = jobs.spawn("remix", preview_task, resource="cpu")
        return {"job_id": job.id}

    if req.accept_warp or req.preview_revision is not None or req.map_digest is not None:
        raise HTTPException(422, "warp rendering requires a current preview")
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
                autotune_strength=req.autotune_strength,
                key_override=req.key_override,
                do_fx=req.do_fx,
                phrase_bars=req.phrase_bars,
                beats_per_bar=req.beats_per_bar,
                offset_ms=req.offset_ms,
                reverb=req.reverb,
                delay=req.delay,
                stem_gains=req.stem_gains,
                progress=on_progress,
            ),
        )

    job = jobs.spawn("remix", task, resource=automatic_torch_resource())
    return {"job_id": job.id}


@router.post("/remix/preview")
async def remix_preview(req: RemixPreviewRequest):
    music_previews.cleanup_expired()
    source = resolve_upload(req.source_audio)
    beat = resolve_upload(req.beat_audio)
    render_settings = req.render_settings.model_dump()
    settings_fingerprint = music_previews.fingerprint_json(_preview_settings(req))
    source_fingerprint = music_previews.fingerprint_file(source)
    beat_fingerprint = music_previews.fingerprint_file(beat)

    if req.preview_id:
        if req.warp_mode != "manual":
            raise HTTPException(422, "existing preview revisions are reserved for manual anchor edits")
        try:
            previous_revision = music_previews.latest_revision(req.preview_id)
            if req.base_revision != previous_revision:
                raise MusicPreviewError(409, "stale_warp_preview")
            previous, _ = music_previews.load_revision(req.preview_id, previous_revision)
            _validate_preview_fingerprints(previous, source, beat, _preview_settings(req))
        except MusicPreviewError as exc:
            raise HTTPException(exc.status_code, exc.code) from exc
        preview_id = req.preview_id
        revision = previous_revision + 1
    else:
        preview_id = music_previews.new_preview_id()
        revision = 1

    # The values are frozen into the job closure and then into its immutable manifest.
    folder = music_previews.revision_dir(preview_id, revision)
    if folder.exists():
        shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir(parents=True, exist_ok=True)
    loop = asyncio.get_event_loop()

    async def task(job, report):
        await report(job, 0.02, "เตรียม global-only preview และตรวจ drift…")
        global_path = str(folder / "global_only.wav")
        global_work = str(folder / "_work_global")
        analysis: dict = {}

        def on_progress(frac: float, message: str) -> None:
            mapped = 0.08 + float(frac) * (0.49 if req.warp_mode != "off" else 0.82)
            asyncio.run_coroutine_threadsafe(report(job, mapped, message), loop)

        def render_global():
            return run_remix(
                source_audio=source, beat_audio=beat,
                target_lufs=render_settings["target_lufs"],
                do_autotune=render_settings["do_autotune"],
                autotune_strength=render_settings["autotune_strength"],
                key_override=render_settings["key_override"],
                do_fx=render_settings["do_fx"],
                phrase_bars=req.phrase_bars,
                beats_per_bar=req.beats_per_bar,
                offset_ms=req.offset_ms,
                reverb=render_settings["reverb"],
                delay=render_settings["delay"],
                stem_gains=render_settings["stem_gains"],
                progress=on_progress,
                work_dir=global_work,
                output_path=global_path,
                analysis_out=analysis,
                analysis_window_bars=req.window_bars,
                analysis_hop_bars=req.hop_bars,
            )

        saved = False
        try:
            baseline_result = await loop.run_in_executor(None, render_global)
            drift = analyze_drift(
                analysis.get("source_beats_sec", []),
                analysis.get("destination_beats_sec", []),
                target_bpm=float(analysis.get("target_bpm", 0.0)),
                beats_per_bar=req.beats_per_bar,
                phase_offset_sec=float(analysis.get("phase_offset_sec", 0.0)),
                phrase_offset_sec=float(analysis.get("phrase_offset_sec", 0.0)),
                source_confidence=float(analysis.get("source_confidence", 0.0)),
                destination_confidence=float(analysis.get("destination_confidence", 0.0)),
                alignment_confidence=float(analysis.get("alignment_confidence", 0.0)),
                window_bars=req.window_bars,
                hop_bars=req.hop_bars,
            )
            auto_anchors = [anchor.__dict__ for anchor in drift.anchors]
            candidate_anchors: list[dict] = []
            candidate_origin = "auto"
            if req.warp_mode == "manual":
                candidate_anchors = validate_manual_anchors(
                    req.anchors,
                    duration_sec=float(analysis["duration_sec"]),
                    beats_per_bar=req.beats_per_bar,
                    target_bpm=float(analysis["target_bpm"]),
                )
                candidate_origin = "manual"
            elif req.warp_mode == "suggest" and drift.status == "drift_detected":
                candidate_anchors = auto_anchors

            candidate_result = None
            if candidate_anchors:
                await report(job, 0.58, "กำลังเรนเดอร์ warp candidate สำหรับ A/B…")
                candidate_path = str(folder / "warp_candidate.wav")
                candidate_work = str(folder / "_work_warp")

                def render_candidate():
                    return run_remix(
                        source_audio=source, beat_audio=beat,
                        target_lufs=render_settings["target_lufs"],
                        do_autotune=render_settings["do_autotune"],
                        autotune_strength=render_settings["autotune_strength"],
                        key_override=render_settings["key_override"],
                        do_fx=render_settings["do_fx"],
                        phrase_bars=req.phrase_bars,
                        beats_per_bar=req.beats_per_bar,
                        # Pin the candidate to the exact resolved phase used by
                        # the global-only preview, including auto phase refine.
                        offset_ms=float(analysis["phase_offset_sec"]) * 1000.0,
                        reverb=render_settings["reverb"],
                        delay=render_settings["delay"],
                        stem_gains=render_settings["stem_gains"],
                        progress=lambda frac, message: on_progress(0.25 + frac * 0.65, message),
                        warp_anchors=candidate_anchors,
                        work_dir=candidate_work,
                        output_path=candidate_path,
                    )

                candidate_result = await loop.run_in_executor(None, render_candidate)

            clean_auto_anchors = auto_anchors
            if candidate_origin == "manual":
                baseline_shift = float(analysis["phase_offset_sec"]) + float(analysis["phrase_offset_sec"])
                candidate_anchors = [
                    {
                        **anchor,
                        "drift_ms": round((anchor["timeline_time_sec"] - anchor["input_time_sec"] - baseline_shift) * 1000.0, 3),
                        "confidence": drift.confidence,
                    }
                    for anchor in candidate_anchors
                ]

            expires = music_previews.expires_at()
            global_digest = music_previews.fingerprint_json({
                "mode": "global_only", "source": source_fingerprint,
                "beat": beat_fingerprint, "settings": settings_fingerprint,
                "phase_offset_sec": analysis.get("phase_offset_sec", 0.0),
                "phrase_offset_sec": analysis.get("phrase_offset_sec", 0.0),
            })
            candidate_digest = music_previews.fingerprint_json({
                "map_version": 1, "anchors": candidate_anchors,
                "source": source_fingerprint, "beat": beat_fingerprint,
                "settings": settings_fingerprint,
            }) if candidate_result else None
            baseline_summary = {key: value for key, value in baseline_result.items() if key != "output"}
            candidate_summary = ({key: value for key, value in candidate_result.items() if key != "output"}
                                 if candidate_result else None)
            audio_preview = {
                "global_only_url": f"/music/preview/{preview_id}/{revision}/global_only",
                "warp_candidate_url": f"/music/preview/{preview_id}/{revision}/warp_candidate" if candidate_result else None,
                "temporary": True,
                "expires_at": expires,
            }
            response = {
                "contract_version": 1,
                "preview_id": preview_id,
                "revision": revision,
                "state": "ready",
                "source_fingerprint": source_fingerprint,
                "beat_fingerprint": beat_fingerprint,
                "settings_fingerprint": settings_fingerprint,
                "baseline": {
                    "source_bpm": analysis.get("source_bpm"),
                    "target_bpm": analysis.get("target_bpm"),
                    "global_stretch_rate": analysis.get("global_stretch_rate"),
                    "beats_per_bar": req.beats_per_bar,
                    "phrase_bars": req.phrase_bars,
                    "phase_offset_ms": round(float(analysis.get("phase_offset_sec", 0.0)) * 1000.0, 3),
                    "phrase_offset_sec": analysis.get("phrase_offset_sec"),
                },
                "drift": drift.as_dict(),
                "anchors": candidate_anchors if candidate_origin == "manual" else clean_auto_anchors,
                "warp_candidate": {
                    "available": bool(candidate_result),
                    "accepted": False,
                    "map_version": 1,
                    "map_digest": candidate_digest,
                    "origin": candidate_origin if candidate_result else None,
                    "reason": None if candidate_result else (drift.reason or drift.status),
                },
                "global_only_map_digest": global_digest,
                "render_map_digests": {
                    "global_only": global_digest,
                    "warp_candidate": candidate_digest,
                },
                "timeline_preview": {
                    "time_base": "destination_seconds",
                    "mode": "transient_overlay",
                    "source_asset_id": req.source_audio,
                    "beat_asset_id": req.beat_audio,
                    "anchor_ids": [item["id"] for item in (candidate_anchors if candidate_origin == "manual" else clean_auto_anchors)],
                    "drift_status": drift.status,
                },
                "audio_preview": audio_preview,
                "render_summaries": {
                    "global_only": baseline_summary,
                    "warp_candidate": candidate_summary,
                },
                "warnings": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": expires,
            }
            music_previews.save_revision(preview_id, revision, response)
            saved = True
            await report(job, 0.97, "บันทึก preview revision และ fingerprints…")
            return response
        finally:
            shutil.rmtree(global_work, ignore_errors=True)
            shutil.rmtree(str(folder / "_work_warp"), ignore_errors=True)
            if not saved:
                shutil.rmtree(folder, ignore_errors=True)

    job = jobs.spawn("music-remix-preview", task, resource=automatic_torch_resource())
    return {"job_id": job.id, "preview_id": preview_id, "revision": revision}


@router.get("/preview/{preview_id}/{revision}/{mode}")
async def get_remix_preview_audio(preview_id: str, revision: int, mode: str):
    try:
        _, path = music_previews.audio_file(preview_id, revision, mode)
    except MusicPreviewError as exc:
        raise HTTPException(exc.status_code, exc.code) from exc
    return FileResponse(path, media_type="audio/wav", filename=path.name)


def _preview_settings(req: RemixPreviewRequest) -> dict:
    return {
        "render_settings": req.render_settings.model_dump(),
        "phrase_bars": req.phrase_bars,
        "beats_per_bar": req.beats_per_bar,
        "offset_mode": req.offset_mode,
        "offset_ms": req.offset_ms,
        "window_bars": req.window_bars,
        "hop_bars": req.hop_bars,
    }


def _remix_settings(req: RemixRequest) -> dict:
    return {
        "render_settings": {
            "target_lufs": req.target_lufs,
            "do_autotune": req.do_autotune,
            "autotune_strength": req.autotune_strength,
            "key_override": req.key_override,
            "do_fx": req.do_fx,
            "reverb": req.reverb,
            "delay": req.delay,
            "stem_gains": req.stem_gains,
        },
        "phrase_bars": req.phrase_bars,
        "beats_per_bar": req.beats_per_bar,
        "offset_mode": "auto" if req.offset_ms is None else "manual",
        "offset_ms": req.offset_ms,
        "window_bars": req.window_bars,
        "hop_bars": req.hop_bars,
    }


def _validate_preview_fingerprints(manifest: dict, source: str, beat: str, settings: dict) -> None:
    if manifest.get("source_fingerprint") != music_previews.fingerprint_file(source):
        raise MusicPreviewError(409, "stale_warp_preview")
    if manifest.get("beat_fingerprint") != music_previews.fingerprint_file(beat):
        raise MusicPreviewError(409, "stale_warp_preview")
    if manifest.get("settings_fingerprint") != music_previews.fingerprint_json(settings):
        raise MusicPreviewError(409, "stale_warp_preview")


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

    job = jobs.spawn("export", task, resource="cpu")
    return {"job_id": job.id}
