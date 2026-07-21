---
version: "0.1.0b"
created_at: "2026-07-06T03:48:00+07:00,ATHER"
last_update: "2026-07-06T03:48:00+07:00,ATHER"
status: "candidate"
attributes:
  doc_type: "feature-spec"
  domain: "dubbing"
  scope: "slice-a"
---

# Proposed v0.3 Dubbing Pro Slice A

## Goal

Slice A คือการเพิ่ม `Transcript / ถอดเทป` เป็นความสามารถชั้นต้นของระบบ โดยยังไม่บังคับให้ทำ multi-speaker render เต็มในรอบเดียว

เป้าหมายของ slice นี้:

1. ถอดเสียงต้นฉบับออกมาเป็น transcript พร้อม timestamps
2. เปิด transcript ใน UI ได้ก่อน render dubbing
3. เก็บ transcript result ไว้ใช้ต่อใน slice ถัดไป
4. ไม่ทำให้ single-speaker dubbing flow เดิมพัง

---

## Why Slice A First

ปัจจุบันระบบมีของเหล่านี้อยู่แล้ว:

- ASR backend ใน dubbing pipeline
- subtitle export (`SRT/VTT`)
- job/progress infrastructure
- DubbingPanel ที่รับ source + voice + target language ได้

แต่สิ่งที่ยังไม่มีคือ “ผล ASR ที่เปิดให้ผู้ใช้ดูและใช้ต่อได้”

ถ้าปิด Slice A ได้ก่อน เราจะได้ฐานสำหรับ:

- multi-speaker mapping
- clip cutter
- short voice-over
- transcript-driven workflow

โดยยังไม่ต้องแบก scope ของ diarization และ rendering logic ใหม่ทั้งหมดในครั้งเดียว

---

## User Story

### Primary

ในฐานะผู้ใช้ G-Music
ฉันต้องการอัปโหลดไฟล์เสียงหรือวิดีโอแล้วกดวิเคราะห์
เพื่อให้ได้ transcript พร้อมเวลาเริ่ม/จบของแต่ละช่วง
และใช้ transcript นี้ตัดสินใจก่อนว่าจะแปล พากย์ หรือซอยคลิปต่ออย่างไร

### Secondary

ในฐานะผู้ใช้เดิมที่เคยใช้ dubbing แบบปุ่มเดียว
ฉันยังต้องสามารถใช้ flow เดิมได้
โดยไม่จำเป็นต้องเรียน workflow transcript ใหม่ถ้ายังไม่ต้องการ

---

## Scope

### In Scope

- backend analyze endpoint ใหม่
- transcript result schema
- transcript view ใน `DubbingPanel`
- transcript segment list
- read-only transcript selection
- link transcript result เข้ากับ existing job UI

### Out of Scope

- multi-speaker voice mapping
- render หลาย voice ใน job เดียว
- clip export
- short voice-over generation
- transcript text editing
- segment split/merge

---

## Root Change

จากเดิม:

`upload → run dubbing → ได้ output`

ไปเป็น:

`upload → analyze → ดู transcript → (ภายหลังค่อย render หรือใช้ทำงานต่อ)`

แต่ต้องยังรักษา quick flow เดิมไว้:

`upload → run dubbing`

ดังนั้น Slice A เพิ่ม capability ใหม่ โดยไม่แทนที่ default path เดิม

---

## Proposed UX

### DubbingPanel Tabs

เพิ่ม tab ย่อยในหน้า dubbing:

1. `Dub`
2. `Transcript`

### Dub Tab

ยังคง flow เดิม:

- source upload
- voice select
- target language
- translate toggle
- run dubbing

เพิ่ม action ใหม่:

- `Analyze Transcript`

### Transcript Tab

แสดงผล transcript ล่าสุดของ source ปัจจุบัน:

- detected language
- analyzed source filename
- segment count
- total duration
- transcript list

### Transcript Row

แต่ละ row ต้องมี:

- segment id
- start
- end
- duration
- text

### Empty States

กรณีสำคัญ:

- ยังไม่เคย analyze
- analyze กำลังรัน
- analyze ล้มเหลว
- analyze สำเร็จแต่ไม่มี segment

---

## UX Rules

- transcript ต้องอ่านง่ายก่อนแก้ไขได้
- timestamp ต้องเป็นแบบมนุษย์อ่านได้ เช่น `00:12.42`
- row density ต้องพออ่านยาว ๆ ได้ ไม่ใช้ card ซ้อนการ์ด
- transcript tab ต้อง reuse visual language ของ app ปัจจุบัน
- ผู้ใช้ต้องไม่สับสนระหว่าง `Analyze` กับ `Run Dubbing`

---

## Backend Proposal

### New Endpoint

`POST /dubbing/analyze`

request:

```json
{
  "source_audio": "upload_abc.wav",
  "source_lang": null
}
```

