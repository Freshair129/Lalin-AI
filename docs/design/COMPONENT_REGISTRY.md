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

คอลัมน์ **"ใช้ที่ไหน"** = ไฟล์ที่ **เรนเดอร์จริง** ไม่ใช่แค่ `import` type
สามไฟล์ที่ชื่อไฟล์ไม่ตรงกับชื่อที่ export (`MicRecorder` → `useMicRecorder`/`MicRecordIndicator`, `Dialog` → `useDialogHost`, `icons` → `Icon`) จดตามชื่อที่ export จริง

---

## 1. Workspace / DAW core (FR-09)

| Component | ใช้ที่ไหน | หน้าที่ + สัญญาสำคัญ |
|-----------|----------|---------------------|
| **StudioDock** | App.tsx, RemixPanel | "พื้น" ของ workspace — ห่อ `ClipTimeline` + ปุ่ม 🤖 เปิด `MixCopilot` + `ContextMenu` ของ clip · ดึง engine จาก `useEngine()` และ master FX (reverb/echo/comp) + ความสูง dock จาก `useRemixStore` · สูงลากปรับได้ 130–620px (double-click reset = 230) · `App.tsx` แสดง dock เฉพาะแท็บ studio และ **ยกเว้น `arrange`** เพราะ RemixPanel เรนเดอร์ dock เองอยู่แล้ว |
| **ClipTimeline** | StudioDock | timeline หลัก (ไฟล์ใหญ่สุดในโปรเจกต์): ruler + beat grid, ลาก/snap/slice/clone/fade, playback ผ่าน Web Audio, loop region, metronome, master FX chain · ฝัง `StereoMeter` · `ChannelMeterBalance` · `MicRecordIndicator` · ยิง `onContext` ขึ้นไปให้ StudioDock เปิดเมนู |
| **Timeline** | — (**ไม่ถูกเรนเดอร์แล้ว**) | มุมมอง waveform track รุ่นแรก — ถูกแทนที่ด้วย `ClipTimeline` · ยังคงไฟล์ไว้เพราะเป็นแหล่งของ `export type TrackView` ที่ RemixPanel/PropertiesPanel import อยู่ ⚠️ ถ้าจะลบต้องย้าย type ออกก่อน |
| **PropertiesPanel** | RemixPanel | dock แก้พารามิเตอร์ของ track ที่เลือก — `{track, outputName, onToggle(mute\|solo\|lock), onExport, exporting}` · `track = null` → แสดง empty state |
| **LibraryPanel** | RemixPanel | คลัง sample/pack ที่ลากไปวางบน timeline ได้ — export `CLIP_DRAG_MIME` + `LibraryDragPayload {src, label, color}` เป็นสัญญาของ dataTransfer (drop handler อยู่ฝั่ง ClipTimeline) · ดึงข้อมูลจาก `GET /packs` + `/files/input/{name}` |
| **StemMixer** | RemixPanel | เฟดเดอร์แยก stem (vocals/drums/bass/other, 0–1.5×) → ส่งเป็น `stem_gains` ให้ `POST /music/remix` · export `DEFAULT_STEM_GAINS` · ⚠️ มีผลเฉพาะเมื่อ backend แยก stem เต็ม 4 ทาง — ไม่ส่ง `stem_gains` เลย backend จะใช้ two-stems (เร็วกว่า) — FR-09.9 |
| **FxRack** | RemixPanel | แร็ค FX รวม: autotune/vocal FX (reverb·delay), offset (auto\|ms), LUFS, master FX (reverb·echo·comp) — ประกอบจาก `Knob` ห่อด้วย `Tilt` |
| **MicRecorder** | ClipTimeline | อัดเสียงจากไมค์ — export **hook** `useMicRecorder()` (start/stop/cancel + อัปโหลดขึ้น `POST /files/upload` อัตโนมัติ) และ component `MicRecordIndicator` (จุดแดง + เวลา) · ปล่อย stream เสมอตอน cancel/unmount — FR-12 |

## 2. AI (FR-14)

| Component | ใช้ที่ไหน | หน้าที่ + สัญญาสำคัญ |
|-----------|----------|---------------------|
| **MixCopilot** | StudioDock | ฝั่ง frontend ของ propose-only agent — ส่งคำสั่ง + project state ไป `POST /agent/act` แล้วแสดง `AgentMutation[]` ให้ผู้ใช้กด "ใช้" รายตัวหรือ "ใช้ทั้งหมด" · commit ผ่าน engine → undo ได้ (FR-14.5/14.6) · op ที่ engine ยังไม่รองรับ (set_pan/set_fx/set_lufs) แสดงเป็นข้อเสนออ่านอย่างเดียว (FR-14.7) |

## 3. มิเตอร์ & คอนโทรล (atoms)

