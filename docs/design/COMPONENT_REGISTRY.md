# Component Registry — `apps/desktop/src/components/`

**Status:** active
**Scope:** component ร่วมทั้งหมดที่ **ไม่ใช่ destination** — ตัวที่เป็น destination/แท็บ ดูที่
[LALIN_SITEMAP_SOT.md](LALIN_SITEMAP_SOT.md)
**Companion:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md) · [LALIN_LAYOUT_SOT.md](LALIN_LAYOUT_SOT.md)
**Machine-readable:** [`docs/architecture/BLUEPRINT.yaml` § components](../architecture/BLUEPRINT.yaml)
— ตรวจ drift ด้วย `tools/doc_graph_scan.py`

---

## วิธีอ่าน

`apps/desktop/src/components/` มี 32 ไฟล์ — 10 ตัวเป็น view/panel ที่ `App.tsx` ผูกกับแท็บโดยตรง ส่วนอีก 22 ตัวคือ component ร่วมในเอกสารนี้

หัวข้อ §1–§4 ใช้ชื่อกลุ่มเดียวกับ `BLUEPRINT.yaml § components` เพื่อให้อ่านคู่กันได้ 1:1
เอกสารนี้เพิ่มสิ่งที่ YAML ไม่มี: **prop/สัญญาที่เรียกใช้จริง** และคอลัมน์ **"ใช้ที่ไหน"**

คอลัมน์ **"ใช้ที่ไหน"** = ไฟล์ที่ **เรนเดอร์จริง** ไม่ใช่แค่ `import` type
สามไฟล์ที่ชื่อไฟล์ไม่ตรงกับชื่อที่ export (`MicRecorder` → `useMicRecorder`/`MicRecordIndicator`, `Dialog` → `useDialogHost`, `icons` → `Icon`) จดตามชื่อที่ export จริง

---

## 1. `studio_floor` — พื้น DAW (FR-09 · FR-12 · FR-14)

| Component | ใช้ที่ไหน | หน้าที่ + สัญญาสำคัญ |
|-----------|----------|---------------------|
| **StudioDock** | App.tsx, RemixPanel | "พื้น" ของ workspace — ห่อ `ClipTimeline` + ปุ่ม 🤖 เปิด `MixCopilot` + `ContextMenu` ของ clip · ดึง engine จาก `useEngine()` และ master FX (reverb/echo/comp) + ความสูง dock จาก `useRemixStore` · สูงลากปรับได้ 130–620px (double-click reset = 230) · `App.tsx` mount dock เฉพาะแท็บ `dubbing`/`mastering` — แท็บ `arrange` ไม่ mount ซ้ำเพราะ `RemixPanel` embed dock เองอยู่แล้ว |
| **ClipTimeline** | StudioDock | timeline หลัก (ไฟล์ใหญ่สุดในโปรเจกต์): ruler + beat grid, ลาก/snap/slice/clone/fade, playback ผ่าน Web Audio, loop region, metronome, master FX chain · ฝัง `StereoMeter` · `ChannelMeterBalance` · `MicRecordIndicator` · ยิง `onContext` ขึ้นไปให้ StudioDock เปิดเมนู · รับ drop จาก `LibraryPanel` |
| **Timeline** | — (**ไม่ถูกเรนเดอร์แล้ว**) | track strip รุ่น Wave 2.1 — ถูกแทนที่ด้วย `ClipTimeline` · ยังคงไฟล์ไว้เพราะเป็นแหล่งของ `export type TrackView` ที่ RemixPanel/PropertiesPanel import อยู่ ⚠️ ถ้าจะลบต้องย้าย type ออกก่อน |
| **MixCopilot** | StudioDock | ฝั่ง frontend ของ propose-only agent — ส่งคำสั่ง + project state ไป `POST /agent/act` แล้วแสดง `AgentMutation[]` ให้ผู้ใช้กด "ใช้" รายตัวหรือ "ใช้ทั้งหมด" · commit ผ่าน engine → undo ได้ (FR-14.5/14.6) · op ที่ engine ยังไม่รองรับ (`set_pan`/`set_fx`/`set_lufs`) แสดงเป็นข้อเสนออ่านอย่างเดียว (FR-14.7) |
| **MicRecorder** | ClipTimeline | อัดเสียงจากไมค์ — export **hook** `useMicRecorder()` (start/stop/cancel + อัปโหลดขึ้น `POST /files/upload` อัตโนมัติ) และ component `MicRecordIndicator` (จุดแดง + เวลา) · ปล่อย stream เสมอตอน cancel/unmount — FR-12 |

