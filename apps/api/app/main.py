"""G-Music backend - FastAPI app."""
# @req NFR-05 — boot + mount router ตาม backend profile (lite/full)
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import get_settings
from .utils.ffmpeg import configure as configure_ffmpeg

LITE_FEATURES = ["voice-library", "files", "projects", "timeline-render", "brain", "market", "jobs"]
FULL_FEATURES = [*LITE_FEATURES, "tts", "dubbing", "mastering", "music-remix"]


def create_app(profile: str | None = None) -> FastAPI:
    """Create the API app.

    `full` keeps every ML pipeline router for source/dev use.
    `lite` keeps the desktop shell, file/project, brain, and catalog endpoints
    so installer packaging can validate without bundling the full ML stack.
    """
    selected_profile = (profile or os.getenv("GMUSIC_BACKEND_PROFILE", "full")).lower()
    if selected_profile not in {"full", "lite"}:
        selected_profile = "full"

    get_settings()
    configure_ffmpeg()

    from .routers import agent, brain, files, fs, health, jobs, packs, plugins, projects, render, speech, voices

    app = FastAPI(
        title="G-Music API",
        version=__version__,
        description="Voice cloning, dubbing, mastering, and remixing with switchable cloud/ollama brain",
    )
    app.state.backend_profile = selected_profile

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # render ไม่ต้องพึ่ง ML หนัก (แค่ scipy/soundfile — pedalboard เป็น optional
    # ที่ router เองปฏิเสธคำขอ master FX แบบมีข้อความชัดถ้ายังไม่ได้ติดตั้ง) จึงอยู่
    # ในกลุ่ม lite ได้เหมือน files/projects — ต่างจาก tts/dubbing/mastering/music
    # ที่โหลด torch/demucs/f5_tts ที่หนักและ gate ไว้เฉพาะ full profile
    router_modules = [health, brain, voices, files, fs, packs, projects, render, jobs, agent, plugins, speech]
    if selected_profile == "full":
        from .routers import dubbing, mastering, music, tts

        router_modules.extend([tts, dubbing, mastering, music])

    for router_module in router_modules:
        app.include_router(router_module.router)

    @app.get("/")
    async def root():
        return {
            "service": "G-Music",
            "version": __version__,
            "profile": selected_profile,
            "docs": "/docs",
            "features": FULL_FEATURES if selected_profile == "full" else LITE_FEATURES,
            "brain": "cloud/ollama switchable",
        }

    return app


app = create_app()
