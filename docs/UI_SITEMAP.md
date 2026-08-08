# UI Sitemap · Layout · View Details — G-Music

**วันที่:** 2026-08-09 (Wave 2-5: global workspace + clip timeline + agent + files/packs/plugins)
**Design language:** Cinemaro-inspired (นีออนไลม์ + space dark + การ์ดมน 16px + pill toggle)
**Theme:** [frontend/src/styles.css](../frontend/src/styles.css)
**Machine-readable:** [BLUEPRINT.yaml](BLUEPRINT.yaml) (sitemap/views/components ต้องตรงกับไฟล์นี้เสมอ)

---

## 1. Site Map

```
G-Music (single-window desktop DAW, Tauri — App.tsx)
│
├─ Topbar (เต็มกว้างแบบ DAW)
│   ├─ Brand "G-MUSIC"
│   ├─ Tab context (icon + label ของแท็บปัจจุบัน)
│   └─ UpdateChecker (ปุ่มเช็คอัปเดต / overlay dialog)
│
├─ Body
│   ├─ Icon rail (ซ้าย — line icons จาก icons.tsx, hover = tooltip)
│   │   ├─ voices     คลังเสียง    → VoicesPanel
│   │   ├─ tts        อ่านข้อความ  → TTSPanel          [studio]
│   │   ├─ dubbing    พากย์เสียง    → DubbingPanel      [studio]
│   │   ├─ mastering  Mastering    → MasteringPanel    [studio]
│   │   ├─ remix      Remix        → RemixPanel        [studio · full-bleed]
│   │   ├─ files      Files        → FileManager       [full-bleed]
│   │   ├─ market     Marketplace  → MarketplacePanel
│   │   ├─ queue      คิวงาน       → BatchQueue
│   │   ├─ plugins    ปลั๊กอิน      → PluginsPanel
│   │   └─ brain      สมอง         → BrainPanel
│   └─ Stage (พื้นที่ view — remix/files เต็มจอ, ที่เหลือห่อ .stage-pad)
│
├─ StudioDock — timeline "พื้น DAW" ถาวร (แสดงบนแท็บ [studio] ข้างบน)
│   ├─ ClipTimeline (multitrack clips — engine ร่วมทั้งแอป)
│   ├─ Splitter แนว y (ลากปรับความสูง dock)
│   └─ MixCopilot (แชทสั่ง mix ด้วยสมอง — เปิด/ปิดได้)
│
└─ Statusbar (ล่าง, monospace): ● ONLINE/OFFLINE · BRAIN: provider · 127.0.0.1:8756 · v0.1.0

Overlay (ลอยทับ)
├─ Update dialog (version + notes + ติดตั้ง/รีสตาร์ท)
├─ ContextMenu (คลิกขวา clip บน timeline)
├─ Dialog (prompt/confirm แทน window.prompt — useDialogHost)
└─ NodeDesigner (ออกแบบ custom node — เฉพาะใน Remix)
```

**สถานะร่วม:**
- `App.tsx` — `tab`, `online` (ping `/health` ทุก 10 วิ), `brainName`
- `EngineProvider` → `useClipEngine` — tracks/clips/undo ของ timeline **แชร์ทุกแท็บ** ([store/engineContext.tsx](../frontend/src/store/engineContext.tsx))
- `useRemixStore` (zustand) — พารามิเตอร์ remix + master-fx (reverb/echo/comp) + layout (ความกว้าง dock ฯลฯ)
- clip engine ล้วนอยู่ใน [frontend/src/timeline/](../frontend/src/timeline/) (clipModel/grid/ops/peaks/useClipEngine + unit tests)

---

## 2. Global Layout

```
┌────────────────────────────────────────────────────────────────┐
│ TOPBAR   ◆ G-MUSIC        ⌂ แท็บปัจจุบัน                🔄 update │
├───┬────────────────────────────────────────────────────────────┤
│ R │  STAGE                                                     │
│ A │   ┌─ .stage-pad (.panel การ์ดมน) ─────────────┐            │
│ I │   │  view ปกติ: voices/tts/dubbing/mastering/  │            │
│ L │   │  market/queue/plugins/brain                │            │
│   │   └────────────────────────────────────────────┘            │
│ ▢ │   (remix + files = full-bleed ไม่มี .stage-pad)             │
│ ▢ │                                                            │
│ ▢ ├────────────────────────────────────────────────────────────┤
│ ▢ │  STUDIO DOCK (แท็บ studio เท่านั้น)          [MixCopilot ▸] │
│ ▢ │  ── Splitter y ──                                          │
│   │  ▷ ‖ track1 ▬▬▬▬▬▬  clip ▓▓▓▓ ▓▓▓                          │
│   │    ‖ track2 ▬▬▬  clip ▓▓▓▓▓▓                               │
├───┴────────────────────────────────────────────────────────────┤
│ STATUSBAR  ● ONLINE · BRAIN: ollama          127.0.0.1:8756 · v │
└────────────────────────────────────────────────────────────────┘
```

