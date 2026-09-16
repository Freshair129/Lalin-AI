---
version: "0.2.1-candidate"
created_at: "2026-09-16T00:00:00+07:00,LALIN"
last_update: "2026-09-16T00:00:00+07:00,LALIN"
status: "proposed"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "change-request"
  scope: "Lalin Play Windows media player, playback EQ, and long-term media platform roadmap"
---

# CR-001 — Lalin Play: Windows Media Player + Playback EQ

## 1. Change Request Summary

เพิ่ม **Windows Media Player surface** และ **non-destructive playback EQ** ให้ Lalin AI เพื่อให้ผู้ใช้สามารถฟัง ตรวจงาน และเล่น media จาก Library/Workspace ได้ใน ecosystem เดียว โดยต่อยอดจาก audio engine เดิมโดยไม่ทำให้ Lalin Studio กลายเป็น media-consumption UI ที่ปะปนกับ editor หลัก

การเปลี่ยนแปลงนี้เสนอ product surface ชื่อชั่วคราว **Lalin Play** (ชื่อ final ยังไม่ล็อก) ภายใต้ ecosystem Lalin AI และแชร์ contracts/services กับ Lalin Studio

> Scope สำคัญ: EQ ใน CR นี้ประมวลผลเฉพาะ audio playback ภายใน Lalin เท่านั้น **ไม่ใช่ Windows system-wide EQ / Audio Processing Object (APO) / virtual audio driver**

## 2. Product Principle

ใช้หลัก **Separate Surface, Shared Platform**

```text
Lalin AI
│
├── Lalin Studio              # Create / Edit / Produce
│   ├── Voice Studio
│   ├── Dubbing
│   ├── Arrange
│   ├── Mastering
│   └── Library
│
├── Lalin Play                # Listen / Watch / Queue / Control
│   ├── Media Player
│   ├── Queue / Now Playing
│   ├── Playback EQ
│   ├── Output Device
│   └── Windows Media Controls
│
└── Shared Platform
    ├── contracts
    ├── playback-core
    ├── audio-core
    ├── media-library
    ├── device-core
    └── input-core
```

Lalin Play ต้องใช้ Library, contracts และ audio/playback primitives ร่วมกับ Studio แต่ไม่ควรเพิ่ม consumer playback controls, TV mode หรือ Ride mode เข้า rail หลักของ Lalin Studio โดยตรง

## 3. Motivation / Problem

Lalin Studio ปัจจุบันมีความสามารถด้าน audio creation, Arrange timeline, mastering และ Library แต่ยังขาด playback surface สำหรับการฟัง media แบบต่อเนื่องนอกบริบท editor

ผู้ใช้จึงยังต้องออกไปใช้ media player ภายนอกเมื่อต้องการ:

- เปิดฟังเพลง/เสียงจาก Library แบบต่อเนื่อง
- จัด queue สำหรับตรวจงานหลายไฟล์
- ปรับโทนเสียงเพื่อการฟังโดยไม่แก้ source file
- ใช้ media keys ของ keyboard/headset บน Windows
- เปลี่ยน output device และควบคุม playback จาก OS
- ใช้ media library เดียวกับไฟล์ที่สร้างโดย Lalin Studio

SRS ปัจจุบันมี playback engine ใน FR-09.7 (Web Audio API, gain, pan, FX, meter) อยู่แล้ว ดังนั้น CR นี้ต้อง **reuse first** และหลีกเลี่ยงการสร้าง DSP stack ซ้ำ

## 4. Proposed Functional Requirements

> หมายเลข FR-16 / FR-16W / FR-17 เป็น **proposed IDs** จนกว่า CR นี้จะได้รับอนุมัติและ merge เข้า canonical `docs/product/SRS.md`

### FR-16: Windows Media Player

