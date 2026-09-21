---
version: "0.2.0c"
created_at: "2026-09-21T06:00:00+07:00,LALIN,16b3daa"
last_update: "2026-09-21T07:30:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "validation"
  scope: "Proposal for PRP owner: D14 manifest-level VAD and D15 per-request glossary for the headless voice worker ASR path (CR-005 / ADR-005); no code change until approved"
---

# D14 / D15 proposal — VAD and glossary for the voice-worker ASR path

**สำหรับ:** PRP owner (ผู้ตัดสิน) · **จาก:** LALIN · **สถานะ:** ข้อเสนอ ยังไม่แตะ contract/โค้ด
**ที่มา:** หลักฐานงานจริงจาก [Slice B §5](2026-09-21-HEADLESS-VOICE-WORKER-SLICE-B-ASR.md) และการทดลอง [pipeline](../architecture/MEETING_TRANSCRIPT_PIPELINE.md) บนบันทึกประชุมไทย 1 h 54 min
**อัปเดต 2026-09-21 (§4):** วัด A/B แล้ว → **เปลี่ยนข้อเสนอ D14 จาก default `true` เป็น default `false`** และเพิ่มคำเตือนของ D15
**หลักที่ยึด:** worker ไม่ตัดสินใจแทน caller (LVP-REQ-005), data minimization (LVP-REQ-026), ไม่มี hidden reference-ASR (LVP-REQ-017), contract เปลี่ยนได้เฉพาะเมื่อ PRP อนุมัติ (D12: pydantic = source → regenerate schema/TS)

## 0. สรุปให้ตัดสิน

| ID | เรื่อง | ข้อเสนอ (default) | ทางเลือก | ผลถ้าไม่ทำ |
|---|---|---|---|---|
| **D14** | VAD ระดับ manifest | เพิ่ม `engine_options.vad_filter: bool` (**default `false`**) + `vad_min_silence_ms` (default 700) ใน profile; **ไม่มี** per-request override. ประโยชน์ที่พิสูจน์ได้คือ **กัน hallucination ในไฟล์ที่เงียบ** ไม่ใช่ทำให้เสียงรบกวนดีขึ้น (§4.3) | (b) per-request flag · (c) ไม่เพิ่ม | input ที่เป็นความเงียบล้วนได้ข้อความปลอม ("ขอบคุณภาษาส") แทนที่จะเป็น `NO_SPEECH` |
| **D15** | Glossary / initial prompt | เพิ่ม `AsrInput.glossary: list[str]` (optional, ≤ 64 รายการ, ≤ 400 code points รวม) ส่งเข้า whisper `initial_prompt`; **ไม่เก็บ**ใน receipt/log; **ไม่ใช่ default** — caller เป็นคนตัดสินเพราะผลขึ้นกับคุณภาพเสียง (§4.2) | (b) glossary ระดับ profile (คงที่ต่อ deployment) · (c) ทั้งสอง · (d) ไม่เพิ่ม | ชื่อเฉพาะ/ชื่อระบบเพี้ยนเป็นหลายแบบ ("Smart Clip" → "สามารถกิบ"/"สามารถกลิป") ต้องแก้ทีหลังด้วย LLM ซึ่งแพงกว่าและเสี่ยงแต่งเรื่อง |
| **D16** *(ใหม่)* | ผลถอดความ **ไม่ reproducible** | ระบุในสัญญา/เอกสารว่า attempt ต่างกันบนไฟล์เดียวกันให้ข้อความต่างกันได้ (receipt ยังคืนผลเดิมเมื่อ retry ตาม idempotency เดิม) | (b) บังคับ deterministic (ต้องเปลี่ยน compute_type → ช้าลง, ยังไม่ยืนยันว่าพอ) | PRP อาจสมมติว่า retry/สอบทานได้ผลเดิม แล้วสรุปผิดเมื่อข้อความต่าง (§4.1) |

