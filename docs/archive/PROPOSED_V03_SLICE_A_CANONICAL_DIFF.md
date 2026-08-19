---
version: "0.1.0b"
created_at: "2026-07-06T03:59:00+07:00,ATHER"
last_update: "2026-07-06T03:59:00+07:00,ATHER"
status: "candidate"
attributes:
  doc_type: "feature-spec"
  domain: "documentation-impact"
  scope: "slice-a-canonical-diff"
---

# Proposed Canonical Doc Diff for v0.3 Slice A

## Purpose

เอกสารนี้ไม่ใช่ canonical truth ใหม่ แต่เป็น packet สำหรับ review ว่า
ถ้าอนุมัติ `Slice A: Transcript / ถอดเทป`
เอกสารหลักของโปรเจกต์ควรถูกแก้อย่างไรบ้างหลังลงโค้ด

เป้าหมายคือให้ approval รอบเดียวครอบคลุมทั้ง:

1. scope ของ feature
2. ขอบเขตงานโค้ด
3. ผลกระทบกับเอกสารหลัก

---

## Affected Canonical Docs

1. `docs/product/PRD.md`
2. `docs/product/SRS.md`
3. `docs/archive/UI_SITEMAP.md`

---

## Proposed Diff — PRD

### 1. Product Vision

ปัจจุบัน PRD เน้น:

- Voice Cloning
- Dubbing
- Mastering

**เสนอเพิ่ม framing ว่า dubbing workspace มี transcript-first path**

แนวข้อความที่ควรสะท้อน:

- G-Music ไม่ได้มีแค่ render dubbing แต่เริ่มรองรับ `analyze transcript before dub`
- transcript ใช้ต่อในงาน translate, review, and short-content workflow ได้

### 2. Section 4.3 AI Dubbing

ปัจจุบันระบุ pipeline เดียว:

`ASR → translate → TTS → fit → mix`

**เสนอแก้เป็น 2 paths**

1. `Analyze path`
2. `Render path`

โดยเพิ่มรายการ:

- transcript analysis
- transcript preview
- segment timestamps
- subtitle artifact reuse

### 3. User Flow 2

ปัจจุบัน:

`upload → choose voice → run dub`

**เสนอให้เปลี่ยนเป็น**

ทางลัดเดิม:

`upload → choose voice → run dub`

และทางใหม่:

`upload → analyze transcript → review transcript → run dub later`

### 4. Roadmap Framing

ใน `v0.3.0` มี `Multi-speaker dubbing` อยู่แล้ว

**เสนอให้ canonical PRD ภายหลังโค้ดผ่านแล้วสะท้อนว่า Slice A คือ groundwork ของรายการนี้**

ตัวอย่าง wording:

- `Transcript analyze workspace (foundation for multi-speaker dubbing and short-content workflows)`

---

## Proposed Diff — SRS

### 1. FR-03 AI Dubbing

ปัจจุบัน FR-03 ผูกทุกอย่างเข้ากับ render path เกือบทั้งหมด

**เสนอเพิ่ม requirement ใหม่โดยไม่ลบของเดิม**

#### Proposed additions

- `FR-03.2a` ระบบต้องเปิดเผยผล ASR transcript ต่อผู้ใช้ก่อน render dubbing ได้
- `FR-03.2b` transcript ต้องมี timestamps ระดับ segment ที่อ่านได้ใน UI
- `FR-03.2c` ระบบต้องรองรับ transcript analysis เป็น job แยกจาก dubbing render
- `FR-03.2d` เมื่อ source เปลี่ยน transcript เดิมต้องไม่ถูกใช้แบบเงียบ ๆ ว่าเป็นของ source ใหม่

### 2. REST API Section

ปัจจุบันมี:

- `POST /dubbing`

**เสนอเพิ่ม**

- `POST /dubbing/analyze`

พร้อม response:

```json
{ "job_id": "..." }
```

และ result contract ที่มี:

- `detected_language`
- `segment_count`
- `duration_sec`
- `transcript.segments[]`
- `subtitle_srt`
- `subtitle_vtt`

### 3. NFR / Usability

เสนอเพิ่มข้อกำหนดเชิง usability สำหรับ transcript:

- transcript tab ต้องเปิดดูผล analyze ได้โดยไม่ต้อง render dub ก่อน
- transcript list ต้องรองรับ segment count สูงโดยยังอ่านได้

---

## Proposed Diff — UI_SITEMAP

### 1. DubbingPanel section

ปัจจุบัน DubbingPanel ถูกอธิบายเป็นหน้า input + run + output เป็นหลัก

**เสนอเปลี่ยนเป็น 2-mode workspace**

1. `Dub`
2. `Transcript`

### 2. DubbingPanel Detail

เสนอเพิ่มโครงนี้:

#### Dub mode

- source upload
- voice select
- target language
- translate toggle
- `Analyze Transcript`
- `Run Dubbing`

#### Transcript mode

- source summary
- detected language
- segment count
- transcript list
- timestamped rows
- empty/loading/error states

### 3. Shared Components

เสนอเพิ่ม note ว่า `JobProgress` ถูก reuse สำหรับ analyze job ด้วย ไม่ใช่เฉพาะ render jobs

### 4. UI Backlog

หลังโค้ดผ่านแล้ว backlog ใหม่ที่ควรถูกเพิ่มเป็น future:

- transcript editing
- speaker mapping
- clip export from transcript
- short VO from selected transcript

เพื่อไม่ให้ canonical docs ดูเหมือน Slice A ปิดทุกงานของ v0.3 แล้ว

---

## What Should Not Change Yet

ถึงแม้จะอนุมัติ Slice A แล้ว เอกสารหลักยังไม่ควร claim ว่า:

- multi-speaker dubbing เสร็จแล้ว
- clip cutter เสร็จแล้ว
- short voice-over เสร็จแล้ว

เพราะทั้งหมดนี้ยังเป็น slice ถัดไป

---

## Approval Boundary

ถ้าอนุมัติ package นี้ รอบโค้ดถัดไปจะทำได้อย่างถูกต้องตาม repo rules:

### Allowed after approval

- เพิ่ม `POST /dubbing/analyze`
- เพิ่ม transcript result contract
- เพิ่ม transcript tab ใน `DubbingPanel`
- เพิ่ม stale transcript handling
- sync canonical docs หลัง implementation truth พร้อม

### Not yet allowed by this approval alone

- multi-speaker render
- diarization dependency ใหญ่
- clip cutter
- short voice-over
- PRD/SRS/UI claims beyond Slice A

---

## Reviewer Shortcut

ถ้าคุณจะ approve แบบสั้นที่สุด สามารถ approve ได้ในระดับนี้:

`Approve Slice A only: transcript analyze + transcript UI + canonical doc sync after code`

---

## Version Diff

- `+` เพิ่ม packet อธิบายผลกระทบต่อ canonical docs
- `+` แยกชัดว่าหลัง approval อะไร “แก้ได้” และอะไร “ยังไม่ควรอ้างว่าเสร็จ”
- `+` ลดความเสี่ยงที่ implementation จะล้ำเกิน scope ที่อนุมัติ

Please review and approve this documentation. I will generate the code once approved.
