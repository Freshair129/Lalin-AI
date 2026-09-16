---
version: "0.1.0-candidate"
created_at: "2026-09-16T00:00:00+07:00,LALIN"
last_update: "2026-09-16T00:00:00+07:00,LALIN"
status: "proposed"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "change-request"
  scope: "Lalin Play Windows media player and playback EQ"
---

# CR-001 — Lalin Play: Windows Media Player + Playback EQ

## 1. Change Request Summary

เพิ่ม **Windows Media Player surface** และ **non-destructive playback EQ** ให้ Lalin AI เพื่อให้ผู้ใช้สามารถฟัง ตรวจงาน และเล่น media จาก Library/Workspace ได้ในแอปเดียว โดยต่อยอดจาก audio engine เดิมโดยไม่ทำให้ Lalin Studio กลายเป็น media-consumption UI ที่ปะปนกับ editor หลัก

การเปลี่ยนแปลงนี้เสนอให้สร้าง product surface ชื่อชั่วคราว **Lalin Play** (ชื่อ final ยังไม่ล็อก) ภายใต้ ecosystem Lalin AI และแชร์ contracts/services กับ Lalin Studio

> Scope สำคัญ: EQ ใน CR นี้ประมวลผลเฉพาะ audio playback ภายใน Lalin เท่านั้น **ไม่ใช่ Windows system-wide EQ / Audio Processing Object (APO) / virtual audio driver**

## 2. Motivation / Problem

Lalin Studio ปัจจุบันมีความสามารถด้าน audio creation, Arrange timeline, mastering และ Library แต่ยังขาด playback surface สำหรับการฟัง media แบบต่อเนื่องนอกบริบท editor

ผู้ใช้จึงยังต้องออกไปใช้ media player ภายนอกเมื่อต้องการ:

- เปิดฟังเพลง/เสียงจาก Library แบบต่อเนื่อง
- จัด queue สำหรับตรวจงานหลายไฟล์
- ปรับโทนเสียงเพื่อการฟังโดยไม่แก้ source file
- ใช้ media keys ของ keyboard/headset บน Windows
- เปลี่ยน output device และควบคุม playback จาก OS
- ใช้ media library เดียวกับไฟล์ที่สร้างโดย Lalin Studio

SRS ปัจจุบันมี playback engine ใน FR-09.7 (Web Audio API, gain, pan, FX, meter) อยู่แล้ว ดังนั้น CR นี้ควร reuse audio primitives เดิมแทนการสร้าง DSP stack ซ้ำ

## 3. Product Position

```text
Lalin AI
│
├── Lalin Studio
│   ├── Voice Studio
│   ├── Dubbing
│   ├── Arrange
│   ├── Mastering
│   └── Library
│
└── Lalin Play                 ← proposed by CR-001
    ├── Media Player
    ├── Queue / Now Playing
    ├── Playback EQ
    ├── Output Device
    └── Windows Media Controls
```

Lalin Play ต้องใช้ source/library เดียวกับ Studio แต่ไม่ควรเพิ่ม `YouTube TV`, `Ride`, หรือ consumer playback controls เข้า rail หลักของ Lalin Studio โดยตรง

## 4. Proposed Functional Requirements

> หมายเลข FR-16 และ FR-17 เป็น **proposed IDs** จนกว่า CR นี้จะได้รับอนุมัติและ merge เข้า canonical `docs/product/SRS.md`

### FR-16: Windows Media Player

