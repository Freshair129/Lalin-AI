# @req NFR-02 — health check สถานะ server + brain (รองรับ FR-05.6)
from fastapi import APIRouter

from ..brain import current_summary, get_brain

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    brain = get_brain()
    return {
        "status": "ok",
        "service": "g-music",
        "brain": await brain.health(),
        "brain_config": current_summary(),
    }
