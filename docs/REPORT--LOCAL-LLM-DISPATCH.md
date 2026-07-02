# REPORT — Local-LLM Dispatch (ข้อมูลจริงเพื่อปรับ prompt/config)

> เก็บจากการรัน swarm G-Music (Wave 0–5, 24 WP) — 2026-07-02/03
> โฟกัส: **การ dispatch งานให้ local model (Ollama) ตาม SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP**
> ใช้คู่กับ [LOCAL_MODEL_LEDGER.md](LOCAL_MODEL_LEDGER.md) (failure/pass ledger)

---

## 0. TL;DR สำหรับปรับ prompt/config

| สิ่งที่เจอจริง | ค่า/หลักฐาน | ปรับ config/prompt เป็น |
|---|---|---|
| cold-load ครอบงำเวลา | 161–186s (cold) vs **5.6s (warm)** | **pre-warm ก่อน batch** + `keep_alive` ยาว → ประหยัด ~30x |
| โมเดล coder GGUF เสีย | gemma-4-12B-coder คืน `<unused30>` (eval=4) | **blacklist** ใน ledger; default = `qwen3:latest` |
| thinking model แทรก `<think>` | qwen3 มี `<think>…</think>` | `num_predict ≥ 2000` + strip regex เสมอ |
| acceptance ตัวอย่างพร้อมค่า | qwen3 แม่นทุก case | **บังคับใส่ input→expected ที่คำนวณตรวจได้** |
| งานที่เหมาะ | เฉพาะ pure/self-contained | อย่า dispatch งานหลายไฟล์/stateful ให้ local |

---

## 1. Local LLM ถูกใช้ตรงไหนในแต่ละ Wave

Local LLM เข้ามาช่วง batch หลัง (ตามคำสั่ง "ใช้ local 9B+") — Wave 0–2 เป็น Sonnet ล้วน (ก่อนมี directive):

| Wave | worker หลัก | Local LLM |
|---|---|---|
| 0 safety net (7 WP) | Sonnet ×5 | — (ก่อน directive) |
| 1 foundation (3 WP) | Sonnet ×3 | — |
| 2.1 shell / 2.2 clips | Opus(2.1) + Sonnet(2.2) | — |
| **3.2 metronome** | Sonnet S1 | ✅ `grid.ts` (metronomeTicks) โดย qwen3 |
| **4.4 dubbing copilot** | Sonnet S4 | ✅ `estimateSpeech.ts` โดย qwen3 (helper) |
| 3.1/3.5/5.1/5.2 | Sonnet ×4 | — (งาน stateful/integration ไม่เหมาะ local) |

**บทสรุปการแบ่งงาน:** local ทำ **pure helper 2 ตัว** (gate ผ่านทั้งคู่), Sonnet ทำ WP หลายไฟล์, Opus เป็น Verify Gate + integration. ตรงกับสเปก: small-model = micro-task/scaffold-first เท่านั้น.

---

## 2. Dispatch log (ข้อมูลดิบ 3 ครั้ง)

### Dispatch #1 — FAIL (escalate)
- **model:** `hf.co/yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF:Q4_K_M` (11.9B, coder)
- **task:** `metronomeTicks(bpm, beatsPerBar, durationSec)` → grid.ts
- **prompt:** anti-error-loop เต็มรูป (มี section headers `[ROLE/SMALL_MODEL_RULES]` `[SCAFFOLD]` `[GROUNDED CONTEXT]` `[TASK+ACCEPTANCE]`)
- **options:** `temperature:0.1, num_ctx:4096, num_predict:700`
- **ผล:** `<unused30><unused14>` · **eval_count = 4** · latency **161.7s**
- **Verify Gate:** ❌ FAIL (special token รั่ว = GGUF/chat-template เสีย ไม่ใช่เรื่อง prompt)
- **action:** escalate → เปลี่ยนโมเดล

