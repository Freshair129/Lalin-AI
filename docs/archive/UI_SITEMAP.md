# UI Sitemap · Layout · View Details — G-Music

> **Historical implementation reference — not a source of truth.**
> Use [LALIN_UI_SOT.md](../design/LALIN_UI_SOT.md) for the authoritative document set,
> [LALIN_LAYOUT_SOT.md](../design/LALIN_LAYOUT_SOT.md) for layout, and
> [LALIN_SITEMAP_SOT.md](../design/LALIN_SITEMAP_SOT.md) for navigation. This document is
> retained for panel/API implementation detail that has not yet been migrated.

**วันที่:** 2026-06-28
**Design language:** Cinemaro-inspired (นีออนไลม์ + space dark + การ์ดมน 16px + pill toggle)
**Theme:** [frontend/src/styles.css](../frontend/src/styles.css) (วาง design system แล้ว)

| Field | Value |
|-------|-------|
| **Doc Version** | 1.0.1 |
| **Status** | Active |
| **Author** | Boss |
| **Created** | 2026-06-28 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-06-28 | Boss | ฉบับแรก |
| 1.0.1 | 2026-08-09 | Boss | เพิ่ม Document Control + เข้าระบบ doc-graph (rwang:doc-architect) |

---

**Design-system source of truth:** [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)

**Lalin AI proposed IA:** [GM6_SITEMAP.md](GM6_SITEMAP.md) covers the detailed desktop and mobile navigation model; it remains a documentation gate before routing changes.

## 1. Site Map

```
G-Music (single-window desktop app, Tauri)
│
├─ Sidebar (คงที่ทุกหน้า — กว้าง 230px)
│   ├─ Logo "🎙️ G-Music"
│   ├─ Nav (เลือก view)
│   │   ├─ 🎤 คลังเสียง        → VoicesPanel
│   │   ├─ 🗣️ อ่านข้อความ      → TTSPanel
│   │   ├─ 🎬 พากย์เสียง        → DubbingPanel
│   │   ├─ 🎚️ Mastering        → MasteringPanel
│   │   ├─ 🎵 Remix            → RemixPanel (node workflow)
│   │   ├─ 📁 Files            → FileManager
│   │   ├─ 🛒 Marketplace      → MarketplacePanel
│   │   ├─ 🧾 คิวงาน           → BatchQueue
│   │   ├─ 🎛️ ปลั๊กอิน         → PluginsPanel
│   │   └─ 🧠 สมอง             → BrainPanel
│   └─ Sidebar-bottom
│       ├─ UpdateChecker (ปุ่ม 🔄 / overlay dialog)
│       └─ Connection status (dot + provider)
│
└─ Content area (เปลี่ยนตาม nav ที่เลือก)
    └─ [view ที่ active]

Overlay (ลอยทับทุกหน้า)
└─ Update dialog (เมื่อมีอัปเดต) — version + notes + ติดตั้ง/รีสตาร์ท
```

**สถานะร่วม (App.tsx):**
- `tab` — view ปัจจุบัน
- `online` — backend ติดต่อได้ไหม
- `brainName` — provider ของสมองปัจจุบัน
- `BackendGate` — บังหน้าใช้งานเมื่อ sidecar/backend ยังไม่พร้อม
- `StudioDock` — แสดงในกลุ่มงาน studio (`remix`, `tts`, `dubbing`, `mastering`)

---

## 2. Global Layout

```
┌──────────────┬───────────────────────────────────────────┐
│  SIDEBAR     │  CONTENT (.content — padding 36/40, scroll) │
│  230px       │                                             │
│              │   ┌─ .panel (max-width 640) ──────────┐    │
│  🎙️ G-Music  │   │  h2 หัวข้อ                          │    │
│              │   │  .hint คำอธิบาย                      │    │
│  ┌─ nav ──┐  │   │                                     │    │
│  │ 🎤 ...  │  │   │  [.card / .field / .row / ...]       │    │
│  │ 🗣️ ...  │  │   │  ...                                 │    │
│  │ 🎬 ...  │  │   │  button.primary                      │    │
│  │ 🎚️ ...  │  │   │  [JobProgress ถ้ามีงาน]              │    │
│  │ 🎵 ...  │  │   └─────────────────────────────────────┘    │
│  │ 🧠 ...  │  │                                             │
│  └────────┘  │   (Remix ใช้ full-width canvas แทน .panel)   │
│              │                                             │
│  ┌────────┐  │                                             │
│  │🔄 conn │  │                                             │
│  └────────┘  │                                             │
└──────────────┴───────────────────────────────────────────┘
```

