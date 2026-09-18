---
version: "0.1.0b"
created_at: "2026-09-18T09:00:00+07:00,LALIN,uncommitted"
last_update: "2026-09-18T09:00:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "change-request"
  scope: "Lalin Play TV and Leanback presentation mode"
---

# CR-002 — Lalin Play TV / Leanback Mode

## 1. Summary

เพิ่มโหมดนำเสนอแบบ **TV / Leanback** ให้ Lalin Play สำหรับการใช้งานบนจอที่ผู้ใช้
นั่งห่างหรือใช้รีโมต/เกมแพด โดยคง local-media playback, queue, Now Playing และ
Playback EQ ของ Lalin Play เดิมไว้ใน playback owner เดียวกัน

โหมดนี้เป็น presentation mode ของ Play surface ไม่ใช่ destination ใหม่ของ Lalin
Studio และไม่เปลี่ยน Studio rail, Arrange session หรือ backend contract

## 2. Parent and peer alignment

- [CR-001](CR-001--LALIN_PLAY_WINDOWS_MEDIA_EQ.md) กำหนด Play เป็น separate surface และวาง TV/Leanback ไว้ใน Phase 7
- [Lalin Play command-delivery plan](../architecture/LALIN_PLAY_COMMAND_DELIVERY_PLAN.md) กำหนด predeclared `play` window, one playback owner และ scoped native permissions
- [SRS](SRS.md) เพิ่ม FR-18 สำหรับโหมดนี้ โดย reuse FR-16/FR-17
- [Lalin Play TV mode architecture plan](../architecture/LALIN_PLAY_TV_MODE_PLAN.md) กำหนด fullscreen/input boundary
- [Lalin Play TV mode design](../design/LALIN_PLAY_TV_MODE_SPEC.md) กำหนด 10-foot layout และ focus order

## 3. Functional requirements — FR-18

| ID | Requirement | Priority |
|---|---|---|
| FR-18.1 | ผู้ใช้ต้องเข้า/ออก TV Mode จาก Lalin Play ได้ด้วยปุ่มที่มองเห็นได้ และโหมดไม่เปิดเองตอน startup | Must |
| FR-18.2 | TV Mode ต้องแสดง layout แบบ 10-foot ด้วยตัวอักษร/ปุ่ม/ระยะห่างที่อ่านและกดได้จากระยะไกล พร้อม visible focus | Must |
| FR-18.3 | Keyboard navigation ต้องใช้ directional focus (`Arrow`/`Tab`), `Enter`/`Space` เพื่อ activate และ `Escape` เพื่อออกจาก TV Mode | Must |
| FR-18.4 | ระบบต้อง map semantic gamepad input (D-pad, A/confirm, B/back, Start/menu) ผ่าน adapter ที่ถอดเปลี่ยนได้ และ cleanup listener/polling เมื่อออกจากโหมด | Should |
| FR-18.5 | Native Tauri ใช้ fullscreen ของหน้าต่าง `play`; browser ใช้ Fullscreen API เมื่อมี และแสดงข้อผิดพลาดภาษาไทยเมื่อทำไม่ได้ | Must |
| FR-18.6 | การเข้า/ออก TV Mode ต้องไม่ reset queue, EQ, Now Playing, position, volume หรือ playback owner | Must |
| FR-18.7 | TV Mode ต้องมีทางออกที่เข้าถึงได้เสมอและไม่ซ่อน error ของ fullscreen/input | Must |
| FR-18.8 | TV Mode ต้องไม่เพิ่ม backend endpoint, network permission, media decoder หรือ playback engine ใหม่ | Must |

## 4. User flow and acceptance

```text
Lalin Play → TV Mode → focus Now Playing → transport / queue / EQ → Escape → Lalin Play
```

| Case | Required result |
|---|---|
| Enter from normal Play | One TV root appears, fullscreen is requested once, current media and queue remain unchanged |
| Exit with button or Escape | Fullscreen is released, normal Play returns, playback state and EQ values remain unchanged |
| Keyboard navigation | Focus moves in documented order; focused control has a high-contrast ring; Enter/Space activates it |
| Gamepad adapter | Semantic actions reach the same store actions as keyboard/UI; adapter stops when mode unmounts |
| Fullscreen rejection/unavailable API | Mode reports an actionable Thai error and remains usable; no phantom fullscreen state |
| Native window failure | Existing Play window error path is used; no browser fallback and no second owner |
| Queue/EQ state | Queue, Now Playing, position and persisted EQ survive mode transitions |
| Accessibility | Root has an accessible name, exit control is reachable, and reduced-motion preference is respected |

## 5. Scope boundary

### In scope

- TV Mode toggle on the existing Play window
- 10-foot Now Playing, transport, queue and EQ presentation
- Native/browser fullscreen adapter
- Keyboard focus model and semantic Gamepad API adapter
- Unit, browser smoke and native WebView2 lifecycle evidence

### Out of scope

- Video playback, casting, receiver mode, DIAL/device discovery or remote network control
- YouTube/DRM/Spotify/Apple Music adapters
- Physical remote certification or a claim of gamepad hardware coverage without a device
- Separate executable/runtime or changes to Studio navigation

## 6. Risk and decision gates

Complexity: **C-3**. Risk: **HIGH** because the change crosses React focus lifecycle,
fullscreen policy and Tauri caller permissions. The implementation gate requires:

1. unit tests for fullscreen adapter and input mapping;
2. browser smoke for enter/exit/preservation/error handling;
3. native WebView2 smoke for fullscreen state and window lifecycle;
4. documentation and architecture review with physical-gamepad evidence marked
   `NOT_RUN` when no controller is attached.

Approval of this CR covers this TV Mode slice only. It does not approve the later
CR-001 Phase 7 items (receiver startup, DIAL, YouTube/Leanback or split runtime).

## 7. CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-18 | beta | Approved TV/Leanback presentation scope, requirements and acceptance gates | uncommitted | LALIN |