| Component | ใช้ที่ไหน | หน้าที่ + prop สำคัญ |
|-----------|----------|---------------------|
| **Knob** | FxRack, RemixPanel | ลูกบิดหมุน SVG — `{value, min=0, max=1, onChange, label, color="#c7f046", format?, size=52, disabled}` · ลากแนวตั้งเพื่อปรับค่า |
| **Meter** | RemixPanel | มิเตอร์ค่าเดี่ยวแนวตั้ง (ดีฟอลต์ LUFS/INTEGRATED) — `{value, min=-30, max=0, label, unit, height=110, format?}` |
| **StereoMeter** | ClipTimeline | มิเตอร์ L/R จาก Web Audio — `{analyserL, analyserR, height=90, active=false, barWidth=9, showLabels}` · วาดเมื่อ `active` เท่านั้น |
| **ChannelMeterBalance** | ClipTimeline | มิเตอร์ + balance ในตัวเดียว: แถบ L/R แนวนอนวิ่งตามระดับเสียงจริง และ**ลากซ้าย-ขวาเพื่อปรับ pan (-1..1)** · double-click = กลับกลาง |
| **Waveform** | RemixPanel | วาด waveform จาก URL — `{src, height=48}` · decode ผ่าน shared peaks utility |

## 4. Shell / UI primitives

| Component | ใช้ที่ไหน | หน้าที่ + prop สำคัญ |
|-----------|----------|---------------------|
| **JobProgress** | TTSPanel, DubbingPanel, MasteringPanel, MixCopilot | badge สถานะ (⏳/⚙️/✅/❌) + progress bar + audio player + ดาวน์โหลด + error — FR-06 |
| **UpdateChecker** | App.tsx | ปุ่มตรวจอัปเดต + overlay dialog (version/notes/ติดตั้ง/รีสตาร์ท) ผ่าน Tauri updater — FR-08 |
| **ContextMenu** | StudioDock, FileManager | เมนูคลิกขวา — `{x, y, items: MenuItem[], onClose}` · `MenuItem` รองรับ `icon` · `shortcut` · `danger` · `disabled` · `{type:"sep"}` · ปิดเมื่อคลิกนอก/Esc |
| **Dialog** | RemixPanel | modal แทน `window.prompt`/`confirm` — export **hook** `useDialogHost()` → `{prompt, confirm, node}` · `prompt()` → `Promise<string \| null>` (null = ยกเลิก), `confirm()` → `Promise<boolean>` · Enter = ตกลง, Esc = ยกเลิก |
| **Splitter** | StudioDock, RemixPanel | เส้นแบ่งลากย่อ/ขยาย — `axis "x"` = ปรับกว้าง, `"y"` = ปรับสูง · `onDelta(d)` + `onReset()` (double-click) |
| **Tilt** | FxRack, MarketplacePanel | ห่อ children ให้เอียงตามเมาส์ (parallax) — `{max=8, scale=1.0}` · เอฟเฟกต์ล้วน ไม่มี state |
| **icons** | App.tsx, ClipTimeline, ContextMenu, FileManager, LibraryPanel, RemixPanel | ชุด line icon (`stroke=currentColor`) — export `<Icon name size />` |

## 5. Remix node UI

| Component | ใช้ที่ไหน | หน้าที่ + สัญญาสำคัญ |
|-----------|----------|---------------------|
| **NodeDesigner** | RemixPanel | เครื่องมือออกแบบโหนดเอง — คืน `CustomNodeConfig {name, width, height, skin: glass\|flat\|dark, btmHeight, elements[]}` ผ่าน `onCreate` · เป็นก้าวแรกไปสู่ drag-connect graph เต็ม (ตอนนี้ node graph หลักยัง static) |

---

## 6. หนี้ที่พบระหว่างจด

- [ ] ลบ `Timeline.tsx` ที่ไม่ถูกเรนเดอร์แล้ว — ต้องย้าย `export type TrackView` ออกไปที่ store/types ก่อน
- [ ] `apps/desktop/src/components/` ยังไม่มี `@req` annotation (ถูกใส่ไว้ใน `backend/`+`frontend/` ยุคก่อน migration แล้วหายไปตอนย้ายเข้า `apps/`) — ทำให้ coverage ของ doc-graph อ่านเป็น 0%
- [ ] `BLUEPRINT.yaml § views` + `§ sitemap.shell` ยังเป็นของยุค G-Music (6 แท็บ / sidebar 230px) ขณะที่ `App.tsx` มี 8 แท็บ — SoT ของ nav คือ [LALIN_SITEMAP_SOT.md](LALIN_SITEMAP_SOT.md)

---

อัปเดตเอกสารนี้เมื่อเพิ่ม/ลบ/เปลี่ยนสัญญาของ component ใน `apps/desktop/src/components/`
และอัปเดต `BLUEPRINT.yaml § components` คู่กันเสมอ — `tools/doc_graph_scan.py` จะรายงาน
component ที่ยังไม่จดเป็น stale node