**Breakpoint:** desktop-first (หน้าต่าง Tauri min 900×600, default 1200×820). ไม่มี mobile.

---

## 3. รายละเอียดแต่ละ View

### 3.1 🎤 คลังเสียง — `VoicesPanel`
**หน้าที่:** จัดการคลังเสียงอ้างอิงสำหรับโคลน

| ส่วน | รายละเอียด |
|------|-----------|
| ฟอร์มเพิ่มเสียง | `ชื่อเสียง` (text), `ข้อความในไฟล์/ref text` (text), `ภาษา` (ไทย/English), `ไฟล์เสียง .wav` (file) |
| ปุ่ม | `+ เพิ่มเสียง` → `POST /voices` (multipart) |
| รายการเสียง | `.voice-list` → แต่ละ `.voice-item`: ชื่อ + `.tag` ภาษา + ปุ่ม `.danger` ลบ (`DELETE /voices/{id}`) |
| empty state | "ยังไม่มีเสียงในคลัง" |

**API:** `GET/POST /voices`, `DELETE /voices/{id}`

**Planned extension — Voice cloning profiles:**

| Area | Details |
|------|---------|
| Profile cards | display name, language, source (upload/microphone), duration, and textual `Ready`/`Processing`/`Error` state |
| Create profile | upload or microphone recording with consent acknowledgement, name, and reference text |
| Profile actions | preview, edit metadata, set default TTS voice, delete with confirmation |
| Whisper size | Base/Small/Medium/Large-v3/Turbo plus model/device/loading state; changes are disabled during ASR work |
| Agent voice | selected profile plus `Speak replies` opt-in; queue/player/error remains in MixCopilot |

**Agent Voice flow:** `MixCopilot reply` → text renders immediately → when opt-in + profile + full TTS runtime → `POST /tts` → job/player; otherwise preserve text and show an unavailable reason.

---

### 3.2 🗣️ อ่านข้อความ — `TTSPanel`
**หน้าที่:** สังเคราะห์เสียงจากข้อความ + โคลนเสียง

| ส่วน | รายละเอียด |
|------|-----------|
| input | `ข้อความ` (textarea), `เลือกเสียง` (dropdown จากคลัง), `ภาษา` (th/en), `ความเร็ว` (slider 0.5–1.5×) |
| ปุ่ม | `สร้างเสียง` → `POST /tts` → job |
| output | `JobProgress` (bar + player + ดาวน์โหลด) |

**API:** `POST /tts` → `{job_id}` → WS `/jobs/ws/{id}`

---

### 3.3 🎬 พากย์เสียง — `DubbingPanel`
**หน้าที่:** พากย์ไฟล์เสียง/วิดีโอเป็นภาษาอื่นด้วยเสียงโคลน

| ส่วน | รายละเอียด |
|------|-----------|
| input | อัปโหลดไฟล์ต้นฉบับ (เสียง/วิดีโอ), `เลือกเสียงพากย์`, `ภาษาเป้าหมาย` (ไทย/English), `แปลภาษา` (checkbox) |
| ปุ่ม | `เริ่มพากย์` → upload → `POST /dubbing` → job |
| output | `JobProgress` (รายงานทีละ segment) |

**API:** `POST /files/upload` → `POST /dubbing` → job

---

### 3.4 🎚️ Mastering — `MasteringPanel`
**หน้าที่:** มาสเตอร์เสียง/เพลงระดับเผยแพร่

| ส่วน | รายละเอียด |
|------|-----------|
| input | `เพลงต้นฉบับ` (upload, required), `เพลงอ้างอิง` (upload, optional → เปิด Matchering), `LUFS` (dropdown -14/-16/-9), `ฟอร์แมต` (wav/mp3) |
| ปุ่ม | `มาสเตอร์` → job |
| output | `JobProgress` |

