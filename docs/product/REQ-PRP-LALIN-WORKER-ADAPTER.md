---
version: "0.1.0c"
created_at: "2026-09-24T02:00:00+07:00,LALIN,4861082"
last_update: "2026-09-24T02:00:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "change-request"
  scope: "Handoff กลับไปยังทีม PRP — 5 ข้อตัดสินที่ต้องปิดก่อนเขียน RuntimeInvoker adapter ที่ M4"
---

# REQ-PRP-LALIN-WORKER-ADAPTER — ขอข้อตัดสิน 5 ข้อก่อน M4 (candidate)

## สถานะและขอบเขตของเอกสารนี้

เอกสารนี้เป็น **handoff ทิศกลับ** ของ [`CR-005`](CR-005--HEADLESS_VOICE_WORKER.md): ตอนนั้น PRP ส่ง
`REQ-LALIN-PRP-VOICE-WORKER.md` 0.1.0 มาขอให้ Lalin สร้าง voice worker — ตอนนี้ worker ใช้งานได้จริงแล้ว
และ Lalin ขอให้ PRP ตัดสิน 5 ข้อที่ **Lalin ตัดสินแทนไม่ได้** เพราะทุกข้ออยู่ในขอบเขตที่ PRP เป็นเจ้าของ

**นี่ไม่ใช่การอนุมัติ** ไม่ขอให้เริ่ม M4 ก่อนกำหนด และไม่ขอให้แก้ `prp-worker.yaml` ที่ยัง DRAFT
ขอแค่ให้คำตอบ 5 ข้อถูกบันทึกไว้ที่เดียว ก่อนที่จะมีคนลงมือเขียน adapter

ไม่มีไฟล์ใดใน `Private-Runtime-Platform` ถูกแก้ ข้อมูลทั้งหมดในเอกสารนี้มาจากการอ่านอย่างเดียวที่ `f2c86a7`
(branch `feat/PRP-WP24-ev07-candidate-a`) เทียบกับ Lalin ที่ `4861082`

[ASSUMPTIONS]

1. **adapter เขียนใน repo ของ PRP ไม่ใช่ของ Lalin** เพราะ implement `prp.core.execution.ports.RuntimeInvoker`
   และใช้ model ของ PRP; `AGENTS.md` ของ PRP กำหนดให้มีเอกสารที่อนุมัติแล้วก่อนเขียนโค้ด
2. **route ของ Lalin worker ไม่เปลี่ยน** ตามที่ `prp-worker.yaml` เขียนไว้เองว่า *"Native engines do not have to
   expose these routes; an external adapter/supervisor provides them"* — adapter คือรอยต่อ
3. PRP ยังเป็นเจ้าของ admission, lease, quota, คิว และ artifact สาธารณะ; worker บังคับเฉพาะ local invariant
4. M4 ยังถูก gate ด้วย WP24 → WP03 → WP04 ตาม `docs/SDD-PRP-REPO.md` §11 — เอกสารนี้ไม่ขอเปลี่ยน gate นั้น

## สิ่งที่พร้อมอยู่แล้วฝั่ง Lalin

| สิ่งที่มี | อยู่ที่ไหน | สถานะ |
|---|---|---|
| worker ที่ทำ ASR จริง (faster-whisper large-v3-turbo, CPU) | `lalin-voice-worker:dev` | รันอยู่ production, RTF 0.22–0.61 |
| worker TTS (F5-TTS-THAI, GPU) | image แยก | ผ่าน smoke ครบ, preset เสียงยัง `dev-only` |
| ช่องทางเชื่อม (D17) | `docker/voice-worker/compose.example.yaml` | พิสูจน์แล้วด้วย `coordinator-probe` |
| ตัวอย่าง caller ครบทุกคำสั่ง ไม่ retry เอง | `tools/verify/voice_worker_client.py` | รันกับ worker ตัวจริงแล้ว |
| เฝ้าดูจากเครื่องอื่นได้ | status gateway `:9109` | ใช้งานอยู่, เครื่อง 3060 เข้าถึงได้ |

coordinator container ต้องการแค่ 2 อย่าง คือ mount volume ของ socket และ `group_add: ["10001"]`

## 5 ข้อตัดสิน

### PRP-DEC-01 — `profile_epoch` เป็นตัวเลข แต่ `runtime_epoch` เป็นข้อความ

`prp.core.execution.model.Attempt.profile_epoch` และ `ResultEnvelope.profile_epoch` เป็น `int`
แต่ `Target.runtime_epoch` ของ worker เป็น string เช่น `ep-b4e0171ee3d7-09b7cd6b` ซึ่งเปลี่ยนใหม่ทุกครั้งที่
engine เริ่ม และ worker ใช้ค่านี้ **ปฏิเสธงานที่ค้างท่อมาจาก epoch เก่าด้วย 409 `TARGET_MISMATCH`**

เรื่องนี้ต้องตรงเป๊ะ ถ้าแปลงผิดจะกลายเป็นปฏิเสธงานที่ควรทำ หรือแย่กว่านั้นคือรับงานที่ควรปฏิเสธ

**ทางเลือก** (ก) PRP ส่งค่า opaque ของ worker ผ่านไปตรง ๆ เพิ่มฟิลด์ string · (ข) adapter เก็บ mapping
int ↔ string เอง · (ค) เปลี่ยน `profile_epoch` เป็น string ในสัญญา ตอนที่ WP03 freeze

**Lalin แนะนำ (ก) หรือ (ค)** เพราะ (ข) ทำให้ adapter ต้องมี state ซึ่งจะหายเมื่อ restart

