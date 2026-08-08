# Software Requirements Specification (SRS)

**ระบบ:** G-Music — AI Audio Studio
**เวอร์ชัน:** 0.1.0
**วันที่:** 2026-06-27
**มาตรฐานอ้างอิง:** IEEE 830-1998 · IEEE 29148-2018

| Field | Value |
|-------|-------|
| **Doc Version** | 1.1.0 |
| **Status** | Active |
| **Author** | Boss |
| **Created** | 2026-06-27 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-06-27 | Boss | ฉบับแรก |
| 1.0.1 | 2026-08-09 | Boss | เพิ่ม Document Control + เข้าระบบ doc-graph (rwang:doc-architect) |
| 1.1.0 | 2026-08-09 | Boss | เพิ่ม FR-09..FR-15 จาก reverse gap scan (ฟีเจอร์ Wave 2-5 ที่มีโค้ดแล้ว: workspace/timeline, projects, plugins+marketplace, mic, batch queue, agent+copilot, file manager) |

---

## 1. บทนำ

### 1.1 วัตถุประสงค์
เอกสารนี้กำหนดข้อกำหนดซอฟต์แวร์ทั้งหมดของ G-Music ครอบคลุม functional requirements, non-functional requirements, ข้อจำกัด และ interface requirements เพื่อใช้เป็นแนวทางสำหรับการพัฒนา ทดสอบ และบำรุงรักษา

### 1.2 ขอบเขต
G-Music เป็นแอปพลิเคชันเดสก์ท็อปสำหรับ Windows ที่รวม:
- **Backend:** FastAPI server (Python 3.11) สำหรับ ML inference และ API
- **Frontend:** Tauri v2 + React สำหรับ UI
- **ML Pipelines:** ASR, TTS/Voice Cloning, Dubbing, Mastering

### 1.3 คำจำกัดความ

| คำ | ความหมาย |
|----|----------|
| **ASR** | Automatic Speech Recognition — ถอดเสียงเป็นข้อความ |
| **TTS** | Text-to-Speech — แปลงข้อความเป็นเสียง |
| **Voice Cloning** | โคลนเสียง — สร้างเสียงที่เหมือนต้นแบบจากตัวอย่างสั้น |
| **Dubbing** | พากย์เสียง — แทนที่เสียงต้นฉบับด้วยเสียงพากย์ภาษาอื่น |
| **Mastering** | ปรับคุณภาพเสียงรวมให้ได้มาตรฐาน broadcast |
| **Brain** | ระบบ LLM (Large Language Model) ที่ใช้ในการแปลภาษาและ chat |
| **LUFS** | Loudness Units Full Scale — หน่วยวัดความดังตามมาตรฐาน |
| **Segment** | ส่วนย่อยของเสียงที่แบ่งตาม VAD/timestamps |
| **Job** | งานเบื้องหลังที่รายงาน progress ผ่าน WebSocket |

---

## 2. ภาพรวมระบบ

### 2.1 สถาปัตยกรรมระดับสูง