**API:** `POST /mastering` → job
**โหมด:** มี reference = Matchering / ไม่มี = auto LUFS

---

### 3.5 🎵 Remix — `RemixPanel` [implemented — timeline-first finishing workspace]
**หน้าที่:** เก็บงานเพลง (Suno finishing studio) — วางเสียงร้องบน beat อื่น + autotune + FX + master
**Paradigm หลัก:** `Arrange` แบบ timeline-first เพื่อให้ผู้ใช้เห็นสิ่งสำคัญทันทีเหมือน DAW/CapCut
**Paradigm รอง:** `Patch` หรือ node workflow สำหรับผู้ใช้ที่ต้องการมอง pipeline แบบกราฟ

**UX goal:**
- ใช้งานได้ทันทีโดยไม่ต้องเรียนรู้ node graph ก่อน
- timeline ต้องเป็นศูนย์กลางสายตาและอยู่บนจอเสมอเมื่ออยู่ใน `Arrange`
- ปุ่มสำคัญ (import / run / save / export) ต้องรวมอยู่บนแถบบน ไม่ปล่อยพื้นที่ว่างทิ้ง
- panel รองต้องยุบก่อน timeline เมื่อพื้นที่ลดลง

**Layout (authoritative target):**
```
┌─ Session Bar ─────────────────────────────────────────────────────────────┐
│ Project · Import Source/Beat · Save/Open · Mode · Render Status · Run    │
├───────────────────────────────────────────────────────────────────────────┤
│ Left Panel        │ Main Arrange Stage                                   │
│ Library / Track   │ ┌─ Timeline (primary work surface) ────────────────┐ │
│                   │ │ clips · playhead · sync preview · transport      │ │
│                   │ └───────────────────────────────────────────────────┘ │
│                   │                                                       │
│                   │ ┌─ Device Dock (bottom) ───────────────────────────┐ │
│                   │ │ Vocal FX · Sync · Stem Mixer · Master · Export   │ │
│                   │ └───────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────────────────┤
│ Optional Inspector / Patch View (advanced, contextual)                   │
└───────────────────────────────────────────────────────────────────────────┘
```

**Information hierarchy:**
1. `Timeline`
2. `Transport + Run`
3. `Source/Beat import`
4. `Selected track / selected clip`
5. `Device dock`
6. `Patch view`

**Arrange mode modules:**

| พื้นที่ | หน้าที่ | map → backend |
|------|-------------|---------------|
| **Session Bar** | import source/beat, file actions, render state, run | `source_audio`, `beat_audio` |
| **Timeline** | preview alignment, clip arrangement, transport, offset preview | `offset_ms`, `phrase_bars` |
| **Sync** | auto/manual sync, phrase start, key awareness | `offset_ms`, `phrase_bars`, `key_override` |
| **Vocal FX** | toggle เปิด/ปิด + reverb + delay + tune strength | `do_fx`, `reverb`, `delay`, `do_autotune`, `autotune_strength` |
| **Stem Mixer** | vocal/drums/bass/other balance | `stem_gains` |
| **Master** | loudness target, export summary | `target_lufs` |
| **Patch View** | graph มุมมองขั้นสูงของ pipeline เดิม | same request payload as arrange |

**Patch view modules (advanced):**

| โหนด | input/param | map → backend |
|------|-------------|---------------|
| **Source** | อัปโหลดเพลง/เดโม่ (มีร้อง) | `source_audio` |
| **Beat** | อัปโหลด beat | `beat_audio` |
| **Stem Split** | (auto) แยก vocal/inst | Demucs |
| **Auto-tune** | toggle เปิด/ปิด + knob `strength` + key override | `do_autotune`, `autotune_strength`, `key_override` |
| **Vocal FX** | slider `reverb`, `delay` + toggle | `do_fx`, `reverb`, `delay` |
| **Mix** | slider `offset (ms)` (None=auto), auto/manual sync, phrase start, preview alignment ใน timeline, stem mix support | `offset_ms`, `phrase_bars`, `stem_gains` |
| **Master** | `LUFS` (-14/-16/-9) | `target_lufs` |
| **Output** | player + ดาวน์โหลด (read-only) | `result.output` |

