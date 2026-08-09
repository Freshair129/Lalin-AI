---
version: "0.1.0b"
created_at: "2026-07-06T03:35:00+07:00,ATHER"
last_update: "2026-07-06T03:35:00+07:00,ATHER"
status: "candidate"
attributes:
  doc_type: "feature-spec"
  domain: "dubbing"
  scope: "v0.3-next-slice"
---

# Proposed v0.3 Next Slice: Dubbing Pro

## Summary

เอกสารนี้เสนอ scope งานถัดไปของ roadmap เพื่อขยับ `v0.3.0` จากสถานะ future ให้เริ่มลงมือได้จริง โดยเลือก feature ที่ใกล้กับระบบปัจจุบันที่สุด:

1. `Multi-speaker dubbing`
2. `Transcript / ถอดเทป`
3. `Short clip cutter` สำหรับทำ content
4. `Short voice-over` จาก transcript ที่เลือก

แนวทางนี้ตั้งใจให้ปิดช่องว่างใหญ่ของ G-Music ในงาน dubbing ขั้นสูง โดยไม่กระโดดไปเรื่อง cross-platform, training pipeline, หรือ plugin system ก่อน

---

## Why This Slice

จาก code และเอกสารปัจจุบัน:

- ระบบมี `ASR → translate → TTS → timeline` อยู่แล้ว
- ระบบมี subtitle export (`SRT/VTT`) อยู่แล้ว
- ระบบมี timeline/clip engine ใน frontend อยู่แล้ว
- roadmap ที่ยังไม่เสร็จมี `Multi-speaker dubbing` เป็นรายการค้างที่ใกล้ของเดิมที่สุด

ดังนั้นงานที่คุ้มที่สุดไม่ใช่เริ่มจาก macOS/Linux หรือ voice fine-tuning แต่คือขยาย dubbing จาก `single-voice render` ไปสู่ `speaker-aware workflow` และใช้ผล ASR เดิมให้เกิดมูลค่าเพิ่มในงาน content

---

## Product Goal

ผู้ใช้ต้องสามารถ:

1. อัปโหลดเสียง/วิดีโอต้นฉบับหนึ่งไฟล์
2. ให้ระบบถอดเทปออกมาเป็น transcript พร้อม timestamps
3. แบ่ง speaker ได้อย่างน้อยในระดับใช้งานจริง
4. map voice ต่อ speaker ได้
5. render dubbing หลายตัวละครได้ใน job เดียว
6. ตัดช่วง transcript เป็น clip สั้นสำหรับคอนเทนต์ได้
7. สร้างเสียงภาคสั้น ๆ จากช่วง transcript ที่เลือกได้โดยไม่ต้องออกจาก workflow เดิม

---

## Scope

### In Scope

- transcript view จาก ASR job
- transcript segment list พร้อมเวลาเริ่ม/จบ
- speaker labeling ต่อ segment
- voice mapping ต่อ speaker slot
- multi-speaker render
- export selected segments เป็น short clips
- generate short voice-over จาก selected transcript

### Out of Scope

- lip-sync ระดับ phoneme
- automatic character identity จาก face tracking
- collaborative transcript editor
- cloud asset management
- model fine-tuning
- plugin architecture
- cross-platform packaging

---

## Execution Level

**Complexity:** `C-2`

Text → Doc → Code

เหตุผล:

- มีผลข้าม backend pipeline, API contract, และ frontend workflow
- ยังไม่ถึงขั้น architecture rewrite
- ใช้ของเดิมต่อได้จำนวนมากถ้า lock scope ดี

**Risk:** `MEDIUM`

- กระทบ dubbing pipeline, job payload, และ UX ของ view เดิม
- ไม่กระทบ schema สำคัญหรือ installer lane

---

## Proposed UX

### Dubbing Workspace Modes

หน้า `DubbingPanel` เสนอให้มี 3 โหมดใน view เดียว:

1. `Dub`
2. `Transcript`
3. `Clips`

### 1. Dub

โหมดปัจจุบันที่เน้น render output แต่เพิ่ม:

- speaker summary
- voice-per-speaker mapping
- target language
- translate toggle
- run multi-speaker dub

### 2. Transcript

workspace สำหรับตรวจ transcript ก่อน render:

- timeline-aligned transcript list
- start/end timestamp
- detected speaker หรือ `Speaker A/B/C...`
- text segment
- translate preview
- assign speaker label
- assign target voice

### 3. Clips

workspace สำหรับเอา segment ไปใช้เป็นคอนเทนต์:

- select one or many transcript segments
- merge contiguous ranges เป็น clip เดียวได้
- export audio clips
- export transcript snippet
- create short VO จาก selected text

---

## Proposed UX Rules

- default flow ต้องยังง่ายแบบเดิม: upload → choose voice → run
- ถ้าผู้ใช้ไม่แตะ speaker mapping ให้ fallback เป็น single-speaker behavior แบบปัจจุบัน
- transcript ต้องอ่านง่ายก่อนแก้ไขได้
- `Transcript` และ `Clips` ต้อง reuse timestamps เดิมจาก ASR ไม่สร้างระบบ time editor ใหม่
- short-content flow ต้องใช้ไม่เกิน 2 ระดับของ action หลัง transcript พร้อม

---

## Proposed Backend Shape

### Phase 1: Analyze First

เพิ่ม job วิเคราะห์ก่อน render:

- ถอดเสียง
- สร้าง transcript segments
- สร้าง speaker slots ขั้นต้น

ข้อเสนอ endpoint:

`POST /dubbing/analyze`

request:

```json
{
  "source_audio": "upload_x.wav",
  "source_lang": null
}
```

response:

```json
{
  "job_id": "..."
}
```