### PRP-DEC-02 — `runtime_uid` กับ `runtime_id`

`ResultEnvelope.runtime_uid` ของ PRP ตรงกับ `Target.runtime_id` ของ worker แค่ชื่อต่างกัน แต่ต้องตกลงให้จบ
ก่อน เพราะ `tests/contracts/test_worker_conformance.py` ของ PRP เทียบชื่อฟิลด์ตรง ๆ

**Lalin แนะนำ** ให้ adapter เป็นคนแปลง ไม่ต้องแก้สัญญาฝั่งไหน

### PRP-DEC-03 — `fence_token` ตรงกับอะไร

`Attempt.fence_token` ของ PRP เป็นค่าเดียว แต่ `Admission` ของ worker มี 3 ค่าที่เกี่ยวข้อง:
`lease_id`, `deadline_at` และ `content_fence` (optional)

**คำถาม** `fence_token` ควรไปเป็น `lease_id` หรือ `content_fence` และ `deadline_at` ของ worker มาจากไหน
(`Invocation.deadline_at` หรือคำนวณจากเวลาที่เหลือของ lease)

**Lalin แนะนำ** `fence_token` → `lease_id`, `Invocation.deadline_at` → `deadline_at`,
ส่วน `content_fence` ปล่อยว่างจนกว่าจะมี use case จริง

### PRP-DEC-04 — ไฟล์เสียงเข้าทางไหน ผลออกทางไหน

worker รับเสียงเป็น multipart ตอน submit และให้ดาวน์โหลดผลจาก `GET /operations/{id}/output`
แต่ `prp-worker.yaml` **ไม่มีทั้ง route รับไฟล์และ route ดาวน์โหลดผล** และสัญญาฝั่ง client ของ PRP เองก็ระบุว่า
multipart ของ `transcribeAudio` / `uploadArtifact` "รอ upload path M4"

ตราบใดที่ข้อนี้ยังไม่ตัด adapter จะไม่รู้ว่าไบต์มาจากไหนและผลไปไหน ซึ่งเป็นแกนกลางของงาน ไม่ใช่รายละเอียด

**Lalin แนะนำ** ตัดข้อนี้ให้จบ **ก่อน** เริ่ม M4 เพราะมันกำหนดรูปร่างของ adapter ทั้งตัว

### PRP-DEC-05 — ใครเป็นคนลบไฟล์

worker เก็บผลไว้จนกว่าจะมีคนสั่ง `DELETE /operations/{id}/payload` ถ้าไม่มีใครสั่ง
**เสียงประชุมและ transcript จะสะสมใน data volume ของ worker ไปเรื่อย ๆ**

เป็นเรื่องนโยบายข้อมูล ไม่ใช่เรื่องเทคนิค — worker ไม่ลบเองโดยตั้งใจ เพื่อไม่ให้ผลหายก่อนที่เจ้าของงานจะได้อ่าน

**Lalin แนะนำ** ให้ PRP สั่งลบทันทีที่ดึงผลสำเร็จ และมีงานกวาดของเก่าเป็นตาข่ายรอง

## สิ่งที่ coordinator ต้องรับรู้ ไม่ว่าจะตัด 5 ข้อข้างบนอย่างไร

- **D16 — ผลไม่คงที่ข้ามครั้ง** ส่งเสียงเดิมเข้าไปใหม่อาจได้ข้อความต่างออกไป ห้ามใช้วิธี "ส่งซ้ำแล้วเทียบ"
  เป็นการตรวจสอบ; receipt ของ `attempt_id` เดิมไม่เปลี่ยนตลอดไป
- **D15 — glossary ต่อ request** ช่วยเฉพาะเสียงชัด ในการทดสอบ A/B มันทำให้เสียงไกลแย่ลง
- **D18 — `repeated_oom` ไม่ใช่ error ที่ retry ได้** worker ล็อกตัวเองหลังโดน OOM kill ซ้ำ และ**จะไม่กลับมาเอง**
  ต้องถือเป็นสัญญาณเรียกคน ไม่ใช่เคสที่ส่งซ้ำ
- **ไม่ retry ใน transport** การส่งซ้ำต้องเป็นการตัดสินใจของ coordinator หลังอ่าน status (LVP-REQ-023)

## Lalin จะทำอะไรต่อเมื่อได้คำตอบ

1. ปรับเอกสารสัญญาฝั่ง Lalin ให้ตรงกับที่ตัดสิน (ถ้าจำเป็น)
2. ส่งตัวอย่างการเรียกที่ตรงกับ mapping ที่ตกลง รันได้จริงกับ worker ตัวจริง
3. ถ้า PRP ต้องการ Lalin ช่วยเขียน adapter ใน repo ของ PRP ทำได้ แต่ต้องผ่าน gate ของ PRP เอง

## ไม่อยู่ในขอบเขตของเอกสารนี้

- ไม่ขอเปลี่ยน `prp-worker.yaml` ตอนที่ยัง DRAFT
- ไม่ขอเปิด M4 ก่อน WP24 → WP03 → WP04
- ไม่มีการแก้ไฟล์ใน repo ของ PRP

## CHANGELOG

| Version | Date | Status | Change | Evidence | Author |
|---|---|---|---|---|---|
| 0.1.0c | 2026-09-24 | candidate | ฉบับแรก: 5 ข้อตัดสิน (PRP-DEC-01..05) พร้อมข้อแนะนำของ Lalin และสิ่งที่พร้อมส่งมอบแล้ว | based on 4861082, PRP at f2c86a7 | LALIN |