```
┌─────────────────────────────────────────────────┐
│              Tauri Desktop Shell                 │
│  ┌───────────────────────────────────────────┐  │
│  │         React Frontend (Vite)              │  │
│  │  ┌─────┬─────┬─────┬──────┬──────┐       │  │
│  │  │Voice│ TTS │ Dub │Master│Brain │       │  │
│  │  └──┬──┴──┬──┴──┬──┴──┬───┴──┬───┘       │  │
│  │     │     │     │     │      │            │  │
│  │     └─────┴─────┴─────┴──────┘            │  │
│  │              HTTP / WebSocket               │  │
│  └──────────────────┬────────────────────────┘  │
│                     │                            │
│  ┌──────────────────▼────────────────────────┐  │
│  │        FastAPI Backend (:8756)              │  │
│  │  ┌────────┬────────┬──────────┬────────┐  │  │
│  │  │Routers │Services│Pipelines │  Jobs  │  │  │
│  │  └───┬────┴───┬────┴────┬─────┴───┬────┘  │  │
│  │      │        │         │         │        │  │
│  │  ┌───▼────┐ ┌─▼──┐ ┌───▼───┐ ┌───▼───┐   │  │
│  │  │ Brain  │ │File│ │  ML   │ │  WS   │   │  │
│  │  │Factory │ │ IO │ │Models │ │Notify │   │  │
│  │  └───┬────┘ └────┘ └───┬───┘ └───────┘   │  │
│  │      │                  │                  │  │
│  │  ┌───▼────┐      ┌─────▼──────┐           │  │
│  │  │Ollama  │      │F5-TTS/XTTS │           │  │
│  │  │Claude  │      │Whisper     │           │  │
│  │  │OpenAI  │      │Matchering  │           │  │
│  │  └────────┘      └────────────┘           │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 2.2 ผู้ใช้ระบบ
- **End User:** ผู้ใช้ทั่วไปที่ใช้ผ่าน UI เพื่อสร้างเสียง/พากย์/มาสเตอร์
- **Admin/Developer:** ปรับแต่ง config, เพิ่ม LLM provider ใหม่

---

## 3. Functional Requirements

### FR-01: การจัดการคลังเสียง (Voice Library)

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-01.1 | ระบบต้องรองรับการอัปโหลดไฟล์เสียงอ้างอิง (.wav) พร้อมชื่อ, ข้อความอ้างอิง, ภาษา (ไทย/อังกฤษ) | Must |
| FR-01.2 | ระบบต้องแสดงรายการเสียงทั้งหมดในคลัง พร้อม tag ภาษา | Must |
| FR-01.3 | ระบบต้องรองรับการลบเสียงจากคลัง | Must |
| FR-01.4 | ระบบต้องจัดเก็บเสียงเป็น `<id>.wav` + `<id>.json` metadata ในโฟลเดอร์ `data/voices/` | Must |
| FR-01.5 | ระบบต้องสร้าง ID อัตโนมัติ (12-char hex) สำหรับแต่ละเสียง | Must |

### FR-02: Text-to-Speech + Voice Cloning

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-02.1 | ระบบต้องรองรับการสังเคราะห์เสียงจากข้อความภาษาไทยและอังกฤษ | Must |
| FR-02.2 | ระบบต้องรองรับ voice cloning โดยใช้เสียงอ้างอิงจากคลังเสียง | Must |
| FR-02.3 | ระบบต้องรองรับ F5-TTS เป็น engine หลัก (รองรับไทย, zero-shot cloning) | Must |
| FR-02.4 | ระบบต้องรองรับ XTTS v2 เป็น engine สำรอง (หลายภาษา) | Should |
| FR-02.5 | ระบบต้อง fallback จาก XTTS เป็น F5-TTS อัตโนมัติเมื่อเลือกภาษาไทย | Must |
| FR-02.6 | ระบบต้องรองรับการปรับความเร็วเสียง (0.5×–1.5×) | Must |
| FR-02.7 | ระบบต้องรายงาน progress แบบ real-time ผ่าน WebSocket | Must |
| FR-02.8 | ระบบต้องส่งออกเสียงเป็น WAV 24kHz | Must |

### FR-03: AI Dubbing

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-03.1 | ระบบต้องรองรับการอัปโหลดไฟล์เสียง/วิดีโอเป็นแหล่งต้นฉบับ | Must |
| FR-03.2 | ระบบต้องถอดเสียงต้นฉบับเป็นข้อความ (ASR) พร้อม timestamps ระดับ segment | Must |
| FR-03.3 | ระบบต้องตรวจจับภาษาต้นฉบับอัตโนมัติ หรือรับค่าจากผู้ใช้ | Must |
| FR-03.4 | ระบบต้องแปลข้อความแต่ละ segment ผ่าน Brain (LLM) เมื่อเปิด translate | Must |
| FR-03.5 | ระบบต้องสังเคราะห์เสียงพากย์ด้วย voice cloning สำหรับแต่ละ segment | Must |
| FR-03.6 | ระบบต้องยืด/หดเสียงพากย์ให้ตรงกับระยะเวลา segment ต้นฉบับ (รักษาระดับเสียง) | Must |
| FR-03.7 | ระบบต้องมิกซ์ segments ทั้งหมดลง timeline เดียวตามตำแหน่งเวลาต้นฉบับ | Must |
| FR-03.8 | ระบบต้องรายงาน progress ทีละ segment ผ่าน WebSocket | Must |
| FR-03.9 | ระบบต้องส่งออกผลลัพธ์เป็น WAV | Must |

### FR-04: Audio Mastering

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-04.1 | ระบบต้องรองรับ Reference Mode — ใช้เพลงอ้างอิงปรับ EQ, loudness, dynamics (Matchering) | Must |
| FR-04.2 | ระบบต้องรองรับ Auto Mode — ปรับ loudness ตาม target LUFS + peak limiting | Must |
| FR-04.3 | ระบบต้องรองรับค่า LUFS ที่กำหนดได้: -14 (Spotify), -16 (Apple Music), -9 (Club) | Must |
| FR-04.4 | ระบบต้องใช้ peak ceiling -1 dBFS ใน Auto Mode | Must |
| FR-04.5 | ระบบต้องรองรับ output ทั้ง WAV และ MP3 | Must |

### FR-04b: Music Remix (Suno Finishing Studio)

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-04b.1 | ระบบต้องรับ source (เพลง/เดโม่มีร้อง) + beat เป็น input (mp3/mp4/wav) | Must |
| FR-04b.2 | ระบบต้องแยกเสียงร้อง/ดนตรีด้วย Demucs | Must |
| FR-04b.3 | ระบบต้อง detect BPM + time-stretch เสียงร้องให้ตรง beat | Must |
| FR-04b.4 | ระบบต้อง detect key + auto-tune เสียงร้องเข้าสเกลของ beat (psola) | Should |
| FR-04b.5 | ระบบต้องใส่ vocal FX chain (EQ/compress/reverb/delay) ปรับความแรงได้ (pedalboard) | Should |
| FR-04b.6 | ระบบต้องรองรับ phase-sync อัตโนมัติ หรือ manual offset (ms) | Must |
| FR-04b.7 | ระบบต้องมิกซ์เสียงร้องบน beat + มาสเตอร์ปลายทาง (LUFS) | Must |
| FR-04b.8 | ระบบต้องรายงาน progress ทุก stage ผ่าน WebSocket | Must |
| FR-04b.9 | deps หนัก (demucs/psola/pedalboard) ต้องเป็น lazy import + optional | Must |

### FR-05: Brain / LLM System

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-05.1 | ระบบต้องรองรับ Ollama เป็น local LLM provider | Must |
| FR-05.2 | ระบบต้องรองรับ Cloud LLM: Anthropic (Claude), OpenAI, OpenRouter | Must |
| FR-05.3 | ระบบต้องสลับ provider/model ได้ real-time โดยไม่ต้องรีสตาร์ท server | Must |
| FR-05.4 | ระบบต้องรองรับ streaming response สำหรับ chat | Should |
| FR-05.5 | ระบบต้องตัด `<think>...</think>` blocks จาก thinking models (Qwen3, DeepSeek-R1) อัตโนมัติ | Must |
| FR-05.6 | ระบบต้องมี health check แสดงสถานะการเชื่อมต่อ + รายชื่อโมเดลที่ติดตั้ง (Ollama) | Must |
| FR-05.7 | ระบบต้องมี timeout 600 วินาทีสำหรับ Ollama (รองรับ cold-load โมเดลใหญ่) | Must |

### FR-06: Job System

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-06.1 | งาน ML ทุกชนิดต้องรันเป็น background job | Must |
| FR-06.2 | แต่ละ job ต้องมี state: queued → running → done / error | Must |
| FR-06.3 | แต่ละ job ต้องรายงาน progress (0.0–1.0) + message ผ่าน WebSocket | Must |
| FR-06.4 | client ต้อง subscribe ผ่าน WebSocket `/jobs/ws/{id}` เพื่อรับ real-time updates | Must |
| FR-06.5 | ระบบต้องรองรับการดึงรายการ jobs ทั้งหมด (`GET /jobs`) | Should |

### FR-07: File Management

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-07.1 | ระบบต้องรองรับการอัปโหลดไฟล์ไปยัง `data/uploads/` | Must |
| FR-07.2 | ระบบต้องรองรับการดาวน์โหลดไฟล์จาก `data/outputs/` | Must |
| FR-07.3 | ระบบต้องป้องกัน path traversal attack ในการดาวน์โหลด | Must |

### FR-08: Auto-Update

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-08.1 | ระบบต้องตรวจสอบอัปเดตอัตโนมัติเมื่อเปิดแอป | Must |
| FR-08.2 | ระบบต้องรองรับการตรวจสอบอัปเดตด้วยตนเอง (ปุ่มกด) | Must |
| FR-08.3 | ระบบต้องแสดง version ใหม่ + release notes ก่อนติดตั้ง | Must |
| FR-08.4 | ระบบต้องดาวน์โหลด + ติดตั้ง + รีสตาร์ทได้ในแอป | Must |
| FR-08.5 | ระบบต้องตรวจสอบ signature ก่อนติดตั้ง (minisign) | Must |

### FR-09: Workspace / Timeline (พื้น DAW + clips)

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-09.1 | ระบบต้องมี timeline dock เป็น "พื้น" ถาวรของ workspace แสดงบนแท็บกลุ่ม studio (Remix/TTS/Dubbing/Mastering) โดยใช้ clip engine ตัวเดียวร่วมกันทั้งแอป | Must |
| FR-09.2 | โปรเจกต์ต้องมีโครงสร้าง tracks → clips (start/duration/offset/gain/mute/สี/fade in-out) พร้อม bpm และ key | Must |
| FR-09.3 | ระบบต้องรองรับการแก้ไข clip: ลากย้าย (snap ตาม beat grid), slice ณ ตำแหน่งที่กำหนด, clone, ลบ, วางเพิ่ม (paste), ปรับ gain (0–1), mute, ตั้ง fade in/out ด้วยการลาก handle บน clip | Must |
| FR-09.4 | operation แก้ไขทั้งหมดต้องเป็น pure function (ไม่ mutate input) และ undo/redo ได้ (history ≥ 100 ขั้น) | Must |
| FR-09.5 | ระบบต้องรองรับการจัดการ track: เปลี่ยนชื่อ, เปลี่ยนสี, mute/solo/lock, ลากสลับลำดับ | Must |
| FR-09.6 | ระบบต้องแสดง waveform ของ clip จาก audio peaks ที่ decode แล้ว | Must |
| FR-09.7 | ระบบต้องเล่นเสียงรวมทุก track ผ่าน Web Audio API โดยเคารพ start/offset/gain/fade/mute/solo, มี pan + level meter ต่อ track และ master FX (reverb/echo/compressor) + stereo meter | Must |
| FR-09.8 | ระบบต้องรองรับ loop region (ลากบน ruler, playback วนในช่วง) และ metronome click ตาม BPM/time signature โดย beat grid ต้องไม่มี drift สะสม | Should |
| FR-09.9 | ระบบต้องมี stem mixer ปรับ gain แยกตาม stem (vocals/drums/bass/other, 0–1.5×) ส่งให้ remix pipeline เป็น `stem_gains` | Should |
| FR-09.10 | โมดูล timeline หลัก (grid, ops, clip engine) ต้องมี unit test | Must |

### FR-10: Projects (บันทึก/โหลดโปรเจกต์)

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-10.1 | ระบบต้องบันทึกโปรเจกต์ (state ของ workspace) เป็น JSON บน backend ที่ `data/projects/<id>.json` พร้อมสร้าง id สั้นอัตโนมัติ | Must |
| FR-10.2 | ระบบต้องมี REST CRUD: รายการ (id+name), บันทึกใหม่, โหลด, บันทึกทับ (คง id เดิม), ลบ — พร้อมตรวจ id กัน path traversal | Must |
| FR-10.3 | UI ต้องมีวงจรไฟล์แบบ Adobe: New / Open / Save / Save As / Rename / Delete | Must |
| FR-10.4 | ระบบต้องติดตาม dirty state (เทียบ snapshot ปัจจุบันกับ baseline ที่บันทึกล่าสุด) และถามยืนยันก่อนทิ้งงานที่ยังไม่บันทึก (New/Open) รวมทั้งเตือนก่อนปิดแอป (beforeunload) | Must |
| FR-10.5 | ระบบต้อง autosave draft ลง localStorage ทุก 60 วินาทีเมื่อ dirty และเสนอกู้คืนเมื่อเปิดแอปใหม่หาก draft ใหม่กว่าการบันทึกล่าสุด (เลือกกู้คืนหรือทิ้งได้) | Must |
| FR-10.6 | โปรเจกต์ที่บันทึกไว้ต้องเปิดจากเครื่องอื่นที่ต่อ backend เดียวกันได้ | Should |

### FR-11: Plugin Manager + Marketplace (BYOM)

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-11.1 | ระบบต้องตรวจสถานะ optional deps (pedalboard/psola/matchering) ว่าติดตั้งหรือยังโดยไม่ import จริง (`importlib.util.find_spec`) และรายงานฟีเจอร์ที่ปลดล็อก + license ของแต่ละตัว | Must |
| FR-11.2 | ระบบต้องแสดงคำเตือน license (GPL/copyleft) ชัดเจนก่อนผู้ใช้ตัดสินใจติดตั้ง | Must |
| FR-11.3 | ระบบต้องให้คำสั่งติดตั้ง (`uv pip install <pkg>`) พร้อมปุ่มคัดลอก โดยไม่รัน pip อัตโนมัติ (ผู้ใช้รันเองใน venv ของ backend — by design) | Must |
| FR-11.4 | ระบบต้องมี Marketplace: แคตตาล็อก sample pack + สถานะติดตั้ง + ดาวน์โหลดรายชิ้น (v0.1: catalog mock, สถานะ in-memory — reset เมื่อรีสตาร์ต backend) | Should |
| FR-11.5 | progress ที่ไม่มีข้อมูลความคืบหน้าจริงจาก backend ต้องแสดงแบบ indeterminate เท่านั้น (ห้ามแสดง % จำลอง) | Must |
| FR-11.6 | UI ต้องรีเฟรชสถานะ plugin ได้ และแสดง error พร้อมปุ่มลองใหม่เมื่อดาวน์โหลด pack ล้มเหลว | Should |

### FR-12: Mic Recording (บันทึกเสียงจากไมค์)

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-12.1 | ระบบต้องบันทึกเสียงจากไมโครโฟนผ่าน getUserMedia + MediaRecorder (start/stop/cancel) | Must |
| FR-12.2 | ระหว่างบันทึกต้องแสดง indicator (จุดแดงกะพริบ) + เวลาที่ผ่านไป | Must |
| FR-12.3 | เมื่อหยุดบันทึก ระบบต้องอัปโหลดไฟล์ขึ้น backend อัตโนมัติ (`mic_<timestamp>.webm|wav`) แล้ววางเป็น clip ลงแทร็กที่ arm ไว้ (แทร็กที่เลือกอยู่) ณ ตำแหน่ง playhead | Must |
| FR-12.4 | ระบบต้องแจ้ง error เป็นภาษาไทยเมื่อ: ไม่ได้รับสิทธิ์ไมค์ / เบราว์เซอร์ไม่รองรับ MediaRecorder / ไฟล์บันทึกว่างเปล่า / อัปโหลดล้มเหลว | Must |
| FR-12.5 | ระบบต้องปล่อย mic stream เสมอเมื่อยกเลิกหรือ unmount (ไมค์ต้องไม่ค้าง) และกันการกดเริ่มซ้ำระหว่างรอสิทธิ์ | Must |
| FR-12.6 | ระบบควรบันทึกเสียงที่อัดเป็นเสียงอ้างอิงเข้าคลังเสียงได้ (ตัวเลือก "ตั้งเป็น reference voice") | Should |

### FR-13: Batch Queue (คิวประมวลผลชุด)

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-13.1 | ระบบต้องรองรับคิวงานหลายรายการชนิด TTS / Dubbing / Mastering พร้อมชื่อรายการและพารามิเตอร์ต่อรายการ | Must |
| FR-13.2 | คิวต้องรันทีละงานตามลำดับ — ส่งงานถัดไปเมื่องานก่อนหน้าจบ (backend รันเบื้องหลังตาม FR-06, frontend ควบคุมจังหวะการส่ง) | Must |
| FR-13.3 | ระบบต้องติดตาม progress ของงานปัจจุบันผ่าน WebSocket จนจบ (done/error) | Must |
| FR-13.4 | งานที่ error ต้องไม่หยุดคิว — บันทึก error ที่รายการนั้นแล้วรันงานถัดไป | Must |
| FR-13.5 | ระบบต้อง pause ได้แบบ "หยุดหลังงานปัจจุบันเสร็จ" (ไม่ยกเลิกงานที่กำลังรัน) และกันการรันคิวซ้อนหลาย instance | Must |
| FR-13.6 | ระบบต้องจัดการคิวได้: ลบรายการ / ล้างคิว / เลื่อนลำดับขึ้น-ลง | Must |
| FR-13.7 | UI ต้องแสดงความคืบหน้ารวม (เสร็จ x/y + %) และสถานะรายรายการ (รอคิว/กำลังทำงาน/เสร็จ/ผิดพลาด) | Must |

### FR-14: Workspace Agent + Mix Copilot

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-14.1 | ระบบต้องมี endpoint `POST /agent/act` รับคำสั่งภาษาธรรมชาติ (ไทย/อังกฤษ) พร้อม project state ปัจจุบัน | Must |
| FR-14.2 | Brain ต้องทำงานผ่าน tool-use: read tools (get_project_state, analyze_project — ตอบแบบ deterministic ผ่าน context ไม่ต้อง round-trip) + write tools 8 ชนิด (move_clip, set_gain, set_pan, set_fx, set_lufs, mute_clip, slice_clip, reorder_track) | Must |
| FR-14.3 | endpoint ต้อง "เสนอ" mutation เท่านั้น — ห้ามแก้ project เอง และทุก mutation ต้องผ่าน validation (op รู้จัก + required args ครบ ไม่ผ่านให้ตัดทิ้ง) | Must |
| FR-14.4 | เมื่อคำสั่งกำกวมหรือขาดข้อมูล (เช่น ไม่รู้ clip_id) agent ต้องถามกลับแทนการเดา | Must |
| FR-14.5 | Mix Copilot UI ต้องให้ผู้ใช้ยืนยัน mutation รายตัว ("ใช้") หรือทั้งชุด ("ใช้ทั้งหมด") ก่อน apply เสมอ | Must |
| FR-14.6 | mutation ที่ apply ต้องผ่าน engine commit → undo ได้ (Ctrl+Z) ทุกการแก้ไขของ AI | Must |
| FR-14.7 | op ที่ engine ยังไม่รองรับ (set_pan/set_fx/set_lufs) ต้องแสดงเป็นข้อเสนออ่านอย่างเดียวพร้อมข้อความแจ้งว่ายังไม่รองรับการ apply อัตโนมัติ | Must |

### FR-15: File Manager (จัดการไฟล์ workspace)

| ID | ข้อกำหนด | Priority |
|----|----------|----------|
| FR-15.1 | ระบบต้องมี REST `/fs`: list (โฟลเดอร์ขึ้นก่อน เรียงตามชื่อ) / สร้างโฟลเดอร์ / rename / move / delete / upload ภายใต้ `data/workspace/` | Must |
| FR-15.2 | ทุก endpoint ต้อง resolve path แล้วบังคับให้อยู่ใต้ workspace root เท่านั้น (กัน path traversal — ตอบ 400 เมื่อหลุดขอบเขต) | Must |
| FR-15.3 | ระบบต้องห้ามลบ workspace root, ชื่อซ้ำตอบ 409, ไม่พบตอบ 404 | Must |
| FR-15.4 | UI ต้อง browse ด้วย breadcrumb + ปุ่มขึ้นบน, สลับมุมมอง grid/list ได้, double-click เปิดโฟลเดอร์ | Must |
| FR-15.5 | UI ต้องมี context menu คลิกขวา (Open/Rename/Delete ของรายการ, New Folder/Refresh ของพื้นหลัง) + rename แบบ inline | Must |
| FR-15.6 | UI ควรแสดงไอคอนตามชนิด (โฟลเดอร์/ไฟล์เสียง/เอกสาร) และขนาดไฟล์ในมุมมอง list | Should |

---

## 4. Non-Functional Requirements

### NFR-01: ประสิทธิภาพ

| ID | ข้อกำหนด | เกณฑ์ |
|----|----------|-------|
| NFR-01.1 | เวลาเริ่มต้นแอป (ไม่รวมโหลดโมเดล) | ≤ 3 วินาที |
| NFR-01.2 | TTS inference ต่อประโยค (GPU, F5-TTS) | ≤ 15 วินาที |
| NFR-01.3 | ASR transcription speed ratio | ≤ 0.5× realtime |
| NFR-01.4 | Backend API response (non-ML endpoints) | ≤ 200ms |
| NFR-01.5 | WebSocket update latency | ≤ 100ms |

### NFR-02: ความเชื่อถือได้

| ID | ข้อกำหนด |
|----|----------|
| NFR-02.1 | ML models ต้องเป็น lazy import — แอปเปิดได้แม้ยังไม่ลงโมเดล |
| NFR-02.2 | Job ที่ล้มเหลวต้องรายงาน error message ชัดเจน, ไม่ crash แอป |
| NFR-02.3 | Backend ต้อง gracefully handle GPU out-of-memory |

### NFR-03: ความปลอดภัย

| ID | ข้อกำหนด |
|----|----------|
| NFR-03.1 | API key ของ Cloud provider ต้องไม่แสดงใน UI (mask ด้วย •••) |
| NFR-03.2 | ไฟล์เสียงผู้ใช้ต้องไม่ถูกส่งออกนอกเครื่องโดยไม่ตั้งใจ |
| NFR-03.3 | Updater ต้องตรวจ signature ก่อนติดตั้ง |
| NFR-03.4 | Signing private key ต้องไม่อยู่ใน repository (gitignore) |

### NFR-04: ความสามารถในการใช้งาน

| ID | ข้อกำหนด |
|----|----------|
| NFR-04.1 | UI ต้องเป็นภาษาไทย |
| NFR-04.2 | ทุกฟีเจอร์หลักต้องเข้าถึงได้ภายใน ≤ 3 คลิก |
| NFR-04.3 | Progress bar ต้องแสดงเปอร์เซ็นต์ + ข้อความสถานะ |
| NFR-04.4 | ผลลัพธ์ต้องเล่นฟัง + ดาวน์โหลดได้ในหน้าเดียวกัน |

### NFR-05: Portability

| ID | ข้อกำหนด |
|----|----------|
| NFR-05.1 | ไม่ต้องลง FFmpeg แยก (ใช้ imageio-ffmpeg ที่ฝังในตัว) |
| NFR-05.2 | ตัวติดตั้ง NSIS เป็นไฟล์ .exe เดียว |
| NFR-05.3 | รองรับ CPU-only mode (ช้าลงแต่ยังใช้ได้) |

### NFR-06: Maintainability

| ID | ข้อกำหนด |
|----|----------|
| NFR-06.1 | เพิ่ม LLM provider ใหม่ได้โดย implement `LLMProvider` interface + ต่อใน `factory.py` |
| NFR-06.2 | เพิ่ม TTS engine ใหม่ได้โดยเพิ่ม engine ใน `tts.py` |
| NFR-06.3 | Config ทั้งหมดอยู่ใน `.env` + pydantic-settings, hot-reload ผ่าน API ได้ |

---

## 5. Interface Requirements

### 5.1 REST API

| Method | Endpoint | Request | Response | หมายเหตุ |
|--------|----------|---------|----------|----------|
| GET | `/` | — | `{service, version, features, brain}` | Info |
| GET | `/health` | — | `{status, brain, brain_config}` | Health check |
| GET | `/brain/config` | — | `{config, health}` | อ่าน config สมอง |
| POST | `/brain/config` | `{provider, model, ...}` | `{config, health}` | เปลี่ยน provider |
| POST | `/brain/chat` | `{messages, temperature?, max_tokens?, stream?}` | `{text, model, usage}` | Chat/completion |
| POST | `/brain/translate` | `{text, target_lang, source_lang?}` | `{translation}` | แปลภาษา |
| GET | `/voices` | — | `{voices: [...]}` | รายการเสียง |
| POST | `/voices` | multipart: name, ref_text, language, file | `{id, name, ...}` | เพิ่มเสียง |
| DELETE | `/voices/{id}` | — | `{deleted: id}` | ลบเสียง |
| POST | `/files/upload` | multipart: file | `{filename, path}` | อัปโหลด |
| GET | `/files/download/{name}` | — | FileResponse | ดาวน์โหลด |
| POST | `/tts` | `{text, voice_id?, language, speed?}` | `{job_id}` | สร้างเสียง |
| POST | `/dubbing` | `{source_audio, voice_id, target_lang, translate, source_lang?}` | `{job_id}` | พากย์ |
| POST | `/mastering` | `{source_audio, reference_audio?, target_lufs, target_format}` | `{job_id}` | มาสเตอร์ |
| POST | `/music/remix` | `{source_audio, beat_audio, do_autotune?, do_fx?, offset_ms?, reverb?, delay?, target_lufs?}` | `{job_id}` | Remix |
| GET | `/jobs` | — | `{jobs: [...]}` | รายการ jobs |
| GET | `/jobs/{id}` | — | `Job` | ดู job |
| WS | `/jobs/ws/{id}` | — | Stream `Job` | Progress updates |

### 5.2 WebSocket Protocol

**Endpoint:** `ws://127.0.0.1:8756/jobs/ws/{job_id}`

