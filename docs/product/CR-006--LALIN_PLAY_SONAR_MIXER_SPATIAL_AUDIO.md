---
version: "0.2.1b"
created_at: "2026-10-20T01:59:56+07:00,Codex"
last_update: "2026-10-20T02:43:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "change-request"
  scope: "Lalin Play in-app mixer, virtual headphone surround and bilingual ENG/TH UI"
---

# CR-006 — Mixer แบบ Sonar, Virtual Surround และ UI สองภาษา ENG/TH (approved)

## Request and approval boundary

ผู้ใช้ขอเพิ่มระบบ mixer ที่ได้แนวคิดจาก SteelSeries Sonar, โหมดเสียง
`Stereo` / จำลอง `7.1` และ UI สองภาษา ENG/TH โดยใช้ ENG เป็นค่าเริ่มต้น
สำหรับ Lalin Play ภาพ Sonar ที่แนบใช้เป็น reference
ด้านการจัดวาง channel mixer เท่านั้น ไม่ใช่ข้อกำหนดให้ทำ Windows audio driver
หรือทำซ้ำแบรนด์/asset ของ SteelSeries

ผู้ใช้ตอบ **approve** ให้ CR-006 ฉบับนี้เมื่อ 2026-10-20; scope นี้ได้รับอนุมัติ
สำหรับ implementation แล้ว การอนุมัติไม่ใช่หลักฐานว่าเสียงออกจริงหรือคุณภาพ
surround ผ่าน native acceptance. Implementation และ automated checks บันทึกไว้
ด้านล่าง; การรับฟังผ่าน Windows headphone endpoint ยังไม่ทำและยังไม่ผ่าน

Classification: **C-3 — Architecture-driven; MEDIUM risk** เพราะเพิ่มจุด
ปรับ gain และการแปลง spatial audio ใน playback graph ที่กำลังเล่นอยู่ ต้องคง
owner, EQ, output device, state และการเล่นต่อเนื่องเดิม

## Evidence and parent alignment