| ID | Requirement | Priority |
|---|---|---|
| FR-16.1 | ระบบต้องเปิดและเล่นไฟล์ audio ใน Library/Workspace ได้โดยไม่ต้องนำไฟล์เข้า Arrange timeline ก่อน | Must |
| FR-16.2 | ระบบต้องมี transport controls อย่างน้อย: Play, Pause, Previous, Next, Seek, Stop และ Volume | Must |
| FR-16.3 | ระบบต้องมี `Now Playing` state กลางที่ระบุ media id/path, title, duration, position, playback state, artwork/thumbnail (ถ้ามี) และ active output | Must |
| FR-16.4 | ระบบต้องรองรับ queue: add, remove, reorder, clear และ play-next | Must |
| FR-16.5 | ระบบต้องรองรับ Repeat Off / Repeat One / Repeat All และ Shuffle | Should |
| FR-16.6 | ผู้ใช้ต้องสามารถเปิด media จาก Library/File Manager ด้วย action `Play`, `Play next`, `Add to queue` | Must |
| FR-16.7 | Player ต้องไม่แก้ไข source media โดยอัตโนมัติ การปรับ volume/EQ/playback ต้องเป็น non-destructive | Must |
| FR-16.8 | Player ต้องรองรับ format ที่ runtime ปัจจุบันอ่านได้ และต้องรายงาน unsupported codec/container แบบชัดเจนแทนการ fail เงียบ | Must |
| FR-16.9 | ระบบควรรองรับ audio อย่างน้อย WAV, MP3, FLAC, M4A/AAC และ OGG เมื่อ codec/runtime รองรับ | Should |
| FR-16.10 | ระบบควรรองรับ video playback สำหรับ MP4/WebM ใน phase ถัดไป โดย audio path ต้องใช้ playback controls/EQ contract เดียวกันเท่าที่ทำได้ | Could |
| FR-16.11 | Player state ต้อง survive การสลับหน้าใน Lalin surface; การเปลี่ยน UI route ต้องไม่หยุดเพลงโดยไม่มีคำสั่งจากผู้ใช้ | Must |
| FR-16.12 | ระบบต้องบันทึก queue/session ล่าสุดแบบ local และ restore ได้เมื่อผู้ใช้เลือก `Resume previous session` | Should |
| FR-16.13 | ระบบต้องรองรับ playback speed อย่างน้อย 0.5×–2.0× สำหรับไฟล์ที่ engine รองรับ | Should |
| FR-16.14 | ระบบต้องมี keyboard shortcuts สำหรับ play/pause, previous/next, seek และ volume | Must |

### FR-16W: Windows Integration

| ID | Requirement | Priority |
|---|---|---|
| FR-16W.1 | แอป Windows ต้องรับ hardware media keys: Play/Pause, Previous, Next และ Stop เมื่อ OS/runtime อนุญาต | Must |
| FR-16W.2 | ระบบควร publish metadata ของเพลงปัจจุบันให้ Windows System Media Transport Controls (SMTC) หรือ integration ที่เทียบเท่า เพื่อให้แสดง Now Playing ใน Windows media overlay | Should |
| FR-16W.3 | การกด media key ต้อง route ผ่าน playback command contract กลาง ห้ามผูกตรงกับ component UI เฉพาะหน้า | Must |
| FR-16W.4 | ระบบต้องรองรับการเลือก audio output device เมื่อ runtime/API อนุญาต และต้อง fallback เป็น Windows default output อย่างปลอดภัย | Should |
| FR-16W.5 | เมื่อ output device หาย/ถูกถอด ระบบต้องไม่ crash และต้อง fallback หรือแจ้งผู้ใช้ให้เลือก output ใหม่ | Must |
| FR-16W.6 | Player ต้องสามารถทำงานใน background ขณะที่หน้าต่าง Lalin ถูก minimize โดย playback ไม่หยุดเอง | Must |

### FR-17: Playback EQ

| ID | Requirement | Priority |
|---|---|---|
| FR-17.1 | ระบบต้องมี playback EQ แบบ non-destructive อยู่ใน signal chain ของ Lalin Player เท่านั้น | Must |
| FR-17.2 | MVP ต้องมี EQ อย่างน้อย 10 bands: 31, 62, 125, 250, 500 Hz, 1k, 2k, 4k, 8k, 16k Hz | Must |
| FR-17.3 | gain ต่อ band ต้องปรับได้อย่างน้อย -12 dB ถึง +12 dB และ reset แต่ละ band/ทั้งหมดได้ | Must |
| FR-17.4 | ระบบต้องมี Preamp อย่างน้อย -12 dB ถึง +12 dB เพื่อชดเชย headroom | Must |
| FR-17.5 | ระบบต้องมี EQ bypass แบบ instant A/B โดยไม่ล้างค่า EQ ที่ผู้ใช้ตั้งไว้ | Must |
| FR-17.6 | ระบบต้องมี preset อย่างน้อย Flat, Bass Boost, Treble Boost, Vocal, Rock, Pop และ Classical | Should |
| FR-17.7 | ผู้ใช้ต้องสร้าง/rename/delete custom EQ preset ได้ | Should |
| FR-17.8 | EQ preset และค่าล่าสุดต้อง persist ระหว่าง app sessions | Must |
| FR-17.9 | ระบบต้องป้องกัน clipping หลัง EQ/preamp ด้วย headroom strategy และ/หรือ limiter ใน playback chain | Must |
| FR-17.10 | UI ควรแสดง spectrum/level visualization ที่มาจากข้อมูลจริง; หากไม่มีข้อมูลจริงต้องไม่ fabricate meter | Should |
| FR-17.11 | การปรับ EQ ต้องมีผลแบบ real-time โดยไม่ restart player หรือ reload media | Must |
| FR-17.12 | EQ state ต้องแยกจาก Mastering parameters; การปรับ Playback EQ ต้องไม่เปลี่ยนค่าหรือ output ของ mastering project | Must |
| FR-17.13 | ระบบควรรองรับการผูก preset กับ output device ในอนาคต เช่น Headphones / Speakers แต่ไม่บังคับใน MVP | Could |