**Message format (JSON):**
```json
{
  "id": "abc123def456",
  "kind": "tts",
  "status": "running",
  "progress": 0.45,
  "message": "กำลังสังเคราะห์เสียง…",
  "result": null,
  "error": null
}
```

**Lifecycle:**
1. Client connects → server sends current state
2. Server sends update on every progress change
3. Connection closes when `status` = `done` or `error`

### 5.3 Internal Interfaces

**LLMProvider (Abstract Base):**
```python
class LLMProvider(ABC):
    async def chat(messages, temperature, max_tokens) -> ChatResult
    async def stream(messages, temperature, max_tokens) -> AsyncIterator[str]
    async def health() -> dict
    async def translate(text, target_lang, source_lang) -> str
```

**Job Task signature:**
```python
async def task(job: Job, report: ProgressFn) -> dict
# ProgressFn = async (job, progress: float, message: str) -> None
```

---

## 6. Data Requirements

### 6.1 โครงสร้างไฟล์

```
data/
├── uploads/          # ไฟล์ที่ผู้ใช้อัปโหลด
│   └── <filename>    # เสียง/วิดีโอต้นฉบับ
├── outputs/          # ผลลัพธ์จาก pipeline
│   ├── tts_<id>.wav
│   ├── dubbed_<id>.wav
│   ├── master_<id>.wav
│   └── dub_<id>/     # temp files ระหว่าง dubbing
└── voices/           # คลังเสียงอ้างอิง
    ├── <id>.wav       # ไฟล์เสียง
    └── <id>.json      # metadata
```

