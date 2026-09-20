---
version: "0.1.2b"
created_at: "2026-09-20T19:41:00+07:00,LALIN,8429010"
last_update: "2026-09-20T21:36:24+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "change-request"
  scope: "Standalone Lalin Play local video presentation in Full and Compact"
---

# CR-003 — แสดงภาพวิดีโอใน Lalin Play

## Request and approval boundary

ผู้ใช้ขอเพิ่มพื้นที่แสดงภาพเมื่อสื่อเป็นวิดีโอ หลังจากทดสอบ standalone audio
foundation แล้ว ผู้ใช้ตอบ `approve` อนุมัติรายละเอียดเอกสารนี้เมื่อ 2026-09-20
ให้ implementation บน `codex/lalin-play-split`; ไม่ใช่การรับรอง runtime/release

Complexity **C-3**, risk **HIGH**: เปลี่ยน media element ที่เป็นเจ้าของ playback,
แตะ Rust file classification, persistence compatibility และ UI สอง surface
โดยต้องรักษาเสียง/คิว/EQ เดิม ไม่ใช่เพียงเพิ่มกล่องเปล่าใน UI

[ASSUMPTIONS]

1. เพิ่ม local video ให้ standalone `apps/play-desktop` ทั้ง Full และ Compact;
   ไม่แก้ player เดิมของ Studio และไม่รวม YouTube/Cast
2. เริ่มรับ MP4/WebM; เป็น container ที่ให้ลองเปิด ไม่ใช่คำรับรองทุก codec
   และไม่ติดตั้ง decoder/transcoder ใหม่
3. เพลงยังใช้หน้าฟังเพลงเดิม วิดีโอใช้พื้นที่ภาพจริง รักษาอัตราส่วนและไม่ crop

## Evidence and alignment

- `src/playback/audioEngine.ts` ใช้ `HTMLAudioElement` และ `new Audio()`;
  ไม่มี element สำหรับวาดเฟรมวิดีโอ
- `src-tauri/src/library.rs` ใช้ `AUDIO_EXTENSIONS` ทั้ง picker, scan และ resolver;
  ไม่มี `mp4`/`webm` ในรายการ
- `src/native.ts` ส่ง metadata ไม่มี media kind และ `src/App.tsx`
  มี library/queue/EQ/transport แต่ไม่มีพื้นที่ video
- PRD §4.9 / ADR-004 เดิมกำหนด audio-first; CR-001 FR-16.10 เลื่อน video
  ไว้ phase ถัดไป จึงเป็นการขยาย scope ที่ต้องอนุมัติ ไม่ใช่ regression
  จากการสลับ Full/Compact
- รักษา ADR-004 single-owner, per-file native access, no backend dependency
  และห้ามถอน Studio owner ก่อน integration/export ผ่าน
- CR นี้ดึงเฉพาะ local video presentation จาก CR-001 Phase 3;
  ไม่อนุมัติ subtitles, chapters, artwork pipeline หรือ phase อื่นทั้งหมด

## Proposed behavior and acceptance

| ID | Requirement / exit evidence |
|---|---|
| PLAY-V01 | File picker, selected-folder import และ drag/drop รับ MP4/WebM ผ่าน canonical path/scope validation เดิม; เก็บ kind audio/video แยกจาก title และไม่อ้าง codec support จาก extension |
| PLAY-V02 | เมื่อกดเล่นวิดีโอใน Full แสดง Now Playing video stage พร้อมชื่อและ transport; จัดกรอบภาพด้วย contain/letterbox ไม่ยืดหรือ crop; เปิดดู library/queue/EQ แล้ว stage ยังอยู่และมีปุ่มกลับ Now Playing |
| PLAY-V03 | Compact แสดงภาพเหนือ transport ในหน้าต่างเดียว; ปรับขนาดให้ภาพและ controls ใช้ได้จริง ไม่ซ่อน controls ใต้กรอบภาพ; queue/EQ ไม่สร้าง media element อีกตัว |
| PLAY-V04 | Full ↔ Compact ใช้ element, source node และ owner เดิม; ไม่เปลี่ยน src, reload, seek กลับต้น, เล่นเสียงซ้อน หรือ reset queue/EQ/volume/output |
| PLAY-V05 | Play/Pause/Stop/Seek/Next/Previous/repeat/shuffle/rate ใช้ store เดิม; audio จาก video ผ่าน EQ/output เดิมเพียงเส้นทางเดียว; video ไม่มีเสียงยังแสดงภาพได้ |
| PLAY-V06 | เปลี่ยน audio → video → audio ตามคิวได้; audio แสดงปก/placeholder เดิม ไม่ค้างเฟรมจาก video ก่อนหน้า; Stop หยุดภาพและเสียงตาม semantics เดิม |
| PLAY-V07 | metadata จริงกำหนด duration และ dimensions เมื่อพร้อม; ระหว่างโหลดแสดง loading, decode/unsupported/missing error ที่มีเหตุผล ไม่ปลอม duration หรือเงียบเป็นจอดำ; queue ไม่ถูกล้าง |
| PLAY-V08 | มีขยายภาพเต็มหน้าต่าง/เต็มจอและ Escape กลับ layout ก่อนหน้าโดยไม่ remount; การขยายภาพไม่บังคับเปิด TV navigation และไม่สร้าง surface/process ใหม่ |
| PLAY-V09 | library/queue เก่ายังอ่านได้: kind ที่ไม่มีให้ native ตรวจจากประเภทไฟล์ที่ยอมรับ; ไม่แก้ profile เดิมหรือ reset persistence; resume ยัง opt-in และไม่ autoplay |
| PLAY-V10 | Windows native proof มีเฟรมที่เปลี่ยนจริงพร้อมเวลาเดิน, pause/seek และ Full/Compact continuity; automated audio/EQ/race tests เดิมต้องผ่าน พร้อมหลักฐานภาพและบันทึก A/V sync/output limitations |

