# RCA — Local-LLM Dispatch Failures (Root Cause Analysis)

> **วันที่วิเคราะห์:** 2026-07-03 · **ผู้วิเคราะห์:** agent refine (branch `swarm/local-llm-refine`)
> **ขอบเขต:** ความล้มเหลว/ความช้าของการ dispatch micro-task ให้ local model (Ollama, RTX 3060 12GB)
> **วิธีการ:** empirical เท่านั้น — benchmark 74 dispatch จริง + probe เจาะจงต่อสมมติฐาน ทุกข้อสรุปมีคำสั่ง+ตัวเลขอ้างอิง
> **หลักฐานประกอบ:** [REPORT V2](REPORT--LOCAL-LLM-DISPATCH.md) · `orchestration/bench_results.jsonl` · `orchestration/bench_raw/*.txt`

---

## Incident 1 — gemma-4-12B-coder คืน `<unused30><unused14>` แทนโค้ด

| | |
|---|---|
| **อาการ** | dispatch #1 (2026-07-02): eval_count=4, output เป็น special token, เสียเวลา 161.7s กลาง batch |
| **ผลกระทบ** | เสีย 1 dispatch + cold-load 1 รอบ (~160s) ก่อน escalate; เสี่ยงเกิดซ้ำถ้าโมเดลใหม่เข้า pool โดยไม่ตรวจ |
| **สมมติฐานเดิม (v1)** | "GGUF/chat-template เสีย" — ยังไม่แยกว่า template หรือ weights |

### การพิสูจน์ (probe 4 ทาง — `orchestration/probe_gemma.py`, โมเดล warm)

| probe | เส้นทาง | ผล |
|---|---|---|
| P1 | `/api/generate` (template ของโมเดล) | eval=1, output ว่าง |
| P2 | `/api/chat` + system role + messages array | eval=67, `<unused33><unused27>…[multimodal]…` ล้วน |
| P3 | `raw:true` + ประกอบ template gemma4 (`<|turn>`) เอง | eval=33, `<unusedNN>` ล้วน |
| P4 | `raw:true` + template gemma ดั้งเดิม (`<start_of_turn>`) | eval=83, `<unusedNN>` ล้วน |

**ตัวควบคุม (control):** `gemma-4-12b-it` (unsloth) — arch `gemma4` + Jinja template **เดียวกันเป๊ะ** (ตรวจด้วย `ollama show --template` ทั้งคู่) → generate ข้อความจริงได้ปกติ

### Root cause (สรุปขั้นสุดท้าย)

**GGUF export ของ community build นี้เสียระดับ weights/vocab mapping** — โมเดลทำนาย token ในช่วง unused-slot ไม่ว่า input จะถูก format อย่างไร (แม้ raw mode ที่ข้าม template ทุกชั้น) → **ไม่ใช่ปัญหา template, ไม่ใช่ปัญหา prompt, แก้ด้วย Modelfile ไม่ได้ = เสียถาวร**

### Contributing factor
- ไม่มี onboarding gate: โมเดลถูกใส่เข้า pool โดยไม่เคย smoke-test (spec FR-1 เขียนไว้แล้วแต่ยังไม่ implement ตอนนั้น)

### Corrective actions
| action | สถานะ |
|---|---|
| blacklist ถาวรใน `ledger.jsonl` (`blacklist:true` → recall inject เตือนทุก dispatch) | ✅ ทำแล้ว |
| Verify Gate ตรวจ special-token leak (`<unused\d+>`, `<pad>`, `<\|…\|>`) = fail ทันที | ✅ อยู่ใน `dispatch.py:analyze_output` |
| smoke-test ทุกโมเดลใหม่ก่อนเข้า pool (FR-1) — ใช้ `bench.py --tasks clamp01` ได้ทันที | ✅ เครื่องมือพร้อม (3 นาที/โมเดล) |

---

## Incident 2 — cold-load "180s" ครอบงำเวลา dispatch

| | |
|---|---|
| **อาการ** | v1 รายงาน cold 161–186s vs warm 5.6s (~33x) |
| **ผลกระทบ** | dispatch แรกของทุก batch แพงมาก; ประเมิน budget เพี้ยนถ้าคิดว่า 180s เป็นค่าคงที่ |

### การพิสูจน์ (วัด `load_duration` จริงทุกการโหลด, VRAM state ควบคุมได้)

| เงื่อนไข | load_duration |
|---|---|
| qwen3 (9GB) จาก **VRAM ว่าง** | **62.7s** |
| qwen3 reload โดย **evict** sushirl | **88.1s** (+40%) |
| Qwythos evict gemma-it / evict gemma-coder | 80.1s / **115.3s** |
| sushirl (5.6GB) ×2 ครั้ง | 55.6s / 63.5s |

