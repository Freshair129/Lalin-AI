---
version: "0.5.0c"
created_at: "2026-09-21T06:00:00+07:00,LALIN,16b3daa"
last_update: "2026-09-21T13:30:00+07:00,LALIN"
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
**อัปเดต 3 (2026-09-21): D14 APPLIED** ตามคำสั่งเจ้าของงาน — ดู §6
**อัปเดต 2 (2026-09-21, §4.4–§4.6):** วัดเพิ่ม → **D14 กลับไปเป็น default `true`** (เหตุผลใน §4.4: ทางเลือก `no_speech_prob` ใช้ไม่ได้ และ input ที่ไม่ใช่เสียงพูดทุกชนิดให้ "ประโยคไทยที่ดูเหมือนจริง") · **D8 ตัด `asr-th-en-01-medium` ออก** (§4.5)
**อัปเดต 1 (2026-09-21, §4.1–§4.3):** วัด A/B แล้ว → เคยเปลี่ยน D14 เป็น default `false` และเพิ่มคำเตือนของ D15
**หลักที่ยึด:** worker ไม่ตัดสินใจแทน caller (LVP-REQ-005), data minimization (LVP-REQ-026), ไม่มี hidden reference-ASR (LVP-REQ-017), contract เปลี่ยนได้เฉพาะเมื่อ PRP อนุมัติ (D12: pydantic = source → regenerate schema/TS)

## 0. สรุปให้ตัดสิน

| ID | เรื่อง | ข้อเสนอ (default) | ทางเลือก | ผลถ้าไม่ทำ |
|---|---|---|---|---|
| **D14** | VAD ระดับ manifest | เพิ่ม `engine_options.vad_filter: bool` + `vad_min_silence_ms` (default 700); **ตั้ง `true` สำหรับ profile ที่รับเสียงจาก caller ทั่วไป** (กลับคำจากอัปเดต 1 — เหตุผลใน §4.4) · **ไม่มี** per-request override | (b) default `false` แล้วยอมรับว่า input ที่ไม่ใช่เสียงพูดจะได้ข้อความแต่งขึ้น · (c) per-request flag · (d) ไม่เพิ่ม | input ที่ไม่ใช่เสียงพูด (เงียบ, noise, โทน, ฮัม 50 Hz) ได้ **ประโยคไทยที่ดูเหมือนจริง** เช่น "ขอบคุณครับ" ซึ่ง caller แยกไม่ออกว่าปลอม |
| **D15** | Glossary / initial prompt | เพิ่ม `AsrInput.glossary: list[str]` (optional, ≤ 64 รายการ, ≤ 400 code points รวม) ส่งเข้า whisper `initial_prompt`; **ไม่เก็บ**ใน receipt/log; **ไม่ใช่ default** — caller เป็นคนตัดสินเพราะผลขึ้นกับคุณภาพเสียง (§4.2) | (b) glossary ระดับ profile (คงที่ต่อ deployment) · (c) ทั้งสอง · (d) ไม่เพิ่ม | ชื่อเฉพาะ/ชื่อระบบเพี้ยนเป็นหลายแบบ ("Smart Clip" → "สามารถกิบ"/"สามารถกลิป") ต้องแก้ทีหลังด้วย LLM ซึ่งแพงกว่าและเสี่ยงแต่งเรื่อง |
| **D8** *(ปิดคำถามได้แล้ว)* | Phase 1 ASR profiles | **เปิด `asr-th-en-01` (turbo) ตัวเดียว · ตัด `asr-th-en-01-medium` ออก** — medium ไม่ใช่ CPU fallback ที่ใช้ได้ (§4.5) | (b) เก็บทั้งสองไว้ | เพิ่มภาระ qualification เท่าตัวโดยไม่ได้อะไร |
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
| `describe()` | ~~`engine_options` ที่เปิดเผยอยู่แล้วจะมี key นี้~~ **ข้อความนี้ผิด** — `ProfileDescribe` ไม่เปิดเผย `engine_options` เลย และการเพิ่มจะเป็น schema change ซึ่ง D14 สัญญาว่าจะไม่ทำ · ทางที่ใช้จริง: **bump `profile_revision`** ทำให้ caller ที่ pin revision เดิมได้ 409 `TARGET_MISMATCH` (รับรู้การเปลี่ยนพฤติกรรมผ่านกลไกที่สัญญามีอยู่แล้ว) และ `manifest_sha256` ใน describe เปลี่ยน |
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
- ~~ทางเลือกที่ถูกกว่า: ตรวจ `no_speech_prob` แทน VAD~~ **วัดแล้วใช้ไม่ได้ (§4.4)** — turbo คืน 0.0 เสมอ และ medium แยกเงียบกับเสียงพูดไม่ออก

