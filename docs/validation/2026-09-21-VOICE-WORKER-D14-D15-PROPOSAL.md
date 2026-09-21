---
version: "0.1.0c"
created_at: "2026-09-21T06:00:00+07:00,LALIN,16b3daa"
last_update: "2026-09-21T06:00:00+07:00,LALIN"
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
**หลักที่ยึด:** worker ไม่ตัดสินใจแทน caller (LVP-REQ-005), data minimization (LVP-REQ-026), ไม่มี hidden reference-ASR (LVP-REQ-017), contract เปลี่ยนได้เฉพาะเมื่อ PRP อนุมัติ (D12: pydantic = source → regenerate schema/TS)

## 0. สรุปให้ตัดสิน

| ID | เรื่อง | ข้อเสนอ (default) | ทางเลือก | ผลถ้าไม่ทำ |
|---|---|---|---|---|
| **D14** | VAD ระดับ manifest | เพิ่ม `engine_options.vad_filter: bool` (default `false`) + `vad_min_silence_ms` ใน profile; **ไม่มี** per-request override | (b) per-request flag · (c) ไม่เพิ่ม | เสียงประชุม/ไกลไมค์ให้ hallucination ต่างภาษาในช่วงเงียบ/พูดซ้อน (พบจริง: "obra功出来", "aconteceu") |
| **D15** | Glossary / initial prompt | เพิ่ม `AsrInput.glossary: list[str]` (optional, ≤ 64 รายการ, ≤ 400 code points รวม) ส่งเข้า whisper `initial_prompt`; **ไม่เก็บ**ใน receipt/log | (b) glossary ระดับ profile (คงที่ต่อ deployment) · (c) ทั้งสอง · (d) ไม่เพิ่ม | ชื่อเฉพาะ/ชื่อระบบเพี้ยนเป็นหลายแบบ ("Smart Clip" → "สามารถกิบ"/"สามารถกลิป") ต้องแก้ทีหลังด้วย LLM ซึ่งแพงกว่าและเสี่ยงแต่งเรื่อง |

ทั้งสองข้อเป็น **ASR เท่านั้น**; ไม่กระทบ TTS, admission, receipts, cancel

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
| manifests | `asr-th-en-01`: เสนอ `vad_filter: true` เพราะ use case คือเสียงประชุม/สนทนา; profile พากย์เสียงสะอาดในอนาคตค่อยตั้ง `false` |
| tests | manifest validation ×2, engine test ที่ยืนยันว่า silence-only input → `NO_SPEECH` แทน hallucination |
| docs | ADR-005 หมายเหตุ, Slice B evidence, D-traceability |

**ข้อควรระวัง:** VAD ตัด timestamps ที่ caller ได้รับ (segments ยังอ้างเวลาต้นฉบับ — faster-whisper คืนเวลาเดิมหลัง restore) และอาจตัดพยางค์แรกของคำสั้น ๆ → ต้องมี evidence บนคลิปสั้น 15 s ก่อน default `true`

## 2. D15 — Glossary ต่อ request (initial prompt)

### 2.1 หลักฐาน
- คำผิดที่พบแยกได้ 3 ประเภท (Slice B §5.2, pipeline §5): **ชื่อเฉพาะ** แก้ได้เกือบหมดถ้ารู้คำล่วงหน้า; คำไทยเพี้ยนตามเสียง แก้ได้บางส่วน; ช่วงไม่มีสัญญาณ แก้ไม่ได้
- Whisper รองรับ `initial_prompt` (≤ 224 token) ซึ่งเอนเอียง decoder ไปหาคำในนั้นตั้งแต่ตอนถอด — ถูกกว่าและตรวจสอบได้มากกว่าการแก้ด้วย LLM ทีหลัง
- ยังไม่มีตัวเลข A/B ในเครื่อง → **ก่อนอนุมัติควรวัด** บน 4 คลิปเดิม (ดู §4 ขั้นถัดไป)

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
- glossary ที่ผิด/ไม่เกี่ยว อาจ**เพิ่ม** error (Whisper ยัดคำที่ไม่ได้พูด) — ต้องมี evidence ทั้งสองทิศก่อน default
- ใช้กับ `language: th` เท่านั้นที่วัดแล้ว; ผลกับ code-switch ไทย/อังกฤษยังไม่รู้

## 3. สิ่งที่ **ไม่**เสนอ
- ไม่เสนอให้ worker ทำ diarization, speaker naming, หรือ narrative correction — อยู่นอก handoff (ASR/TTS เท่านั้น) และเป็นเครื่องมือ offline ต่อไป
- ไม่เสนอเปิด `language: auto` กลับมา (หลักฐาน Slice B §5.2 ข้อ 1)

## 4. ขั้นถัดไปที่ LALIN ทำได้โดยไม่ต้องรอ (ถ้า PRP owner ให้ไฟเขียวเก็บหลักฐาน)
1. A/B `initial_prompt` บน 4 คลิปเดิมด้วย eval tool (นอก worker): baseline vs glossary 20 คำ vs glossary ผิดบริบท → นับคำผิดประเภท "ชื่อเฉพาะ" ก่อน/หลัง
2. VAD บนคลิป 15 s เพื่อดูว่าตัดพยางค์แรกหรือไม่ และ silence-only input → NO_SPEECH
3. เมื่ออนุมัติ D14 → Slice B.1 (manifest + engine + tests, ไม่มี contract change) · เมื่ออนุมัติ D15 → Slice B.2 (contract + schema regenerate + receipts + tests)

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0c | 2026-09-21 | candidate | Initial proposal: D14 manifest-level VAD (default), D15 per-request glossary with draft contract diff; evidence from real-work clips; no code change | based on 16b3daa | LALIN |