| ID | Requirement | Priority |
|---|---|---|
| FR-16.1 | ระบบต้องเปิดและเล่นไฟล์ audio ใน Library/Workspace ได้โดยไม่ต้องนำไฟล์เข้า Arrange timeline ก่อน | Must |
| FR-16.2 | ระบบต้องมี Play, Pause, Previous, Next, Seek, Stop และ Volume | Must |
| FR-16.3 | ระบบต้องมี `Now Playing` state กลางที่ระบุ media id/path, title, duration, position, playback state, artwork/thumbnail และ active output เท่าที่ข้อมูลมีจริง | Must |
| FR-16.4 | ระบบต้องรองรับ queue: add, remove, reorder, clear และ play-next | Must |
| FR-16.5 | ระบบต้องรองรับ Repeat Off / Repeat One / Repeat All และ Shuffle | Should |
| FR-16.6 | Library/File Manager ต้องมี action `Play`, `Play next`, `Add to queue` | Must |
| FR-16.7 | Playback ต้องเป็น non-destructive และไม่แก้ source media | Must |
| FR-16.8 | Unsupported codec/container ต้องแสดง actionable error และห้าม fail เงียบ | Must |
| FR-16.9 | ควรรองรับอย่างน้อย WAV, MP3, FLAC, M4A/AAC และ OGG เมื่อ runtime รองรับ | Should |
| FR-16.10 | Video playback สำหรับ MP4/WebM เป็น phase ถัดไป และต้อง reuse playback contract เดียวกันเท่าที่ทำได้ | Could |
| FR-16.11 | Player state ต้อง survive การเปลี่ยน route/window state; UI navigation ต้องไม่หยุดเพลงเอง | Must |
| FR-16.12 | ระบบควร restore queue/session ล่าสุดแบบ opt-in (`Resume previous session`) | Should |
| FR-16.13 | Playback speed 0.5×–2.0× สำหรับ media ที่ engine รองรับ | Should |
| FR-16.14 | ต้องมี keyboard shortcuts สำหรับ transport, seek และ volume | Must |

### FR-16W: Windows Integration

| ID | Requirement | Priority |
|---|---|---|
| FR-16W.1 | รับ hardware media keys: Play/Pause, Previous, Next และ Stop เมื่อ OS/runtime อนุญาต | Must |
| FR-16W.2 | ควร publish Now Playing metadata ให้ Windows System Media Transport Controls (SMTC) หรือ integration ที่เทียบเท่า | Should |
| FR-16W.3 | Media key ต้อง route ผ่าน playback command contract กลาง ห้ามผูกตรงกับ UI component | Must |
| FR-16W.4 | ควรรองรับการเลือก audio output device และ fallback เป็น Windows default อย่างปลอดภัย | Should |
| FR-16W.5 | เมื่อ output device หาย/ถูกถอด ระบบต้องไม่ crash | Must |
| FR-16W.6 | Playback ต้องทำงานต่อได้เมื่อ Lalin Play ถูก minimize | Must |

### FR-17: Playback EQ

| ID | Requirement | Priority |
|---|---|---|
| FR-17.1 | Playback EQ ต้องเป็น non-destructive และอยู่ใน signal chain ของ Lalin Player เท่านั้น | Must |
| FR-17.2 | MVP ต้องมี EQ อย่างน้อย 10 bands: 31, 62, 125, 250, 500 Hz, 1k, 2k, 4k, 8k, 16k Hz | Must |
| FR-17.3 | Gain ต่อ band ต้องปรับได้อย่างน้อย -12 dB ถึง +12 dB และ reset ได้ | Must |
| FR-17.4 | ต้องมี Preamp อย่างน้อย -12 dB ถึง +12 dB | Must |
| FR-17.5 | ต้องมี EQ bypass สำหรับ instant A/B โดยไม่ล้างค่าปัจจุบัน | Must |
| FR-17.6 | ควรมี preset อย่างน้อย Flat, Bass Boost, Treble Boost, Vocal, Rock, Pop, Classical | Should |
| FR-17.7 | ผู้ใช้ควรสร้าง/rename/delete custom preset ได้ | Should |
| FR-17.8 | EQ preset และค่าล่าสุดต้อง persist ระหว่าง app sessions | Must |
| FR-17.9 | ต้องมี clipping protection ผ่าน headroom strategy และ/หรือ limiter | Must |
| FR-17.10 | Spectrum/level visualization ต้องใช้ข้อมูลจริง; ห้าม fabricate meter | Should |
| FR-17.11 | การปรับ EQ ต้องมีผล real-time โดยไม่ restart player/reload media | Must |
| FR-17.12 | Playback EQ state ต้องแยกจาก Mastering parameters อย่างเด็ดขาด | Must |
| FR-17.13 | อนาคตควรรองรับ EQ preset per output device เช่น Headphones / Speakers | Could |

## 5. UX Requirements

### 5.1 Player Surface