### Dispatch #2 — PASS
- **model:** `qwen3:latest` (14.8B)
- **task:** เดิม (metronomeTicks)
- **prompt:** ตัด section-header วงเล็บออก → plain instruction (signature เป๊ะ + rules bullet + acceptance ตัวอย่าง)
- **options:** `temperature:0.1, num_ctx:8192, num_predict:2500`
- **ผล:** TypeScript สะอาดถูกต้อง · eval_count 164 · latency **186.5s (cold)**
- **Verify Gate:** ✅ PASS — `metronomeTicks(120,4,2)` = [0,0.5,1,1.5], accent [T,F,F,F], guards ผ่าน
- **hardening (Opus):** accumulation `time += dt` → `beatIndex*dt` กัน float drift ก่อน merge

### Dispatch #3 — PASS (warm)
- **model:** `qwen3:latest` (14.8B) — โมเดลยัง resident จาก #2
- **task:** `estimateSpeechDurationSec(text, lang)` → dubbing/estimateSpeech.ts
- **prompt:** plain + แทรก PAST MISTAKES ("avoid gemma-coder — ใช้ qwen3") ตาม ledger
- **options:** `temperature:0.1, num_ctx:8192, num_predict:2000`
- **ผล:** สะอาดถูกต้อง · eval_count 150 · latency **5.6s (WARM)** ← เร็วกว่า cold ~33x
- **Verify Gate:** ✅ PASS — en/th/empty ตรงทุก case

---

## 3. Failure analysis — gemma-4-12B-coder

- อาการ: กำเนิดแค่ 4 token = special token ของ gemma (`<unused30>` `<unused14>`) แล้วหยุด
- สาเหตุน่าจะเป็น **chat template / GGUF quantization ของ community build เสีย** — ไม่ใช่ prompt (qwen3 prompt แทบเดียวกันผ่าน)
- บทเรียน: **การเลือกโมเดลสำคัญกว่าการจูน prompt** สำหรับ local. ต้อง smoke-test โมเดลก่อนใส่ใน pool
- → ledger บันทึก `severity:critical, fix: อย่าใช้ → qwen3`

---

## 4. คำแนะนำปรับ PROMPT (concrete)

สิ่งที่ **ทำให้ qwen3 สำเร็จ** (ทำต่อ):
1. **Signature เป๊ะบรรทัดเดียว** — "Implement EXACTLY: export function X(...): T" → โมเดลไม่เดา API
2. **Acceptance เป็นตัวอย่าง input→expected ที่คำนวณได้** — เช่น `metronomeTicks(120,4,2) -> [0,0.5,1,1.5]` → Verify Gate ตรวจอัตโนมัติได้ + โมเดลมีเป้า
3. **"Output ONLY one ```ts block. No prose."** — ได้ code block เดียว extract ด้วย regex ง่าย
4. **Rules สั้นเป็น bullet** (pure, no imports, guard invalid) — ครบใน ~6 บรรทัด
5. **แทรก PAST MISTAKES** (G3) — บรรทัดเดียวก็พอ ("avoid X model / API")

สิ่งที่ควร **เลิก/ระวัง:**
- section-header วงเล็บหนัก (`[ROLE]…[SCAFFOLD]…`) ไม่ได้ช่วย qwen3 เพิ่ม — plain ดีกว่า/สั้นกว่า (แต่ยังไม่ยืนยันว่าทำ gemma พังจริง)
- อย่าขอหลาย function/หลายไฟล์ในครั้งเดียว — one-action เท่านั้น
- อย่าลืม budget: prompt เล็ก (< ~500 token) เพราะ overflow = failure mode หลัก

**Template prompt ที่ผ่านจริง (ใช้ซ้ำได้):**
```
You are a focused code generator. ONE task. Output ONLY the file contents in a single ```ts block. No prose. Pure function, no imports.
Implement EXACTLY in <path>:
export function <sig>
Rules:
- <rule 1..n, รวม guard invalid input>
Acceptance: <call> -> <expected>. <call2> -> <expected2>.
(PAST MISTAKES: <ledger note ถ้ามี>)
Output ONLY the ```ts block.
```

---

## 5. คำแนะนำปรับ CONFIG (Ollama)

