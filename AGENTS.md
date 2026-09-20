---
version: "0.2.2b"
created_at: "2026-09-20T18:34:22+07:00,LALIN,8429010"
last_update: "2026-09-20T22:40:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "agent-governance"
  doc_type: "core-directive"
  scope: "Lalin-AI repository and Lalin Play separation branch"
---

# AGENTS.md — Lalin AI

คู่มือสำหรับ Codex เมื่อทำงานในโปรเจกต์นี้ (อ่านก่อนเริ่ม)

## Agent identity

- **Name:** LALIN (ลลิน)
- **Role:** Product-minded software engineer and technical architect for Lalin Studio and the Lalin Play product separation.

## ขอบเขตโปรดัคและสถานะการแยก

| Product | หน้าที่ | Source ownership ปัจจุบัน |
|---|---|---|
| Lalin Studio | Create / Edit / Produce: AI audio workstation | `apps/desktop`, `apps/api`, `apps/mcp` ใน `Freshair129/Lalin-AI` |
| Lalin Play | Local media player: Full แบบ Spotify + Winamp และ Compact แบบ VLC | มี standalone candidate ที่ `apps/play-desktop` บน `codex/lalin-play-split`; owner เดิมใน Studio ยังไม่ถอน |
| Lalin Cast | YouTube TV / Leanback, DIAL และ mobile pairing | แยกแล้วที่ `Freshair129/lalin-cast`; ดู [handoff](docs/architecture/LALIN_CAST_SEPARATION_HANDOFF.md) |

Lalin Play เป็นหนึ่งโปรดัค มีสองรูปแบบหน้าจอที่ใช้ playback owner, queue,
ตำแหน่งเล่น และ EQ ชุดเดียวกัน ส่วน Lalin Media เป็นชื่อเดิมของ Cast
และไม่ใช่ชื่อรวมของ Play อีกต่อไป

กติกาสำหรับ branch แยก Play:

- อ่าน [PRD](docs/product/PRD.md) §1.1/4.9 และ
  [ADR-004](docs/architecture/ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md) ก่อนแก้ implementation
- ผู้ใช้อนุมัติ PRD/ADR-004 และ implementation บน branch เมื่อ 2026-09-20;
  การเปลี่ยนขอบเขตใหม่ยังต้องผ่าน doc-first review ตาม R5
- `lalin-play.exe` มี debug build ใน candidate แล้ว แต่ target remote
  `Freshair129/lalin-play` และ installer/update ยังไม่ผ่านเกณฑ์; อย่าอ้างว่าเผยแพร่แล้ว
- แยก runtime ให้เปิดไฟล์ในเครื่องได้โดยไม่พึ่ง Studio/API ก่อนถอน owner เดิม
- ตรวจทั้ง consumer และผู้ใช้งานร่วมก่อนลบ: `timeline/peaks.ts` ยังใช้
  `playback/audioContext.ts`; Cast launcher ยัง import `isTauri` จาก `windowManager.ts`
- คง Arrange preview และ Mastering state แยกจาก consumer player;
  ห้ามให้ Full/Compact สร้าง engine ซ้อนหรือสลับหน้าจอแล้วเพลงเริ่มใหม่
- เก็บ contracts ที่ Studio/API/MCP ยังใช้ และทำ migration ของ queue/EQ แบบผู้ใช้เลือก;
  ไม่อ่าน/ล้าง WebView profile เดิมเพื่อย้ายข้อมูลเงียบ ๆ
- ก่อนลบ Play implementation จาก repo หลัก ต้องมี standalone build,
  Studio integration และ recovery evidence ตาม ADR-004; งานบน branch ไม่เปลี่ยน `main` โดยอัตโนมัติ

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
- product split: `docs/architecture/ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md` (approved, implementation partial),
  `docs/architecture/LALIN_CAST_SEPARATION_HANDOFF.md` (Cast split completed)
- Play local evidence: `docs/validation/LALIN_PLAY_STANDALONE_FOUNDATION.md`
- Play documentation/status register: `docs/product/LALIN_PLAY_DOCUMENTATION.md`;
  links current traceability, user guide and candidate integration/migration,
  separation handoff and release runbook. Candidate detail still needs R5 review;
  branch commit/push is not repo export or release acceptance.
- Local video: approved `docs/product/CR-003--LALIN_PLAY_LOCAL_VIDEO.md` and
  `docs/validation/LALIN_PLAY_LOCAL_VIDEO.md`; standalone uses one persistent
  video-capable media element for audio/video, not a second playback owner
- Minimal Compact: approved `docs/product/CR-004--LALIN_PLAY_MINIMAL_COMPACT_PREVIEW.md`
  and `docs/validation/LALIN_PLAY_MINIMAL_COMPACT.md`; Compact ไม่มี queue/EQ controls
  แต่ state ยังใช้ร่วมกับ Full อนุญาต preview-only muted/paused video อีกหนึ่งตัว
  ห้ามเรียก play/ต่อ Web Audio/MediaSession หรือ seek ตัวเล่นหลักเพียงเพราะ hover
  Addendum A fullscreen/±10 ผ่าน approval และมี local evidence ที่
  `docs/validation/LALIN_PLAY_FULLSCREEN_SKIP.md`; Full library ไม่ใช่ Fullscreen

