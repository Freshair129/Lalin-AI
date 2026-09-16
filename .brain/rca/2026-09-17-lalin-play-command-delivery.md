---
version: "0.1.1b"
created_at: "2026-09-17T02:53:21+07:00,LALIN,uncommitted"
last_update: "2026-09-17T03:45:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "playback"
  doc_type: "rca"
  scope: "CR-001 first-open command delivery and secondary-window ownership"
---

# RCA: คำสั่งเล่นข้ามหน้าต่างก่อน receiver พร้อม

## Symptom

งานตรวจ branch พบ test gap ของการกด Play จาก Studio ขณะ Play Window ยังไม่พร้อม
ตรวจต่อที่ source baseline `3d7b60e96fe43f2cc2564ffd13ee0e8ecb3a6446` แล้วพบ:

- คำสั่งที่ broadcast ก่อน receiver สมัครฟังไม่ได้ถูกส่งย้อนหลัง
- Studio เริ่มเล่นเองแล้วส่งคำสั่งให้ Play Window เล่นอีกครั้ง
- native window commands มี permission gap ใน capability ที่ commit ไว้

รายการแรก reproduce ได้ด้วย module จริงและ Node BroadcastChannel; อีกสองรายการ
ยืนยันลำดับและ configuration จาก source ยังไม่ใช่ผลฟังเสียงหรือ native runtime test

## Evidence

| Evidence | Observation |
|---|---|
| `apps/desktop/src/components/FileManager.tsx:46-63` | `play(item)` ใน Studio → broadcast PLAY → เปิด/focus window; queue actions เขียน local store แล้ว broadcast ด้วย |
| `apps/desktop/src/components/LibraryPanel.tsx:47-60` | เรียก local play และ bridge แบบเดียวกัน |
| `apps/desktop/src/playback/windowManager.ts:122-153` | สร้าง channel → post → close; ไม่มี ready, acknowledgement หรือ replay |
| `apps/desktop/src/components/LalinPlayWindow.tsx:73-85` | receiver ถูกติดตั้งใน React effect และเรียก play/queue mutation ของตัวเอง |
| `apps/desktop/src/playback/usePlaybackStore.ts:163-165,253-307` | singleton ต่อ module realm; restore queue ตั้ง state idle และไม่ loadAndPlay; play action จึงเป็นจุดเริ่ม audio จริง |
| `apps/desktop/src/playback/audioEngine.ts:36-73` | static singleton สร้าง `new Audio()` ต่อ window ที่โหลด module ไม่ได้แชร์ audio element ข้าม webview |
| `apps/desktop/src/App.tsx:57-61,73-94,124` | Studio ยังมี playback store, media-session adapter และ modal พร้อมกับ secondary-window launcher |
| `apps/desktop/src-tauri/tauri.conf.json` | native `play` ถูกสร้าง hidden ตั้งแต่ startup จึงอาจพร้อมแล้วหรือยังอยู่ระหว่าง boot เมื่อ Studio ส่งคำสั่ง |
| `apps/desktop/src-tauri/capabilities/default.json` | capability เพียงไฟล์เดียว match `main` ไม่ match `play` |
| `apps/desktop/src-tauri/gen/schemas/acl-manifests.json` | `core:window` default มี read/query commands แต่ไม่มี show/unminimize/set-focus; webview default ไม่มี create-webview-window |
| `apps/desktop/src/playback/windowManager.test.ts` | bridge test สมัคร listener ก่อนส่งทุกครั้ง; browser test ตรวจแค่ว่า return type เป็น boolean |

### Executed diagnostic

Node v24.19.0 import `apps/desktop/src/playback/windowManager.ts` โดยตรง
ตั้งเพียง `globalThis.window = {}` เพื่อผ่าน environment guard ไม่ mock transport
ส่ง PLAY ก่อนติดตั้ง listener แล้วส่ง FOCUS_PLAYER หลังติดตั้ง ใช้ receipt ของ
FOCUS_PLAYER เป็นจุดจบการสังเกต และมี timeout 1.5 วินาทีเป็น failure guard

```json
{"runtime":"Node BroadcastChannel using actual windowManager.ts","sentBeforeListener":"PLAY","observed":["FOCUS_PLAYER"],"firstPlayLost":true}
```

