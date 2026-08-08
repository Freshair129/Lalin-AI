# LOCAL_MODEL_LEDGER.md — anti-error-loop (file-based degrade path)

ledger ของ dispatch งานให้ local model (Ollama) ตาม SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP §6/§L0.
ก่อน dispatch งานคล้ายกันครั้งถัดไป → อ่าน "❌ PAST MISTAKES" ที่เกี่ยวข้องแล้วฉีดเข้า prompt.

| Field | Value |
|-------|-------|
| **Doc Version** | 1.0.1 |
| **Status** | Active (living ledger — append-only, ประวัติดูใน git) |
| **Author** | Boss |
| **Created** | — (ยุค swarm, ~2026-07) |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

## ✅ PASSED
| task | model | latency | note |
|---|---|---|---|
| `metronomeTicks` (grid.ts, pure beat-grid) | `qwen3:latest` (14.8B) | 186s (cold) | ผ่าน Verify Gate ครบ (times/accents/guards); Opus hardened float-drift |
| `estimateSpeechDurationSec` (dubbing/estimateSpeech.ts) | `qwen3:latest` (14.8B) | **5.6s (warm)** | ผ่าน Verify Gate ครบ; **warm = เร็ว 30x กว่า cold** |

## ❌ FAILED (ห้ามใช้ซ้ำ / ต้องเลี่ยง)
| model | issue | severity | fix/escalation |
|---|---|---|---|
| `hf.co/yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF:Q4_K_M` | คืน special token รั่ว `<unused30><unused14>` (eval_count=4) — GGUF/chat-template เสีย | critical | **อย่า dispatch โมเดลนี้** → escalate ไป `qwen3:latest` (ผ่าน) |

## กติกา dispatch (สรุปจากสเปก)
- prompt: ROLE/small-rules → SCAFFOLD (signature เป๊ะ) → GROUNDED CONTEXT (สั้น) → PAST MISTAKES → TASK+ACCEPTANCE; output = code block เดียว
- เฉพาะ **pure/self-contained micro-task** ที่ acceptance ตรวจได้อัตโนมัติ
- `maxReworkRounds: 1` → fail แล้ว escalate (โมเดลอื่น / Sonnet / Opus)
- Verify Gate: tsc + unit assertion บน acceptance — empty/garbage = fail เสมอ
- default local worker: **`qwen3:latest`** (9B+ known-good) · embedding (ถ้าใช้ retrieval): `bge-m3`