D14/D15 เป็น **ASR เท่านั้น**; D16 เป็นการบันทึกข้อเท็จจริง ไม่ใช่การเปลี่ยนพฤติกรรม; ไม่กระทบ TTS, admission, receipts, cancel

## 1. D14 — VAD ระดับ manifest

### 1.1 หลักฐาน
- ใน worker ปัจจุบัน `vad_filter=False` ทุกกรณี (`engine_faster_whisper.py`) ตาม contract ที่ห้าม worker ตัดเสียงเอง
- คลิป `mid-meeting` 45 s (หลายคนพูดซ้อน ไกลไมค์): ผลผ่าน worker มีอักขระจีน/รัสเซีย/ญี่ปุ่นปนครึ่งหนึ่ง; full-file run นอก worker ที่เปิด VAD (min_silence 700 ms) ให้ผลอ่านได้ในช่วงเดียวกัน
- Whisper hallucinate ในช่วงเงียบเป็นพฤติกรรมที่รู้กัน (ตัวอย่างในไฟล์เดียวกัน: "I don't see the picture." ×3 บน 40 s แรกที่เป็นความเงียบ)

### 1.2 ทำไมระดับ manifest ไม่ใช่ per-request
- ผลของ VAD ขึ้นกับชนิดเสียงที่ profile นั้นรับ (ประชุม vs พากย์เสียงสะอาด) = คุณสมบัติของ profile ไม่ใช่ของ request
- per-request จะทำให้ receipt/idempotency ต้องรวม flag ใน payload digest และ PRP ต้องตัดสินใจต่อ attempt ซึ่งขัดหลัก "coordinator ไม่รู้ engine internals"
- ค่าใน manifest อยู่ใน `describe()` → PRP เห็นว่า profile นี้ตัดเงียบหรือไม่ ตรวจสอบได้

### 1.3 การเปลี่ยนแปลงถ้าอนุมัติ (ไม่ใช่ contract change)
| ที่ | เปลี่ยน |
|---|---|
| `profile.py` | validate `vad_filter: bool`, `vad_min_silence_ms: int 100–3000` (default 700) เฉพาะ engine faster-whisper |
| `engine_faster_whisper.py` | ส่งค่าเข้า `model.transcribe(vad_filter=…, vad_parameters={...})` |
| `describe()` | `engine_options` ที่เปิดเผยอยู่แล้วจะมี key นี้ (ไม่มี field ใหม่ใน schema) |
| manifests | `asr-th-en-01`: **คง `vad_filter: false`** (แก้จากข้อเสนอแรกหลังวัดจริง §4.3); เปิดเฉพาะ profile ที่รับไฟล์ซึ่งอาจมีช่วงเงียบยาว |
| tests | manifest validation ×2, engine test ที่ยืนยันว่า silence-only input → `NO_SPEECH` แทน hallucination |
| docs | ADR-005 หมายเหตุ, Slice B evidence, D-traceability |

**ข้อควรระวัง:** VAD ตัด timestamps ที่ caller ได้รับ (segments ยังอ้างเวลาต้นฉบับ — faster-whisper คืนเวลาเดิมหลัง restore) · ข้อกังวลเรื่อง**ตัดพยางค์แรก ตกไปแล้ว**หลังวัดจริง (§4.3) · แต่ VAD + glossary พร้อมกันบนเสียงแย่ทำให้เนื้อหาหายมาก (§4.2)

## 2. D15 — Glossary ต่อ request (initial prompt)