- [PRD §4.9](PRD.md#49-lalin-play--standalone-local-media-player-approved)
  และ [ADR-004](../architecture/ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md)
  กำหนด Full/Compact ใช้ playback owner เดียว และคง queue, position, volume,
  output และ EQ ระหว่างสลับ surface; Compact ยังคงเป็น transport แบบ minimal
- `apps/play-desktop/src/playback/audioEngine.ts` ปัจจุบันต่อ source → preamp →
  EQ 10 bands → limiter → master gain → analyser → output. Volume เดิมใช้
  master gain; CR นี้เสนอเพิ่ม media-channel gain และ spatial processing ใน graph
  เดิม ไม่สร้าง media element หรือ AudioContext เพิ่ม
- `apps/play-desktop/src/playback/usePlaybackStore.ts` เป็น owner ของ playback
  และ EQ state; mixer state ใหม่ต้องอยู่กับ store นี้และ persist แยก key แบบมี
  version โดยไม่เปลี่ยน EQ schema หรือ queue
- Lalin Play มี media stream จาก player ของตัวเองหนึ่ง stream ในขณะนี้ ไม่ได้มี
  Game, Chat, Aux หรือ Mic stream ที่แยกกันจริง จึงไม่แสดง channel ปลอมหรือ
  ChatMix ที่ไม่มี source ให้ควบคุม
- `apps/play-desktop/src/App.tsx` และ `PlaybackSettings.tsx` มีข้อความ UI
  เขียนตรงใน component; ไม่พบ locale state/dictionary กลางใน source ที่ตรวจ
  การเพิ่มภาษาเป็นขอบเขต UI ของ Lalin Play ไม่เปลี่ยน Studio/API
- Windows audio architecture แยก application streams, audio engine, endpoints
  และ audio drivers; ตัวอย่าง SysVAD ของ Microsoft เป็น virtual audio device
  driver สำหรับนักพัฒนา จึงไม่เท่ากับการเพิ่มหน้า UI ใน player

## Proposed V1 boundary

### Mixer surface

เพิ่มหน้า **มิกเซอร์** ใน Full เท่านั้น ตามแนวคิดภาพอ้างอิง: แถบ channel จริง,
fader, mute และข้อมูล output อ่านง่าย โดยมีสองแถบ:

1. **MEDIA** — เสียงของเพลง/วิดีโอที่ Lalin Play กำลังเล่น; มีชื่อสื่อ, fader,
   mute และปุ่มลัดไปหน้า EQ เดิม
2. **MASTER** — ระดับเสียงรวม, mute และ output device โดยใช้กลไก volume/output
   device ปัจจุบันเป็นแหล่งความจริงเดียว

ไม่แสดงแถบ GAME / CHAT / AUX / MIC หรือ ChatMix จนกว่าจะมี source ที่ Play
เป็นเจ้าของจริง Compact ไม่เพิ่ม mixer/EQ controls และยังใช้ transport เดิม

```text
┌────────────── MIXER ──────────────┐
│ MEDIA                    MASTER  │
│ เพลงที่กำลังเล่น         Output  │
│ [Mute] [fader]  [EQ]     [Mute]  │
│                         [fader]  │
├───────────────────────────────────┤
│ Spatial:  Stereo | Virtual 7.1    │
│                (Headphones)       │
└───────────────────────────────────┘
```

MEDIA fader ควบคุม channel gain ก่อน spatial processing; MASTER fader ใช้
volume/master gain ปัจจุบันหลัง limiter เพื่อรักษาพฤติกรรม transport volume.
EQ ยังเป็นหน้าเดิมและมีเพียง state/engine ชุดเดียว

### Bilingual UI — ENG / TH

- ครอบคลุมข้อความที่ Lalin Play เป็นเจ้าของในทุก UI surface: navigation,
  Full/Compact/TV controls, buttons, app-owned menus/dialogs, settings, EQ,
  mixer, transport/status, errors, tooltips, keyboard help และ accessibility
  labels; ไม่แปล metadata/ชื่อไฟล์/ชื่อ playlist ที่มาจากผู้ใช้หรือไฟล์สื่อ
- เพิ่มตัวสลับภาษาแบบ segmented `ENG | TH` ไว้ด้านขวาของ top bar ใน Full;
  แสดงภาษาที่เลือกชัดเจนและเปลี่ยนข้อความทันทีโดยไม่ reload media/หน้าต่าง
- Compact ใช้ภาษาที่เลือกเดียวกันโดยไม่มีตัวสลับเพิ่มใน overlay เพื่อคงขอบเขต
  minimal; ผู้ใช้กลับ Full เพื่อเปลี่ยนภาษา
- ค่าเริ่มต้นของโปรไฟล์ที่ยังไม่มีค่าภาษาเป็น **ENG** โดยไม่ตรวจจับ
  browser/Windows locale อัตโนมัติ เมื่อเลือก TH ให้จำค่าข้ามการเปิดแอปและ
  Full/Compact; เก็บใน `lalin-play:v1:locale` แยกจาก playback/EQ state
- ค่า locale ที่เสียหรือไม่รองรับ fallback เป็น ENG; เปลี่ยน `<html lang>` ให้
  ตรงกับ `en` หรือ `th` และ localize ชื่อ accessible/aria ด้วย
- ข้อความใน native OS title bar, Windows file picker และข้อความจาก Windows
  เองยังใช้ภาษาระบบ; strings จาก Lalin Play ที่นำมาแสดงใน error/banner ต้องมี
  translation key และไม่ผสมภาษาแบบไม่ตั้งใจ
- ใช้ typed local dictionary/translation helper แบบ offline; ไม่เพิ่มบริการ
  network, remote translation หรือ dependency ใหม่โดยไม่จำเป็น

### Stereo and virtual surround modes

- **Stereo**: ส่งเสียง 2-channel ผ่าน graph ปัจจุบัน ไม่มี matrix upmix หรือ
  HRTF processing เพิ่ม
- **Virtual 7.1 (หูฟัง)**: รับ source stereo, สร้าง virtual speaker feeds ด้วย
  stereo matrix upmix แล้ว render ตำแหน่งลำโพงเสมือนผ่าน HRTF ลง output stereo
  สำหรับหูฟังที่เลือกไว้ใน Play; UI ระบุชัดว่าเป็นการจำลองจาก stereo ไม่ใช่
  การถอดรหัสสัญญาณ 7.1 จริงหรือ output 8-channel
- เปิดโหมด surround เป็น opt-in; ค่าเริ่มต้นเป็น Stereo และการสลับโหมดไม่หยุด
  หรือเริ่มเพลงใหม่
- ไม่มีการจับเสียง Windows แบบ loopback, ไม่แทรกเสียงจากแอปอื่น, ไม่เปิดไมค์
  และไม่สร้าง Windows virtual endpoint/driver ใน CR นี้
- ไม่มี personalized HRTF, head tracking, room correction, mic monitoring,
  reverb/delay หรือระบบ preset หลาย channel ใน V1

Web Audio `PannerNode` แบบ `HRTF` ให้ spatialized stereo output จากแหล่งเสียง
ที่จัดตำแหน่งใน 3D; อัลกอริทึม matrix upmix ของ Play ต้องถูกระบุและรับฟัง
ก่อนอ้างว่าได้ผลดี ไม่ควรใช้คำว่า native/true 7.1

### Signal and ownership proposal

```text
Existing media source
  → Media channel gain / mute
  → Existing EQ (10 bands + preamp)
  → Stereo direct OR stereo matrix upmix + virtual-speaker HRTF
  → Existing limiter
  → Existing Master volume / mute
  → Existing analyser and selected output
```

- Keep exactly one playback owner, Web Audio context, shared EQ/spatial/limiter/
  master graph, MediaSession and output routing. Full/Compact switches do not
  rebuild the graph, reload media or reset the selected spatial mode.
- Approved CR-008 exception (2026-10-20): an audio-only transition may use two
  reusable media decoders with individual deck gains feeding that same graph.
  Video continues through its single persistent visible media element and never
  overlaps; the Compact preview exception remains paused, muted and outside the graph.
- Construct/disconnect spatial nodes within `PlaybackAudioEngine`; do not create
  another player or attach a second `MediaElementAudioSourceNode` to the element.
- Persist only the new Media channel gain/mute and spatial mode in a new versioned
  Play local-storage key. Master volume, output and EQ keep their existing owners
  and persistence contracts.
- Clamp gain and keep the existing limiter after all mix/spatial paths. Switching
  modes crossfades or ramps gains to avoid clicks; failed graph setup falls back
  to Stereo and reports that fallback instead of claiming surround is active.

## Acceptance proposal

1. Mixer shows only MEDIA and MASTER; fader, mute, output selection and EQ shortcut
   control the real Play signal path. No empty/fake Game/Chat/Aux/Mic lanes appear.
2. MEDIA and MASTER gain/mute have distinct, predictable behavior; transport
   volume still maps to MASTER and the existing EQ still affects Play audio only.
3. Stereo is the default and preserves direct stereo playback. Switching to
   Virtual 7.1 is immediate, repeatable, click-free, and does not restart media.
4. Virtual 7.1 processes stereo input into a binaural stereo headphone signal;
   UI and docs never claim true 7.1 decode or Windows-wide audio routing.
5. Full/Compact transitions and track changes keep one owner, queue, position,
   output, EQ, mixer settings and active mode; reload preserves the new mixer state.
6. Windows native playback evidence compares Stereo and Virtual 7.1 through the
   selected headphone endpoint and records CPU/latency behavior and limitations.
   This is separate from code/build checks and user audible acceptance.
7. When no locale preference exists, the app displays ENG on first launch; `ENG | TH`
   switches all Play-owned UI strings immediately, persists across restart and
   Full/Compact changes, and does not alter media metadata, playback or EQ state.
8. Both languages cover visible text, errors, tooltips and accessibility labels;
   no Lalin-owned control or message is left unintentionally mixed in the other language.

## Approved CR-008 decoder-count amendment (2026-10-20)

The user approved an audio-only second deck for crossfade in CR-008. This changes
the media-decoder count only: the single playback session, queue-advance owner,
AudioContext, MEDIA gain, EQ/spatial processing, limiter, MASTER/output path and
MediaSession remain shared. The active video stage stays on its existing element
and does not crossfade. Transition scheduling belongs to the PC audio clock, not
React renders or mobile messages.

## Implementation and verification record after approval

1. Implemented the Full Mixer with MEDIA/MASTER only, persistent media gain/mute,
   existing master volume/output selection and a shortcut to the original EQ.
2. Implemented an offline ENG/TH dictionary; ENG is the default, the Full topbar
   switch persists locale and Compact reads the same provider value.
3. Added media gain/mute before the existing EQ, and kept master volume after the
   limiter in the same playback engine and AudioContext.
4. Added opt-in stereo-matrix virtual-speaker feeds through eight HRTF panners,
   ramped direct/spatial gains and Stereo fallback when graph creation fails.
5. `npm run build` passed; `npm test -- --reporter=dot` passed all 14 files and
   81 tests, including locale/mute labels, mixer persistence, channel surface,
   HRTF graph construction, gain ramps and fallback.
6. Windows native headphone comparison, audible quality, CPU/latency profiling
   and real output-device transition evidence remain NOT_RUN.

## Out of scope and possible later work

- System-wide Sonar-like Game/Chat/Aux/Mic routing for arbitrary Windows apps.
  That requires a separately designed virtual audio device/driver and routing
  lifecycle; the current Play Web Audio graph only owns Play's media stream.
- Eight-channel output to physical 7.1 speakers, decode of encoded surround
  formats, game positional-audio integration or per-application capture.
- CMF Buds Pro 2 ANC/device controls, Windows-wide EQ, operating-system volume
  mixer replacement, Studio mixer integration and a new audio driver installer.
- Localizing Lalin Studio, APIs, OS dialogs/title bars, media metadata and
  third-party system messages.

If system-wide routing is the intended meaning of “แบบ Sonar”, that must be a
separate architecture proposal with driver install/update/signing, privacy,
uninstall/recovery and multi-app routing acceptance. Microsoft's SysVAD sample
illustrates the scope of a virtual-device driver; it is not a production driver
or a drop-in component for this player.

## Technical references

- [Windows Audio Architecture — Microsoft Learn](https://learn.microsoft.com/en-us/windows-hardware/drivers/audio/windows-audio-architecture)
- [SysVAD Virtual Audio Device Driver Sample — Microsoft Learn](https://learn.microsoft.com/en-us/samples/microsoft/windows-driver-samples/sysvad-virtual-audio-device-driver-sample/)
- [Web Audio API 1.1 — W3C](https://www.w3.org/TR/webaudio-1.1/)

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.1b | 2026-10-20 | beta | Record full 14-file/81-test pass and localized mixer mute labels; native headphone acceptance remains open | working tree | Codex |
| 0.2.0b | 2026-10-20 | beta | Record user approval and local implementation/build/unit-test evidence; leave Windows headphone acceptance open | working tree | Codex |
| 0.1.1b | 2026-10-20 | candidate | Add ENG/TH UI localization with ENG default across Lalin Play Full/Compact to the doc-first proposal | working tree | Codex |
| 0.1.0b | 2026-10-20 | candidate | Propose Play-only Sonar-inspired MEDIA/MASTER mixer and stereo-to-binaural virtual surround; await doc-first approval | working tree | Codex |
