---
version: "0.1.0b"
created_at: "2026-07-06T04:08:00+07:00,ATHER"
last_update: "2026-07-06T04:08:00+07:00,ATHER"
status: "candidate"
attributes:
  doc_type: "execution-backlog"
  domain: "roadmap"
  scope: "remaining-roadmap"
---

# Roadmap Execution Backlog

## Purpose

เอกสารนี้แตก roadmap ที่ยังไม่เสร็จออกเป็นงานย่อยที่ “หยิบไปทำได้จริง”
เพื่อให้ของที่เหลือใน `PRD.md` และ `ROADMAP_MUSIC.md`
ไม่ค้างเป็นรายการกว้างเกินไป

เอกสารนี้ยังไม่ใช่ canonical completion claim
แต่เป็น execution map ของงานที่ยังเหลือ

---

## Current Truth

จากเอกสาร canonical ปัจจุบัน:

### Closed

- `v0.1.0` ปิดแล้ว
- `v0.2.0` ปิดแล้ว
- Remix Phase A/B ปิดแล้ว

### Remaining

#### PRD v0.3.0

1. รองรับ macOS / Linux
2. Voice fine-tuning
3. Multi-speaker dubbing
4. Plugin system

#### ROADMAP_MUSIC Phase C

1. pyworld formant-preserving
2. Piecewise beat-warp
3. RVC singing voice conversion

---

## Prioritization Rule

จัดลำดับตามหลัก:

1. ใกล้ของเดิมที่สุด
2. unlock feature อื่นต่อได้
3. verify ได้ง่าย
4. เสี่ยงต่ำกว่าทำ architecture/pipeline ใหม่ทั้งก้อน

---

## Recommended Order

### Track A — Dubbing Pro

สถานะ: `next`

เหตุผล:

- มีฐาน ASR/TTS/subtitle/job/UI อยู่แล้ว
- ปิดช่องว่างเชิงแข่งขันจริง
- แตกเป็น slice เล็กได้

#### Slice A

- transcript analyze
- transcript UI
- canonical doc sync

สถานะ: `proposal ready`

เอกสาร:

- `PROPOSED_V03_DUBBING_PRO.md`
- `PROPOSED_V03_DUBBING_PRO_SLICE_A.md`
- `PROPOSED_V03_SLICE_A_CANONICAL_DIFF.md`

#### Slice B

- speaker labels
- voice-per-speaker mapping
- multi-speaker render payload

สถานะ: `not approved`

#### Slice C

- clip export from transcript
- short voice-over from selected transcript

สถานะ: `not approved`

---

### Track B — Music Phase C

สถานะ: `after Track A`

เหตุผล:

- เป็น advanced quality work
- value สูง แต่ dependency หนักกว่า
- บางรายการมี legal/product risk เพิ่ม

#### Slice B1

- pyworld formant-preserving evaluation
- benchmark vs current psola path
- acceptance thresholds for large pitch shift

สถานะ: `not started`

#### Slice B2

- piecewise beat-warp design
- drift detection definition
- timeline preview contract for warped segments

สถานะ: `not started`

#### Slice B3

- RVC singing voice conversion design
- consent gate
- BYOM lane
- legal/documentation guardrails

สถานะ: `not started`

---

### Track C — Platform / Productization

สถานะ: `later`

เหตุผล:

- broad surface area
- weak leverage compared to Dubbing Pro
- likely needs packaging/build-system work more than user feature proof

#### Slice C1

- cross-platform feasibility audit
- Tauri/backend dependency blockers for macOS/Linux
- packaging delta report

สถานะ: `not started`

#### Slice C2

- plugin system definition
- plugin contract
- security model
- install/discovery UX

สถานะ: `not started`

#### Slice C3

- voice fine-tuning design
- asset storage
- consent/data policy
- training job model

สถานะ: `not started`

---

## Dependency Graph

### Hard Dependencies

- `Track A / Slice A` before `Track A / Slice B`
- `Track A / Slice A` before `Track A / Slice C`

### Soft Dependencies

- `Track B / Slice B1` before deciding whether `Track B / Slice B3` is worth productizing in-app
- `Track C / Slice C1` before any PRD claim that non-Windows support is near-ready

---

## Verification Standard Per Track

### Track A

- backend route smoke
- frontend build
- single-speaker regression
- transcript happy path

### Track B

- offline benchmark artifacts
- audio A/B evidence
- documented thresholds
- no regression to current remix lane

### Track C

- packaging/build proof
- runtime smoke on target platform or explicit blocker report
- docs truth sync

---

## Recommended “Done” Interpretation

Roadmap จะถือว่า “ใกล้เสร็จจริง” เมื่อ:

1. Track A ปิดอย่างน้อยถึง Slice B
2. Track B มี decision อย่างน้อย 1 ชิ้นว่า implement หรือ reject ด้วย evidence
3. Track C มี feasibility decision อย่างน้อย 1 ชิ้น ไม่ปล่อยเป็น checkbox ลอย

หมายเหตุ:

นี่ไม่ใช่การ rewrite canonical roadmap
แต่เป็นเกณฑ์ปฏิบัติว่าของค้างควรถูกแปลงเป็นงานจริงอย่างไร

---

## Immediate Next Action

ถ้าจะเดินต่อโดยไม่เปลี่ยนลำดับ:

`Approve Slice A`

แล้วลงมือ:

1. `POST /dubbing/analyze`
2. transcript tab UI
3. stale transcript handling
4. doc truth sync หลังโค้ดผ่าน

---

## Version Diff

- `+` แตกงาน roadmap ที่เหลือเป็น execution tracks / slices
- `+` ระบุ dependency และ verification standard
- `+` ชี้ next action ที่คุ้มที่สุดตอนนี้อย่างชัดเจน