ข้อเท็จจริงระบบ: blob อยู่บน **C: = SATA SSD** (WDC WDS250G2B0A, ~500MB/s → 9GB ≈ 19s ขั้นต่ำแค่อ่าน disk) + เหลือที่ **17GB** (เกือบเต็ม) · เวลา cold ≈ load_duration ล้วน (wall − load < 1s)

### Root cause

cold-load = **อ่าน blob จาก SATA SSD + dequant/PCIe upload + alloc KV cache** โดยมี **eviction เป็นตัวแปรเพิ่ม 25–40%** — ตัวเลข 160–186s ของ v1 **reproduce ไม่ได้บนเครื่องว่าง** (แบนด์จริง 56–115s); ส่วนต่างที่เหลืออธิบายได้จาก disk/CPU contention ช่วง swarm รันหลาย worker พร้อมกัน (ไม่สามารถ reproduce สภาพนั้นได้แล้ว — บันทึกเป็นข้อจำกัดการวิเคราะห์)

### Root cause ย่อยที่เจอใหม่ (สำคัญกว่าตัวเลข 180s)

**pre-warm ที่ num_ctx ไม่ตรงกับ dispatch จริง = อุ่นทิ้งเปล่า** — วัดพบ: llama3.2:1b prewarm (ctx default) 20.4s แล้ว call ถัดไป (ctx 8192) โดน reload ซ้ำ 3.7s เพราะ Ollama re-allocate context ใหม่ → pre-warm strategy เดิมของ v1 ("ยิง dummy 1 ครั้ง") มีเงื่อนไขซ่อนที่ไม่เคยระบุ

### Corrective actions
| action | สถานะ |
|---|---|
| `scripts\prewarm_ollama.ps1` — อุ่นด้วย **num_ctx 8192 ตรงกับ dispatch** + keep_alive 30m | ✅ ทำแล้ว, ทดสอบจริง |
| `-Unload` switch เขี่ยโมเดลก่อนงาน ML หนัก (mutex FR-5 แบบ manual) | ✅ ทำแล้ว (รองรับ embedding model ด้วย) |
| ใช้ sushirl (5.57GB) เป็นตัว co-resident → ตัดปัญหา evict-reload ทั้งวงจร | ✅ วัดแล้ว 7/7 |
| เฝ้าระวัง: disk C: เหลือ 17GB — ถ้าเต็มกว่านี้ cold จะแย่ลงอีก | ⚠️ แจ้งผู้ใช้ |

---

## Incident 3 — prompt contract: pass-rate แกว่งตาม prompt shape โดยไม่รู้สาเหตุ

| | |
|---|---|
| **อาการ** | v1 สังเกตว่า bracket-header "ไม่ได้ช่วย" แต่ไม่มีตัวเลข; ไม่รู้ว่า acceptance/past-mistakes มีผลจริงแค่ไหน |
| **ผลกระทบ** | จูน prompt ด้วยความเชื่อ ไม่ใช่ข้อมูล |

### การพิสูจน์ (A/B 4 variant × 7 task บน qwen3 ตัวเดียว, warm ทั้งหมด)

| variant | pass | median lat | median eval | กลไกที่เห็นจาก raw |
|---|---|---|---|---|
| **v-plain** | **7/7** | **5.1s** | 142 | qwen3 ปล่อย `<think>` **ว่าง** → เขียนโค้ดทันที |
| v-plain-nacc (ไม่มี acceptance) | 6/7 | 6.1s | 175 | syntax hallucination (`String.padStart` static) — ไม่มีตัวอย่าง output ให้ยึด |
| v-bracket | 5/7 | 49.0s | 1492 | จุด CoT ยาว 675–2500 tok → 2 เคส **ชน num_predict → โค้ดโดนตัด** + พลาด rule บน holdout |
| v-plain-pm (past-mistakes ไม่ตรง task) | 4/7 | 5.6s | 160 | logic เพี้ยน (start/end=null) + จุด think-overflow |
| v-plain-pm+**recall** (bge-m3 คัด) | 3/3* | 6.6s | 184 | *บน 3 task ที่ pm-static ตกพอดี |

### Root cause

