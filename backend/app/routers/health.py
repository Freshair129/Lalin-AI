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