job result:

```json
{
  "transcript": {
    "language": "th",
    "segments": [
      {
        "id": "seg_001",
        "start": 0.42,
        "end": 2.91,
        "speaker": "spk_a",
        "text": "..."
      }
    ]
  }
}
```

### Phase 2: Render Dub

ขยาย endpoint เดิมหรือเพิ่ม endpoint ใหม่:

ตัวเลือกแนะนำ:

`POST /dubbing/render`

request:

```json
{
  "source_audio": "upload_x.wav",
  "target_lang": "en",
  "translate": true,
  "segments": [
    {
      "id": "seg_001",
      "speaker": "spk_a",
      "voice_id": "voice_010",
      "text_override": null
    }
  ]
}
```

เหตุผลที่แยก `analyze` กับ `render`:

- ใช้ transcript ซ้ำได้
- ลดการรัน ASR ซ้ำเวลาแก้ speaker/voice mapping
- รองรับ clip/content workflow ต่อเนื่อง

---

## Proposed Data Model

### TranscriptSegment

```ts
type TranscriptSegment = {
  id: string;
  start: number;
  end: number;
  speaker: string | null;
  text: string;
  translation?: string | null;
};
```

### SpeakerMap

```ts
type SpeakerMap = {
  speakerId: string;
  label: string;
  voiceId: string | null;
};
```

### ClipExportSelection

```ts
type ClipExportSelection = {
  segmentIds: string[];
  mergeAdjacent: boolean;
  includeTranscript: boolean;
};
```

---

## Proposed Frontend Structure

### DubbingPanel

เพิ่ม state หลัก:

- `mode: "dub" | "transcript" | "clips"`
- `analysisJob`
- `transcript`
- `speakerMap`
- `selectedSegments`

### Shared UX Contracts

- `JobProgress` ยังเป็น component กลาง
- transcript selection ต้อง keyboard-friendly
- selected segments จาก `Transcript` ต้องถูกส่งต่อไป `Clips` ได้ทันที

---

## Simplification Strategy

เพื่อไม่ให้ over-engineer:

### Version 1 of this slice should use:

- speaker slots แบบ `Speaker A/B/C...`
- manual relabel ได้
- optional auto speaker detect ถ้ามี dependency พร้อม
- no inline waveform text editor
- no per-word editing
- no nested scene/storyboard model

### Fallback behavior

ถ้าไม่มี speaker detection:

- transcript ยังทำงานได้
- ทุก segment ใช้ `spk_a` เป็นค่าเริ่มต้น
- user ยัง split/use clips/short VO ได้

นี่ทำให้ feature มีคุณค่าแม้ยังไม่เพิ่ม diarization เต็ม

---

## Acceptance Criteria

### AC-01 Transcript

- ผู้ใช้รัน analyze แล้วได้ transcript พร้อม timestamps ระดับ segment
- transcript ถูกเปิดอ่านใน UI โดยไม่ต้อง render dub ก่อน

### AC-02 Multi-Speaker Mapping

- ผู้ใช้กำหนด speaker label และ voice ต่อ speaker ได้
- ถ้าไม่กำหนด ระบบยัง render แบบ single-speaker ได้เหมือนเดิม

### AC-03 Multi-Speaker Render

- render job หนึ่งงานใช้หลาย voice IDs ตาม segment mapping ได้
- output ยังคงรายงาน progress ผ่าน WebSocket

### AC-04 Clip Cutter

- ผู้ใช้เลือก segment หนึ่งหรือหลายช่วงแล้ว export เป็น clip สั้นได้
- รองรับ merge adjacent segments ก่อน export

### AC-05 Short Voice-Over

- ผู้ใช้เลือก transcript ช่วงสั้นแล้วสั่งสร้างเสียงภาคสั้น ๆ ได้
- output ถูกเล่น/ดาวน์โหลดได้ใน workflow เดียว

### AC-06 Regression Guard

- single-speaker dubbing flow เดิมยังทำงานได้
- subtitle export เดิมยังทำงานได้

---

## Recommended Delivery Order

### Slice A

- transcript analyze job
- transcript UI
- no multi-speaker render yet

### Slice B

- speaker slots + manual mapping
- multi-speaker render payload

### Slice C

- clip cutter
- short voice-over from selection

ลำดับนี้ช่วยให้ทุก step มีของใช้จริงและ verify ได้ ไม่ต้องรอ feature ใหญ่ทั้งก้อน

---

## Open Questions

1. speaker detection รอบแรกจะใช้ manual-only ก่อน หรือจะผูก diarization dependency ตั้งแต่แรก
2. short clip export ต้องการ audio only หรือ audio + subtitle snippet เป็น default
3. short voice-over ควรออกไปลง `TTSPanel` ด้วยหรือเก็บไว้ใน `DubbingPanel` อย่างเดียว

---

## Recommended Decision

แนะนำให้อนุมัติแนวทางนี้โดยเริ่มจาก `Slice A` ก่อน:

- ได้ `ถอดเทป`
- ได้ฐานข้อมูล transcript สำหรับ clip/content
- ไม่เสี่ยงเกินจำเป็น
- ปูทางตรงไปยัง `Multi-speaker dubbing` ที่ค้างอยู่ใน roadmap

---

## Definition of Done for Approval

หาก proposal นี้ได้รับ approval รอบถัดไป งาน code ควรถูกแบ่งเป็น:

1. backend analyze contract
2. transcript UI
3. speaker map model
4. multi-speaker render
5. clip export / short VO

พร้อม verification:

- backend smoke
- frontend build
- single-speaker regression check
- transcript-to-clip happy path

---

Please review and approve this documentation. I will generate the code once approved.
