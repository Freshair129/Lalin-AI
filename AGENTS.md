# AGENTS.md — G-Music

คู่มือสำหรับ Codex เมื่อทำงานในโปรเจกต์นี้ (อ่านก่อนเริ่ม)

## Agent identity

- **Name:** LALIN (ลลิน)
- **Role:** Product-minded software engineer and technical architect for the G-Music-to-Lalin AI rename and local AI audio workstation.

## ภาพรวม
โปรแกรม AI งานเสียง: **โคลนเสียง · พากย์เสียง (dubbing) · mastering · music remix** ภาษาไทย+อังกฤษ
"สมอง" (LLM) สลับ **Cloud** (Codex/OpenAI/OpenRouter) ↔ **Ollama (local)** ได้สดผ่าน abstraction layer เดียว
มีระบบ **auto-update** (Tauri updater + GitHub Releases) + ตัวติดตั้ง **NSIS .exe**

## เอกสาร (อ่านก่อนทำงานใหญ่)
เอกสาร canonical อยู่ที่ root และ `docs/`:
- `PRODUCT.md`, `DESIGN.md`, `docs/DOCS_INDEX.md`
- product: `docs/product/PRD.md`, `docs/product/SRS.md`, `docs/product/ROADMAP_MUSIC.md`, `docs/product/COMPETITIVE_BRIEF.md`
- architecture: `docs/architecture/SPEC.md`, `docs/architecture/BLUEPRINT.yaml`, `docs/architecture/REPOSITORY_ARCHITECTURE_SOT.md`
- design: `docs/design/LALIN_LAYOUT_SOT.md`, `docs/design/LALIN_SITEMAP_SOT.md`, `docs/design/LALIN_UI_SOT.md`
- archive: `docs/archive/UI_SITEMAP.md` และเอกสาร GM6/proposal ที่ superseded

## โครงสร้าง
- `backend/` — FastAPI + ML pipelines (Python **3.11**)
  - `app/brain/` — สมอง LLM (`base.py` interface, `ollama_provider.py`, `cloud_provider.py`, `factory.py` สลับสด)
  - `app/pipelines/` — `asr.py` (faster-whisper), `tts.py` (F5-TTS โคลนเสียง), `dubbing.py` (orchestrate), `mastering.py` (Matchering), `music.py` (remix: Demucs/autotune/FX/mix/master)
  - `app/routers/` — REST endpoints (รวม `music.py` → `POST /music/remix`), `app/jobs/` — งานเบื้องหลัง + WebSocket progress
  - `app/services/voices.py` — คลังเสียง, `app/utils/ffmpeg.py` — ffmpeg แบบฝังในตัว
- `frontend/` — Tauri + React + Vite (แท็บ: คลังเสียง/อ่านข้อความ/พากย์/mastering/สมอง + **Remix** กำลังทำ) — theme: **Cinemaro** (นีออนไลม์) ใน `src/styles.css`
- `keys/` — Tauri updater signing key (**gitignored** — อย่า commit)
- `tools/dev/` — developer setup and runtime utilities (`setup_windows.ps1`, `prewarm_ollama.ps1`)
- `tools/build/` — build utilities (`make_icons.py`, `build_sidecar.ps1`, `build_installer.ps1`)
- `tools/verify/` — smoke and release verification utilities
- `scripts/` — compatibility shims for older commands; canonical scripts live in `tools/*`
- `runtime/` — local generated/user state; gitignored (`runtime/data` owns uploads, outputs, voices, projects, workspace)

## คำสั่งที่ใช้บ่อย
```powershell
# backend (เปิด venv ก่อนเสมอ)
cd D:\G-Music\backend ; .\.venv\Scripts\Activate.ps1
uvicorn app.main:app --port 8756          # http://127.0.0.1:8756/docs

# frontend
cd D:\G-Music\frontend
npm run dev          # เบราว์เซอร์ (เร็ว ทดสอบ UI)
npm run tauri dev    # desktop app
npm run build        # ตรวจ TypeScript + build

# smoke test โคลนเสียงไทย
cd D:\G-Music\backend ; .venv\Scripts\python.exe smoke_tts.py

# build ตัวติดตั้ง .exe (NSIS + เซ็น updater)
powershell -ExecutionPolicy Bypass -File tools\build\build_installer.ps1
```