response:

```json
{
  "job_id": "job_xxx"
}
```

### Job Result Shape

```json
{
  "source_audio": "upload_abc.wav",
  "detected_language": "th",
  "segment_count": 18,
  "duration_sec": 143.24,
  "transcript": {
    "segments": [
      {
        "id": "seg_001",
        "start": 0.42,
        "end": 2.91,
        "text": "สวัสดีครับทุกคน"
      }
    ]
  },
  "subtitle_srt": "transcript_xxx.srt",
  "subtitle_vtt": "transcript_xxx.vtt"
}
```

### Storage Direction

ผล analyze ควรเก็บไว้ใน output artifact ของ job เดิม ไม่ต้องเพิ่ม DB ใหม่ใน Slice A

ข้อเสนอ:

- transcript summary อยู่ใน `job.result`
- subtitle artifacts ยังอ้างเป็น filename ใน `data/outputs`

---

## Frontend State Proposal

ใน `DubbingPanel` เพิ่ม state หลัก:

```ts
type TranscriptSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
};

type TranscriptResult = {
  sourceAudio: string;
  detectedLanguage: string | null;
  segmentCount: number;
  durationSec: number;
  segments: TranscriptSegment[];
  subtitleSrt?: string | null;
  subtitleVtt?: string | null;
};
```

state ที่ต้องมี:

- `mode`
- `analyzeJob`
- `transcript`
- `selectedSegmentIds`

---

## Interaction Flow

### Happy Path

1. ผู้ใช้อัปโหลด source
2. กด `Analyze Transcript`
3. job แสดง progress
4. job เสร็จ
5. app สลับหรือเปิด `Transcript` tab
6. ผู้ใช้เห็น segment list พร้อมเวลา

### Error Path

1. วิเคราะห์ล้มเหลว
2. job panel แสดง error
3. transcript เดิมไม่ถูกลบ
4. ผู้ใช้ retry ได้

### Re-analyze Path

1. ผู้ใช้อัปโหลด source ใหม่
2. transcript เก่าต้องถูกมองว่า stale
3. UI ต้องบอกชัดว่า transcript ปัจจุบันไม่ตรงกับ source ใหม่จนกว่าจะ analyze ใหม่

---

## API / UI Contract Notes

- ใช้ job infrastructure เดิม: queued/running/done/error
- ไม่ต้องเพิ่ม WebSocket path ใหม่
- transcript row id ต้อง stable พอสำหรับ selection
- ถ้า ASR ส่ง segment ว่าง ต้องกรองหรือแสดงอย่างสม่ำเสมอ

---

## Verification Plan

### Backend

- `POST /dubbing/analyze` รับ request ได้จริง
- job result มี transcript segments
- detected language ถูกส่งกลับเมื่อมี
- subtitle artifact ยังเขียนได้

### Frontend

- `npm run build` ผ่าน
- `DubbingPanel` เปิด transcript tab ได้
- transcript list render ได้แม้ segment เยอะ
- empty/error/loading states ครบ

### Regression

- `POST /dubbing` เดิมยังทำงาน
- subtitle export เดิมยังไม่แตก
- job progress component เดิมยัง reuse ได้

---

## Acceptance Criteria

### AC-01

ผู้ใช้กด `Analyze Transcript` จากหน้า dubbing ได้

### AC-02

เมื่อ analyze สำเร็จ ผู้ใช้เห็น transcript พร้อม timestamp ระดับ segment ใน UI

### AC-03

ผู้ใช้ยังใช้ flow dubbing เดิมได้โดยไม่ต้องผ่าน transcript

### AC-04

เมื่อ source เปลี่ยน UI ต้องไม่แสดง transcript เก่าว่าเป็นของ source ใหม่แบบเงียบ ๆ

### AC-05

ผล analyze ต้องพร้อมใช้ต่อใน slice ถัดไปโดยไม่ต้องเปลี่ยน contract ใหญ่

---

## Implementation Sequence

1. backend endpoint + job result contract
2. frontend analyze action
3. transcript tab UI
4. stale-source handling
5. verification + doc truth sync

---

## Approval Boundary

ถ้าอนุมัติเอกสารนี้ รอบโค้ดถัดไปจะทำเฉพาะ:

- transcript analyze endpoint
- transcript tab UI
- transcript result state
- regression guard สำหรับ flow เดิม

ยังไม่รวม:

- multi-speaker mapping
- clip cutter
- short voice-over

---

## Version Diff

- `+` แตก proposal ใหญ่เป็น implementation-ready slice
- `+` เพิ่ม API contract ของ `POST /dubbing/analyze`
- `+` เพิ่ม state model, UX states, และ verification plan
- `+` จำกัด approval boundary ให้แคบลงเพื่อเริ่มลงโค้ดได้เร็ว

Please review and approve this documentation. I will generate the code once approved.