**Breakpoint:** desktop-first (หน้าต่าง Tauri min 900×600, default 1200×820) — ไม่มี mobile

---

## 3. รายละเอียดแต่ละ View

### 3.1 คลังเสียง — `VoicesPanel`
**หน้าที่:** จัดการคลังเสียงอ้างอิงสำหรับโคลน

| ส่วน | รายละเอียด |
|------|-----------|
| ฟอร์มเพิ่มเสียง | `ชื่อเสียง` (text), `ข้อความในไฟล์/ref text` (text), `ภาษา` (ไทย/English), `ไฟล์เสียง .wav` (file) |
| ปุ่ม | `+ เพิ่มเสียง` → `POST /voices` (multipart) |
| รายการเสียง | `.voice-list` → แต่ละ `.voice-item`: ชื่อ + `.tag` ภาษา + ปุ่ม `.danger` ลบ (`DELETE /voices/{id}`) |
| empty state | "ยังไม่มีเสียงในคลัง" |

**API:** `GET/POST /voices`, `DELETE /voices/{id}`

---

### 3.2 อ่านข้อความ — `TTSPanel` [studio]
**หน้าที่:** สังเคราะห์เสียงจากข้อความ + โคลนเสียง

| ส่วน | รายละเอียด |
|------|-----------|
| input | `ข้อความ` (textarea), `เลือกเสียง` (dropdown จากคลัง), `ภาษา` (th/en), `ความเร็ว` (slider 0.5–1.5×) |
| ปุ่ม | `สร้างเสียง` → `POST /tts` → job |
| output | `JobProgress` (bar + player + ดาวน์โหลด) — ผลลัพธ์ลากลง timeline ได้ |

**API:** `POST /tts` → `{job_id}` → WS `/jobs/ws/{id}`

---

### 3.3 พากย์เสียง — `DubbingPanel` [studio]
**หน้าที่:** พากย์ไฟล์เสียง/วิดีโอเป็นภาษาอื่นด้วยเสียงโคลน

| ส่วน | รายละเอียด |
|------|-----------|
| input | อัปโหลดไฟล์ต้นฉบับ (เสียง/วิดีโอ), `เลือกเสียงพากย์`, `ภาษาเป้าหมาย` (ไทย/English), `แปลภาษา` (checkbox) |
| ปุ่ม | `เริ่มพากย์` → upload → `POST /dubbing` → job |
| ตัวช่วยเกลาบท | ป้อนประโยค + `target_sec` + โทน (formal/casual) → `POST /dubbing/refine` → สมองเขียนใหม่ให้พูดทันช่องเวลา (แก้แปลแล้วยาวเกิน) |
| output | `JobProgress` (รายงานทีละ segment) |

**API:** `POST /files/upload` → `POST /dubbing` → job · `POST /dubbing/refine`

---

### 3.4 Mastering — `MasteringPanel` [studio]
**หน้าที่:** มาสเตอร์เสียง/เพลงระดับเผยแพร่

| ส่วน | รายละเอียด |
|------|-----------|
| input | `เพลงต้นฉบับ` (upload, required), `เพลงอ้างอิง` (upload, optional → เปิด Matchering), `LUFS` (dropdown -14/-16/-9), `ฟอร์แมต` (wav/mp3) |
| ปุ่ม | `มาสเตอร์` → job |
| output | `JobProgress` |

**API:** `POST /mastering` → job
**โหมด:** มี reference = Matchering / ไม่มี = auto LUFS (+ pedalboard.Limiter กันพีค)

---

### 3.5 Remix — `RemixPanel` [studio · full-bleed]
**หน้าที่:** สตูดิโอเก็บงานเพลง (Suno finishing studio) — วางเสียงร้องบน beat อื่น + autotune + FX + master
**Paradigm:** Node workflow บน **React Flow** (`@xyflow/react`) — canvas เต็มจอ สไตล์ Cinemaro