```text
┌────────────────────────────────────────────────────┐
│ Lalin Play                                         │
├───────────────────────────────┬────────────────────┤
│                               │ Queue              │
│        Artwork / Video        │ 01 Current         │
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

- ใช้ fader/slider ที่ keyboard-accessible
- แสดง dB value ต่อ band
- มี Reset / Bypass ชัดเจน
- state enabled/disabled ห้ามสื่อด้วยสีอย่างเดียว
- การเลือก preset ห้าม overwrite custom preset จนกว่าผู้ใช้จะสั่ง Save

### 5.3 Surface Separation

ระยะแรกแนะนำ:

```text
Lalin.exe
├── Studio Window
└── Play Window
```

หมายถึง installer/update/runtime เดียวกัน แต่ Studio และ Play เป็น **คนละ window/surface** และ share core เดียวกัน

ห้ามเพิ่ม `YouTube TV`, `Ride`, `Queue`, `EQ` เป็น top-level Studio rail โดยตรงเพียงเพราะ implementation อยู่ใน binary เดียวกัน

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
│      Audio Core             │
│ Source                      │
│   ↓                         │
│ Preamp                      │
│   ↓                         │
│ EQ                          │
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
- Shared playback state ต้องอยู่นอก React page lifecycle
- UI เป็น consumer ของ playback state เท่านั้น
- Windows-specific integration ต้องอยู่หลัง adapter interface
- Studio playback และ Play playback ใช้ core ร่วมกัน แต่ใช้ **คนละ session/state**

### 6.2 Target Code Ownership

```text
apps/
├── desktop/                   # current Lalin desktop binary/shell
│   ├── Studio Window
│   └── Play Window            # initial phase
└── play-desktop/              # future separate executable if gate is met

