# AI Agent Architecture — G-Music

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Status** | Draft |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

เอกสารนี้รวมสเปกของ "agent" ทุกชั้นในระบบ — ทั้งที่**อยู่ในผลิตภัณฑ์** (ผู้ใช้เจอ) และที่**ใช้พัฒนา** (dev-time) เพื่อไม่ให้ปนกัน

## ภาพรวม

```
ผลิตภัณฑ์ (runtime)                          เครื่องมือพัฒนา (dev-time)
┌──────────────────────────────┐            ┌──────────────────────────────┐
│ AI-AGT-001 Workspace Agent    │            │ AI-AGT-004 Dev Agent Swarm    │
│   (routers/agent.py + UI)     │            │   (SWARM_PLAN.md)             │
│ AI-AGT-002 MCP Server         │            │ AI-AGT-005 Local Micro-task   │
│   (apps/mcp)                  │            │   Dispatch (LEDGER)           │
│        │ ทั้งคู่เรียกผ่าน        │            └──────────────────────────────┘
│        ▼                      │
│ AI-AGT-003 Brain Abstraction  │
│   (app/brain/ factory)        │
└──────────────────────────────┘
```

## AI-AGT-001: Workspace Agent (ในแอป)

- **ที่อยู่:** `backend/app/routers/agent.py` + UI ใน workspace (Wave 3.3/3.6)
- **หน้าที่:** รับคำสั่งภาษาธรรมชาติจากผู้ใช้ → เรียกความสามารถของแอป (TTS/dubbing/mastering/remix)
- **โมเดล:** ใช้ Brain ปัจจุบัน (AI-AGT-003) — ผู้ใช้เลือก local/cloud เอง
- ✏️ TODO — ระบุรายการ tool ที่ agent เรียกได้ + guardrails (เช่น ห้ามลบไฟล์ผู้ใช้, ยืนยันก่อนงานที่ใช้เวลานาน)

## AI-AGT-002: MCP Server

- **ที่อยู่:** `apps/mcp/`
- **หน้าที่:** เปิดความสามารถ G-Music ให้ agent ภายนอก (เช่น Claude) เรียกผ่านโปรโตคอล MCP
- ✏️ TODO — ระบุรายการ tools/resources ที่ expose + นโยบายความปลอดภัย (งานไหนต้องยืนยันจากผู้ใช้)

## AI-AGT-003: Brain Abstraction (โครงสร้างพื้นฐาน)

- **ที่อยู่:** `backend/app/brain/` — `base.py` (interface `LLMProvider`), `ollama_provider.py`, `cloud_provider.py`, `factory.py`
- **หน้าที่:** ชั้นเดียวที่ agent/pipeline ทุกตัวใช้เรียก LLM — สลับ Ollama ↔ Cloud สดผ่าน `POST /brain/config` (FR-05.3)
- **กติกา:** provider ใหม่ต้อง implement `LLMProvider` แล้วต่อใน `factory.py` (ดู CLAUDE.md)
- โมเดลที่ใช้: ดู [model-cards/](model-cards/) — local default: [chinda-qwen3-4b](model-cards/chinda-qwen3-4b.md)

## AI-AGT-004: Dev-time Agent Swarm (ไม่ ship ในผลิตภัณฑ์)

- **สเปกเต็ม:** [SWARM_PLAN.md](../SWARM_PLAN.md) — Orchestrator (Fable) → Workers (Sonnet, worktree แยก) → Gate 1 correctness → Gate 2 integration → Final Gate product
- **ผลลัพธ์ที่บังคับ:** ทุก WP จบด้วย `tsc --noEmit` + `vitest run` ผ่านก่อนเข้า Gate

## AI-AGT-005: Local Micro-task Dispatch (dev-time)

- **สเปก + บันทึกผ่าน/ตก:** [LOCAL_MODEL_LEDGER.md](../LOCAL_MODEL_LEDGER.md)
- **กติกาสำคัญ:** เฉพาะ pure/self-contained micro-task ที่ตรวจ acceptance อัตโนมัติได้ · `maxReworkRounds: 1` แล้ว escalate · Verify Gate = tsc + unit assertion

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |

## Referenced Standards

- IEEE 1016-2009 (Software Design Description) · ISO/IEC 42001 (AI Management)