## 2. `remix_studio` — ประกอบร่างใน RemixPanel

| Component | ใช้ที่ไหน | หน้าที่ + สัญญาสำคัญ |
|-----------|----------|---------------------|
| **NodeDesigner** | RemixPanel | ออกแบบ custom node เพิ่มลง React Flow canvas — คืน `CustomNodeConfig {name, width, height, skin: glass\|flat\|dark, btmHeight, elements[]}` ผ่าน `onCreate` |
| **LibraryPanel** | RemixPanel | คลัง asset ที่ลากไปวางบน timeline ได้ — export `CLIP_DRAG_MIME` + `LibraryDragPayload {src, label, color}` เป็นสัญญาของ dataTransfer (drop handler อยู่ฝั่ง `ClipTimeline`) · ดึงข้อมูลจาก `GET /packs` + `/files/input/{name}` |
| **PropertiesPanel** | RemixPanel | dock แก้พารามิเตอร์ของ track ที่เลือก — `{track, outputName, onToggle(mute\|solo\|lock), onExport, exporting}` · `track = null` → แสดง empty state |
| **FxRack** | RemixPanel | แร็ค FX รวม: autotune/vocal FX (reverb·delay), offset (auto\|ms), LUFS, master FX (reverb·echo·comp) — ประกอบจาก `Knob` ห่อด้วย `Tilt` |
| **StemMixer** | RemixPanel | เฟดเดอร์แยก stem (vocals/drums/bass/other, 0–1.5×) → ส่งเป็น `stem_gains` ให้ `POST /music/remix` · export `DEFAULT_STEM_GAINS` · ⚠️ มีผลเฉพาะเมื่อ backend แยก stem เต็ม 4 ทาง — ไม่ส่ง `stem_gains` เลย backend จะใช้ two-stems (เร็วกว่า) — FR-09.9 |

## 3. `meters_controls` — มิเตอร์ & คอนโทรล

| Component | ใช้ที่ไหน | หน้าที่ + prop สำคัญ |
|-----------|----------|---------------------|
| **Waveform** | RemixPanel | วาด waveform จาก URL — `{src, height=48}` · decode ผ่าน shared peaks utility |
| **Knob** | FxRack, RemixPanel | ลูกบิดหมุน SVG — `{value, min=0, max=1, onChange, label, color="#c7f046", format?, size=52, disabled}` · ลากแนวตั้งเพื่อปรับค่า · ⚠️ **ยังไม่มี** double-click reset (มีเฉพาะใน `Splitter`) |
| **Meter** | RemixPanel | มิเตอร์ค่าเดี่ยวแนวตั้ง (ดีฟอลต์ LUFS/INTEGRATED) — `{value, min=-30, max=0, label, unit, height=110, format?}` |
| **StereoMeter** | ClipTimeline | มิเตอร์ L/R จาก Web Audio — `{analyserL, analyserR, height=90, active=false, barWidth=9, showLabels}` · วาดเมื่อ `active` เท่านั้น |
| **ChannelMeterBalance** | ClipTimeline | มิเตอร์ + balance ในตัวเดียว: แถบ L/R แนวนอนวิ่งตามระดับเสียงจริง และ**ลากซ้าย-ขวาเพื่อปรับ pan (-1..1)** · double-click = กลับกลาง |

## 4. `shell_utility` — shell / UI primitives