| พารามิเตอร์ | ค่าที่ใช้ได้จริง | เหตุผล |
|---|---|---|
| default model | **`qwen3:latest` (14.8B)** | known-good, TS/Python ได้, thinking ช่วยคุณภาพ |
| blacklist | `hf.co/yuxinlu1/gemma-4-12B-coder…` | GGUF เสีย (§3) |
| `temperature` | **0.1** | code deterministic |
| `num_ctx` | **8192** | พอสำหรับ micro-task + grounded context |
| `num_predict` | **≥ 2000** | เผื่อ `<think>` ของ qwen3 + output |
| `keep_alive` | **ตั้งยาว (เช่น 30m) หรือ pre-warm** | cold 180s → warm 6s |
| strip | `re.sub(r"<think>.*?</think>","",out,flags=S)` | thinking model |
| extract | `re.search(r"```(?:ts\|typescript)?\s*(.*?)```", out, S)` | เอา code block |

**กลยุทธ์ warm ที่คุ้มสุด:** ก่อน batch ยิง dummy call 1 ครั้งให้โมเดล resident → dispatch จริงต่อ ๆ ไปเหลือ ~6s/งาน (พิสูจน์แล้ว #2 cold 186s → #3 warm 5.6s)

**หมายเหตุ VRAM (RTX 3060 12GB):** qwen3 14.8B (~9GB) กิน VRAM มาก — ระวังชนกับ Demucs/whisper. ตั้ง `ollama keep_alive:0` ก่อนงาน ML หนัก หรือใช้โมเดล 9B เล็กกว่า (sushirl 9B, Qwythos-9B) ถ้าต้อง co-resident (ยังไม่ได้ทดสอบคุณภาพ 2 ตัวนี้)

---

## 6. Verify Gate + escalation (ที่ใช้จริง)

- **Gate = node/vitest assertion บน acceptance** — empty/garbage/ผิดค่า = fail เสมอ (จับ gemma ได้ทันที)
- **maxReworkRounds = 1** → fail แล้ว escalate (โมเดลอื่น → Sonnet → Opus) ไม่วน
- ผลจริง: gemma fail → qwen3 (escalate สำเร็จ) — loop ทำงานตามสเปก
- ของที่ผ่าน gate ยังผ่าน **Opus hardening** (float-drift) ก่อน merge — local ผ่าน gate ≠ perfect, ยังต้อง review ชั้นบน

---

## 7. ควรทำต่อ (roadmap ปรับปรุง)

1. **Pre-warm script**: warm qwen3 ก่อนทุก batch (ลด cold penalty เป็นศูนย์หลังตัวแรก)
2. **ทดสอบโมเดล 9B co-resident** (sushirl:9B, Qwythos-9B) เทียบคุณภาพ vs VRAM กับ qwen3 14.8B
3. **L1 retrieval จริง** (SPEC §8): ใช้ `bge-m3` embed failure/pass nodes → inject "past mistakes" ที่ semantic ตรง task (ตอนนี้ยังเป็น file-ledger manual)
4. **ขยายชนิด micro-task ที่ให้ local**: pure parser (SRT/VTT cues), pure DSP helper, format util — ทุกตัวต้อง acceptance ตรวจได้
5. **วัด eval_count/latency ต่อโมเดล** เก็บสถิติเลือก model อัตโนมัติ (เร็ว+ผ่าน gate บ่อย = โปรโมท)

---

## ภาคผนวก — สถิติรวม

| metric | ค่า |
|---|---|
| local dispatch ทั้งหมด | 3 (2 pass, 1 fail) |
| โมดูลที่ merge จาก local | 2 (`grid.ts`, `estimateSpeech.ts`) — ผ่าน Verify Gate + hardening |
| latency: cold / warm | ~180s / ~6s |
| โมเดลที่ใช้ได้ | `qwen3:latest` (14.8B) |
| โมเดล blacklist | `gemma-4-12B-coder…GGUF` |
| bug เงียบที่ gate ชั้นบนจับ (ทั้ง swarm) | 4 (autosave dep, LUFS NaN, fade-out pop, mic leak) — ไม่ใช่ของ local |