### 4.4 `no_speech_prob` ใช้แทน VAD **ไม่ได้** (วัด 2026-09-21 — ล้มข้อเสนอของ LALIN เอง)

ใน §4.3 ผมเสนอทางที่ถูกกว่า VAD คือให้ engine อ่าน `no_speech_prob` ที่โมเดลคืนมาแล้วตอบ `NO_SPEECH` เอง **วัดแล้วใช้ไม่ได้**

| Model / device / compute | ความเงียบ 10 s | เสียงพูดจริง | สรุป |
|---|---|---|---|
| turbo cuda int8_float16 | 1 segment, `nsp=0.0`, ข้อความปลอม | 4 segment, `nsp=0.0` | ค่าเป็น 0.0 เสมอ **แยกอะไรไม่ได้เลย** |
| turbo cuda float16 | 1 segment, `nsp=0.0` | `nsp=0.0` | เหมือนกัน ไม่ใช่เรื่อง compute type |
| turbo cpu int8 | 1 segment, `nsp=0.0` | `nsp=0.0` | เหมือนกัน ไม่ใช่เรื่องอุปกรณ์ |
| medium cuda int8_float16 | 1 segment, `nsp=0.863` | `nsp=0.839` | มีค่าจริง แต่ **ต่างกันแค่ 0.02** แยกไม่ได้ |
| medium cpu int8 | **0 segment** | `nsp=0.854` | ตรงนี้ทำถูก แต่มาจาก logic ภายในของ library ไม่ใช่เกณฑ์ที่เราตั้ง |

ข้อเท็จจริงสองชั้น:
1. **turbo (โมเดลหลักของเรา) ไม่คืนค่า `no_speech_prob` เลย** — เป็น 0.0 ทุก segment ทุกอุปกรณ์ ทุก compute type และทั้งไฟล์ 1,437 segment ของประชุมจริงก็เป็น 0.0 ทั้งหมด
   faster-whisper ขอค่านี้จาก CTranslate2 ด้วย `return_no_speech_prob=True` แต่ conversion ของ `mobiuslabsgmbh/faster-whisper-large-v3-turbo` ไม่ส่งกลับมา
2. **ต่อให้มีค่า (medium) ก็แยกไม่ออก** — 0.863 (เงียบ) กับ 0.839 (เสียงพูด) ห่างกัน 0.024 ตั้ง threshold ไม่ได้

ผลต่อ D14: **VAD คือกลไกเดียวที่พิสูจน์แล้วว่าใช้ได้** สำหรับเปลี่ยนความเงียบเป็น `NO_SPEECH` ทางเลือกที่ผมเสนอว่าถูกกว่านั้นใช้ไม่ได้จริง

**VAD กัน input ที่ไม่ใช่เสียงพูดได้ทุกชนิดที่ทดสอบ และไม่กินเสียงพูดจริง** (2 รอบต่อช่อง):