packages/
├── contracts/
├── playback-core/
├── audio-core/
├── playback-eq/
├── media-library/
├── device-core/
├── input-core/
└── room-core/                 # future
```

## 7. Current Scope / Non-Goals

### In Scope

- Windows local-media playback
- Playback queue / Now Playing
- Playback-only EQ
- Presets + preamp + bypass + clipping protection
- Windows hardware media keys
- Background playback
- Shared Library/Workspace files
- Separate Play surface/window

### Out of Current MVP Scope

- Windows system-wide EQ / APO
- Virtual sound card / virtual audio cable
- Kernel/driver-level audio processing
- DRM streaming service implementation
- Spotify/Apple Music credential integration
- YouTube TV / Leanback integration
- Multi-device synchronized playback
- Remote controller app
- Shared room / party mode
- Bike/Ride mode

> รายการข้างต้น **ไม่ถูกปฏิเสธในระดับ product roadmap** แต่ถูกเลื่อนไป phase หลังเพื่อไม่ให้ MVP ผูกกับ media-orchestration stack ทั้งชุด

## 8. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-MP-01 | Play/Pause command → audible state change | p95 ≤ 150 ms สำหรับ local media บนเครื่องอ้างอิง |
| NFR-MP-02 | EQ update | ไม่มี media reload / graph restart audible gap |
| NFR-MP-03 | UI route/window state change | ห้าม reset queue/playback state |
| NFR-MP-04 | Unsupported/corrupt media | actionable error และไม่ crash |
| NFR-MP-05 | EQ persistence | deterministic restore |
| NFR-MP-06 | CPU/GPU isolation | playback/EQ ห้ามเข้า ML/GPU queue |
| NFR-MP-07 | Startup isolation | player feature ห้ามบังคับโหลด decoder/visualizer/ML หนักตอน basic Studio startup |

## 9. Acceptance Criteria — MVP Gate

1. เปิด WAV/MP3 จาก Library แล้วเล่นได้โดยไม่เข้า Arrange
2. Play/Pause/Seek/Previous/Next ทำงานจาก UI และ media keys
3. Queue เพิ่ม/ลบ/เรียง/auto-advance ได้
4. EQ 10-band + preamp + bypass ทำงาน real-time
5. EQ preset persist หลัง restart
6. EQ ไม่แก้ source และไม่เปลี่ยน Mastering project parameters
7. Clipping protection ตรวจสอบได้เมื่อ boost หลาย band
8. เปลี่ยน route/minimize แล้ว playback ไม่ reset
9. Unsupported media แสดง error และไม่ crash
10. Unit/integration tests ครอบคลุม playback state, queue, EQ serialization และ command routing

## 10. Test Requirements

### Unit

- queue operations: add/remove/reorder/next/repeat/shuffle
- playback state transitions
- EQ band bounds/reset
- preset save/load/delete
- EQ/preamp serialization
- media-key command mapping

### Integration

- open → play → seek → pause → resume
- queue auto-advance
- EQ update during playback
- output device loss/fallback
- restore previous session
- Studio ↔ Play window switching without playback reset

### Windows Manual Validation

- keyboard media keys
- Bluetooth headset media keys
- minimize/restore
- sleep/wake
- unplug/replug output device
- Windows default output change

## 11. Dependencies / Risks

| Risk | Impact | Mitigation |
|---|---|---|
| WebView/runtime codec support แตกต่างตาม Windows | บางไฟล์เปิดไม่ได้ | capability detection + actionable error + optional decoder fallback |
| EQ boost ทำให้ clipping | distortion | preamp/headroom + limiter |
| Player state ผูกกับ React route | เพลงหยุดเมื่อเปลี่ยนหน้า | service/store นอก page lifecycle |
| Windows integration ผูก platform | portability ลดลง | Windows adapter interface |
| Duplicate engine กับ Arrange | behavior/bug แยกกัน | extract/reuse shared playback/audio core |
| Lalin Play โตเร็วจน Studio UX เละ | product identity แตก | separate surface + roadmap gates |

## 12. Decision Gates

ก่อน implementation ต้องตัดสินใจ:

1. **Surface Gate:** secondary Play window ใน Lalin binary (default proposal) หรือ separate executable ตั้งแต่แรก
2. **Decoder Gate:** WebView/native media path อย่างเดียว หรือมี ffmpeg/native fallback
3. **Windows Integration Gate:** SMTC/media-key implementation ผ่าน Tauri/Rust adapter ใด
4. **Shared Engine Gate:** extract Arrange primitives เป็น `playback-core` / `audio-core` ก่อน หรือใช้ adapter transition phase

## 13. Long-Term Roadmap

Roadmap นี้กำหนด **ทิศทางระยะยาว** ไม่ใช่ commitment ว่าทุก phase ต้อง implement ต่อเนื่องทันที แต่ใช้เป็น architectural guardrail เพื่อให้ MVP วันนี้ไม่ปิดทาง product ในอนาคต

### Phase 0 — Foundation / Domain Extraction

**Goal:** ทำให้ playback/audio เป็น platform primitive ไม่ใช่ component ของ Arrange

Deliverables:
- define `MediaItem`, `PlaybackState`, `PlaybackCommand`, `PlaybackCapabilities`
- extract/reuse shared `playback-core`
- extract/reuse `audio-core`
- แยก Studio editing state ออกจาก consumer playback state
- contract tests ระหว่าง Studio / Play
- capability detection สำหรับ codec/output/runtime

**Exit Gate:** Studio ยังทำงานเหมือนเดิม และ Play สามารถใช้ core โดยไม่ import UI/editor-specific logic

### Phase 1 — Lalin Play MVP (Windows Local Player)

**Goal:** ให้ Lalin มี local media player ใช้งานจริงโดยไม่ทำลาย Studio UX

Deliverables:
- secondary **Lalin Play Window** ใน Lalin desktop binary
- local audio playback
- queue / Now Playing
- 10-band EQ + preamp + bypass + presets
- output selection/fallback
- keyboard/headset media keys
- background playback
- Library actions: Play / Play Next / Add to Queue
- session persistence

**Default topology:**
```text
Lalin.exe
├── Studio Window
└── Play Window
```

**Exit Gate:** MVP Acceptance Criteria ในข้อ 9 ผ่านครบ

### Phase 2 — Native Windows Media Experience

**Goal:** ทำให้ Lalin Play รู้สึกเป็น Windows media application จริง ไม่ใช่ editor ที่มีปุ่ม Play เพิ่ม

Deliverables:
- SMTC / Windows Now Playing metadata
- improved codec/decoder fallback
- gapless playback เมื่อ format/decoder รองรับ
- ReplayGain/loudness normalization แบบ playback-only
- per-output-device EQ preset
- sleep/wake recovery
- drag/drop media และ Windows file association (opt-in)
- mini-player / compact overlay window

**Decision Gate A — Split Executable?**

แยกเป็น `Lalin Play.exe` เมื่ออย่างน้อยหนึ่งเงื่อนไขเกิดขึ้น:
- media runtime/dependencies ทำให้ Studio startup/package หนักอย่างมีนัยสำคัญ
- Play ต้องอยู่ background independently จาก Studio lifecycle
- release cadence ของ Play เริ่มต่างจาก Studio
- TV/receiver mode ต้องการ runtime/window policy คนละชุด

ถ้ายังไม่เข้าเงื่อนไข ให้คง binary เดียว + multi-window ต่อไป

### Phase 3 — Video + Rich Media

**Goal:** ขยายจาก audio player เป็น media player โดยยังใช้ playback contract เดิม

Deliverables:
- MP4/WebM video playback
- artwork/subtitle/metadata pipeline
- chapter support เท่าที่ source รองรับ
- audio-only / video presentation mode
- shared EQ/audio-output path สำหรับ video
- hardware acceleration capability check
- fullscreen / borderless playback surface

**Non-goal:** ยังไม่ทำ YouTube/DRM service integration ใน phase นี้

### Phase 4 — Lalin Remote + Device Control

**Goal:** แยก **Player** ออกจาก **Controller**

Deliverables:
- device identity/capability registry
- QR/LAN pairing
- phone/PWA remote
- transport/queue/EQ control ผ่าน local network
- input abstraction: keyboard, gamepad, Bluetooth media keys, phone remote
- authorization/pairing token สำหรับ local control

```text
Phone / Gamepad / Keyboard
           │
           ▼
      Input Gateway
           │
           ▼
     Playback Core
           │
           ▼
       Lalin Play