### 2.1 หลักฐาน
- คำผิดที่พบแยกได้ 3 ประเภท (Slice B §5.2, pipeline §5): **ชื่อเฉพาะ** แก้ได้เกือบหมดถ้ารู้คำล่วงหน้า; คำไทยเพี้ยนตามเสียง แก้ได้บางส่วน; ช่วงไม่มีสัญญาณ แก้ไม่ได้
- Whisper รองรับ `initial_prompt` (≤ 224 token) ซึ่งเอนเอียง decoder ไปหาคำในนั้นตั้งแต่ตอนถอด — ถูกกว่าและตรวจสอบได้มากกว่าการแก้ด้วย LLM ทีหลัง
- **วัดแล้ว 2026-09-21** (§4.2): ได้ผลซ้ำได้บนเสียงสะอาด (+1 ศัพท์ทุกรอบ) แต่ทำให้เนื้อหาหายบนเสียงแย่ → เป็นเครื่องมือเฉพาะกรณี ไม่ใช่ default

### 2.2 ทำไม per-request (default) ไม่ใช่ profile
- glossary ขึ้นกับ**เนื้อหา**ของงาน (ลูกค้าคนไหน โปรเจกต์ไหน) ไม่ใช่ deployment; PRP มี context นั้น worker ไม่มี
- ถ้าอยู่ใน manifest จะกลายเป็นข้อมูลลูกค้าคงที่ใน profile ที่ `describe()` เปิดเผย → ขัด data minimization
- ทางเลือก (c) "ทั้งสอง" เหมาะถ้า PRP อยากมี base glossary ของ deployment (เช่นชื่อบริษัทตัวเอง) + ต่อ request: worker ต่อสตริง profile-glossary + request-glossary แล้วตัดที่ 224 token

### 2.3 ร่าง contract diff (ยังไม่ apply)
```python
class AsrInput(StrictModel):
    language: str = Field(default="auto", min_length=2, max_length=8)
    audio_sha256: str = Field(pattern=SHA256_PATTERN)
    audio_bytes: int = Field(gt=0)
    declared_mime_type: str = Field(min_length=3, max_length=64)
+   glossary: list[str] | None = Field(default=None, max_length=64)
+   # แต่ละรายการ 1–40 code points หลัง normalize (norm-v1); รวมกัน ≤ 400 code points
+   # worker ใช้เป็น ASR bias เท่านั้น (initial_prompt) — ไม่ใช่คำสั่ง ไม่ถูก echo กลับ ไม่เก็บใน receipt
```
- **payload digest / idempotency:** glossary เป็นส่วนของ input → รวมใน `envelope_digest` (retry ด้วย glossary ต่างกัน = IDEMPOTENCY_CONFLICT ตามหลักเดิม)
- **receipt / log:** เก็บเฉพาะ `glossary_count` และ `glossary_sha256` ไม่เก็บข้อความ (อาจมีชื่อลูกค้า)
- **describe():** เพิ่ม `capabilities.asr_glossary: true` เพื่อให้ PRP รู้ว่า worker/profile รองรับ
- **validation error:** เกินขนาด → `INVALID_REQUEST` (422); profile ที่ engine ไม่รองรับ (stub) → รับได้แต่ ignore และรายงาน `glossary_applied: false` ใน result? — **ต้องตัดสิน**: เสนอ ignore + flag เพื่อไม่ให้ stub/engine อื่นทำ request ล้ม
- **schema:** regenerate `lalin-voice-worker.schema.json` + `voiceWorker.ts` (D12), `test_contract_schema.py` บังคับ
- **security:** initial_prompt เป็น text ที่ caller ควบคุม → เข้า model เป็น bias ไม่ใช่ instruction; จำกัดขนาดและ normalize เพื่อไม่ให้ใช้เป็น payload ขนาดใหญ่; ไม่มีเส้นทางที่ข้อความนี้ถูก execute

### 2.4 ผลกระทบข้างเคียงที่ต้องยอมรับ
- glossary ที่ผิด/ไม่เกี่ยว **ไม่** ทำให้คำในนั้นโผล่ (วัดแล้ว 0/12 รอบ §4.2) แต่ทำให้ผลไม่เสถียรบนเสียงแย่
- ใช้กับ `language: th` เท่านั้นที่วัดแล้ว; ผลกับ code-switch ไทย/อังกฤษยังไม่รู้

