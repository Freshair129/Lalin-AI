# REPORT — Local-LLM Dispatch (ข้อมูลจริงเพื่อปรับ prompt/config)

> เก็บจากการรัน swarm G-Music (Wave 0–5, 24 WP) — 2026-07-02/03
> โฟกัส: **การ dispatch งานให้ local model (Ollama) ตาม SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP**
> ใช้คู่กับ [LOCAL_MODEL_LEDGER.md](../product/LOCAL_MODEL_LEDGER.md) (failure/pass ledger)
> **อัปเดต v2 (2026-07-03):** benchmark เชิงประจักษ์ 74 dispatch จริง → ดู [หัวข้อ V2](#v2--ผลการทดลองรอบ-2-2026-07-03-benchmark-74-dispatch) — **แทนที่ §4 (prompt) และ §5 (config) ของรายงานเดิม**

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

## 4. คำแนะนำปรับ PROMPT (concrete) — ⚠️ superseded โดย [V2.7](#v27-prompt-template-v2-แทน-4--ผู้ชนะคือ-v-plain-เดิม--กติกาที่พิสูจน์เพิ่ม)

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

## 5. คำแนะนำปรับ CONFIG (Ollama) — ⚠️ superseded โดย [V2.8](#v28-config-v2-แทน-5--ค่าที่วัดแล้วทั้งหมด)

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

## V2 — ผลการทดลองรอบ 2 (2026-07-03, benchmark 74 dispatch)

> **วิธีวัด:** benchmark suite 7 micro-task ([orchestration/bench_tasks.json](../orchestration/bench_tasks.json)) ครอบคลุม pure-math / parser ×2 (รวม SRT→cues) / array-reduce / format-util / dsp-helper / TS-generics · ทุก task มี **visible acceptance** (อยู่ใน prompt) + **holdout checks** (ไม่อยู่ใน prompt) · Verify Gate = `tsc --noEmit --strict` + assertion ทั้งสองชุด (eps 1e-6) — deterministic ล้วน ([orchestration/verify_gate.mjs](../orchestration/verify_gate.mjs)) · pre-warm ก่อนทุก batch แล้ววัดเฉพาะ warm · harness: [orchestration/bench.py](../orchestration/bench.py) + [orchestration/dispatch.py](../orchestration/dispatch.py) · ผลดิบ: `orchestration/bench_results.jsonl` + `orchestration/bench_raw/*.txt`

### V2.1 Root cause A — gemma-4-12B-coder: **เสียถาวรระดับ weights ไม่ใช่ template**

probe 4 ทาง ([orchestration/probe_gemma.py](../orchestration/probe_gemma.py)) บนโมเดล warm:

| probe | ผล |
|---|---|
| P1 `/api/generate` (template ของโมเดล) | eval=1, output ว่าง |
| P2 `/api/chat` + system role + messages array | eval=67, `<unused33><unused27>…[multimodal]…` ล้วน |
| P3 `raw:true` + ประกอบ template gemma4 (`<|turn>`) เอง | eval=33, `<unusedNN>` ล้วน |
| P4 `raw:true` + template gemma ดั้งเดิม (`<start_of_turn>`) | eval=83, `<unusedNN>` ล้วน |

- **แม้ raw mode ที่ข้าม template ทุกชั้นก็ยังพ่น unused-token** → ปัญหาอยู่ที่ GGUF export (weights/vocab mapping) ไม่ใช่ chat template → **แก้ด้วย Modelfile/template ไม่ได้ — blacklist ถาวร**
- หลักฐานเทียบ: `gemma-4-12b-it` (unsloth) ใช้ arch `gemma4` + Jinja template **เดียวกันเป๊ะ** (ตรวจด้วย `ollama show --template`) แต่ generate ข้อความจริงได้ → template ไม่ใช่ตัวการ
- ข้อสรุป v1 ("GGUF/chat-template เสีย") แม่นครึ่งเดียว — ที่ถูกคือ **GGUF เสีย, template ไม่เกี่ยว**

### V2.2 Root cause B — กายวิภาค cold-load (ตัวเลข 160–186s เดิม reproduce ไม่ได้)

| เงื่อนไข | load_duration วัดจริง |
|---|---|
| qwen3 14.8B (9GB) จาก **VRAM ว่าง** | **62.7s** |
| qwen3 reload โดยต้อง **evict** sushirl (5.6GB) | **88.1s** |
| Qwythos 9B evict gemma-it (8.4GB) / evict gemma-coder (7.4GB) | 80.1s / **115.3s** |
| sushirl 9B (โหลด 2 ครั้ง) | 55.6s / 63.5s |
| llama3.2:1b (1.3GB) | 20.4s |

- เวลา cold ≈ `load_duration` ล้วน (wall − load < 1s) = อ่าน blob จาก **SATA SSD** (C: = WDC WDS250G2B0A, ~500MB/s; 9GB ≈ 19s ขั้นต่ำ) + dequant/PCIe upload + alloc KV cache · **eviction เพิ่ม 25–40%** · disk เหลือ 17GB (เกือบเต็ม — เสี่ยงช้าลงอีก)
- ตัวเลข 160–186s ของ v1 **ไม่เกิดซ้ำในเครื่องว่าง** — คำอธิบายที่สอดคล้อง: ตอน swarm มี Sonnet workers หลายตัวอัด disk/CPU พร้อมกัน + eviction ทับซ้อน → cold แบนด์จริงวันนี้ = **56–115s**, warm = 1.8–6.1s (qwen3) → **speedup 10–35x ยืนยัน**
- **กับดักที่วัดพบใหม่: pre-warm ต้องใช้ `num_ctx` เดียวกับ dispatch จริง** — llama1b prewarm (ctx default) 20.4s แล้ว call ถัดไป (ctx 8192) โดน **reload อีก 3.7s** เพราะ Ollama re-allocate เมื่อ num_ctx เปลี่ยน → [tools/dev/prewarm_ollama.ps1](../../tools/dev/prewarm_ollama.ps1) fix แล้ว (ctx 8192 + `-Unload` สำหรับก่อนงาน ML)

### V2.3 Root cause C — prompt A/B บน qwen3 (7 task × 4 variant, warm ทั้งหมด)

| variant | gate pass | median latency | median eval_count |
|---|---|---|---|
| **v-plain** (template §4 เดิม) | **7/7 = 100%** | **5.1s** | 142 |
| v-plain-nacc (ตัด acceptance) | 6/7 = 86% | 6.1s | 175 |
| v-bracket (section header `[ROLE]…` ตามสเปกเก่า) | 5/7 = 71% | 49.0s (**~10x ช้ากว่า**) | 1492 |
| v-plain-pm (แทรก past-mistakes **ไม่ตรง task**) | 4/7 = 57% | 5.6s | 160 |
| v-plain-pm+**recall** (แทรกจาก bge-m3 recall, 3 task ที่ pm-static เคยตก) | **3/3 = 100%** | 6.6s | 184 |

กลไกที่เห็นจาก raw output:
- **v-plain ทำให้ qwen3 ปล่อย `<think>` ว่าง** แล้วเขียนโค้ดทันที (eval 45–175) · v-bracket/v-nacc จุด CoT ยาว 675–2500 token → ช้า 10 เท่า และ 2 เคส **think จนชน num_predict 2500 → โค้ดโดนตัด → fail** (`parseTimecode`, `parseSrtCues` v-bracket)
- v-bracket ยังพลาด rule บน holdout (ลืม validate SS≤59) — คิดเยอะ ≠ แม่นขึ้น
- ไม่มี acceptance → **syntax hallucination**: `String.padStart(n,2,"0")` (static method ที่ไม่มีจริง) — tsc ใน gate จับได้ 2 เคส
- **past-mistakes ที่ไม่ตรง task เป็นพิษ** (57%): ทำ logic เพี้ยน (`parseSrtCues` คืน start/end = null) และจุด think-overflow (`pickKeys` eval=2500) — ขณะที่บรรทัดจาก semantic recall (FR-4) ผ่านครบ → **inject เฉพาะที่ recall ตรง มิฉะนั้นไม่ใส่เลย**

### V2.4 Model benchmark — before/after (harness v1 → v2)

| model (VRAM จริง) | ก่อน (extractor v1 + config เดียวทุกโมเดล) | หลัง (extractor v2 ± per-model config) | median warm | สถานะ |
|---|---|---|---|---|
| qwen3:latest 14.8B (**10.05GB**) | v-plain 7/7 | 7/7 (ไม่เปลี่ยน — fail ของมันเป็น logic จริง 0/6 rescued) | **5.1s** | **default (คุณภาพ+เร็วสุด)** |
| sushirl 9B (**5.57GB**) | **0/7** — fence แรกจับ prompt-restatement | **7/7 (rescue offline ยืนยันด้วย live re-run 7/7)** | 11.6s | **promote: ตัว co-resident** |
| Mellum2-12B-A2.5B MoE (8.25GB) | — (เทสเพิ่มรอบ 3 ตาม config card: temp 0.6) | **6/7** — fail เดียวคือ logic slip ตัวอักษรเดียว (regex `:` แทน `\.`) · **gen 127.5 tok/s = 4x qwen3** · cold load 26.8s (เร็วสุดในกลุ่มใหญ่) · ไม่มี special-token leak (ยืนยัน GGUF เสียเป็นราย build ไม่ใช่ราย uploader yuxinlu1) | 4.9s | สำรองอันดับ 1 ใน pool (แซง Qwythos) |
| gemma-4-12b-it 11.9B (8.36GB) | v-plain 6/7 · v-bracket 3/7 | 14/14 (offline re-verify) แต่ `<|channel>thought` รั่วเป็น text ทุก run (0/14 single-fence) | 54.9s (**ช้า 10x**) | candidate (ช้าเกิน) |
| Qwythos-9B (6.09GB) | 1/7 ที่ temp 0.1 | **5/7 ที่ temp 0.6** (ตาม model card: "avoid T≤0.3 → repetition loop") + extractor v2 | 19.6s | candidate (ยังแพ้ sushirl) |
| gemma-4-12B-coder (7.4GB) | `<unused30>` eval=4 | probe 4 ทางยืนยัน **เสียถาวร** (V2.1) | — | **blacklist ถาวร** |
| llama3.2:1b (2.58GB) | 0/1 — ตัด `export` ทิ้ง | — | 4.1s | เล็กเกิน ไม่เข้า pool |

**Extractor v2** (แก้ใน `dispatch.py:analyze_output`, พิสูจน์ด้วย [orchestration/reextract.py](../orchestration/reextract.py) จาก raw เดิม — ไม่รันโมเดลซ้ำ):
1. strip `<think>…</think>` → 2. strip **orphan `</think>`** (template qwen3.5-family auto-open `<think>` ตอน generation → CoT ต้น response ไม่มี tag เปิด) → 3. จับ fence ทุก language tag → 4. เลือก **fence ตัวสุดท้ายที่มี `export function`** (ห้ามใช้ fence แรก — โมเดล CoT ชอบ restate โจทย์ที่มี ``` ในเนื้อความ) → 5. fallback: fence สุดท้าย → substring ตั้งแต่ `export function`
- ผล rescue: sushirl 0/7→7/7 · gemma-it 9/14→14/14 · Qwythos 1/7→4/7 (ที่เหลือเป็น logic จริง) · qwen3 0/6 rescued (fail ของ thinking-model เก่งเป็นของจริง ไม่ใช่ format)

### V2.5 L1 retrieval (FR-4) — วัดจริงด้วย bge-m3

- [orchestration/recall_mistakes.py](../orchestration/recall_mistakes.py): embed `lesson` ใน [orchestration/ledger.jsonl](../orchestration/ledger.jsonl) (8 entries) ผ่าน `/api/embeddings` + cache (`ledger_vec.json`, re-query 0.19s) · blacklist inject เสมอ
- ranking ถูกโดเมนทุก query ที่ทดสอบ: "parse subtitle timecode…" → parser lesson **0.587** (อันดับ 1) · "format milliseconds MM:SS.mmm" → **0.709** · "crossfade DSP" → สูงสุด 0.448 (ไม่ผ่าน threshold → ไม่ inject อะไร = ปลอดภัย)
- calibration: ช่วง sim ของ lesson ที่เกี่ยวจริง 0.41–0.71 vs ไม่เกี่ยว 0.32–0.42 (คาบเกี่ยว) — **คง threshold 0.5** เพราะ false-positive แพง (V2.3 พิสูจน์ว่า inject ผิด = pass-rate ร่วง) ยอมพลาด lesson ชายขอบ (เช่น padStart 0.406)
- ผลเชิงพฤติกรรม: PM จาก recall = 3/3 pass บน task ที่ PM-static-irrelevant ตก 0/3 (ตาราง V2.3)

### V2.6 VRAM / co-residency (RTX 3060 12GB, desktop กิน ~0.9GB)

| โมเดล | size_vram (`/api/ps`, ctx 8192) | เหลือให้ ML | co-resident Demucs/whisper? |
|---|---|---|---|
| qwen3 14.8B | 10.05GB | ~1.1GB | ❌ ต้อง `-Unload` ก่อน (mutex FR-5) |
| gemma-4-12b-it | 8.36GB | ~2.7GB | ❌/เสี่ยง |
| Qwythos-9B | 6.09GB | ~5.0GB | ✅ น่าจะพอ |
| **sushirl 9B** | **5.57GB** | **~5.5GB** | ✅ (Demucs htdemucs แบบ staged ใน `music.py` + whisper large-v3 ~3GB) |
| bge-m3 (embeddings) | 1.2GB | — | co-resident กับ 9B ได้ (วัดแล้วตอนรัน recall คู่ Qwythos) |

> ยังไม่ได้รัน Demucs พร้อม sushirl จริง — ตัวเลขฝั่ง ML เป็น estimate จากสเปก pipeline; ก่อนใช้จริงให้ทดสอบ 1 รอบ

### V2.7 Prompt template v2 (**แทน §4**) — ผู้ชนะคือ v-plain เดิม + กติกาที่พิสูจน์เพิ่ม

```
You are a focused code generator. ONE task. Output ONLY the TypeScript file contents
in a single ```ts code block. No prose. Pure function, no imports.

Implement EXACTLY this signature in <path>:
export function <signature 1 บรรทัดเป๊ะ>

Rules:
- <bullet สั้น ≤ 6 ข้อ รวม guard invalid input>

Acceptance: <call> -> <expected ที่คำนวณได้>. <อย่างน้อย 2 case รวม edge>.
{PAST MISTAKES (from ledger, avoid these): <เฉพาะจาก recall_mistakes.py — blacklist + sim ≥ 0.5 เท่านั้น>}
Output ONLY the ```ts block.
```

| กติกา | หลักฐาน |
|---|---|
| **ห้าม** section-header วงเล็บ `[ROLE]…[SCAFFOLD]` | 100%→71%, 5.1s→49s, จุด CoT 10x + think-overflow (V2.3) — v1 บอก "ไม่ช่วย" แต่จริงคือ **ทำร้าย** |
| acceptance เลขคำนวณได้ = บังคับ | ตัดแล้วเหลือ 86% + syntax hallucination (padStart) |
| PAST MISTAKES เฉพาะจาก recall | static-irrelevant = 57% · recall = 100% (n=3) · ไม่มีอะไร inject = ปลอดภัยกว่า inject มั่ว |
| `num_predict ≥ 2500` (qwen3) | think-overflow คือ failure mode อันดับ 1 ของ prompt ที่จุด CoT |
| ฝั่ง harness ต้องมี extractor v2 เสมอ | prompt สั่ง "ONLY one block" แล้วโมเดล CoT-นอก-tag ก็ยังไม่ทำตาม (gemma-it 0/14, sushirl 1/7 single-fence) |

### V2.8 Config v2 (**แทน §5**) — ค่าที่วัดแล้วทั้งหมด

| สถานการณ์ | โมเดล | options | หมายเหตุ |
|---|---|---|---|
| **default** (คุณภาพ+เร็ว, VRAM ว่าง) | `qwen3:latest` | `temp 0.1, num_ctx 8192, num_predict 2500, keep_alive 30m` | 7/7 @ 5.1s |
| **co-resident กับงาน ML** | `sushirl:latest` + extractor v2 | เหมือน default | 7/7 @ 11.6s, VRAM 5.57GB |
| สำรองอันดับ 1 (escalation ใน T1) | `Mellum2-12B-A2.5B` (MoE) | `temp 0.6, top_p 0.95, top_k 20, num_predict 6000` (JetBrains official per card) | 6/7 @ 4.9s, 127 tok/s, VRAM 8.25GB |
| สำรองอันดับ 2 | `Qwythos-9B` | **`temp 0.6, top_p 0.95, top_k 20, repeat_penalty 1.05, num_predict 6000`** (per model card — temp 0.1 ทำ repetition: 1/7) | 5/7 @ 19.6s |
| blacklist | `gemma-4-12B-coder…GGUF` (ถาวร, V2.1) · `llama3.2:1b` (เล็กเกิน) | — | |
| pre-warm | `tools\dev\prewarm_ollama.ps1` ก่อนทุก batch — **num_ctx ต้องตรงกับ dispatch** | `-Unload` ก่อน Demucs/whisper ถ้าใช้ qwen3 | cold 56–115s → warm ~5–12s |
| per-model options | เก็บใน `dispatch.py:MODEL_OPTIONS` — ห้ามใช้ config เดียวทุกโมเดล | บทเรียน Qwythos | |

**Harness ครบ loop (ใช้ซ้ำได้):** `python orchestration/dispatch.py --task <id> --model qwen3:latest --pool sushirl:latest` = buildPrompt → dispatch → Verify Gate (tsc+visible+holdout) → escalate ใน pool (maxRework=1) → append `model_stats.jsonl` — exit 2 = ส่งขึ้น T2

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

---

## ภาคผนวก B — ตัวอย่าง task จริง (prompt → output แบบ verbatim)

> คู่ prompt-ที่ส่งจริง ↔ output-ที่โมเดลคืนจริง — ใช้เทียบ before/after ตอนจูน

### ตัวอย่าง 1 — `metronomeTicks` · gemma-4-12B-coder → ❌ FAIL

**PROMPT ที่ส่ง** (มี section-header วงเล็บ, options: `temp 0.1, num_ctx 4096, num_predict 700`):
```
[ROLE / SMALL_MODEL_RULES]
You are a focused code generator. ONE task only. Output ONLY a single TypeScript file's
contents inside one ```ts code block. No prose, no explanation. Pure function, no imports,
no external deps. Surgical and minimal.

[SCAFFOLD]
File: frontend/src/timeline/grid.ts
Signature to implement EXACTLY:
export function metronomeTicks(bpm: number, beatsPerBar: number, durationSec: number): { t: number; accent: boolean }[]

[GROUNDED CONTEXT]
- t is a time in seconds from 0.
- one beat lasts 60/bpm seconds.
- emit one tick per beat starting at t=0 up to and including any tick < durationSec.
- accent=true on the downbeat of each bar (every `beatsPerBar` beats: 0, beatsPerBar, 2*beatsPerBar, ...), else false.
- guard: if bpm<=0 or beatsPerBar<=0 or durationSec<=0 return [].

[TASK + ACCEPTANCE]
metronomeTicks(120, 4, 2) -> beat = 0.5s -> ticks at 0,0.5,1.0,1.5 (4 ticks; 2.0 excluded). accents: [true,false,false,false].
Return ONLY the file contents in one ```ts block.
```

**OUTPUT ที่คืนจริง** (eval_count=4):
```
<unused30><unused14>
```
→ **Verify Gate ❌** (special token รั่ว = GGUF/template เสีย) → escalate ไป qwen3

---

### ตัวอย่าง 2 — `metronomeTicks` · qwen3:14.8B → ✅ PASS (cold 186s)

**PROMPT ที่ส่ง** (ตัด section-header ออก → plain, options: `temp 0.1, num_ctx 8192, num_predict 2500`):
```
You are a focused code generator. ONE task only. Output ONLY the TypeScript file contents
in a single ```ts code block. No prose. Pure function, no imports.

Implement EXACTLY this signature in frontend/src/timeline/grid.ts:
export function metronomeTicks(bpm: number, beatsPerBar: number, durationSec: number): { t: number; accent: boolean }[]

Rules:
- one beat = 60/bpm seconds; emit one tick per beat from t=0 while t < durationSec.
- accent=true on downbeats (beat index 0, beatsPerBar, 2*beatsPerBar, ...), else false.
- if bpm<=0 or beatsPerBar<=0 or durationSec<=0 return [].

Acceptance: metronomeTicks(120,4,2) -> ticks at 0,0.5,1.0,1.5 (4 ticks, 2.0 excluded), accents [true,false,false,false].
Output ONLY the ```ts block.
```

**OUTPUT ที่คืนจริง** (verbatim, หลัง strip `<think>`):
```ts
export function metronomeTicks(bpm: number, beatsPerBar: number, durationSec: number): { t: number; accent: boolean }[] {
  if (bpm <= 0 || beatsPerBar <= 0 || durationSec <= 0) return [];
  const ticks: { t: number; accent: boolean }[] = [];
  const beatDuration = 60 / bpm;
  let beatIndex = 0;
  let time = 0;

  while (time < durationSec) {
    const isDownbeat = beatIndex % beatsPerBar === 0;
    ticks.push({ t: time, accent: isDownbeat });
    beatIndex++;
    time += beatDuration;   // ← Opus hardening: เปลี่ยนเป็น beatIndex*beatDuration กัน float drift
  }

  return ticks;
}
```
→ **Verify Gate ✅** `metronomeTicks(120,4,2)` = times `[0,0.5,1,1.5]`, accents `[T,F,F,F]`, guards ผ่าน
→ merge เป็น [grid.ts](../frontend/src/timeline/grid.ts) (หลัง Opus hardening drift)

---

### ตัวอย่าง 3 — `estimateSpeechDurationSec` · qwen3:14.8B → ✅ PASS (warm 5.6s)

**PROMPT ที่ส่ง** (plain + acceptance หลาย lang, options: `temp 0.1, num_ctx 8192, num_predict 2000`):
```
You are a focused code generator. ONE task. Output ONLY the TypeScript file contents in a
single ```ts block. No prose. Pure function, no imports.

Implement EXACTLY in frontend/src/dubbing/estimateSpeech.ts:
export function estimateSpeechDurationSec(text: string, lang: "th" | "en"): number

Rules (heuristic for fitting dubbed text to a time slot):
- th: ~5.0 chars/sec (count non-space characters). en: ~14 chars/sec (count non-space characters).
- trim text; if empty return 0.
- add 0.30s trailing pause. round to 3 decimals.

Acceptance: estimateSpeechDurationSec("hello world", "en") -> 10 non-space chars /14 = 0.714 + 0.30 = 1.014.
estimateSpeechDurationSec("", "en") -> 0. estimateSpeechDurationSec("สวัสดีครับ","th") -> 10 chars/5 =2.0 +0.30 =2.3.
Output ONLY the ```ts block.
```

**OUTPUT ที่คืนจริง** (verbatim):
```ts
export function estimateSpeechDurationSec(text: string, lang: "th" | "en"): number {
    const trimmedText = text.trim();
    if (trimmedText === "") return 0;

    const nonSpaceChars = trimmedText.replace(/\s/g, "").length;
    let charPerSec: number;

    if (lang === "th") {
        charPerSec = 5.0;
    } else {
        charPerSec = 14.0;
    }

    const duration = nonSpaceChars / charPerSec + 0.30;
    return Math.round(duration * 1000) / 1000;
}
```
→ **Verify Gate ✅** `("hello world","en")=1.014`, `("","en")=0`, `("สวัสดีครับ","th")=2.3`
→ merge เป็น [estimateSpeech.ts](../frontend/src/dubbing/estimateSpeech.ts) (verbatim, ไม่ต้อง harden)

---

### ข้อสังเกตจาก 3 ตัวอย่าง (สำหรับจูน)
- **ตัวอย่าง 2 vs 1**: prompt qwen3 (plain) กับ gemma (bracket) ต่างกันเล็กน้อย แต่ผลลัพธ์ต่างสุดขั้ว → **root cause = โมเดล ไม่ใช่ prompt**
- **ตัวอย่าง 2**: local เขียนถูกเชิง logic แต่ใช้ accumulation (drift ได้) → **Verify Gate ผ่าน acceptance แต่ Opus review ยัง harden** = local pass ≠ production-ready
- **ตัวอย่าง 3**: acceptance ที่ให้เลขคำนวณ (10/14=0.714+0.30) ทำให้โมเดล "เห็นสูตร" → output ตรงเป๊ะ; **ยิ่ง acceptance เป็นเลขที่ตรวจได้ ยิ่งแม่น**
- ทั้ง 2 ตัวที่ผ่าน: **ไม่มี import, function เดียว, signature ตรง** — ยืนยันขอบเขต "pure micro-task เท่านั้น"