failure ของ qwen3 ทุกเคสสาวกลับได้ที่ **ปริมาณ/คุณภาพของ context ที่ prompt เหนี่ยวนำ** ไม่ใช่ความสามารถโมเดล:
1. **bracket-header เหนี่ยวนำ chain-of-thought ยาว 10 เท่า** → ช้า + think กิน num_predict จน output ถูกตัด (failure mode อันดับ 1)
2. **ไม่มี acceptance ตัวเลข** → โมเดลไม่มี anchor → หลุด syntax/API ที่ไม่มีจริง
3. **inject ข้อความไม่เกี่ยวกับ task** → รบกวน attention → logic เพี้ยน (100% → 57%)

### Corrective actions
| action | สถานะ |
|---|---|
| Prompt template v2 = v-plain + acceptance บังคับ (REPORT V2.7) | ✅ commit แล้ว |
| PAST MISTAKES inject เฉพาะผ่าน `recall_mistakes.py` (blacklist เสมอ + sim ≥ 0.5) — ไม่มีอะไรตรง = ไม่ใส่เลย | ✅ ทำแล้ว, วัดแล้ว |
| `num_predict ≥ 2500` คงไว้ + gate จับ eval ชน cap (= truncation) | ✅ อยู่ใน harness |

---

## Incident 4 (พบระหว่างวิเคราะห์) — harness เดิมตัดสินโมเดลผิด: extraction naive

| | |
|---|---|
| **อาการ** | sushirl 0/7, Qwythos 1/7, gemma-it 9/14 — ดูเหมือน "โมเดลห่วย" |
| **การพิสูจน์** | re-verify แบบ offline จาก raw เดิม (`orchestration/reextract.py` — gate เดิมเป๊ะ ไม่รันโมเดลซ้ำ) |

### Root cause

**regex เดิมจับ fence แรกเสมอ** แต่โมเดลตระกูล qwen3.5 (sushirl/Qwythos) พ่น CoT ไร้ tag (template auto-open `<think>` ตอน generation) ที่ **restate โจทย์ซึ่งมี ``` อยู่ในเนื้อความ** → extractor คว้า "โค้ด" ผิดก้อน ทั้งที่คำตอบจริงถูกต้อง

### ผลหลังแก้ (extractor v2: strip orphan `</think>` + เลือก fence สุดท้ายที่มี `export function`)

| model | ก่อน | หลัง | ยืนยัน |
|---|---|---|---|
| sushirl | 0/7 | **7/7** | offline + **re-run สด 7/7 @ 11.6s** |
| gemma-it | 9/14 | 14/14 | offline |
| Qwythos | 1/7 | 4/7 → **5/7** เมื่อรวม fix config (temp 0.6 ตาม model card — temp 0.1 ทำ repetition loop) | re-run สด |
| qwen3 | 22/28 | 22/28 (0 rescued — fail เป็น logic จริง) | offline |

**บทเรียนเชิงระบบ:** ก่อนสรุปว่า "โมเดลตก gate" ต้องแยก **format-failure ออกจาก capability-failure** เสมอ — เก็บ raw output ทุก dispatch (harness ทำแล้ว) เพื่อให้ re-verify ย้อนหลังได้โดยไม่เผา GPU

---

## สรุปภาพรวม + Lessons learned

| # | root cause | ชั้นที่ผิด | แก้แล้ววัดผลได้ |
|---|---|---|---|
| 1 | GGUF weights เสีย (gemma-coder) | ตัวโมเดล | blacklist ถาวร + smoke gate |
| 2 | SATA SSD + eviction + prewarm ctx-mismatch | infra/config | prewarm script ที่ถูกต้อง; cold เหลือจ่ายครั้งเดียว/batch |
| 3 | prompt เหนี่ยวนำ CoT เกิน / ขาด anchor / inject พิษ | prompt contract | template v2: 100% @ 5.1s บน default model |
| 4 | extractor จับ fence แรก | **harness เอง** | extractor v2: sushirl 0/7→7/7 (ได้โมเดล co-resident ฟรี 1 ตัว) |

1. **การเลือก/ตรวจโมเดลมาก่อนการจูน prompt** (ยืนยัน v1) — แต่เพิ่ม: **การตรวจ harness มาก่อนการตัดสินโมเดล** (Incident 4 — เกือบ blacklist โมเดลดีเพราะ bug ตัวเอง)
2. อ่าน **model card ก่อนตั้ง options** — config ที่พิสูจน์กับโมเดลหนึ่ง (temp 0.1) เป็นพิษกับอีกตระกูล
3. failure ราคาถูกที่สุดคือที่จับได้ **ก่อน** เข้า batch (smoke) และ **หลัง** แบบ offline (raw + re-verify) — ทั้งสองไม่เผา GPU เพิ่ม
