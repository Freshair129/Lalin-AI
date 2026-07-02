"""Brain abstraction — สัญญา (interface) เดียวที่ทุก LLM provider ต้องทำตาม

หน้าที่ของ "สมอง" ในระบบนี้:
  • แปลภาษา (สำหรับ dubbing)  • เขียน/ปรับสคริปต์  • สรุป/จัดรูปข้อความ
โค้ดส่วนอื่นเรียกผ่าน interface นี้เท่านั้น จึงสลับ cloud ↔ ollama ได้อิสระ
"""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import AsyncIterator


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class ChatResult:
    text: str
    model: str
    provider: str
    usage: dict = field(default_factory=dict)


class LLMProvider(abc.ABC):
    """Interface กลางของสมอง — ทุก provider implement เมธอดเหล่านี้."""

    name: str = "base"

    @abc.abstractmethod
    async def chat(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> ChatResult:
        """ตอบกลับครั้งเดียว (non-streaming)."""

    @abc.abstractmethod
    async def stream(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> AsyncIterator[str]:
        """สตรีมข้อความทีละชิ้น (yield token/chunk)."""

    @abc.abstractmethod
    async def health(self) -> dict:
        """ตรวจว่าสมองพร้อมใช้ไหม (เช่น Ollama รันอยู่/มี API key)."""

    # ── helper ที่ใช้ร่วมกันได้ ─────────────────────────────
    async def translate(
        self, text: str, *, target_lang: str, source_lang: str | None = None
    ) -> str:
        """แปลข้อความ — ใช้ในไปป์ไลน์ dubbing.

        target_lang / source_lang เป็นชื่อภาษาอ่านง่าย เช่น "ไทย", "English".
        """
        src = f"จากภาษา{source_lang} " if source_lang else ""
        system = (
            "You are a professional subtitle/dubbing translator. "
            "Translate naturally for spoken voice-over, keep it concise and "
            "matching the original tone. Return ONLY the translation, no notes."
        )
        user = f"แปลข้อความต่อไปนี้ {src}เป็นภาษา{target_lang}:\n\n{text}"
        res = await self.chat(
            [Message("system", system), Message("user", user)],
            temperature=0.3,
        )
        return res.text.strip()