## 5. UX Requirements

### 5.1 Player Surface

Player ควรมีโครงสร้างอย่างน้อย:

```text
┌────────────────────────────────────────────────────┐
│ Lalin Play                                         │
├───────────────────────────────┬────────────────────┤
│                               │ Queue              │
│        Artwork / Video        │                    │
│                               │ 01 Current         │
│                               │ 02 Next            │
│                               │ 03 ...             │
├───────────────────────────────┴────────────────────┤
│  ◀◀      ▶ / ❚❚      ■      ▶▶                   │
│  ───────────────●──────────────────  02:14 / 04:32│
│  Vol ████████                 Output: Speakers     │
├────────────────────────────────────────────────────┤
│ EQ: [Flat ▼]  [Bypass]  [Open EQ]                 │
└────────────────────────────────────────────────────┘
```

### 5.2 EQ Surface

- ใช้ fader/slider ที่อ่านค่าด้วย keyboard ได้
- แสดง dB value ต่อ band
- มี Reset / Bypass ชัดเจน
- ต้องไม่ใช้สีอย่างเดียวเป็นตัวสื่อ enabled/disabled
- Preset selection ต้องไม่ overwrite custom preset จนกว่าผู้ใช้จะสั่ง save

## 6. Proposed Technical Architecture

```text
Library / Workspace
       │
       ▼
 Playback Command API
       │
       ▼
┌─────────────────────────────┐
│      Playback Core          │
│ state / queue / transport   │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│      Audio Graph            │
│ Source                      │
│   ↓                         │
│ Preamp                      │
│   ↓                         │
│ 10-band EQ                  │
│   ↓                         │
│ Limiter / safety stage      │
│   ↓                         │
│ Gain / output               │
│   ↓                         │
│ Meter / analyser            │
└──────────────┬──────────────┘
               │
               ▼
       Windows Audio Output
               │
               ├── Media keys / SMTC
               └── Output device state
```

### 6.1 Reuse First

- Reuse audio primitives จาก FR-09.7 ก่อนสร้าง engine ใหม่
- Shared playback state ควรอยู่ใน package/service กลาง ไม่อยู่ใน React component
- UI เป็น consumer ของ playback state เท่านั้น
- Windows media-key adapter ต้อง translate OS events เป็น command (`play`, `pause`, `next`, `previous`) ผ่าน contract เดียวกับ UI

### 6.2 Proposed Code Ownership

โครงสร้างเป้าหมายเชิงแนวคิด:

```text
apps/
├── desktop/                      # existing Lalin Studio shell
└── play-desktop/                 # optional separate Lalin Play surface

packages/
├── contracts/
├── playback-core/
├── playback-eq/
└── media-library/
```

หากทีมเลือกไม่สร้าง `apps/play-desktop/` ในระยะแรก สามารถทำเป็น secondary Tauri window/surface ใน `apps/desktop/` ได้ แต่ต้องรักษา separation ของ playback domain และห้ามทำให้ Studio navigation หลักปนกับ consumer media controls

## 7. Scope / Non-Goals

### In Scope

- Windows desktop media playback
- Playback queue
- Playback-only EQ
- Presets + preamp + bypass
- Windows hardware media keys
- Now Playing / Windows media integration เท่าที่ runtime รองรับ
- Shared Library/Workspace files

### Out of Scope for this CR

- Windows system-wide EQ
- Audio Processing Object (APO)
- Virtual sound card / virtual audio cable
- Kernel/driver-level audio processing
- DRM streaming service implementation
- Spotify/Apple Music credential integration
- YouTube TV / Leanback integration
- Multi-device synchronized playback
- Bike/Ride mode

รายการ Out of Scope เหล่านี้สามารถมี CR แยกภายหลัง เพื่อไม่ให้ implementation ของ local Windows player ถูกผูกกับ media-orchestration roadmap ทั้งชุด

## 8. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-MP-01 | Play/Pause command to audible state change | p95 ≤ 150 ms สำหรับ local media บนเครื่องอ้างอิง |
| NFR-MP-02 | EQ parameter update | ต้องได้ยินผลโดยไม่ reload media และไม่มี audible gap ที่เกิดจากการ restart graph |
| NFR-MP-03 | UI route change | ต้องไม่ reset queue หรือ playback state |
| NFR-MP-04 | Unsupported/corrupt media | ต้องแสดง actionable error และไม่ crash process |
| NFR-MP-05 | EQ persistence | preset/current state ต้อง restore แบบ deterministic |
| NFR-MP-06 | CPU usage | EQ/playback ต้องไม่ใช้ ML/GPU queue และต้องไม่โหลด heavy ML model |
| NFR-MP-07 | Startup | การมี player feature ต้องไม่ทำให้ basic Lalin shell cold start ต้องโหลด media decoder/visualizer หนักโดยไม่จำเป็น |