## Architecture delta

```text
Selected local file → Rust validate/classify → existing queue/store
                                                ↓
                                 one persistent HTMLVideoElement
                                  ↙                         ↘
                     same displayed frames         one Web Audio EQ/output
                    Full / Compact / expanded
                         (CSS layout only)
```

ใช้ HTMLVideoElement เดียวเป็น media element ของ standalone engine สำหรับ
audio และ video; audio-only ซ่อนเฉพาะภาพ ไม่ dispose element หรือ audio graph
ขณะเล่น หน้าจอใช้ stable host ที่อยู่นอก subtree ของ navigation/layout และ
ปรับ CSS เท่านั้น ห้ามสร้าง `<video src=...>` เพิ่มขนานกับ `new Audio()`
หรือย้าย DOM ระหว่าง host จน playback ถูก reset

ตั้งค่า source, transport และ event subscriptions ที่ owner เดียว; React
ไม่ควบคุม src/autoplay ซ้ำกับ engine รักษา pending-load generation guard
และ cleanup ของ listeners; full/compact/expanded ต้องไม่สร้าง graph ใหม่

HTMLVideoElement สืบทอด media controls จาก HTMLMediaElement และ Web Audio
รับ video element เป็น source ได้ตาม
[MDN HTMLMediaElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement)
และ [createMediaElementSource](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource).
นี่เป็นเหตุผลของแบบเสนอ ไม่ใช่หลักฐานว่า WebView2 บนเครื่องเล่นทุก codec ได้

เพิ่ม optional media kind ใน standalone DTO/catalog พร้อม backward default;
ไม่เปลี่ยน Studio shared contracts ใน slice นี้ Lofty ใช้ metadata ที่อ่านได้
เท่านั้น; metadata วิดีโอที่อ่านไม่ได้รอค่าจาก loadedmetadata ของ runtime
ไม่เพิ่ม backend/ffprobe runtime dependency เพื่อเติมข้อมูลใน library

## Execution and verification after approval

1. เพิ่ม native media classification และ backward-compatible DTO → verify:
   selected path/scope, audio/video filtering, catalog เก่าและ unsupported input
2. เปลี่ยน engine เป็น persistent video-capable media element → verify:
   inherited audio/EQ tests, pending Stop/Next race, no duplicated graph/play
3. เพิ่ม stable stage + Full/Compact/expanded layouts → verify: same element,
   position/queue/EQ continuity, mixed queue, loading/error, resize/keyboard controls
4. Native Windows smoke ด้วยไฟล์ fixture สั้นที่มีภาพเคลื่อนไหวและเสียง sync cue:
   MP4 H.264/AAC และ WebM VP8/Vorbis หรือ VP9/Opus ตาม fixture ที่สร้างได้;
   รายงานแต่ละ combination เป็น PASS/FAIL/NOT_RUN ไม่รับรองจาก container
5. ตรวจสองเฟรมต่างเวลา, pause, seek, switch, silent video, audio-only regression,
   และ fullscreen Escape พร้อม screenshot evidence; ขอผู้ใช้ยืนยันเสียงจริง
   หากยังไม่มีหลักฐาน audio output ของ binary นี้
6. อัปเดต validation และ PRD status เฉพาะผลจริง; foundation audio report เดิม
   ไม่ใช้แทน video evidence และยังไม่ถือว่า split/release เสร็จ

Success: PLAY-V01–10 ผ่านตาม scope และข้อจำกัด codec ที่ประกาศอย่างชัดเจน;
ไม่มี audio regression ที่รู้จัก เก็บ source media/state เดิมและ evidence ครบ
หากขั้นไหนไม่ผ่าน ให้รายงาน incomplete ไม่กลบด้วย placeholder หรือ fallback
เป็น audio-only โดยไม่แจ้งผู้ใช้

## Not included

MKV/HEVC/AV1 universal coverage, libVLC/mpv/FFmpeg bundled decoder, automatic
transcoding, subtitles, chapters, DRM/streaming services, picture-in-picture
แยกหน้าต่าง, Cast/mobile pairing, file association และการย้าย source/remote/release
โดยอัตโนมัติ

## Implementation status

Approved [CR-004](CR-004--LALIN_PLAY_MINIMAL_COMPACT_PREVIEW.md) supersedes
PLAY-V03's stacked Compact layout/minimum sizing with minimal overlay controls.
The single playback element/graph invariant still applies; CR-004 permits one
additional muted, paused preview-only element with no playback ownership.
Current Compact evidence is in [the CR-004 report](../validation/LALIN_PLAY_MINIMAL_COMPACT.md).
The following results describe the original CR-003 build, not the newer preview tests.

Implemented locally under user approval: video classification, persistent media
element, Full/Compact video stage, expanded-in-window view with Escape, shared
transport/EQ and video-aware native sizing. See
[validation](../validation/LALIN_PLAY_LOCAL_VIDEO.md) for screenshots, 30 frontend
tests and 6 Rust tests. Native MP4/WebM/silent-video visual checks passed;
physical audio/A-V sync confirmation and exhaustive codec/device coverage remain
limited. This is not release qualification or completion of the repository split.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.2b | 2026-09-20 | beta | Cross-reference approved Compact overlay and preview-only exception; preserve historical evidence | based on 8429010 | LALIN |
| 0.1.1b | 2026-09-20 | beta | Record user approval, local implementation and bounded native video evidence | based on 8429010 | LALIN |
| 0.1.0b | 2026-09-20 | candidate | Propose local video stage, single-element Full/Compact continuity and native video acceptance | based on 8429010 | LALIN |
