"""G-Music backend - FastAPI app.

Includes routers for brain, voices, tts, dubbing, mastering, files, jobs,
and music remix. Run with: `uvicorn app.main:app --reload --port 8756`.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import get_settings
from .utils.ffmpeg import configure as configure_ffmpeg

settings = get_settings()
configure_ffmpeg()

from .routers import brain, dubbing, files, fs, health, jobs, mastering, music, packs, projects, tts, voices

app = FastAPI(
    title="G-Music API",
    version=__version__,
    description="Voice cloning · Dubbing · Mastering - switchable cloud/ollama brain",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (health, brain, voices, files, fs, tts, dubbing, mastering, music, packs, projects, jobs):
    app.include_router(r.router)


@app.get("/")
async def root():
    return {
        "service": "G-Music",
        "version": __version__,
        "docs": "/docs",
        "features": ["voice-clone", "dubbing", "mastering", "music-remix"],
        "brain": "cloud/ollama switchable",
    }
