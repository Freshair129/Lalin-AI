"""Lite backend profile for installer-sidecar validation."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import get_settings
from .utils.ffmpeg import configure as configure_ffmpeg

LITE_FEATURES = ["voice-library", "files", "projects", "brain", "market", "jobs"]


def create_app() -> FastAPI:
    get_settings()
    configure_ffmpeg()

    from .routers import agent, brain, files, fs, health, jobs, packs, plugins, projects, speech, voices

    app = FastAPI(
        title="G-Music API",
        version=__version__,
        description="G-Music desktop shell sidecar profile",
    )
    app.state.backend_profile = "lite"

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router_module in (health, brain, voices, files, fs, packs, projects, jobs, agent, plugins, speech):
        app.include_router(router_module.router)

    @app.get("/")
    async def root():
        return {
            "service": "G-Music",
            "version": __version__,
            "profile": "lite",
            "docs": "/docs",
            "features": LITE_FEATURES,
            "brain": "cloud/ollama switchable",
        }

    return app


app = create_app()