| Component | ใช้ที่ไหน | หน้าที่ + prop สำคัญ |
|-----------|----------|---------------------|
| **Splitter** | StudioDock, RemixPanel | เส้นแบ่งลากย่อ/ขยาย — `axis "x"` = ปรับกว้าง, `"y"` = ปรับสูง · `onDelta(d)` + `onReset()` (double-click) |
| **Tilt** | FxRack, MarketplacePanel | ห่อ children ให้เอียงตามเมาส์ (parallax) — `{max=8, scale=1.0}` · เอฟเฟกต์ล้วน ไม่มี state · **ปิดเองเมื่อ `prefers-reduced-motion: reduce`** |
| **ContextMenu** | StudioDock, FileManager | เมนูคลิกขวา — `{x, y, items: MenuItem[], onClose}` · `MenuItem` รองรับ `icon` · `shortcut` · `danger` · `disabled` · `{type:"sep"}` · ปิดเมื่อคลิกนอก/Esc |
| **Dialog** | RemixPanel | modal แทน `window.prompt`/`confirm` — export **hook** `useDialogHost()` → `{prompt, confirm, node}` · `prompt()` → `Promise<string \| null>` (null = ยกเลิก), `confirm()` → `Promise<boolean>` · Enter = ตกลง, Esc = ยกเลิก |
| **JobProgress** | TTSPanel, DubbingPanel, MasteringPanel, MixCopilot | badge สถานะ (⏳/⚙️/✅/❌) + progress bar + audio player + ดาวน์โหลด + error — FR-06 |
| **UpdateChecker** | App.tsx | ปุ่มตรวจอัปเดต + overlay dialog (version/notes/ติดตั้ง/รีสตาร์ท) ผ่าน Tauri updater — FR-08 |
| **icons** | App.tsx, ClipTimeline, ContextMenu, FileManager, LibraryPanel, RemixPanel | ชุด line icon (`stroke=currentColor`) — export `<Icon name size />` |

---

## 5. Lalin Play TV presentation (CR-002 / FR-18)

| Component / adapter | ใช้ที่ไหน | หน้าที่ + สัญญาสำคัญ |
|---|---|---|
| **LalinPlayWindow** | `play` surface | เจ้าของ consumer playback เพียงจุดเดียว; สลับ normal/TV presentation โดยไม่ reset queue, EQ หรือ Now Playing; มีปุ่มเข้า/ออกและ stable accessibility hooks |
| **tvMode.ts** | `LalinPlayWindow` | pure keyboard/gamepad semantic mapping และ lifecycle cleanup; ไม่เรียก backend และไม่สร้าง engine |
| **windowManager fullscreen adapter** | `LalinPlayWindow` | native `play` window หรือ browser Fullscreen API; รายงาน actual state และ Thai error เมื่อ unavailable |

TV layout และ focus order อยู่ใน [LALIN_PLAY_TV_MODE_SPEC.md](LALIN_PLAY_TV_MODE_SPEC.md)
และ architecture boundary อยู่ใน [LALIN_PLAY_TV_MODE_PLAN.md](../architecture/LALIN_PLAY_TV_MODE_PLAN.md)

---
## 6. หนี้ที่พบระหว่างจด

- [ ] ลบ `Timeline.tsx` ที่ไม่ถูกเรนเดอร์แล้ว — ต้องย้าย `export type TrackView` ออกไปที่ store/types ก่อน
- [x] `@req` annotation ครบทั้ง `apps/api` + `apps/desktop` แล้ว (78 ไฟล์) — `requirements_with_code_annotations` = 100% (22/22)
- [x] `BLUEPRINT.yaml § sitemap` + `§ views` resync กับ Lalin Studio shell 8 แท็บแล้ว — product IA ยังอ่านที่ [LALIN_SITEMAP_SOT.md](LALIN_SITEMAP_SOT.md)
- [x] Lalin Play TV presentation contract mapped to `LalinPlayWindow` and the playback fullscreen/input adapters

---

อัปเดตเอกสารนี้เมื่อเพิ่ม/ลบ/เปลี่ยนสัญญาของ component ใน `apps/desktop/src/components/`
และอัปเดต `BLUEPRINT.yaml § components` คู่กันเสมอ — `tools/doc_graph_scan.py` จะรายงาน
component ที่ยังไม่จดเป็น stale node
