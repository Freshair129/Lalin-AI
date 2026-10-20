---
version: "0.2.2b"
created_at: "2026-07-06T04:08:00+07:00,ATHER"
last_update: "2026-10-21T00:00:28+07:00,Codex"
status: "beta"
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

สถานะ: `closed through Slice C; PR #30 merged as 8df8c073eeab07f87a6fa70875bb321e8ecbe672`

เหตุผล:

- มีฐาน ASR/TTS/subtitle/job/UI อยู่แล้ว
- ปิดช่องว่างเชิงแข่งขันจริง
- แตกเป็น slice เล็กได้

#### Slice A

- transcript analyze
- transcript UI
- canonical doc sync

สถานะ: `approved; implemented and merged in PR #29 (merge commit 60c66c4); live-ASR verification remains pending`

เอกสาร:

- `PROPOSED_V03_DUBBING_PRO.md`
- `PROPOSED_V03_DUBBING_PRO_SLICE_A.md`
- `PROPOSED_V03_SLICE_A_CANONICAL_DIFF.md`
- `docs/validation/2026-10-20-DUBBING-PRO-SLICE-A.md`

#### Slice B

- manual speaker labels on transcript segments
- voice-per-speaker mapping from existing voice profiles
- multi-speaker render job reusing the completed analyze transcript

สถานะ: `approved (manual-only); implemented and merged in PR #29 (merge commit 60c66c4); automatic diarization remains out of scope`

เอกสาร:

- `PROPOSED_V03_DUBBING_PRO_SLICE_B.md`
- `docs/validation/2026-10-20-DUBBING-PRO-SLICE-B.md`

#### Slice C

- select one or more transcript segments; export each contiguous selection as WAV with rebased SRT/VTT snippets
- generate a compact short voice-over from selected transcript using existing manual speaker/voice mappings
- preview, download, and add exported audio to the Dubbing timeline
- no transcript text editing, automatic diarization, or social publishing

สถานะ: `approved and merged in PR #30 (merge commit 8df8c073eeab07f87a6fa70875bb321e8ecbe672); live ASR/TTS, GPU render, and native desktop UAT remain separate gates`

---

### Track B — Music Phase C

สถานะ: `active after Track A closure`

เหตุผล:

- เป็น advanced quality work
- value สูง แต่ dependency หนักกว่า
- บางรายการมี legal/product risk เพิ่ม

#### Slice B1

- pyworld formant-preserving evaluation
- benchmark vs current psola path
- acceptance thresholds for large pitch shift

สถานะ: `offline benchmark complete in PR #31; conditional candidate for real-vocal A/B; production integration is on hold`

ผลที่ตัดสินใจได้ตอนนี้:

- pyworld ผ่าน provisional objective gates ทั้ง 4 ช่วงที่ทดสอบ (−8, −4, +4, +8 semitones)
- psola ผ่าน 7/8; ไม่ผ่าน formant-drift p95 ที่ +8 semitones (26.95% เทียบเกณฑ์ ≤10%)
- pyworld ที่ +8 semitones วัด formant-drift p95 8.49% บน synthetic input
- ยังไม่ย้ายเข้า production จนกว่าจะมี blinded A/B จากเสียงร้องจริงที่มีสิทธิ์และตรวจ license set ครบ
- หลักฐาน: `docs/validation/2026-10-20-MUSIC-PHASE-C-SLICE-B1.md`

#### Slice B2

- piecewise beat-warp design
- drift detection definition
- timeline preview contract for warped segments

สถานะ: `implementation in progress; PR review/hosted CI, licensed-vocal A/B, and native desktop UAT pending`

เอกสาร: `MUSIC-PHASE-C-SLICE-B2-DESIGN.md`

สิ่งที่ implementation ทำ:

- คง global-only/manual-offset path เดิมเป็น default
- วิเคราะห์ drift หลังแยก constant phase offset ออกจาก residual timing error
- สร้าง gated warp candidate และต้องให้ผู้ใช้ยอมรับก่อน render
- ผูก preview audio, timeline marker map, และ final render กับ immutable map revision/fingerprints
- preview เก็บชั่วคราว 30 นาที; การแก้ anchor สร้าง revision ใหม่

Gate ที่ยังเปิด: licensed-vocal A/B listening และ native desktop UAT; ดูหลักฐานใน `docs/validation/2026-10-21-MUSIC-PHASE-C-SLICE-B2-IMPLEMENTATION.md`.

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
- `Track A / Slice B` before `Track A / Slice C` voice-over mapping

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

1. Track A ปิดอย่างน้อยถึง Slice C
2. Track B มี decision อย่างน้อย 1 ชิ้นว่า implement หรือ reject ด้วย evidence
3. Track C มี feasibility decision อย่างน้อย 1 ชิ้น ไม่ปล่อยเป็น checkbox ลอย

หมายเหตุ:

นี่ไม่ใช่การ rewrite canonical roadmap
แต่เป็นเกณฑ์ปฏิบัติว่าของค้างควรถูกแปลงเป็นงานจริงอย่างไร

---

## Immediate Next Action

PR #31 (B1) และ PR #32 (B2 design) merge แล้ว. Slice B2 implementation กำลังเตรียม PR; หลัง merge ให้ทำ product-quality acceptance ที่ยัง pending ก่อนเลือก B3:

`Slice B2 acceptance — licensed-vocal A/B and native desktop preview/render UAT`

Slice B2 คง global-only fallback และ gated warp candidate. Synthetic และ hosted CI เป็นหลักฐานคนละประเภทกับ A/B listening และ native desktop UAT; Track A runtime UAT gates ยังคงแยกอยู่.

---

## Version Diff

- `+` แตกงาน roadmap ที่เหลือเป็น execution tracks / slices
- `+` ระบุ dependency และ verification standard
- `+` ชี้ next action ที่คุ้มที่สุดตอนนี้อย่างชัดเจน
- `+` บันทึกว่า Slice A/B merge แล้ว และ Slice C ได้รับอนุมัติให้ implement แบบ manual mapping
- `+` ปิด Track A ถึง Slice C และเพิ่มผล benchmark/decision evidence สำหรับ Track B Slice B1