## สภาพแวดล้อม (เครื่องนี้)
- **ต้องใช้ Python 3.11** — torch/f5-tts ยังไม่มี wheel สำหรับ 3.12/3.13. venv อยู่ที่ `backend/.venv` (สร้างด้วย `uv`)
- GPU: **RTX 3060 12GB**, torch **2.5.1+cu121** (CUDA True)
- ติดตั้งใช้ `uv pip install`; torch ต้องระบุ `--index-url https://download.pytorch.org/whl/cu121`
- **Ollama รันอยู่แล้ว** บนเครื่อง — โมเดลภาษาไทยที่ดี: `hf.co/iapp/chinda-qwen3-4b-gguf:Q4_K_M`

## โมเดลที่ใช้จริง
- **TTS/โคลนเสียง:** `VIZINTZOR/F5-TTS-THAI` (arch `F5TTS_Base` + vocos, รองรับไทย+อังกฤษในตัว, 24kHz).
  โหลด ckpt `model_1000000.pt` + `vocab.txt` ผ่าน `cached_path` ใน `tts.py:_get_f5()`
- **ASR:** faster-whisper `large-v3` (ยังไม่โหลด weight — โหลดครั้งแรกที่รัน dubbing, ~3GB)
- **Music remix (`music.py`):** Demucs `htdemucs` (แยก stem), psola (autotune, PSOLA/Praat), pedalboard (FX), librosa (BPM/key/stretch). deps พวกนี้ **lazy import + ติดตั้งแยก**: `uv pip install demucs psola pedalboard`
  - ⚠️ **License:** psola(→parselmouth GPL), pedalboard(GPLv3), matchering(GPLv3) → ถ้าขายเชิงพาณิชย์ ใช้แบบ **BYOM/optional** (ดู `ROADMAP_MUSIC.md`)
  - VRAM 3060 พอ ถ้าโหลดทีละขั้น — `music.py` เรียก `torch.cuda.empty_cache()` หลังแยก stem

## ⚠️ Gotchas
- **cp1252 console พิมพ์ภาษาไทยไม่ได้** — ตอน `python -c` ที่ print ไทย ให้ตั้ง `PYTHONIOENCODING=utf-8` หรือเขียนลงไฟล์แล้ว Read
- **Ollama request แรกช้า (cold-load >4 นาที)** เพราะเขี่ยโมเดลใหญ่ออกจาก VRAM — warm แล้วเร็ว ~2s. `OllamaProvider` timeout = 600s แล้ว
- **thinking model** (qwen3) แทรก `<think>…</think>` — `OllamaProvider` ตัดออกให้แล้ว
- **ffmpeg** ไม่ได้ลงทั้งระบบ — ใช้ `imageio-ffmpeg` (bundle) wire ผ่าน `app/utils/ffmpeg.py:configure()` เรียกตอน boot
- heavy ML deps ใน pipelines เป็น **lazy import** — แอป boot ได้แม้ยังไม่ลงโมเดล (จะ error ตอนเรียกใช้พร้อมข้อความแนะนำ)

## หลักการเขียนโค้ด
- คอมเมนต์/ข้อความ UI เป็นภาษาไทย (ผู้ใช้เป็นคนไทย) แต่ identifier เป็นอังกฤษ
- งาน ML ที่ใช้เวลานานรันผ่าน `jobs.spawn()` + รายงานผ่าน WebSocket เสมอ
- เพิ่ม LLM provider ใหม่ → implement `LLMProvider` ใน `app/brain/` แล้วต่อใน `factory.py`