| Input 10 s | vad=false | vad=true |
|---|---|---|
| ความเงียบดิจิทัล | 1 segment · `"ข้างคำสัญญา ได้สwheel ช่วยที่…"` | **0 segment** |
| dither (−80 dB) | 1 segment · `"เกิดที่ตรงนั้น ต้องมีกลับกัน"` | **0 segment** |
| white noise | 1 segment · `"นะครับ"` | **0 segment** |
| โทน 440 Hz | 1–4 segment · `"ที่นี่สำหรับ กับภัยที่สำหรับ…"` | **0 segment** |
| ฮัม 50 Hz | 1–10 segment · `"จริงที่หรือ แปลกสิ ไม่มีเธอ…"` | **0 segment** |
| **เสียงพูดจริง** clean-short | 4 segment · 141 ตัวอักษร | 4 segment · **141 ตัวอักษร (เท่ากัน)** |
| **เสียงพูดจริง** farfield-noisy | 15 segment · 660 ตัวอักษร | 21 segment · **683 ตัวอักษร (ไม่น้อยลง)** |

นี่คือเหตุผลที่ **กลับคำ** จากอัปเดต 1: ตอนแรกผมลด D14 เป็น default `false` เพราะคิดว่า VAD ช่วยแค่กรณีเงียบและมีทางถูกกว่า
แต่ (ก) ทางที่ถูกกว่านั้นใช้ไม่ได้ และ (ข) ขอบเขตปัญหากว้างกว่าที่ประเมิน — ไม่ใช่แค่ความเงียบ แต่คือ **input ที่ไม่ใช่เสียงพูดทุกชนิด** ให้ประโยคไทยที่ดูน่าเชื่อ
สำหรับ supplier ที่ต้อง fail-closed การแต่งประโยคขึ้นมาจากสัญญาณที่ไม่มีคำพูดคือโหมดพังที่แย่ที่สุด เพราะ caller ตรวจไม่ได้

เพิ่มเติม: ความเงียบไม่ได้ให้ข้อความปลอมแบบเดิมทุกครั้ง แต่ให้ **ข้อความไทยที่อ่านดูเหมือนจริง**หลายแบบ เช่น `"สวัสดีที่สวัสดี"`, `"ขอบคุณครับ"`, `"เจ้า ข้า ข็งสวัสดี"` และ white noise / โทน 440 Hz ก็ให้ข้อความไทยเช่นกัน — อันตรายกว่าการได้อักขระต่างภาษาเพราะ caller แยกไม่ออกว่าเป็นของปลอม

### 4.5 D8 — CPU benchmark: turbo ชนะ medium บน CPU ด้วย จึงไม่มีเหตุผลเก็บ medium

`compute_type=int8` (อย่างเดียวที่ใช้ได้บน CPU) · CPU 28 threads · 2 รอบต่อค่า · median RTF (ต่ำ = เร็ว)

| Config | clean-short 15 s | clean-long 60 s | โหลดโมเดล |
|---|---|---|---|
| turbo · cpu · int8 | 0.666 | **0.724** | 4.3 s |
| medium · cpu · int8 | 0.551 | **2.971** (178 s / 144 s) | 4.6 s |
| turbo · cuda · int8_float16 *(อ้างอิง)* | 0.032 | 0.062 | 1.9 s |

- บนคลิปสั้น medium เร็วกว่าเล็กน้อย แต่บนคลิป 60 s **medium ช้ากว่า realtime เกือบ 3 เท่า** และช้ากว่า turbo 4 เท่า
- เหตุผลเดียวที่เคยเขียนไว้ว่าเก็บ medium ไว้คือ "CPU fallback" — หลักฐานบอกว่า**ไม่จริง** turbo บน CPU ที่ RTF 0.72 ยังอยู่ในงบ 60 s ได้ ส่วน medium ไม่ได้
- **สรุป D8: เปิด `asr-th-en-01` ตัวเดียว** ถ้าต้อง deploy บน CPU ให้ใช้ manifest เดียวกันเปลี่ยนเป็น `device: cpu`, `compute_type: int8`
- ข้อแม้ที่ยังเปิด: เครื่องนี้ CPU 28 threads — host ที่เล็กกว่าจะช้ากว่านี้ ต้องวัดบน host จริงก่อนอนุมัติ CPU deployment
- หมายเหตุ: การวัด RAM รอบนี้ **ไม่สำเร็จ** จึงไม่มีตัวเลขหน่วยความจำ · **แก้ไขข้อความเดิม:** ครั้งแรกผมเขียนว่า "แก้ helper แล้ว" แต่การแก้นั้น (เปลี่ยนไปเรียก `K32GetProcessMemoryInfo`) **ไม่ได้แก้อะไร** — สาเหตุจริงคือ ctypes ส่ง pseudo-handle `-1` ของ `GetCurrentProcess` เป็น int 32-bit ทำให้ call 64-bit ได้ค่าผิดและล้มเงียบ ๆ แก้จริงแล้วใน §4.6 ด้วยการประกาศ `HANDLE` types

