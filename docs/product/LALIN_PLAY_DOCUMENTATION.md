---
version: "0.2.0b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-09-25T19:20:01+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "documentation-register"
  scope: "Lalin Play current status and complete document entrypoint"
---

# Lalin Play — จุดเริ่มต้นเอกสารและสถานะปัจจุบัน

## สถานะที่ยืนยันได้

Lalin Play เป็น local audio/video player แยกจาก Studio/Cast มีสอง surface
Full และ Compact ใช้ playback owner เดียวกัน ปัจจุบัน source อยู่ที่
`apps/play-desktop` ใน `Freshair129/Lalin-AI` branch `codex/lalin-play-split`.
เป็น standalone runtime candidate ไม่ใช่การแยก repository ที่เสร็จแล้ว

| รายการ | สถานะ ณ 2026-09-20 |
|---|---|
| Source commit | `f5a66819ad58b481635733dd29e1658d67e29e3d` (`f5a6681`) |
| Publication | commit และ push branch ข้างต้นแล้ว; remote SHA ตรงกันในรอบ push |
| App identity | `lalin-play.exe`, `ai.lalin.play`, app version `0.1.0` |
| Runtime | Rust/Tauri v2 shell + React + HTML media/Web Audio; ไม่ใช่ Rust decoder |
| Latest recorded checks | 48 frontend / 7 Rust tests และ frontend build ผ่านในรอบก่อน commit; native build/screenshot มีรายงานแยก |
| Split phases | S1 LOCAL PASS, S2 PARTIAL, S3 LOCAL IMPLEMENTATION / live parity NOT_VERIFIED, S4–S7 NOT_RUN |
| Original Studio player | ยังอยู่ ห้ามใช้เอกสารนี้เป็นคำสั่งลบ |
| New repo / installer / updater / release | ยังไม่มี execution evidence; ห้ามตีความ branch push เป็น independent release |

รายงาน validation เดิมเป็น snapshot ของแต่ละรอบ ข้อความ `uncommitted` หรือ
`No push` หมายถึงเวลาที่เก็บหลักฐานนั้น ไม่ใช่สถานะ publication ปัจจุบัน
ห้ามแก้ hash/จำนวน tests ย้อนหลังให้ดูเหมือนทดสอบบน binary ใหม่
งานจัดเอกสารรอบนี้ไม่ได้รัน runtime tests ซ้ำและไม่ได้เปลี่ยน app version

## S3 status update — 2026-09-25

The approved Windows named-pipe contract now has local sender/receiver code,
same-logon ACL checks, bounded local-file resolution, FIFO delivery and ACK/STATE
reconciliation. Focused Studio, Play and API tests pass. Actual Studio–Play
process-pair delivery and audible parity have not been run. Studio's current
Play/Play Next/Queue actions still use its existing playback owner; separate
explicit actions exercise standalone Play while parity remains open. Nothing in
this update removes the Studio playback source or closes S3 acceptance.

## แผนที่เอกสาร

