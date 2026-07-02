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

    # ── chat_with_tools ─────────────────────────────────────
    @staticmethod
    def _to_ollama_tools(tools: list[dict]) -> list[dict]:
        """แปลง tool schema กลาง -> รูปแบบ Ollama (เหมือน OpenAI function-calling)."""
        out = []
        for t in tools:
            out.append(
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "parameters": t.get("input_schema") or t.get("parameters") or {
                            "type": "object",
                            "properties": {},
                        },
                    },
                }
            )
        return out

    async def chat_with_tools(
        self,
        messages: list[Message],
        tools: list[dict],
        *,
        temperature: float = 0.2,
    ) -> dict:
        """ลองใช้ tool-calling ของ Ollama ก่อน (โมเดลที่รองรับ เช่น qwen2.5/llama3.1)
        ถ้าไม่รองรับ (ไม่มี field tool_calls กลับมา) → fallback เป็นสั่งให้ตอบ JSON
        แล้ว parse เอง — ถ้า parse ไม่ได้ ก็คืนข้อความล้วนแบบไม่พัง
        """
        payload = self._payload(messages, temperature, max_tokens=2048, stream=False)
        payload["tools"] = self._to_ollama_tools(tools)
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                r = await client.post(f"{self.base_url}/api/chat", json=payload)
                r.raise_for_status()
                data = r.json()
            msg = data.get("message", {})
            raw_calls = msg.get("tool_calls") or []
            if raw_calls:
                tool_calls = []
                for c in raw_calls:
                    fn = c.get("function", {})
                    args = fn.get("arguments")
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except (ValueError, TypeError):
                            args = {}
                    tool_calls.append({"name": fn.get("name", ""), "arguments": args or {}})
                return {"text": _strip_think(msg.get("content", "")), "tool_calls": tool_calls}
        except (httpx.HTTPError, KeyError, ValueError):
            pass  # โมเดล/เวอร์ชันนี้อาจไม่รองรับ tools → ไปทาง fallback

        # ── fallback: ขอให้ตอบเป็น JSON object แล้ว parse เอง ──
        tool_desc = "\n".join(
            f"- {t['name']}: {t.get('description', '')} "
            f"(arguments schema: {json.dumps(t.get('input_schema') or t.get('parameters') or {}, ensure_ascii=False)})"
            for t in tools
        )
        instruction = Message(
            "system",
            "คุณสามารถเรียกใช้เครื่องมือ (tools) ต่อไปนี้ได้ ถ้าจำเป็น:\n"
            f"{tool_desc}\n\n"
            "ถ้าต้องการเรียกเครื่องมือ ให้ตอบเป็น JSON object รูปแบบนี้เท่านั้น "
            '(ไม่ต้องมีข้อความอื่นปน): '
            '{"tool_calls": [{"name": "...", "arguments": {...}}], "text": "..."}\n'
            "ถ้าไม่ต้องเรียกเครื่องมือ ให้ตอบข้อความปกติได้เลย",
        )
        fallback_messages = [instruction, *messages]
        res = await self.chat(fallback_messages, temperature=temperature, max_tokens=2048)
        text = res.text.strip()
        try:
            start = text.index("{")
            end = text.rindex("}") + 1
            parsed = json.loads(text[start:end])
            calls = parsed.get("tool_calls") or []
            norm = [
                {"name": c.get("name", ""), "arguments": c.get("arguments") or {}}
                for c in calls
                if isinstance(c, dict)
            ]
            return {"text": parsed.get("text", "") or "", "tool_calls": norm}
        except (ValueError, KeyError):
            # parse ไม่ได้ → เสื่อมสภาพอย่างนุ่มนวล คืนข้อความล้วน ไม่มี tool_calls
            return {"text": text, "tool_calls": []}

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
