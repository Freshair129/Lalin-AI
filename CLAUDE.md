# CLAUDE.md — G-Music

คู่มือสำหรับ Claude Code เมื่อทำงานในโปรเจกต์นี้ (อ่านก่อนเริ่ม)

## ภาพรวม
โปรแกรม AI งานเสียง: **โคลนเสียง · พากย์เสียง (dubbing) · mastering · music remix** ภาษาไทย+อังกฤษ
"สมอง" (LLM) สลับ **Cloud** (Claude/OpenAI/OpenRouter) ↔ **Ollama (local)** ได้สดผ่าน abstraction layer เดียว
มีระบบ **auto-update** (Tauri updater + GitHub Releases) + ตัวติดตั้ง **NSIS .exe**

## เอกสาร (อ่านก่อนทำงานใหญ่)
`docs/DOCS_INDEX.md` คือทางเข้า — โครง hybrid ตาม `.doc-graph.json`:
`docs/product/` (`PRD.md` `SRS.md` `COMPETITIVE_BRIEF.md` `ROADMAP_MUSIC.md`), `docs/architecture/` (`SPEC.md` `BLUEPRINT.yaml` `API_SEMANTICS.md`), `docs/operations/` (`PACKAGING_SIDECAR.md`), `docs/archive/` (`UI_SITEMAP.md`), `docs/appendices/` (risk matrix, traceability), `docs/superpowers/plans/` (implementation plans)

## โครงสร้าง (monorepo — ย้ายจาก backend/+frontend/ แบบแบนเข้า apps/ ใน PR #9)
- `apps/api/` — FastAPI + ML pipelines (Python **3.11**)
  - `app/brain/` — สมอง LLM (`base.py` interface, `ollama_provider.py`, `cloud_provider.py`, `factory.py` สลับสด)
  - `app/pipelines/` — `asr.py` (faster-whisper), `tts.py` (F5-TTS โคลนเสียง), `dubbing.py` (orchestrate), `mastering.py` (Matchering), `music.py` (remix: Demucs/autotune/FX/mix/master), `render.py` (mix arrangement ทั้งก้อนเป็นไฟล์)
  - `app/routers/` — REST endpoints (รวม `music.py` → `POST /music/remix`, `render.py` → `POST /render`, `speech.py` → ASR profile config), `app/jobs/` — งานเบื้องหลัง + WebSocket progress
  - `app/services/voices.py` — คลังเสียง, `app/utils/ffmpeg.py` — ffmpeg แบบฝังในตัว
  - `app/main.py` — `create_app(profile)` แยก **lite** (desktop shell เท่านั้น ไม่โหลด ML หนัก) กับ **full** (ทุก router) ผ่าน env `GMUSIC_BACKEND_PROFILE`
- `apps/desktop/` — Tauri v2 + React + Vite ("Lalin Studio" shell: command bar + BackendGate + RuntimeFooter) — theme: **Cinemaro** (นีออนไลม์) ใน `src/styles.css`
- `apps/mcp/` — MCP server ฝั่ง Node (ยังเล็ก)
- `packages/contracts/` — TypeScript types ที่ share ระหว่าง apps/desktop กับ apps/mcp (`@lalin/contracts` — ต้อง `npm run build:contracts` ก่อน tsc ถึงจะ resolve)
- `keys/` — Tauri updater signing key (**gitignored** — อย่า commit)
- `tools/build/` `tools/dev/` `tools/verify/` — build/setup/smoke scripts จริง (`scripts/*.ps1` เดิมตอนนี้เป็นแค่ shim ที่ redirect มาที่นี่)

## คำสั่งที่ใช้บ่อย
```powershell
# backend (เปิด venv ก่อนเสมอ — .venv ยังอยู่ apps/api/.venv หรือ backend/.venv แล้วแต่เครื่อง)
cd D:\lalin\apps\api ; .\.venv\Scripts\Activate.ps1
uvicorn app.main:app --port 8756          # http://127.0.0.1:8756/docs

# frontend
cd D:\lalin\apps\desktop
npm run dev          # เบราว์เซอร์ (เร็ว ทดสอบ UI)
npm run tauri dev    # desktop app
npm run build        # ตรวจ TypeScript + build

# ตรวจทั้ง workspace (contracts+mcp+desktop build, api compileall, tauri check)
cd D:\lalin ; npm run check:all

# smoke test โคลนเสียงไทย
cd D:\lalin\apps\api ; .venv\Scripts\python.exe smoke_tts.py

# build sidecar + ตัวติดตั้ง .exe (NSIS + เซ็น updater)
powershell -ExecutionPolicy Bypass -File tools\build\build_sidecar.ps1 -Profile full
powershell -ExecutionPolicy Bypass -File tools\build\build_installer.ps1

# รันเทสต์ทั้งชุด (tsc, vitest, pytest, curl smoke)
.\test.bat
```

## สภาพแวดล้อม (เครื่องนี้)
- **ต้องใช้ Python 3.11** — torch/f5-tts ยังไม่มี wheel สำหรับ 3.12/3.13. venv อยู่ที่ `apps/api/.venv` (สร้างด้วย `uv`) — script fallback ไป `backend/.venv` ถ้ายังไม่ได้ย้าย
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