### 4.6 `MemoryError: bad allocation` — สืบแล้ว (2026-09-21)

**เหตุการณ์เดิม:** ระหว่าง A/B เจอ `MemoryError: bad allocation` หลังเรียก `transcribe` ราว 60 ครั้งใน process เดียว
ข้อความนี้คือ C++ `std::bad_alloc` = จอง **host RAM** ไม่ได้ (ไม่ใช่ข้อความ CUDA OOM)

**ผลการสืบ: ไม่มี leak ในเส้นทางไหนเลย และทำให้เกิดซ้ำไม่ได้**

| การทดสอบ | จำนวน | พัง? | หน่วยความจำ |
|---|---|---|---|
| **soak ผ่าน worker จริง** (manifest ที่ ship: VAD เปิด, ไม่มี glossary) · [`voice_worker_soak.py`](../../tools/verify/voice_worker_soak.py) | 200 request (3.3× จุดที่เคยพัง) | **ไม่พัง** · engine restart 0 · PID เดียวตลอด | engine private 3074.8 → 3106.3 MiB (+31.5) · slope ครึ่งหลัง **+0.13 MiB/request** |
| **จำลองเงื่อนไขตอนพังเป๊ะ ๆ** ใน process เดียว (glossary prompt, VAD ปิด, ลำดับเดียวกับ A/B) · [`asr_inprocess_memory.py`](../../tools/verify/asr_inprocess_memory.py) | 120 call (2× จุดที่เคยพัง) | **ไม่พัง** | ดูด้านล่าง |

การจำลองในข้อสอง แยกตัวเลขที่ปนกันออกเป็น 2 ส่วน:
- **+970 MiB ครั้งเดียวที่ call แรก** — CUDA/cuBLAS/cuDNN จอง workspace แบบ lazy ตอน inference แรก **ไม่ใช่ leak**
- **หลังจากนั้น +27.8 MiB ตลอด 119 call = +0.02 MiB/call** และบางช่วง**ลดลง** → steady state แบน
- spike ชั่วคราวสูงสุด +90 MiB เหนือค่าสุดท้าย (call 24, `clean-long/glossary_vad`)
- ถ้าอ่านแค่ "end − start" จะได้ +998 MiB ซึ่งดูเหมือนรั่ว ~1 GB — tool ตอนนี้รายงานสองส่วนแยกกันเพื่อกันการอ่านผิดแบบนี้

**GPU (system-wide):** แบนจาก request 32–144 แล้วกระโดดครั้งเดียว ~345 MiB แล้วแบนต่อ — **ไม่ใช่รูปแบบ leak** (leak จะขึ้นต่อเนื่อง)
และระบุว่าเป็นของ engine ไม่ได้: ตัวเลขเป็นของทั้งเครื่อง และแอปอื่นใช้ GPU เพิ่มจาก 10.3 → 12.9 GB ระหว่าง session เดียวกัน (Windows WDDM ไม่ให้ค่า per-process)

**สภาพเครื่องตลอดการทดสอบ:** RAM 31.8 GB ว่าง 6–8 GB · commit 69–73 GB จาก 85.8 GB · **`vmmemWSL` (VM ของ WSL2) ถือ ~23 GB** · Ollama ไม่ได้โหลดโมเดล

