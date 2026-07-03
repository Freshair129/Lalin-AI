# LOCAL_MODEL_LEDGER.md — anti-error-loop (file-based degrade path)

ledger ของ dispatch งานให้ local model (Ollama) ตาม SPEC--LOCAL-LLM-DISPATCH-V2 §6/§10
(**สเปกย้ายไปอยู่ `G:/Rwang/docs/` แล้ว 2026-07-03** — เป็นเอกสารชั้น orchestrator ไม่ใช่ของ target repo).
machine-readable SSOT = [orchestration/ledger.jsonl](../orchestration/ledger.jsonl) — ไฟล์นี้เป็น human-readable view.
ก่อน dispatch → `python orchestration/recall_mistakes.py --task "<คำอธิบาย task>"` แล้วฉีดผลเข้า prompt.
**อัปเดต 2026-07-03:** จาก benchmark v2 (74 dispatch จริง, 7 micro-task × 4 prompt-variant × 6 โมเดล) — ดู [REPORT V2](REPORT--LOCAL-LLM-DISPATCH.md)

## ✅ POOL (ผ่านการวัดจริง)
| ลำดับ | model | pass-rate (v-plain, gate tsc+visible+holdout) | median warm | VRAM | บทบาท |
|---|---|---|---|---|---|
| 1 | `qwen3:latest` (14.8B) | **7/7 = 100%** | **5.1s** | 10.05GB | **default** — VRAM ว่างเท่านั้น (เหลือ ~1.1GB ไม่พอ ML) |
| 2 | `sushirl:latest` (9B) | **7/7 = 100%** (ต้องใช้ extractor v2 — 0/7 ถ้า extract แบบ fence-แรก) | 11.6s | **5.57GB** | **co-resident กับ Demucs/whisper** (เหลือ ~5.5GB) |
| 3 | `hf.co/yuxinlu1/Mellum2-12B-A2.5B…:Q4_K_M` (MoE, active 2.5B) | 6/7 = 86% (fail เดียว = logic slip; temp 0.6 ตาม card) | **4.9s** (gen 127 tok/s — เร็วสุด) | 8.25GB | สำรองอันดับ 1 / งาน latency-sensitive |
| 4 | `hf.co/deepreinforce-ai/Ornith-1.0-9B…:Q4_K_M` (qwen3.5-base) | 6/7 = 86% (temp 0.6 ตาม card) + **tool-use 3/3 เร็วสุด 1.9–2.7s** | ~25s (think เยอะ) | **5.57GB** | **งาน agentic/tool-calling + co-resident** |
| 5 | `hf.co/empero-ai/Qwythos-9B…:Q4_K_M` | 5/7 = 71% **เฉพาะ temp 0.6** (temp 0.1 → repetition loop, 1/7) | 19.6s | 6.09GB | สำรองท้ายแถว |

### เฉพาะทาง tool-calling
| model | tool-use (S1-en / S2-th / S3-no-call) | code | บทบาท |
|---|---|---|---|
| `Ornith-1.0-9B` | ✅ 3/3 (1.9–2.7s) | 6/7 | ตัวหลักงาน agentic |
| `hf.co/yuxinlu1/gemma-4-12B-agentic…v2-3.5x-tau2` | ✅ 3/3 (2.3–4.1s) | **3/7 — ห้ามให้เขียนโค้ด** | tool-calling เท่านั้น · v2 GGUF แก้ special-token leak ของ coder v1 แล้ว |
| `qwen3:latest` | ❌ **think-loop timeout >900s เมื่อเจอ tools** | 7/7 | **ห้ามใช้กับ tool-calling เด็ดขาด** |

### candidate (ยังไม่เข้า pool)
| model | เหตุผล |
|---|---|
| `hf.co/unsloth/gemma-4-12b-it-GGUF:UD-Q4_K_XL` | ความสามารถผ่าน (14/14 ด้วย extractor v2) แต่ **ช้า 10x** (median 54.9s — `<|channel>thought` รั่วเป็น text ทุก run, Ollama ไม่แยก channel ของ arch gemma4) — ใช้ได้เมื่อไม่มีทางเลือก |

## ❌ FAILED / BLACKLIST (ห้ามใช้ซ้ำ)
| model | issue | severity | หลักฐาน/fix |
|---|---|---|---|
| `hf.co/yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF:Q4_K_M` | คืน `<unusedNN>` ล้วนทุกช่องทาง — **probe 4 ทาง (generate/chat/raw×2 template) ยืนยันเสียระดับ GGUF weights/vocab ไม่ใช่ template** | critical | **blacklist ถาวร — แก้ด้วย Modelfile ไม่ได้** (`orchestration/probe_gemma.py`) |
| `llama3.2:1b` | ตัด `export` ทิ้งจาก signature (compile ผ่านแต่ไม่ export) | major | เล็กเกินสำหรับ contract-following — ไม่เข้า pool |

## กติกา dispatch (อัปเดตตามผลวัด v2)
- **prompt = v-plain เท่านั้น** (template ตาม REPORT V2.7): signature เป๊ะ + rules bullet + acceptance เลขคำนวณได้ — **ห้าม bracket-header** (`[ROLE]…` ทำ pass 100%→71% + ช้า 10x จาก think-overflow)
- **PAST MISTAKES inject เฉพาะจาก `recall_mistakes.py`** (blacklist เสมอ + sim ≥ 0.5) — แทรกบรรทัดไม่ตรง task ทำ pass ร่วงเหลือ 57% (วัดจริง)
- **extractor v2 บังคับ** (อยู่ใน `dispatch.py`): strip think/orphan-`</think>` → fence สุดท้ายที่มี `export function` — ห้ามใช้ fence แรก
- **options ต่อโมเดล** จาก `dispatch.py:MODEL_OPTIONS` (default: temp 0.1/ctx 8192/predict 2500 · Qwythos: temp 0.6 ตาม card) — ห้าม config เดียวทุกโมเดล
- **pre-warm ก่อนทุก batch** ด้วย `scripts\prewarm_ollama.ps1` (num_ctx ต้องตรงกับ dispatch ไม่งั้น reload ทิ้งการอุ่น) · cold 56–115s → warm 5–12s · `-Unload` ก่อนงาน ML หนักถ้าใช้ qwen3
- เฉพาะ **pure/self-contained micro-task** ที่ acceptance ตรวจอัตโนมัติได้ · `maxReworkRounds: 1` → escalate (pool ถัดไป → T2 Sonnet → T3 Opus)
- Verify Gate: `tsc --strict` + assertion บน visible + holdout (`orchestration/verify_gate.mjs`) — empty/garbage/special-token = fail เสมอ
- embedding สำหรับ retrieval: `bge-m3` (1.2GB co-resident กับโมเดล 9B ได้)
