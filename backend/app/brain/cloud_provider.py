"""Cloud provider — รองรับ Anthropic (Claude), OpenAI และ OpenRouter

- anthropic  → ใช้ SDK `anthropic`
- openai     → ใช้ SDK `openai`
- openrouter → OpenAI-compatible (เปลี่ยน base_url)

import SDK แบบ lazy เพื่อให้เซิร์ฟเวอร์บูตได้แม้ยังไม่ได้ติดตั้งครบ
"""
from __future__ import annotations

from typing import AsyncIterator

from .base import ChatResult, LLMProvider, Message

_OPENROUTER_BASE = "https://openrouter.ai/api/v1"


class CloudProvider(LLMProvider):
    name = "cloud"

    def __init__(
        self,
        provider: str,
        api_key: str,
        model: str,
        base_url: str | None = None,
    ) -> None:
        self.provider = provider  # anthropic | openai | openrouter
        self.api_key = api_key
        self.model = model
        self.base_url = base_url or (_OPENROUTER_BASE if provider == "openrouter" else None)

    # ── Anthropic ───────────────────────────────────────────
    def _anthropic_client(self):
        from anthropic import AsyncAnthropic

        return AsyncAnthropic(api_key=self.api_key)

    @staticmethod
    def _split_system(messages: list[Message]) -> tuple[str, list[dict]]:
        system = "\n".join(m.content for m in messages if m.role == "system")
        convo = [
            {"role": m.role, "content": m.content}
            for m in messages
            if m.role != "system"
        ]
        return system, convo

    # ── OpenAI / OpenRouter ─────────────────────────────────
    def _openai_client(self):
        from openai import AsyncOpenAI

        return AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)

    # ── chat ────────────────────────────────────────────────
    async def chat(
        self, messages: list[Message], *, temperature: float = 0.7, max_tokens: int = 2048
    ) -> ChatResult:
        if self.provider == "anthropic":
            system, convo = self._split_system(messages)
            client = self._anthropic_client()
            resp = await client.messages.create(
                model=self.model,
                system=system or None,
                messages=convo,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            text = "".join(b.text for b in resp.content if b.type == "text")
            return ChatResult(
                text=text,
                model=self.model,
                provider=f"cloud:{self.provider}",
                usage={
                    "prompt_tokens": resp.usage.input_tokens,
                    "completion_tokens": resp.usage.output_tokens,
                },
            )

        # openai / openrouter
        client = self._openai_client()
        resp = await client.chat.completions.create(
            model=self.model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        usage = resp.usage
        return ChatResult(
            text=resp.choices[0].message.content or "",
            model=self.model,
            provider=f"cloud:{self.provider}",
            usage={
                "prompt_tokens": getattr(usage, "prompt_tokens", None),
                "completion_tokens": getattr(usage, "completion_tokens", None),
            },
        )

    # ── stream ──────────────────────────────────────────────
    async def stream(
        self, messages: list[Message], *, temperature: float = 0.7, max_tokens: int = 2048
    ) -> AsyncIterator[str]:
        if self.provider == "anthropic":
            system, convo = self._split_system(messages)
            client = self._anthropic_client()
            async with client.messages.stream(
                model=self.model,
                system=system or None,
                messages=convo,
                temperature=temperature,
                max_tokens=max_tokens,
            ) as stream:
                async for text in stream.text_stream:
                    yield text
            return

        client = self._openai_client()
        stream = await client.chat.completions.create(
            model=self.model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def health(self) -> dict:
        if not self.api_key:
            return {
                "ok": False,
                "provider": f"cloud:{self.provider}",
                "error": "ยังไม่ได้ตั้ง CLOUD_API_KEY",
            }
        return {
            "ok": True,
            "provider": f"cloud:{self.provider}",
            "model": self.model,
            "note": "มี API key แล้ว (ยังไม่ได้ทดสอบเรียกจริงเพื่อประหยัดโควต้า)",
        }
