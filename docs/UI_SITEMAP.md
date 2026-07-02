# UI Sitemap · Layout · View Details — G-Music

**วันที่:** 2026-06-28
**Design language:** Cinemaro-inspired (นีออนไลม์ + space dark + การ์ดมน 16px + pill toggle)
**Theme:** [frontend/src/styles.css](../frontend/src/styles.css) (วาง design system แล้ว)

---

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
│   │   ├─ 🎵 Remix  [ใหม่]     → RemixPanel (node workflow)
│   │   └─ 🧠 สมอง              → BrainPanel
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
- `online` — backend ติดต่อได้ไหม (ping ทุก 10 วิ)
- `brainName` — provider ของสมองปัจจุบัน (แสดงที่ status)

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

### 3.5 🎵 Remix — `RemixPanel` [ใหม่ — node workflow]
**หน้าที่:** เก็บงานเพลง (Suno finishing studio) — วางเสียงร้องบน beat อื่น + autotune + FX + master
**Paradigm:** Node workflow (กราฟโหนด สไตล์ Cinemaro Workflow) — full-width canvas ไม่ใช่ `.panel`

**Layout:**
```
┌─ Toolbar (บนสุด) ─────────────────────────────────────┐
│  [Remix]  ·  ปุ่ม ▶ Run (ขวา)  ·  สถานะ job            │
├───────────────────────────────────────────────────────┤
│                                                        │
│   ● Source ──┐                                         │
│   (อัป mp3/   │      ● Stem Split ──┬── ● Auto-tune ──┐ │
│    mp4/wav)   └──────► (Demucs)     │   (psola)       │ │
│                          vocal ●────┘                 │ │
│                          inst  ○                      ▼ │
│   ● Beat ───────────────────────────► ● Vocal FX ──► ● Mix ──► ● Master ──► ● Output
│   (อัป beat)                          (reverb/delay     (offset    (LUFS)     (player+
│                                        slider)          slider)              ดาวน์โหลด)
└───────────────────────────────────────────────────────┘
```

**โหนด (แต่ละโหนด = การ์ดมน มี port สี):**

| โหนด | input/param | map → backend |
|------|-------------|---------------|
| **Source** | อัปโหลดเพลง/เดโม่ (มีร้อง) | `source_audio` |
| **Beat** | อัปโหลด beat | `beat_audio` |
| **Stem Split** | (auto) แยก vocal/inst | Demucs |
| **Auto-tune** | toggle เปิด/ปิด | `do_autotune` |
| **Vocal FX** | slider `reverb`, `delay` + toggle | `do_fx`, `reverb`, `delay` |
| **Mix** | slider `offset (ms)` (None=auto), `vocal/beat gain` | `offset_ms` |
| **Master** | `LUFS` (-14/-16/-9) | `target_lufs` |
| **Output** | player + ดาวน์โหลด (read-only) | `result.output` |

**Flow:** กรอกค่าในโหนด → กด **▶ Run** → `POST /music/remix` (ส่งทุก param รวมกัน) → `JobProgress` แสดง stage (แยกร้อง→BPM→autotune→FX→mix→master) → โหนด Output โชว์ผล

**หมายเหตุ:** เวอร์ชันแรกเป็น **static graph** (โหนดตายตัวตาม pipeline) — ยังไม่ใช่ drag-connect แบบ ComfyUI เต็ม (ดู roadmap)

**API:** `POST /music/remix` → `{job_id}` → WS (param: source_audio, beat_audio, do_autotune, do_fx, offset_ms, reverb, delay, target_lufs)

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

- [ ] `RemixPanel` (node workflow) — **กำลังจะทำ** (เฟส A)
- [ ] เพิ่มแท็บ Remix ใน `App.tsx` NAV
- [ ] Manual mixer ใน Mix node (slider offset + preview) — เฟส B
- [ ] Drag-connect node graph เต็ม (ตอนนี้ static) — ภายหลัง
- [ ] Stem fader (vocal/drums/bass/other) — เฟส B
- [ ] หน้า Timeline (ถ้าต้องการ paradigm ที่ 2 ของ Cinemaro)
- [ ] ปรับ component เดิม (Voices/TTS/Dubbing/Mastering/Brain) ให้ใช้ `.card` ทุกตัวให้สม่ำเสมอ
