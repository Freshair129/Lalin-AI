"""Endpoints ของสมอง: chat, stream, แปล, และสลับ provider (cloud/ollama)"""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ..brain import BrainConfig, Message, current_summary, get_brain, reconfigure
from ..schemas import BrainConfigRequest, ChatRequest, TranslateRequest

router = APIRouter(prefix="/brain", tags=["brain"])


@router.get("/config")
async def get_config():
    brain = get_brain()
    return {"config": current_summary(), "health": await brain.health()}


@router.post("/config")
async def set_config(req: BrainConfigRequest):
    """สลับสมองสด ๆ ระหว่าง cloud ↔ ollama (และเปลี่ยนรุ่นโมเดล)."""
    brain = reconfigure(
        BrainConfig(
            provider=req.provider,
            ollama_base_url=req.ollama_base_url,
            ollama_model=req.ollama_model,
            cloud_provider=req.cloud_provider,
            cloud_model=req.cloud_model,
            cloud_api_key=req.cloud_api_key,
        )
    )
    return {"config": current_summary(), "health": await brain.health()}


@router.post("/chat")
async def chat(req: ChatRequest):
    brain = get_brain()
    msgs = [Message(m.role, m.content) for m in req.messages]

    if req.stream:
        async def gen():
            async for chunk in brain.stream(
                msgs, temperature=req.temperature, max_tokens=req.max_tokens
            ):
                yield chunk
        return StreamingResponse(gen(), media_type="text/plain")

    res = await brain.chat(msgs, temperature=req.temperature, max_tokens=req.max_tokens)
    return {"text": res.text, "model": res.model, "provider": res.provider, "usage": res.usage}


@router.post("/translate")
async def translate(req: TranslateRequest):
    brain = get_brain()
    text = await brain.translate(
        req.text, target_lang=req.target_lang, source_lang=req.source_lang
    )
    return {"translation": text}
