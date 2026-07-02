"""Ollama provider — สมองแบบ local ผ่าน Ollama HTTP API."""
from __future__ import annotations

import json
import re
from typing import AsyncIterator

import httpx

from .base import ChatResult, LLMProvider, Message

# โมเดลแบบ thinking (qwen3, deepseek-r1 ฯลฯ) แทรก <think>…</think> มาด้วย
# ตัดทิ้งสำหรับงานแปล/เขียนสคริปต์ที่ต้องการเฉพาะคำตอบ
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)
_TIMEOUT = 600  # วินาที — thinking model + cold load อาจช้า


def _strip_think(text: str) -> str:
    return _THINK_RE.sub("", text).strip()


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self, base_url: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model

    def _payload(self, messages, temperature, max_tokens, stream):
        return {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": stream,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }

    async def chat(
        self, messages: list[Message], *, temperature: float = 0.7, max_tokens: int = 2048
    ) -> ChatResult:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                f"{self.base_url}/api/chat",
                json=self._payload(messages, temperature, max_tokens, stream=False),
            )
            r.raise_for_status()
            data = r.json()
        return ChatResult(
            text=_strip_think(data["message"]["content"]),
            model=self.model,
            provider=self.name,
            usage={
                "prompt_tokens": data.get("prompt_eval_count"),
                "completion_tokens": data.get("eval_count"),
            },
        )

    async def stream(
        self, messages: list[Message], *, temperature: float = 0.7, max_tokens: int = 2048
    ) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json=self._payload(messages, temperature, max_tokens, stream=True),
            ) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    chunk = json.loads(line)
                    if chunk.get("message", {}).get("content"):
                        yield chunk["message"]["content"]
                    if chunk.get("done"):
                        break

    async def health(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{self.base_url}/api/tags")
                r.raise_for_status()
                models = [m["name"] for m in r.json().get("models", [])]
            return {
                "ok": True,
                "provider": self.name,
                "model": self.model,
                "model_available": any(self.model in m for m in models),
                "installed_models": models,
            }
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "provider": self.name, "error": str(e)}
