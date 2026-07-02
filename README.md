# G-Music 🎙️

โปรแกรม AI สำหรับงานเสียงครบวงจร: **Clone เสียง · พากย์เสียง (Dubbing) · Mastering เพลง**
รองรับ "สมอง" (LLM) แบบสลับได้ระหว่าง **Cloud** (Claude / OpenAI / OpenRouter) และ **Ollama (local)**

---

## ความสามารถ

| ฟีเจอร์ | คำอธิบาย | เครื่องมือหลัก |
|---|---|---|
| 🎤 **Voice Cloning** | โคลนเสียงจากตัวอย่างสั้น ๆ (zero-shot) ไทย + อังกฤษ | F5-TTS (โมเดลไทย), XTTS v2 |
| 🎬 **Dubbing / พากย์เสียง** | ถอดเสียง → แปล/เขียนสคริปต์ → พากย์ด้วยเสียงโคลน → จัดให้ตรงเวลา | faster-whisper + brain + TTS |
| 🎚️ **Mastering** | ปรับ/มาสเตอร์เสียงเพลงให้ดังและสมดุลตามมาตรฐานสตรีมมิ่ง | Matchering 2.0 + DSP |
| 🧠 **Brain (LLM)** | สลับ Cloud ↔ Ollama สำหรับงานแปล/เขียนสคริปต์/ปรับบท | abstraction layer เดียว |

## สถาปัตยกรรม

```
┌──────────────────────┐        HTTP / WebSocket        ┌─────────────────────────────┐
│   Tauri Desktop UI    │  ◄──────────────────────────► │      FastAPI Backend (Py)    │
│   (React + Vite)      │                                │                             │
└──────────────────────┘                                │  brain/      สมอง LLM        │
                                                         │   ├ ollama_provider          │
                                                         │   └ cloud_provider           │
                                                         │  pipelines/                  │
                                                         │   ├ asr.py     (Whisper)     │
                                                         │   ├ tts.py     (F5/XTTS)     │
                                                         │   ├ dubbing.py               │
                                                         │   └ mastering.py (Matchering)│
                                                         │  jobs/  งานเบื้องหลัง + WS   │
                                                         └─────────────────────────────┘
```

## โครงสร้างโฟลเดอร์

```
G-Music/
├─ backend/            FastAPI + ML pipelines (Python)
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ config.py
│  │  ├─ schemas.py
│  │  ├─ brain/        สมอง LLM (สลับ cloud/ollama)
│  │  ├─ pipelines/    asr, tts, dubbing, mastering
│  │  ├─ routers/      REST endpoints
│  │  └─ jobs/         งานเบื้องหลัง
│  ├─ requirements.txt
│  └─ .env.example
├─ frontend/           Tauri + React (Phase 2)
├─ scripts/            setup + ดาวน์โหลดโมเดล
└─ README.md
```

## เริ่มต้นใช้งาน (backend)

ต้องมี **Python 3.10/3.11** และ (แนะนำ) GPU NVIDIA + CUDA

```powershell
cd D:\G-Music\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt          # ไลบรารีหลัก (เบา)
# ติดตั้ง PyTorch + โมเดลเสียงเมื่อพร้อม:  ดู scripts/setup_windows.ps1

copy .env.example .env                    # ตั้งค่า API key / โหมดสมอง
uvicorn app.main:app --reload --port 8756
```

เปิด http://127.0.0.1:8756/docs เพื่อดู API ทั้งหมด

## โหมดสมอง (Brain)

ตั้งใน `.env`:

```ini
BRAIN_PROVIDER=ollama          # หรือ "cloud"
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1

# ถ้าใช้ cloud:
CLOUD_PROVIDER=anthropic        # anthropic | openai | openrouter
CLOUD_API_KEY=sk-...
CLOUD_MODEL=claude-opus-4-8
```

สลับโหมดได้สด ๆ ผ่าน API `POST /brain/config` โดยไม่ต้องรีสตาร์ต

## รัน Frontend (Tauri / เว็บ)

```powershell
cd D:\G-Music\frontend
npm install
npm run dev            # เปิดในเบราว์เซอร์ http://localhost:5173
# หรือเป็น desktop app:
npm run tauri dev      # ต้องมี Rust toolchain (มีแล้ว: cargo 1.96)
```

> ต้องรัน backend (`uvicorn …` พอร์ต 8756) คู่กันด้วย — UI จะแสดงสถานะ "เชื่อมต่อแล้ว" มุมซ้ายล่างเมื่อ backend ออนไลน์
> เปลี่ยนโลโก้แอป: `npm run tauri icon path\to\logo.png` (ตอนนี้ใช้ไอคอน placeholder)

## สถานะการพัฒนา

- [x] โครงโปรเจกต์ + config
- [x] Brain abstraction (Ollama + Cloud) — สลับสดได้, ทดสอบผ่าน
- [x] Pipeline: ASR / TTS / Dubbing — เขียนครบ (รอติดตั้งโมเดลเพื่อรันจริง)
- [x] Pipeline: Mastering (Matchering + auto LUFS)
- [x] Tauri UI — 5 แท็บ (คลังเสียง/อ่านข้อความ/พากย์/มาสเตอร์/สมอง) + WebSocket progress
- [x] ติดตั้ง ML stack (Python 3.11 + torch cu121 + f5-tts + whisper + matchering) — ครบ
- [x] **ทดสอบโคลนเสียงไทยจริงบน RTX 3060 ผ่าน** (F5-TTS-THAI, inference ~9 วิ)
- [x] ffmpeg แบบ self-contained (imageio-ffmpeg) — ไม่ต้องลงทั้งระบบ
- [ ] ทดสอบ dubbing end-to-end (ASR→แปล→clone) แบบเต็มไฟล์
- [ ] Tauri sidecar — auto-start backend พร้อมแอป

### โมเดลที่ใช้จริง (ยืนยันแล้ว)
- **Voice clone/TTS:** `VIZINTZOR/F5-TTS-THAI` (arch F5TTS_Base, รองรับไทย+อังกฤษในตัว, 24kHz)
- **Brain (local):** Ollama — แนะนำ `hf.co/iapp/chinda-qwen3-4b` สำหรับงานแปลไทย
- **GPU:** RTX 3060 12GB · torch 2.5.1+cu121