### 6.2 Voice Metadata Schema

```json
{
  "id": "string (12-char hex)",
  "name": "string",
  "ref_text": "string (ข้อความในเสียงอ้างอิง)",
  "language": "th | en",
  "wav": "string (ชื่อไฟล์ .wav)"
}
```

### 6.3 Configuration Schema

ดูรายละเอียดทั้งหมดใน `backend/app/config.py` — ทุกค่าตั้งผ่าน environment variables / `.env`

---

## 7. ข้อจำกัดของระบบ

| ข้อจำกัด | รายละเอียด |
|----------|------------|
| **Python 3.11 only** | torch/f5-tts ยังไม่มี wheel สำหรับ 3.12+ |
| **CUDA 12.1** | torch build เจาะจง CUDA 12.1 |
| **Windows only (v0.1)** | Tauri bundle เฉพาะ NSIS |
| **Single user** | ไม่มี authentication, ออกแบบสำหรับเครื่องเดียว |
| **GPU VRAM** | F5-TTS + Whisper ต้องการ VRAM ~4-6GB |
| **Ollama cold start** | Request แรกช้า >4 นาทีเมื่อเขี่ยโมเดลใหญ่ออกจาก VRAM |
| **cp1252 console** | Windows console ไม่แสดงภาษาไทย — ต้องตั้ง PYTHONIOENCODING=utf-8 |