## 9. Acceptance Criteria

CR นี้ถือว่าผ่าน MVP gate เมื่อ:

1. ผู้ใช้เปิด WAV/MP3 จาก Library และฟังได้ใน Lalin โดยไม่เข้า Arrange
2. Play/Pause/Seek/Previous/Next ทำงานจาก UI และ Windows media keys
3. Queue เพิ่ม/ลบ/เรียงลำดับและเล่นต่ออัตโนมัติได้
4. EQ 10-band + preamp + bypass ทำงาน real-time
5. EQ preset persist หลังปิด/เปิดแอป
6. EQ ไม่แก้ source file และไม่เปลี่ยน Mastering project parameters
7. เพิ่ม gain หลาย band แล้วระบบมี clipping protection ที่ตรวจสอบได้
8. เปลี่ยน route/minimize window แล้ว playback ไม่ถูก reset โดยไม่ตั้งใจ
9. unsupported media แสดง error ชัดเจนและแอปไม่ crash
10. automated tests ครอบคลุม playback state/queue reducer, EQ preset serialization และ command routing อย่างน้อย

## 10. Test Requirements

### Unit

- queue operations: add/remove/reorder/next/repeat/shuffle
- playback state transitions
- EQ band bounds and reset
- preset save/load/delete
- EQ/preamp serialization
- media-key command mapping

### Integration

- open file → play → seek → pause → resume
- queue auto-advance
- EQ update during playback
- output device loss/fallback
- restore previous playback session

### Windows Manual Validation

- keyboard media keys
- Bluetooth headset media keys
- minimize/restore
- sleep/wake behavior
- unplug/replug output device
- Windows default output change

## 11. Dependencies / Risks

| Risk | Impact | Mitigation |
|---|---|---|
| WebView/runtime codec support แตกต่างตาม Windows | บางไฟล์เปิดไม่ได้ | capability detection + actionable error + optional decoder fallback |
| EQ boost ทำให้ clipping | distortion | preamp/headroom + limiter/safety stage |
| Player state ผูกกับ React route | เพลงหยุดเมื่อเปลี่ยนหน้า | playback state/service ต้องอยู่นอก page lifecycle |
| Windows media integration ผูกแน่นกับ platform | portability ลดลง | ใช้ adapter interface แยก Windows-specific code |
| Duplicate audio engine กับ Arrange | bug/behavior ไม่ตรงกัน | reuse FR-09.7 primitives และ shared contracts |

## 12. Decision Gates

ก่อน implementation ต้องตัดสินใจ 4 เรื่อง:

1. **Surface:** separate `Lalin Play` app/window หรือ secondary surface ใน Lalin Studio binary
2. **Decoder strategy:** WebView/native media path อย่างเดียว หรือมี ffmpeg/native fallback
3. **Windows integration:** SMTC implementation ผ่าน Tauri/Rust adapter ใด
4. **Shared engine:** refactor Arrange playback primitives เป็น reusable `playback-core` ก่อน หรือ implement adapter layer ขั้นกลาง

## 13. SRS Integration Plan

เมื่อ CR ได้รับอนุมัติ:

1. Merge FR-16 / FR-16W / FR-17 เข้า `docs/product/SRS.md`
2. เพิ่ม terminology: `MediaItem`, `NowPlaying`, `PlaybackQueue`, `PlaybackEQ`, `OutputDevice`
3. เพิ่ม architecture ownership เข้า `docs/architecture/REPOSITORY_ARCHITECTURE_SOT.md`
4. เพิ่ม UI spec ของ Lalin Play หรือ secondary player surface
5. เพิ่ม roadmap item และ acceptance-test backlog
6. เพิ่ม doc-graph mapping หลัง code paths ถูกล็อก

## 14. Status

**PROPOSED — awaiting product/architecture approval.**

CR นี้ยังไม่อนุมัติให้แก้ canonical SRS หรือเริ่ม implementation จนกว่าจะผ่าน Decision Gates ในข้อ 12

## CHANGELOG

| Version | Date | Status | Summary | Agent |
|---|---|---|---|---|
| 0.1.0-candidate | 2026-09-16 | proposed | Initial CR for Windows media player + playback EQ | LALIN |