```

**Exit Gate:** remote command ใช้ command contract เดียวกับ local UI ไม่มี remote-specific playback logic

### Phase 5 — Lalin Room / Shared Queue

**Goal:** เปลี่ยนจาก single-user player เป็น shared media session

Deliverables:
- `room-core`
- host / participant roles
- shared queue
- participant add-to-queue permissions
- realtime state replication ผ่าน WebSocket/LAN
- room QR join
- reconnect/session recovery
- room policy เช่น max queue items per participant

```text
Phone A ─┐
Phone B ─┼──> Shared Queue ──> Lalin Play
Tablet  ─┘
```

**Architecture Gate:** Room ต้องเป็น domain แยกจาก Playback; Playback ต้องทำงานได้โดยไม่มี Room

### Phase 6 — Multi-Device Sync / Receiver Mode

**Goal:** ให้หลาย device เล่น media session เดียวกันได้และให้ device หนึ่งทำหน้าที่ receiver

Deliverables:
- device clock/sync abstraction
- playback position replication
- drift detection/correction
- receiver mode
- send-to-device
- local-first LAN transport + optional cloud relay abstraction
- capability negotiation (audio/video/controller/display)

```text
             Room / Queue
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
      PC/TV    Phone    Other Receiver
```

**Performance note:** ห้ามอ้าง frame-accurate / 0 ms sync จนกว่าจะมี measured validation จริง

### Phase 7 — TV / Leanback Experience

**Goal:** สร้าง 10-foot UI สำหรับ PC/HTPC/TV โดยแยก consumer experience ออกจาก Studio

Deliverables:
- TV navigation mode
- gamepad/remote navigation
- fullscreen/kiosk option
- large-screen media browser
- optional YouTube/Leanback adapter **หลัง legal/technical feasibility review**
- DIAL/device discovery research
- receiver-first startup mode

**Runtime Gate:** ถ้า Leanback/Chromium requirements ขัดกับ Tauri/WebView2 ให้พิจารณา `Lalin Play` runtime แยก (เช่น Electron) โดย **แชร์ core contracts แต่ไม่ยัดสอง runtime ใน Studio process เดียว**

### Phase 8 — Lalin Ride Experience

**Goal:** นำ media orchestration core ไปใช้กับ rider/passenger use case โดยไม่ทำให้ Ride logic กลายเป็น dependency ของ Play

Potential deliverables:
- Rider / Passenger roles
- Hotspot/LAN session
- passenger remote/shared queue
- large-button/eyes-free UI
- AVRCP input adapter
- audio ducking integration
- optional local WebRTC intercom
- Android companion สำหรับ notification/TTS accessibility ตาม policy/platform constraints

```text
Lalin Media Platform
├── Play / TV
├── Room
└── Ride
```

Ride = vertical experience บน shared core ไม่ใช่ fork ของ player

### Phase 9 — AI Media Orchestration

**Goal:** ใช้ Lalin Brain เป็น command/orchestration layer เหนือ media platform

Potential capabilities:
- natural-language queue control
- contextual playlist generation
- semantic Library search
- `play on device X`
- `after this, play...`
- volume/EQ/preset intent mapping
- summarize/transcribe media where applicable
- voice command → validated media action

AI rule:
- destructive Library actions ต้องยืนยันตาม policy
- ambiguous device/media target ต้องถามกลับ
- AI ต้องเรียก deterministic media tools/contracts ไม่แก้ playback state แบบ bypass engine

### Phase 10 — Optional Platform Expansion

**Only if product evidence justifies it:**
- separate `Lalin Studio.exe` / `Lalin Play.exe` release lanes
- cloud room relay
- multi-room home media
- plugin/adapters สำหรับ external media services ที่ API/license อนุญาต
- companion apps สำหรับ mobile/TV platforms
- public Media/Device SDK

ไม่ควร implement phase นี้จาก architectural ambition อย่างเดียว ต้องมี usage evidence และ maintenance budget รองรับ

## 14. Roadmap Guardrails

1. **Studio remains creation-first.** ห้ามให้ consumer media UX กลบ Arrange/Voice/Dubbing/Mastering
2. **Playback works without AI.** Brain เป็น enhancement ไม่ใช่ dependency ของ basic media playback
3. **Room works above Playback.** ห้ามผูก Playback Core กับ network session โดยตรง
4. **Ride is a vertical.** ห้ามใส่ motorcycle-specific logic ใน generic media core
5. **Platform adapters stay replaceable.** Windows, TV, Leanback, remote protocols ต้องอยู่หลัง adapter boundary
6. **No fake precision.** Sync latency, codec coverage, battery/performance claims ต้องมาจาก measurement
7. **One source of truth for media state.** UI, media keys, remote และ AI ต้องส่ง command ผ่าน contract เดียวกัน
8. **No duplicate DSP stack.** Studio และ Play reuse audio primitives; project/mastering state แยกจาก playback state
9. **Local-first by default.** local media/local control ต้องใช้ได้โดยไม่บังคับ cloud login
10. **Split only when justified.** แยก executable/service เมื่อ lifecycle, dependency, performance หรือ release cadence ต้องการ ไม่แยกเพื่อความสวยของ architecture

## 15. Approval Boundaries

การอนุมัติ CR นี้ต้องไม่ถูกตีความว่า Phase 0–10 ได้รับอนุมัติ implementation ทั้งหมด

- **MVP Approval:** อนุมัติ Phase 0–1 + FR-16/FR-16W/FR-17 ให้เข้าสู่ implementation planning
- **Near-term Direction:** Phase 2–3 ใช้เพื่อ preserve architecture และต้องมี implementation approval แยกก่อนเริ่ม
- **Platform Direction:** Phase 4–10 เป็น strategic roadmap เท่านั้น แต่ละ phase ต้องมี CR/ADR/feature approval ของตัวเองก่อน implementation

## 16. SRS / Architecture Integration Plan

เมื่อ CR ได้รับอนุมัติระดับ MVP:

1. Merge FR-16 / FR-16W / FR-17 เข้า `docs/product/SRS.md`
2. เพิ่ม terminology: `MediaItem`, `NowPlaying`, `PlaybackQueue`, `PlaybackEQ`, `OutputDevice`
3. เพิ่ม ownership ใน `docs/architecture/REPOSITORY_ARCHITECTURE_SOT.md`
4. เพิ่ม UI spec สำหรับ Lalin Play secondary window
5. เพิ่ม Phase 0–1 ลง execution backlog; Phase 2+ คงเป็น roadmap
6. เพิ่ม automated acceptance-test backlog
7. เพิ่ม doc-graph mapping หลัง code paths ถูกล็อก

## 17. Status

**PROPOSED — awaiting product/architecture approval.**

## CHANGELOG

| Version | Date | Status | Summary | Agent |
|---|---|---|---|---|
| 0.2.1-candidate | 2026-09-16 | proposed | Added long-term roadmap and clarified approval boundaries: Phase 0–1 MVP; later phases require separate approval | LALIN |
| 0.1.0-candidate | 2026-09-16 | proposed | Initial CR for Windows media player + playback EQ | LALIN |