**Layout:**
```
┌─ Toolbar ── [Remix] · โปรเจกต์ (save/load) · ▶ Run · สถานะ job ─────────┐
├──────────┬─Splitter x─────────────────────────────────────────────────┤
│ LEFT DOCK│  CANVAS (React Flow)                                        │
│ ┌──────┐ │   ● Source ─► ● Stem Split ─► ● Auto-tune ─► ● Vocal FX ─┐  │
│ │Library│ │   ● Beat ──────────────────────────────────► ● Mix ◄────┘  │
│ │──────│ │                              ● Master ◄─ ● Mix              │
│ │Props  │ │   (custom node จาก NodeDesigner: text | subpatch | lfo)     │
│ └──────┘ │                                                             │
├──────────┴─────────────────────────────────────────────────────────────┤
│ RACK: FxRack (Knob reverb/delay + autotune) · StemMixer (4 เฟดเดอร์)     │
│       Meter LUFS · Waveform ผลลัพธ์                                     │
└────────────────────────────────────────────────────────────────────────┘
```

**โหนด pipeline (map → `POST /music/remix`):**

| โหนด | input/param | map → backend |
|------|-------------|---------------|
| **Source** | อัปโหลดเพลง/เดโม่ (มีร้อง) | `source_audio` |
| **Beat** | อัปโหลด beat | `beat_audio` |
| **Stem Split** | (auto) แยก vocal/inst | Demucs |
| **Auto-tune** | toggle เปิด/ปิด | `do_autotune` |
| **Vocal FX** | Knob `reverb`, `delay` + toggle | `do_fx`, `reverb`, `delay` |
| **Mix** | Knob `offset (ms)` (auto ได้) + StemMixer | `offset_ms`, `stem_gains` |
| **Master** | `LUFS` (-14/-16/-9) | `target_lufs` |
| **Output** | player + ดาวน์โหลด (read-only) | `result.output` |

**ส่วนประกอบ:**
- **Left dock** — สลับแท็บ `LibraryPanel` (ลาก asset ไปวาง timeline) / `PropertiesPanel` (พารามิเตอร์ track ที่เลือก), `Splitter` ปรับกว้าง
- **NodeDesigner** — overlay ออกแบบ custom node (text/subpatch/lfo) เพิ่มลง canvas
- **StemMixer** — เฟดเดอร์ vocals/drums/bass/other → `stem_gains` (เปิดโหมดแยก 4 stem; ไม่ส่ง = two-stems เร็วกว่า)
- **โปรเจกต์** — save/load ผ่าน `/projects` (`useProjectFile`) + `Dialog` ตั้งชื่อ
- **Export** — `POST /music/export` เบค master FX (reverb/echo/comp) ลงไฟล์ + เลือก wav/mp3

**API:** `POST /music/remix` · `POST /music/export` · `GET/POST /projects`, `GET/PUT/DELETE /projects/{pid}`

---

### 3.6 Files — `FileManager` [full-bleed]
**หน้าที่:** จัดการไฟล์ workspace ฝั่ง backend (โฟลเดอร์ `data/workspace`)

| ส่วน | รายละเอียด |
|------|-----------|
| breadcrumb + รายการ | โฟลเดอร์ก่อนแล้วเรียงชื่อ — icon ตามชนิด (folder/audio/doc) |
| การกระทำ | สร้างโฟลเดอร์ · เปลี่ยนชื่อ · ย้าย · ลบ · อัปโหลด (ทุก endpoint กัน path traversal) |

**API:** `GET /fs` · `POST /fs/folder` · `POST /fs/rename` · `POST /fs/move` · `DELETE /fs` · `POST /fs/upload`

---

### 3.7 Marketplace — `MarketplacePanel`
**หน้าที่:** แคตตาล็อก sample pack + ติดตั้ง

| ส่วน | รายละเอียด |
|------|-----------|
| การ์ด pack | ชื่อ/ผู้สร้าง/ขนาด/คำอธิบาย + สี — เอฟเฟกต์ `Tilt` ตามเมาส์ |
| ปุ่ม | ดาวน์โหลด → `POST /packs/{pack_id}/download` (สถานะจริง ไม่จำลอง %) |

**API:** `GET /packs` · `GET /packs/{pack_id}` · `POST /packs/{pack_id}/download`
**หมายเหตุ:** backend เป็นแคตตาล็อก mock in-memory — สถานะ installed หายเมื่อรีสตาร์ต (ต่อ store จริงภายหลัง)