## โครงสร้าง
- `apps/api/` — FastAPI + ML pipelines (Python **3.11**)
  - `app/brain/` — สมอง LLM (`base.py` interface, `ollama_provider.py`, `cloud_provider.py`, `factory.py` สลับสด)
  - `app/pipelines/` — `asr.py` (faster-whisper), `tts.py` (F5-TTS โคลนเสียง), `dubbing.py` (orchestrate), `mastering.py` (Matchering), `music.py` (remix: Demucs/autotune/FX/mix/master)
  - `app/routers/` — REST endpoints (รวม `music.py` → `POST /music/remix`), `app/jobs/` — งานเบื้องหลัง + WebSocket progress
  - `app/services/voices.py` — คลังเสียง, `app/utils/ffmpeg.py` — ffmpeg แบบฝังในตัว
- `apps/desktop/` — Studio: Tauri + React + Vite; rail ตาม SOT คือ Workspace / Voice Studio / Dubbing / Arrange / Mastering / Library / Jobs / Settings; theme ใน `src/styles.css`
- `apps/desktop/src/playback/` + `src/components/LalinPlayWindow.tsx` — Play owner ปัจจุบัน;
  ยังไม่ใช่ standalone app และยังไม่มี Full/Compact ตาม PRD ใหม่ครบ
- `apps/play-desktop/` — standalone candidate ที่มี npm/Cargo manifests ของตัวเอง;
  รันคำสั่งภายในโฟลเดอร์นี้ ไม่เพิ่มเข้า root workspace; Studio IPC/migration ยังไม่พร้อม
- `apps/desktop/src/media/` — Studio-side launcher สำหรับ Lalin Cast ภายนอกผ่าน `LALIN_CAST_EXECUTABLE`
- `keys/` — Tauri updater signing key (**gitignored** — อย่า commit)
- `tools/dev/` — developer setup and runtime utilities (`setup_windows.ps1`, `prewarm_ollama.ps1`)
- `tools/build/` — build utilities (`make_icons.py`, `build_sidecar.ps1`, `build_installer.ps1`)
- `tools/verify/` — smoke and release verification utilities
- `scripts/` — compatibility shims for older commands; canonical scripts live in `tools/*`
- `runtime/` — local generated/user state; gitignored (`runtime/data` owns uploads, outputs, voices, projects, workspace)
- `backend/` / `frontend/` — legacy generated artifacts only after Phase 4; app source lives in `apps/*`

## คำสั่งที่ใช้บ่อย
```powershell
# backend (เปิด venv ก่อนเสมอ)
cd F:\lalin\apps\api
..\..\backend\.venv\Scripts\Activate.ps1
uvicorn app.main:app --port 8756          # http://127.0.0.1:8756/docs

# frontend
cd F:\lalin\apps\desktop
npm run dev          # เบราว์เซอร์ (เร็ว ทดสอบ UI)
npm run tauri dev    # desktop app
npm run build        # ตรวจ TypeScript + build

# smoke test โคลนเสียงไทย
cd F:\lalin\apps\api
..\..\backend\.venv\Scripts\python.exe smoke_tts.py

# build ตัวติดตั้ง .exe (NSIS + เซ็น updater)
cd F:\lalin
powershell -ExecutionPolicy Bypass -File tools\build\build_installer.ps1
```

## สภาพแวดล้อม (เครื่องนี้)
- **ต้องใช้ Python 3.11** — torch/f5-tts ยังไม่มี wheel สำหรับ 3.12/3.13. venv ปัจจุบันยังอยู่ที่ `backend/.venv` เป็น legacy local fallback; canonical ใหม่คือ `apps/api/.venv` เมื่อสร้างใหม่
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

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.2b | 2026-09-20 | beta | Link complete Play document register and clarify candidate execution boundaries | based on f5a6681 | LALIN |
| 0.2.1b | 2026-09-20 | beta | Link approved fullscreen/relative-seek evidence and clarify Full distinction | based on 8429010 | LALIN |
| 0.2.0b | 2026-09-20 | beta | Add approved minimal Compact and preview-only decoder boundary with native evidence | based on 8429010 | LALIN |
| 0.1.2b | 2026-09-20 | beta | Reference approved video scope and persistent media owner evidence | based on 8429010 | LALIN |
| 0.1.1b | 2026-09-20 | beta | Record approval and additive standalone candidate; retain Studio and export gates | based on 8429010 | LALIN |
| 0.1.0b | 2026-09-20 | candidate | Versioned the existing project guide; added Studio/Play/Cast ownership and Play branch migration boundaries | based on 8429010 | LALIN |