**Arrange behavior:**
- `ARRANGE WORKSPACE · Timeline` เป็น workspace header แถวเดียว; สถานะหรือคำสั่งที่ซ้ำกับ source, beat, transport หรือ footer ต้องไม่สร้าง panel สรุปเหนือ timeline เพิ่ม
- เมื่อ `Auto-sync` ปิดอยู่ การหมุน `Offset ms` ต้องเลื่อนตำแหน่ง preview clip ของ vocal เทียบกับ beat ทันที
- preview นี้เป็น non-destructive UI state จนกว่าจะกด `Run`
- `Timeline` ต้องมองเห็นตลอดใน `Arrange` โดยไม่ถูกดันหลุด viewport
- `Device Dock` ต้องอยู่ใต้ timeline ไม่ใช่แข่งพื้นที่กับ timeline

**Responsive / fit rules:**
- root ของ Remix ใช้ `overflow: hidden`
- scroll ได้เฉพาะ `Timeline viewport`, `Library list`, และภายใน `Device Dock` เมื่อต้องจำเป็น
- ไม่มี page scroll หลักในหน้า Remix
- desktop target width = `1280px+`
- compact target width = `1100px+`
- hard minimum workspace width = `960px`
- เมื่อเล็กกว่า ideal ให้ยุบ `Left Panel` และ secondary controls ก่อน ไม่ยุบ timeline ก่อน

**Result feedback ที่มีแล้วใน UI:**
- แสดง output file
- แสดง `Key`
- แสดง `Offset`
- แสดง `Stretch`
- แสดง `LUFS`

**หมายเหตุ:** `Patch View` เป็น drag-connect graph แล้ว และ state ของ graph ถูกเก็บไปพร้อม project workspace เพื่อให้มุมมอง advanced ใช้งานต่อเนื่องได้จริง

**API:** `POST /music/remix` → `{job_id}` → WS (param: source_audio, beat_audio, do_autotune, autotune_strength, key_override, do_fx, phrase_bars, offset_ms, reverb, delay, target_lufs)

---

### 3.6 🧠 สมอง — `BrainPanel`
**หน้าที่:** ตั้งค่า LLM (สลับ Ollama ↔ Cloud สด)

| ส่วน | รายละเอียด |
|------|-----------|
| toggle (pill) | `Ollama` ↔ `Cloud` |
| Ollama | `ชื่อโมเดล` + health (OK/BAD + รายการโมเดลที่ติดตั้ง) |
| Cloud | `provider` (Anthropic/OpenAI/OpenRouter), `model`, `API key` (masked ••••) |
| ปุ่ม | `บันทึก` → `POST /brain/config` → refresh health ทั้งแอป |

**API:** `GET/POST /brain/config`

---

## 4. Shared Components

| Component | ใช้ที่ไหน | หน้าที่ |
|-----------|----------|--------|
| **JobProgress** | TTS, Dubbing, Mastering, Remix | badge สถานะ (⏳/⚙️/✅/❌) + progress bar + audio player + ดาวน์โหลด + error |
| **UpdateChecker** | Sidebar (ทุกหน้า) | ปุ่มตรวจอัปเดต + overlay dialog (version/notes/ติดตั้ง/รีสตาร์ท) |

---

## 5. Design Tokens (จาก styles.css)

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

## 6. สิ่งที่ยังไม่ทำ (UI backlog)

- [x] `RemixPanel` ถูก implement แล้ว และมี `Arrange` เป็นหน้าหลักของ workflow
- [x] เพิ่มแท็บ Remix ใน `App.tsx` NAV แล้ว
- [x] Manual mixer ใน Mix node ครบ definition ของ Phase B1 แล้ว: offset slider + live preview parity
- [x] Key override / phrase start control — เฟส B
- [x] Drag-connect node graph ใน `Patch View` ใช้งานได้แล้ว พร้อม sidecar อธิบายบทบาทของมุมมอง advanced
- [x] Stem fader ให้มี audible effect ครบทุก stem — เฟส B4
- [x] `Arrange` ใช้ timeline-first paradigm เป็นแกนหลักแล้ว
- [x] ปรับ component เดิม (Voices/TTS/Dubbing/Mastering/Brain) ให้ใช้ `.card` ทุกตัวให้สม่ำเสมอ