---

### 3.8 คิวงาน — `BatchQueue`
**หน้าที่:** คิวประมวลผลแบบชุด — เพิ่มงานหลายชิ้นแล้วรันทีละงานตามลำดับ (`useBatchQueue.ts`)

| ส่วน | รายละเอียด |
|------|-----------|
| รายการงาน | ชนิดงาน + พารามิเตอร์ + สถานะ (รอ/กำลังรัน/เสร็จ/พลาด) |
| การควบคุม | เพิ่ม/ลบงาน · เริ่มรันคิว — เรียก endpoint ของงานแต่ละชนิด + ติดตาม `/jobs` |

---

### 3.9 ปลั๊กอิน — `PluginsPanel`
**หน้าที่:** สถานะ optional deps (BYOM) — pedalboard / psola / matchering

| ส่วน | รายละเอียด |
|------|-----------|
| การ์ดต่อ dep | สถานะติดตั้ง (`available`) + ฟีเจอร์ที่ปลดล็อก + license (GPL — จึงไม่ bundle) |
| ปุ่มติดตั้ง | `POST /plugins/{name}/install` → คืน **คำสั่ง** `uv pip install …` ให้ผู้ใช้รันเองใน venv แล้วรีสตาร์ต backend (ยังไม่รัน pip อัตโนมัติ) |

**API:** `GET /plugins` · `POST /plugins/{name}/install`

---

### 3.10 สมอง — `BrainPanel`
**หน้าที่:** ตั้งค่า LLM (สลับ Ollama ↔ Cloud สด)

| ส่วน | รายละเอียด |
|------|-----------|
| toggle (pill) | `Ollama` ↔ `Cloud` |
| Ollama | `ชื่อโมเดล` + health (OK/BAD + รายการโมเดลที่ติดตั้ง) |
| Cloud | `provider` (Anthropic/OpenAI/OpenRouter), `model`, `API key` (masked ••••) |
| ปุ่ม | `บันทึก` → `POST /brain/config` → refresh health ทั้งแอป |

**API:** `GET/POST /brain/config`

---

## 4. Studio floor — timeline ถาวร

### 4.1 `StudioDock`
"พื้น DAW" ของทั้งแอป — โผล่ล่างจอบนแท็บ studio (remix/tts/dubbing/mastering) ใช้ engine ตัวเดียวกันทุกแท็บ ผลงานจากเครื่องมือไหนก็ลงแทร็กเดียวกัน — `Splitter` แนว y ปรับความสูง, master-fx อ่านจาก `useRemixStore`, ปุ่มสลับ `MixCopilot`

### 4.2 `ClipTimeline` (หัวใจของ dock)
- multitrack: หัวแทร็ก (ชื่อ/สี/mute/solo) + เลน clip
- clip: SVG waveform จาก `timeline/peaks.ts`, ลากย้าย/snap ตาม grid, slice, fade in/out
- ต่อแทร็ก: `ChannelMeterBalance` (level L/R + ลากปรับ balance), มาสเตอร์: `StereoMeter`
- อัดไมค์ลงแทร็กด้วย `MicRecorder` (`useMicRecorder` — getUserMedia + MediaRecorder → อัปโหลด)
- รับ drop จาก `LibraryPanel` (dataTransfer payload)
- คลิกขวา clip → `ContextMenu` (slice/mute/ลบ ฯลฯ)
- ทุกการแก้ไขผ่าน `commit()` ของ `useClipEngine` → **Ctrl+Z undo ได้**

### 4.3 `MixCopilot` — แชทสั่ง mix ด้วยสมอง
1. ผู้ใช้พิมพ์คำสั่งภาษาธรรมชาติ (เช่น "ดันเสียงร้องขึ้น ลด beat ช่วง hook")
2. `POST /agent/act` (ส่ง state โปรเจกต์ไปด้วย) → สมองเรียก tool → ได้ `reply` + รายการ `mutations` **ที่ยังไม่ execute**
3. ผู้ใช้กด "ใช้" ต่อ mutation → แปลงเป็น engine call ผ่าน `commit()` (undo ได้)
4. op ที่ยังไม่มี engine method (`set_pan`/`set_fx`/`set_lufs`) แสดงผลอย่างเดียว

---

## 5. Shared Components