| ต้องการทราบ | เอกสารเจ้าของข้อมูล | สถานะ |
|---|---|---|
| Product scope / acceptance | [PRD §4.9](PRD.md#49-lalin-play--standalone-local-media-player-approved), [SRS](SRS.md) | Approved requirements; acceptance ยังไม่ครบ |
| Architecture / split gates | [ADR-004](../architecture/ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md) | Approved direction; implementation partial |
| Video / Compact / fullscreen | [CR-003](CR-003--LALIN_PLAY_LOCAL_VIDEO.md), [CR-004](CR-004--LALIN_PLAY_MINIMAL_COMPACT_PREVIEW.md), [Sitemap](../design/LALIN_SITEMAP_SOT.md) | Approved, implemented locally |
| Requirements → code → tests | [Play traceability](../validation/LALIN_PLAY_TRACEABILITY.md) | Current evidence map; not a blanket PASS |
| Current local API/storage + future integration | [Integration/migration contract](../architecture/LALIN_PLAY_INTEGRATION_MIGRATION_SPEC.md) | Approved S3 protocol implemented locally; migration sections remain candidate |
| Extraction inventory / recovery / license gate | [Separation handoff](../architecture/LALIN_PLAY_SEPARATION_HANDOFF.md) | Candidate execution checklist; export not performed |
| Installer / signed update / release | [Release runbook](../operations/LALIN_PLAY_RELEASE_RUNBOOK.md) | Candidate; signing and distribution gates open |
| User operation / troubleshooting | [User guide](../guides/LALIN_PLAY_USER_GUIDE.md) | Current candidate behavior |
| Developer setup / provenance | [Play README](../../apps/play-desktop/README.md) | Current candidate behavior |
| Historical runtime evidence | [Foundation](../validation/LALIN_PLAY_STANDALONE_FOUNDATION.md), [Video](../validation/LALIN_PLAY_LOCAL_VIDEO.md), [Compact](../validation/LALIN_PLAY_MINIMAL_COMPACT.md), [Fullscreen/skip](../validation/LALIN_PLAY_FULLSCREEN_SKIP.md) | Local evidence with explicit limitations |

## วิธีอ่านสถานะและลำดับงานต่อ

- **LOCAL PASS** = ผ่านเฉพาะ environment/fixture ที่รายงาน ไม่เท่ากับ clean-machine release.
- **PARTIAL** = มี implementation/evidence บางส่วน แต่ acceptance รวมยังเปิด.
- **NOT_IMPLEMENTED / NOT_RUN** = ยังไม่มีโค้ด / ยังไม่มีผลตรวจ ห้ามแทนด้วย PASS.
- **candidate** = รายละเอียด migration/release ที่ยังต้อง review ก่อน implementation ตาม R5; S3 wire contract is approved and implemented locally.
- **BLOCKED** ใน checklist = ต้องเติม decision/evidence ก่อนผ่าน gate ไม่ใช่รายงานว่า agent ทำงานต่อไม่ได้.

ลำดับ: complete S2 data/relink and live S3 process-pair/parity evidence →
license/provenance + S4 export → S5 clean-checkout/regression → S6 scoped removal →
S7 installer/update. แยก authorization สำหรับ remote creation, deletion,
merge และ publication จากการอนุมัติเอกสารเสมอ

เอกสารครบในแง่ coverage ของหัวข้อที่ตรวจพบ ไม่ได้ปิดงาน implementation หรือ
แทนที่การตัดสินใจเรื่อง license, release signing และการทดสอบที่ยังขาด

## ผลตรวจชุดเอกสารรอบนี้

ตรวจแบบอ่าน source/เอกสารและแก้เฉพาะ documentation ไม่มี runtime implementation,
commit หรือ push ในรอบจัดเอกสารนี้ ไม่รัน generated doc-graph writer เพราะมีงาน
คู่ขนาน; ไม่อ้าง generated coverage เป็น standalone acceptance

| Check | Result |
|---|---|
| Changed/new Markdown set | 14 files; 6 new documents and 8 updated Markdown documents |
| Internal relative file links in that set | 100 references, no missing file targets; external URLs/heading anchors not revalidated |
| Canonical acceptance coverage | 33 exact unique IDs: PLAY-01..10, PLAY-V01..10, PLAY-C01..13 |
| Code/test path references in matrix | 28 path references exist in standalone source tree |
| YAML metadata | All 14 Markdown frontmatter blocks contain required metadata fields |
| BLUEPRINT | YAML parses; original Studio owner retained alongside standalone entry |
| Diff hygiene | `git diff --check` passed; CRLF normalization notices only |
| Parallel work | Existing voice-worker mapping preserved; concurrent TTS license clarification retained; no runtime/code changes by this task |

`f5a6681` remains the pinned Play implementation snapshot even if later unrelated
commits advance branch HEAD. This round's document edits remain local until a
separate commit/push request. Historical runtime reports retain their own hashes.

## Version diff

| Document | Before → after |
|---|---|
| Integration/migration spec | 0.1.0b → 0.1.1b |
| Play README | 0.4.1b → 0.4.2b |
| ADR-004 | 0.4.1b → 0.4.2b |
| Standalone foundation evidence | 0.1.0b → 0.2.0b |
| Play traceability matrix | 0.1.0b → 0.1.1b |
| Lalin Play document register | 0.1.0b → 0.2.0b |
| Repository Architecture SOT | 0.4.2b → 0.4.3b |
| User guide | 0.1.0b → 0.1.1b |
| Studio/Play app versions | No change |

## Historical version diff

| Document | Before → after |
|---|---|
| AGENTS | 0.2.1b → 0.2.2b |
| Play README | 0.4.0b → 0.4.1b |
| PRD | 1.4.1b → 1.4.2b |
| SRS | 1.4.0b → 1.5.0b |
| ADR-004 | 0.4.0b → 0.4.1b |
| Repository SOT | 0.4.1b → 0.4.2b |
| Docs index | 0.8.0b → 0.9.0b |
| Appendix D | 1.3.1b → 1.4.0b |
| BLUEPRINT standalone_play entry | New doc_version 0.1.0b; no change to Studio app version |
| Register, traceability, user guide | New 0.1.0b beta documents |
| Integration/migration, handoff, release runbook | New 0.1.0b candidate documents; review required before implementation |

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | beta | Consolidate document ownership, pushed source status and open gates | based on f5a6681 | LALIN |