## 3. สิ่งที่ **ไม่**เสนอ
- ไม่เสนอให้ worker ทำ diarization, speaker naming, หรือ narrative correction — อยู่นอก handoff (ASR/TTS เท่านั้น) และเป็นเครื่องมือ offline ต่อไป
- ไม่เสนอเปิด `language: auto` กลับมา (หลักฐาน Slice B §5.2 ข้อ 1)

## 4. หลักฐานที่วัดแล้ว (2026-09-21)

เครื่องมือ: [`tools/verify/asr_prompt_vad_ab.py`](../../tools/verify/asr_prompt_vad_ab.py) · large-v3-turbo `cuda:0 int8_float16` · RTX 5060 Ti
คลิป: 4 คลิปเดิมจากบันทึกประชุมจริง (`runtime/eval/asr-th`, gitignored) · **ทุกเงื่อนไขรัน 3 รอบ** รายงาน median พร้อมช่วง
glossary จริง = ชื่อผู้ร่วมประชุมจาก tile ของ Meet + ข้อความบนสไลด์ที่แชร์ (ตรวจจากเฟรมวิดีโอ) 20 คำ · glossary ผิดบริบท = ศัพท์แพทย์/ดาราศาสตร์ 15 คำ

### 4.1 ผลลัพธ์ **ไม่ deterministic** (พบระหว่างทาง — เปลี่ยนวิธีวัดทั้งหมด)
input เดิม เงื่อนไขเดิม รัน 3 รอบติดกัน → ข้อความ**ต่างกัน** ใน 3 จาก 4 คลิป (เหมือนกันเฉพาะคลิป 15 s)
ตัวอย่างความแปรปรวนในเงื่อนไขเดียว: `farfield-noisy baseline_vad` foreign chars = 1 / 12 / 0 · chars = 402 / 473 / 392

> ผลนี้ทำให้การเทียบแบบรอบเดียว (ที่ทำครั้งแรก) **ใช้ไม่ได้** — ความแปรปรวนระหว่างรอบใหญ่กว่าผลของ glossary/VAD บนคลิปที่เสียงไม่ดี
> ตัวเลขทั้งหมดด้านล่างจึงเป็น median ของ 3 รอบ และข้อสรุปจำกัดเฉพาะที่ **ซ้ำได้ทุกรอบ**
> กระทบสัญญา: worker คืนผลจาก receipt เมื่อ retry (idempotency เดิมยังถูกต้อง) แต่ **สอง attempt บนไฟล์เดียวกันให้ข้อความต่างกัน** → D16

### 4.2 D15 glossary — ได้ผลบนเสียงสะอาด, อันตรายบนเสียงแย่

| Clip | term_hits base → glossary | chars base → glossary | สรุป |
|---|---|---|---|
| clean-short 15 s | 1 → **2** (ซ้ำได้ 3/3 รอบ) | 141 → 175 | ได้ผล: "ขายปีก" → "ขายปลีก" |
| clean-long 60 s | 1 → **2** (ซ้ำได้ 3/3 รอบ) | 686 → 681 | ได้ผล: "Smartgrip" → "SmartClip" |
| farfield-noisy 60 s | 2 → 2 | 517 → **334** | ไม่ได้ผล และเนื้อหาหายราว 35% |
| mid-meeting 45 s | 0 → 0 | 403 → **191** (glossary+VAD → **47**) | เสียหาย: 45 s เหลือ 47 ตัวอักษร |

- **ไม่มีการ inject**: glossary ผิดบริบท (แพทย์/ดาราศาสตร์) **ไม่เคย**ทำให้คำในนั้นโผล่ในผลลัพธ์เลย (0 ครั้งใน 4 คลิป × 3 รอบ) — ความเสี่ยง "prompt เป็นคำสั่ง" ไม่ปรากฏ
- แต่ glossary ผิดบริบท**ทำให้ผลไม่เสถียร**บนคลิปที่เสียงไม่ดี (chars 626–680 บน farfield)
- **สรุปสำหรับ D15:** เก็บเป็น per-request ตามเดิม (caller รู้คุณภาพเสียง worker ไม่รู้) แต่ **ห้ามเป็น default** และเอกสารต้องเตือนว่าใช้กับเสียงสะอาดเท่านั้น