| Component | ใช้ที่ไหน | หน้าที่ |
|-----------|----------|--------|
| **StudioDock** | แท็บ studio ทุกแท็บ | พื้น timeline+transport ถาวร (§4.1) |
| **ClipTimeline** | StudioDock | multitrack clip timeline (§4.2) |
| **Timeline** | — (รุ่น Wave 2.1) | เหลือใช้เป็นแหล่ง type `TrackView`; UI จริงคือ ClipTimeline |
| **MixCopilot** | StudioDock | แชทสั่ง mix ผ่าน `/agent/act` (§4.3) |
| **MicRecorder** | ClipTimeline | hook อัดเสียงไมค์ → อัปโหลด → ลงแทร็ก |
| **NodeDesigner** | RemixPanel | overlay ออกแบบ custom node (text/subpatch/lfo) |
| **LibraryPanel** | RemixPanel (left dock) | คลัง asset — ลากไปวางบน timeline |
| **PropertiesPanel** | RemixPanel (left dock) | พารามิเตอร์ track ที่เลือก (แนว AudioNodes) |
| **FxRack** | RemixPanel (rack) | Knob reverb/delay + toggle autotune (การ์ด Tilt) |
| **StemMixer** | RemixPanel (rack) | เฟดเดอร์ 4 stem → `stem_gains` |
| **Waveform** | RemixPanel | decode + วาด waveform พร้อมเล่น/seek |
| **Knob** | FxRack, RemixPanel | ปุ่มหมุนพารามิเตอร์ (ลากแนวตั้ง, dbl-click reset) |
| **Meter** | RemixPanel | มิเตอร์ LUFS (integrated) |
| **StereoMeter** | ClipTimeline | VU แท่ง L/R จาก AnalyserNode ขณะเล่น |
| **ChannelMeterBalance** | ClipTimeline (ต่อแทร็ก) | level meter + ลากปรับ balance (-1..1) |
| **Splitter** | RemixPanel (x), StudioDock (y) | เส้นลากย่อ/ขยาย panel (dbl-click reset) |
| **Tilt** | FxRack, MarketplacePanel | การ์ดเอียงตามเมาส์ (ปิดเมื่อ prefers-reduced-motion) |
| **ContextMenu** | StudioDock (clip) | เมนูคลิกขวา generic |
| **Dialog** | RemixPanel | prompt/confirm modal แทน `window.prompt` (`useDialogHost`) |
| **JobProgress** | TTS, Dubbing, Mastering, Remix | badge สถานะ (⏳/⚙️/✅/❌) + progress bar + player + ดาวน์โหลด + error |
| **UpdateChecker** | Topbar (ทุกหน้า) | ปุ่มตรวจอัปเดต + overlay dialog |
| **icons** | Rail/nav ทั้งแอป | ชุด line icon (stroke=currentColor) |

---

## 6. Design Tokens (จาก styles.css)

| Token | ค่า | ใช้ |
|-------|-----|-----|
| `--accent` | `#cdf23f` | นีออนไลม์ — ปุ่มหลัก, active, focus |
| `--accent-text` | `#0a0e14` | ตัวอักษรบนพื้นไลม์ (เข้ม) |
| `--purple` / `--purple-bright` | `#8b5cf6` / `#a855f7` | waveform / track / port รอง |
| `--bg` | `#080b12` | space dark + radial glow |
| `--panel/2/3` | `#11151f` … | การ์ด/ฟิลด์ ไล่ระดับ |
| `--radius` | `16px` | การ์ด (มน) |
| pill | `999px` | toggle |

---

## 7. สิ่งที่ยังไม่ทำ (UI backlog)

- [ ] PluginsPanel ติดตั้งอัตโนมัติ (ตอนนี้คืนคำสั่ง pip ให้รันเอง)
- [ ] Marketplace ต่อ store จริง (แคตตาล็อก mock — installed หายเมื่อรีสตาร์ต backend)
- [ ] MixCopilot: รองรับ op `set_pan`/`set_fx`/`set_lufs` ใน engine (ตอนนี้แสดงผลอย่างเดียว)
- [ ] dubbing วิดีโอเต็มไฟล์ + export SRT/VTT
- [ ] Tauri sidecar บรรจุ backend ลง installer จริง (scaffold แล้ว — [PACKAGING_SIDECAR.md](PACKAGING_SIDECAR.md))
- [ ] RVC singing voice conversion (consent-first + BYOM) — เฟสหลัง