**ข้อสรุปที่พูดได้:** ตัดความเป็นไปได้ของ leak สะสมต่อ call ทิ้งได้ทั้งเส้นทางที่ ship และเส้นทาง glossary
**ข้อสรุปที่พูดไม่ได้:** สาเหตุของเหตุการณ์ครั้งเดียวนั้น — ทำให้เกิดซ้ำไม่ได้ สมมติฐานที่สอดคล้องกับหลักฐานที่สุดคือความกดดันหน่วยความจำของเครื่องขณะนั้น (WSL2 + แอปอื่น) หรือ decode ผิดปกติครั้งเดียวที่จองก้อนใหญ่ (engine ไม่ deterministic §4.1) แต่ **ยังไม่ยืนยัน**

**drift ที่เหลือ (แก้แล้ว 2026-09-22 — [Slice C §6](2026-09-22-HEADLESS-VOICE-WORKER-SLICE-C-LINUX.md)):** ~0.1–0.13 MiB/request ในเส้นทาง worker ยังอยู่หลังช่วงแรก · ถ้าคงที่ 10,000 request ≈ +1–1.3 GB — ไม่ใช่ปัญหาเร็ว ๆ นี้ แต่ **ต้อง soak ยาวกว่านี้ใน Slice C** เพื่อแยกว่าเป็น leak ช้า ๆ หรือ allocator fragmentation ก่อนกำหนด restart policy

**บั๊กที่แก้ระหว่างสืบ**
1. **engine รายงาน OOM ผิดรหัส:** `MemoryError("bad allocation")` ถูกจับแล้วรายงานเป็น `RUNTIME_FAILED` ทั้งที่สัญญามี `RUNTIME_OOM` (เช็คแค่ข้อความ "out of memory") → เพิ่ม `classify_engine_error` ใช้ทั้ง 3 จุดที่จับ exception · ไม่ใช่ contract change (รหัสมีอยู่แล้ว)
2. **จับ PyAV ผิด:** เดิมเช็ค `"av" in type(exc).__module__` = โมดูลไหนก็ได้ที่มีตัวอักษร av (เช่น `java_bridge`, `savepoint`) ถูกตีเป็น `AUDIO_FORMAT_UNSUPPORTED` → เปลี่ยนเป็น `module == "av" or startswith("av.")`
3. **เครื่องมือวัดหน่วยความจำอ่านไม่ได้:** ctypes ส่ง pseudo-handle เป็น int 32-bit → ประกาศ `HANDLE` types ใน 3 tools และเลิกคำนวณ growth จากค่า sentinel `-1` (เคยได้ "0.0" ที่ไม่มีความหมาย)
- เทสต์ใหม่ 11 ข้อ ขับ `_Engine.transcribe` จริงด้วยโมเดลปลอม (รันได้ใน venv หลักไม่ต้องมี speech stack) · **mutation check:** คืนกฎเดิมแล้วเทสต์ `bad allocation` ระหว่าง decode ล้มจริง

**คำถามที่เปิดไว้ (ไม่ได้ทำ):** หลัง `RUNTIME_OOM` ควรให้ supervisor restart engine ทันทีไหม — CUDA state อาจไม่สมบูรณ์หลัง bad_alloc กลางทาง แต่ restart ทุกครั้งแลกกับ warm-up ~20 s ต่อครั้ง ต้องตัดสินพร้อม restart policy ใน Slice C

## 6. D14 — applied (2026-09-21)