ผลนี้ยืนยัน transport ordering ใน diagnostic runtime ไม่ยืนยัน Windows WebView2
audio/autoplay policy หรือ native command rejection ตอนเปิดแอปจริง

## Root Cause

1. **ไม่มี delivery handshake:** fire-and-forget ส่งก่อน receiver พร้อมโดยไม่มี
   ready/acknowledgement การสลับบรรทัดให้ open ก่อน dispatch อย่างเดียวไม่แก้
   เพราะ API เปิดหน้าต่างเสร็จไม่เท่ากับ React effect สมัคร listener เสร็จ
2. **ไม่มีเจ้าของ consumer playback เพียงหนึ่งเดียว:** การคง local play ของ
   prototype ไว้แล้วเพิ่ม remote play ทำให้ warm-window path สั่ง audio engine
   สอง realm; persistence เป็น snapshot จึงไม่ใช่คำสั่งเริ่มเล่นและไม่ซิงก์ state สด
3. **capability ไม่ได้ขยายตาม surface:** เพิ่ม Play Window แต่สิทธิ์ยัง match แค่
   main และไม่อนุญาต window mutations ที่ launcher เรียก; fallback กับ empty catch
   อาจกลบสาเหตุ native failure ต้องยืนยันจริงใน native gate

## Why the issue escaped detection

- เทสต์ transport จำลอง receiver ที่พร้อมแล้ว ไม่ครอบคลุม startup ordering
- ไม่มี cross-window integration ที่นับ engine invocation และ queue mutation
- Node/jsdom ไม่บังคับ Tauri ACL; test เดิมไม่ได้ทดสอบ permission coverage
- restore queue ถูกเข้าใจว่าอาจช่วย cold-open ทั้งที่ไม่มี playback intent replay

Baseline ที่รันในงานนี้: `npm --workspace apps/desktop test --
src/playback/windowManager.test.ts src/playback/playbackQueue.test.ts
src/playback/playbackEQ.test.ts` ผ่าน 3 files / 28 tests พร้อม jsdom stderr เดิม
ผลผ่านจึงไม่ใช่หลักฐานว่ากรณีที่หายไปถูกตรวจแล้ว

## Proposed prevention

ใช้ [approved remediation plan](../../docs/architecture/LALIN_PLAY_COMMAND_DELIVERY_PLAN.md):
Play Window เป็น consumer playback owner, Studio ส่งคำสั่งหลัง handshake,
acknowledgement/deduplication ใน session เดียว, แสดงสถานะส่งล้มเหลวตามจริง,
capability แยก caller main/play และทดสอบ cold/warm/hidden/error paths

Complexity ยกระดับ C-2 → C-3; risk HIGH เพราะแตะ ownership และ IPC permissions
ผู้ใช้อนุมัติแล้ววันที่ 2026-09-17; implementation และ regression tests อยู่ใน
local diff ดูผล [validation](../../docs/validation/2026-09-17-LALIN-PLAY-COMMAND-DELIVERY.md)

## Native validation finding — playback state after buffering

During the approved implementation, isolated Windows WebView2 playback reproduced
`nowPlaying.state = loading` while `currentTime = 9.552` and duration was 60 seconds.
The instrumented real audio element recorded `play → waiting → playing`, with one
audio element and one `play()` call. Evidence is retained locally at
`runtime/playback-verification/native-loading-reproduction.json`.

Root cause: `audioEngine.ts` maps `play` to playing and `waiting` to loading, but
does not listen for `playing`. The later buffering event overwrites the optimistic
state and nothing restores it when actual playback starts/resumes. Existing queue
tests do not exercise browser media-event ordering; the first browser fixture run
did not encounter this sequence. This is directly within the approved owner STATE
contract (actual loading/playing state), not a new media feature.

Prevention: emit the engine play state on actual HTML `playing`, with a regression
for `play → waiting → playing → waiting → playing`; rerun native/browser smoke.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-09-17 | beta | Record approved remediation, native buffering-state reproduction and local validation | uncommitted | LALIN |
| 0.1.0b | 2026-09-17 | need review | Record transport reproduction, ownership/config evidence and missing tests | uncommitted | LALIN |
