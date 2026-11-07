---
version: "0.2.4b"
created_at: "2026-07-06T04:08:00+07:00,ATHER"
last_update: "2026-11-07T00:00:00+07:00,Claude"
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
- Lalin Play Windows EQ / CMF Buds Pro 2 gap analysis ปิดแล้วในฐานะงานวิเคราะห์เอกสาร ณ 2026-10-19; การ audition ผ่าน CMF endpoint ยัง `NOT_VERIFIED` และ system-wide EQ / ANC ยังอยู่นอก scope ปัจจุบัน (ดู [สถานะ Lalin Play](LALIN_PLAY_DOCUMENTATION.md#eq-gap-for-windows-audio-and-cmf-buds-pro-2))

### Current milestone override — Lalin Play local-first

The active Play milestone is local-only runtime readiness: Play must open and
play user-selected local media offline, without Studio, FastAPI or Ollama. This
is the execution priority already within the approved PRD goal; it does not
change product acceptance.

S2/S3 implementation and focused evidence exist. The follow-up branch at
`d241a74` records S2 recovery at five child-process termination checkpoints,
cross-host pipe denial and different-logon-session ACL denial. G3 remains
**PARTIAL**: mapped-drive/reparse runtime cases, Studio/API exit during active
playback and audible parity remain open. The follow-up branch is 23 commits
ahead and 4 behind `main`, so these results are not integrated into `main`.
These lanes are deferred while local-first readiness is pursued, not passed or
cancelled. S4–S7 remain **NOT_RUN**. See the [Play execution DAG](../architecture/LALIN_PLAY_EXECUTION_DAG.md)
and [traceability matrix](../validation/LALIN_PLAY_TRACEABILITY.md) for the
evidence boundaries and remaining gates.

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

สถานะ: `implemented and merged in PR #35 (merge commit eed358ef); hosted CI passed; synthetic native Tauri UAT passed; licensed-vocal A/B pending`

เอกสาร: `MUSIC-PHASE-C-SLICE-B2-DESIGN.md`

สิ่งที่ implementation ทำ:

- คง global-only/manual-offset path เดิมเป็น default
- วิเคราะห์ drift หลังแยก constant phase offset ออกจาก residual timing error
- สร้าง gated warp candidate และต้องให้ผู้ใช้ยอมรับก่อน render
- ผูก preview audio, timeline marker map, และ final render กับ immutable map revision/fingerprints
- preview เก็บชั่วคราว 30 นาที; การแก้ anchor สร้าง revision ใหม่

Gate ที่ยังเปิด: licensed-vocal A/B listening กับ vocal/instrumental ที่จับคู่กันและยืนยันสิทธิ์แล้ว. Native Tauri interaction ผ่านด้วย synthetic fixture โดย mock stem separation; ดูหลักฐานใน `docs/validation/2026-10-21-MUSIC-PHASE-C-SLICE-B2-IMPLEMENTATION.md`.

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

สถานะ: `source audit/packaging delta complete; platform selection, implementation, CI, and native UAT remain open`

หลักฐาน: `docs/validation/2026-10-28-LALIN-CROSS-PLATFORM-FEASIBILITY.md`

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

สำหรับ milestone Lalin Play local-first:

1. ปิด local-only readiness checks และบันทึก evidence โดยไม่พึ่ง Studio/API/network
2. อัปเดตสถานะ candidate ให้แยก local usability ออกจาก integration/release gates
3. เปิด S2/S3/G3 เฉพาะเมื่อเลือกทำ Studio integration หรือ release milestone

หลังจาก milestone นี้ หากเดินต่อใน feature track เดิม:
PR #31 (B1), PR #32 (B2 design), และ PR #35 (B2 implementation) merge แล้ว. Synthetic native desktop acceptance ผ่าน; งานถัดไปก่อนเลือก B3 คือ licensed-vocal A/B listening:

`Slice B2 acceptance — licensed-vocal A/B`

ไฟล์ใน Downloads ที่ตรวจพบเป็นเพลง Suno คนละ arrangement และยังยืนยันสิทธิ์ไม่ได้ จึงไม่ใช่คู่ A/B ที่เหมาะสม. รอ vocal กับ instrumental beat ที่จับคู่กันและ rights-cleared; synthetic, hosted CI, และ native Tauri interaction ไม่ใช้แทน listening acceptance. Track A runtime UAT gates ยังคงแยกอยู่.

---

## Version Diff

- `0.2.4b` (2026-11-07): rebased the Lalin Play local-first/CR-006..008 work onto main; kept merged Music B2 next action and Play local-first milestone together.
- `0.1.4b` (2026-10-19): closed the Lalin Play Windows EQ / CMF Buds Pro 2 documentation gap-analysis item while keeping product acceptance gaps explicit.
- `0.1.3b` (2026-10-19): reconciled the Play local-first note with unmerged S2/G3 follow-up evidence and retained remaining gates.
- `0.1.2b` (2026-10-19): reconciled the priority note with the latest G3 blocker evidence and kept partial/not-run statuses distinct from deferred scheduling.
- `0.1.1b` (2026-10-02): prioritized the local-first Play milestone without changing the approved product scope.
- `+` แตกงาน roadmap ที่เหลือเป็น execution tracks / slices
- `+` ระบุ dependency และ verification standard
- `+` ชี้ next action ที่คุ้มที่สุดตอนนี้อย่างชัดเจน
- `+` บันทึกว่า Slice A/B merge แล้ว และ Slice C ได้รับอนุมัติให้ implement แบบ manual mapping
- `+` ปิด Track A ถึง Slice C และเพิ่มผล benchmark/decision evidence สำหรับ Track B Slice B1
- `+` อัปเดต Slice B2 หลัง PR #35 merge และบันทึก synthetic native Tauri acceptance; licensed-vocal A/B ยังคง pending
- `+` กำหนด Lalin Play local-first เป็น active milestone และเลื่อน S2/S3/G3 เป็น deferred lanes