### 4.3 D14 VAD — ประโยชน์จริงคือกันความเงียบ ไม่ใช่กันเสียงรบกวน

| การทดสอบ | vad=false | vad=true | สรุป |
|---|---|---|---|
| **ความเงียบล้วน 10 s** | 1 segment: `"ขอบคุณภาษาส"` (**hallucination**) | **0 segment** → worker คืน `NO_SPEECH` | **หลักฐานชี้ขาดของ D14** |
| คลิปสั้น 3 s | `สมมติพี่ขายของกวันแล้วก็` | ข้อความเดียวกัน | **ไม่ตัดพยางค์แรก** (ข้อกังวลเดิมตกไป) |
| เสียงพูด + เงียบท้าย 8 s | ข้อความเดียวกัน | ข้อความเดียวกัน | ไม่ต่าง |
| farfield-noisy (median foreign) | 2 | 1 | อยู่ในช่วงความแปรปรวน (0–12) **สรุปไม่ได้** |
| mid-meeting (median foreign) | 2 | 4 | ไม่ช่วย |
| `min_silence` 200 / 700 / 1500 ms | — | foreign 1 / 0 / 3 | 700 ms เหมาะสุด |

- **เปลี่ยนข้อเสนอ:** เดิมเสนอ `asr-th-en-01: vad_filter = true` → **เปลี่ยนเป็น default `false`** เพราะประโยชน์ที่ซ้ำได้มีเฉพาะกรณี input เงียบ ส่วนเสียงประชุมที่มีเสียงรบกวนไม่ได้ดีขึ้นอย่างมีนัย
- ทางเลือกที่ถูกกว่าสำหรับกรณีเงียบ: ตรวจ `no_speech_prob` ที่ engine แล้วคืน `NO_SPEECH` โดยไม่ต้องใช้ VAD — **เสนอให้พิจารณาคู่กัน**

### 4.4 ข้อค้นพบเชิงปฏิบัติการ
`MemoryError: bad allocation` หลังเรียก `transcribe` ราว 60 ครั้งใน process เดียว (ขณะ VRAM ถูกแอป desktop ใช้อยู่ 10.3 GB จาก 16 GB)
→ engine child ของ worker ที่รันยาวอาจเจอเหมือนกัน; supervisor restart ครอบคลุมอยู่แล้ว (engine ตาย → epoch ใหม่) แต่ควรมี soak test ใน Slice C

## 5. ขั้นถัดไป
1. ~~A/B `initial_prompt`~~ **ทำแล้ว** → §4.2
2. ~~VAD บนคลิปสั้น + silence-only~~ **ทำแล้ว** → §4.3
3. ยังไม่ได้ทำ: WER จริงต้องมี reference transcript ที่คนตรวจ — ตัวชี้วัดใน §5 เป็น proxy (term_hits / foreign chars / ความยาว) ไม่ใช่ความถูกต้อง
4. เมื่ออนุมัติ D14 → Slice B.1 (manifest + engine + tests, ไม่มี contract change) · เมื่ออนุมัติ D15 → Slice B.2 (contract + schema regenerate + receipts + tests)

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.0c | 2026-09-21 | candidate | A/B measured over 3 repeats: engine is non-deterministic (new D16); glossary helps clean audio but truncates degraded audio; VAD's proven benefit is silence-hallucination suppression only → D14 default changed to false | based on fd814d9 | LALIN |
| 0.1.0c | 2026-09-21 | candidate | Initial proposal: D14 manifest-level VAD (default), D15 per-request glossary with draft contract diff; evidence from real-work clips; no code change | based on 16b3daa | LALIN |