| ที่ | สิ่งที่ทำ |
|---|---|
| `profile.py` | validate `vad_filter` (bool), `vad_min_silence_ms` (100–3000), และ **บังคับ `vad_model_sha256` เมื่อเปิด VAD** |
| `engine_faster_whisper.py` | เปิด VAD ต่อ job ตาม manifest · **ตรวจ sha256 ของ `silero_vad_v6.onnx` ใน wheel และโหลดล่วงหน้าตอนบูต** — ไม่ตรง/โหลดไม่ได้ → exit ไม่ส่ง hello (fail-closed ตอนบูต ไม่ใช่ตอน request แรก) · warm-up คง VAD ปิด**โดยเจตนา** (ถ้าเปิด ความเงียบของ warm-up ถูกตัดทิ้ง decoder ไม่ได้ JIT) |
| `asr-th-en-01.json` | `vad_filter: true`, `vad_min_silence_ms: 700`, pin hash VAD · **`profile_revision` → `rev-2026-09-21-large-v3-turbo-vad`** |
| contract / schema | **ไม่เปลี่ยน** — `schema --check` in sync |

**หลักฐาน**
- เทสต์ใหม่ 11 ข้อ: silence / white noise / ฮัม 50 Hz → `NO_SPEECH`; เสียงพูดจริงยังถอดได้; hash VAD ผิด → `EngineStartError`; manifest ที่ ship pin hash ตรงกับ wheel ที่ติดตั้ง (กันอัปเกรด faster-whisper แล้ว VAD เปลี่ยนเงียบ ๆ); validation ×5
- **mutation check:** ปิด VAD ใน fixture แล้วรันเทสต์ non-speech → **ล้มจริง** (silence ได้ `"เยี่ยมเกรี่ยม ทุกอย่าง…"` SUCCEEDED, white noise ได้ `"ที่นี่จะต้องกลับกลับกลับ…"` SUCCEEDED) → เทสต์จับข้อบกพร่องได้จริง ไม่ใช่ผ่านเพราะบังเอิญ
- ผ่าน worker จริงบน GPU ด้วย manifest ที่ ship: 4 คลิปประชุมไทย SUCCEEDED ทั้งหมด (ความยาวอยู่ในช่วงความแปรปรวนเดิม) · **ความเงียบ 6 s → `FAILED NO_SPEECH`**
- speech venv 105 passed · apps/api ทั้งชุด 171 passed 1 skipped · smoke GPU PASS

## 5. ขั้นถัดไป
1. ~~A/B `initial_prompt`~~ **ทำแล้ว** → §4.2
2. ~~VAD บนคลิปสั้น + silence-only~~ **ทำแล้ว** → §4.3
3. ยังไม่ได้ทำ: WER จริงต้องมี reference transcript ที่คนตรวจ — ตัวชี้วัดใน §5 เป็น proxy (term_hits / foreign chars / ความยาว) ไม่ใช่ความถูกต้อง
4. เมื่ออนุมัติ D14 → Slice B.1 (manifest + engine + tests, ไม่มี contract change) · เมื่ออนุมัติ D15 → Slice B.2 (contract + schema regenerate + receipts + tests)

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.5.0c | 2026-09-21 | candidate | MemoryError investigated: no leak on the shipped or glossary path (200-request worker soak, 120-call reproduction), cause of the single event unconfirmed; fixed OOM misclassification, PyAV module check and the ctypes handle bug in the tools; corrected the earlier claim that the RAM helper was fixed | based on 55fbf6e | LALIN |
| 0.4.0c | 2026-09-21 | candidate | D14 applied (VAD on, pinned VAD hash, revision bump); corrected the false claim that describe() exposes engine_options | based on 877a121 | LALIN |
| 0.3.0c | 2026-09-21 | candidate | VAD blocks all five non-speech classes while preserving speech, and no_speech_prob is unusable (turbo returns 0.0) → D14 back to default true; CPU benchmark closes D8 (turbo beats medium on CPU too, drop the medium profile) | based on b0a9e81 | LALIN |
| 0.2.0c | 2026-09-21 | candidate | A/B measured over 3 repeats: engine is non-deterministic (new D16); glossary helps clean audio but truncates degraded audio; VAD's proven benefit is silence-hallucination suppression only → D14 default changed to false | based on fd814d9 | LALIN |
| 0.1.0c | 2026-09-21 | candidate | Initial proposal: D14 manifest-level VAD (default), D15 per-request glossary with draft contract diff; evidence from real-work clips; no code change | based on 16b3daa | LALIN |
