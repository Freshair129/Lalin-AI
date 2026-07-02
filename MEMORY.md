# MEMORY.md — G-Music handoff (สำหรับ agent ที่มาทำต่อ)

> อ่านไฟล์นี้ก่อนเริ่ม. อ่าน `CLAUDE.md` (คู่มือโปรเจกต์) + `docs/BLUEPRINT.yaml` (spec เครื่องอ่าน) ด้วย.
> สรุป ณ 2026-07-02. TypeScript = **clean** (`npx tsc --noEmit` ผ่าน).

---

## 1. โปรเจกต์คืออะไร
G-Music = desktop app (Tauri v2 + React/Vite + FastAPI/Python 3.11) งานเสียง AI:
**โคลนเสียง · พากย์ (dubbing) · mastering · music remix (DAW เต็มตัว)** ไทย+อังกฤษ.
สมอง LLM สลับ Ollama(local)↔Cloud(Claude/OpenAI/OpenRouter) สดผ่าน `app/brain/factory.py`.
ธีมปัจจุบัน: **glassmorphism (blur 24px) + bento + floating pods + neon-lime accent `#c7f046`** (ไม่ใช่ Cinemaro/flat เดิมแล้ว).

## 2. วิธีรัน/เทส (สำคัญ)
- `dev.bat` — backend :8756 + frontend :5173 + เปิดเบราว์เซอร์ (เคลียร์พอร์ตให้เอง). **web dev — ไม่มีหน้าต่างเด้ง ต้องเปิด URL**
- `app.bat` — desktop app จริง (Tauri; ครั้งแรก compile Rust ~นาที)
- `test.bat` — tsc + backend import + curl endpoints
- **⚠️ GOTCHA: พอร์ต 8756 ชนบ่อย.** backend เก่าค้างในหน้าต่าง cmd → instance เก่า **ไม่มี router ใหม่** (fs/packs/projects/export) → 404. เพิ่ม router ใหม่ = **ต้อง restart backend เสมอ**. dev.bat/app.bat/test.bat kill port ให้แล้ว.
- venv = `backend/.venv` (สร้างด้วย uv, **Python 3.11 บังคับ**). ลง dep เพิ่ม: `uv pip install ...`

## 3. สถาปัตยกรรม
**Backend routers** (`backend/app/routers/`, มี 31 routes): health, brain, voices, tts, dubbing, mastering, **music** (POST /music/remix, POST /music/export=bake FX), files (upload/download/input/export), **fs** (file manager sandboxed /fs), **packs** (marketplace), **projects** (workspace save/load), jobs (+WebSocket /jobs/ws/{id}).
- งาน ML/หนัก = `jobs.spawn()` + รายงานผ่าน WebSocket เสมอ.
- ML deps = **lazy import** (แอป boot ได้แม้ไม่ลงโมเดล).

**Music pipeline** (`backend/app/pipelines/music.py`): `run_remix` (Demucs แยก stem → BPM/key → time-stretch → psola autotune → pedalboard FX → phase-sync/offset → mix → master). `apply_master_fx` (bake reverb/echo/comp ตอน export). deps: `demucs psola pedalboard` (ลงแยก).

**Frontend Remix = DAW** (`components/RemixPanel.tsx` เป็นตัวหลัก ~500 บรรทัด):
- Clip engine: `timeline/clipModel.ts` (types), `ops.ts` (pure immutable ops), `peaks.ts` (Web Audio decode+peaks), `useClipEngine.ts` (state+undo/redo+selection), `ClipTimeline.tsx` (render/drag/slice/playhead/Web Audio playback+FX chain+meter/snap/mixer header).
- Layout switch: **Standard** (timeline + bento FxRack) / **+Node** (react-flow graph + timeline).
- Left dock (tab **Library**/**Track**) = `LibraryPanel.tsx` (browse packs) / `PropertiesPanel.tsx`.
- ปรับขนาด panel ด้วยเมาส์ = `Splitter.tsx` (ลาก + double-click reset).
- component อื่น: Knob, StereoMeter, Meter, Tilt(3D), ContextMenu, NodeDesigner, FileManager, MarketplacePanel, icons.tsx (line SVG แทน emoji).
- Project file = `useProjectFile` hook (New/Open/Save/Save As + dirty) เก็บทั้ง clip arrangement + params + ขนาด panel ผ่าน /projects.

## 4. TODO (ทำต่อ)
- [ ] เชื่อม FileManager ↔ project (.gmp): open/save ผ่าน file manager + **drag ไฟล์เสียงจาก fs เข้า timeline**
- [ ] drag & drop upload ใน FileManager (backend POST /fs/upload มีแล้ว ยังไม่ต่อ UI)
- [ ] Remix: **automation envelope** (เส้น gain/pitch ลากได้ — `Envelope` มีใน clipModel แล้ว), drag clip ข้าม track
- [ ] snap-to-grid: ตอนนี้ snap เฉพาะตอน commit (pointerup) — เพิ่ม visual snap ระหว่างลาก
- [ ] Marketplace: download pack จริง (ตอนนี้ mock mark-installed), ต่อ Library ↔ ใช้ pack ใน timeline
- [ ] NodeDesigner: custom node render element จริง (Text/LFO/Subpatch) + snippet share (save/load node selection)
- [ ] Auto-updater: เปลี่ยน endpoint ใน `tauri.conf.json` เป็น repo จริง + ใส่ GitHub secret `TAURI_SIGNING_PRIVATE_KEY` ก่อน release
- [ ] Tauri sidecar (bundle backend เป็นไฟล์เดียว) + CPU fallback ทดสอบจริง

## 5. NOTE/Concern สำคัญ (ไม่อยู่ในโค้ด)
- **⚠️ License (ก่อนขายเชิงพาณิชย์):** โมเดลไทย `VIZINTZOR/F5-TTS-THAI` = CC-BY-4.0 (ขายได้+ให้เครดิต) **แต่** เป็น fine-tune จากฐาน NC → สีเทา. `psola`(→parselmouth GPL), `pedalboard`(GPLv3), `matchering`(GPLv3), Demucs(MIT), XTTS(CPML/NC). กลยุทธ์: **Local-first + BYOM** (ให้ผู้ใช้โหลดโมเดล/FX เอง ไม่ bundle GPL). ดู `docs/COMPETITIVE_BRIEF.md` + `ROADMAP_MUSIC.md`.
- **Effects reverb/echo/comp มี 2 ที่ อย่าสับสน:** (1) **preview** = Web Audio ใน `ClipTimeline` (real-time ตอนเล่น, ไม่ลงไฟล์), (2) **bake** = `POST /music/export` (pedalboard, ลงไฟล์จริงตอน export). Pan = StereoPannerNode ต่อ track (preview เท่านั้น).
- **Workspace/project เก็บ recipe + clip arrangement เต็ม** แต่ **แชร์ข้ามเครื่องได้เฉพาะที่ต่อ backend เดียวกัน** (ไฟล์เสียงอยู่ใน backend uploads/outputs; อีกเครื่องต้องเข้าถึง path เดียวกัน).
- **Verify UI ยาก:** preview headless window มักเป็น **0×0** → react-flow error #004 + screenshot timeout. ใช้ `preview_eval` เช็ค DOM/computed-style แทน screenshot. HMR reload ทำ eval แรกได้ผลว่าง — ต้อง reload+รอ.
- **cp1252/cp874 console** พิมพ์ไทยเพี้ยน → ตั้ง `PYTHONIOENCODING=utf-8`; ใน .bat ใช้ข้อความอังกฤษ + chcp 65001.
- **ffmpeg** ไม่ได้ลงระบบ — ใช้ imageio-ffmpeg wire ตอน boot (`utils/ffmpeg.py`). warning "Couldn't find ffmpeg" จาก pydub = ปกติ ไม่ต้องแก้.
- **Ollama แย่ง VRAM** กับ ML (RTX 3060 12GB): โหลดทีละขั้น, `torch.cuda.empty_cache()` หลัง Demucs, บีบ Ollama (`keep_alive:0`) ก่อนงานหนัก.
- **ผู้ใช้ co-edit ไฟล์เอง** (FxRack, music.py, .bat, ChannelMeterBalance.tsx, AGENTS.md ฯลฯ) — เช็คไฟล์จริงก่อนแก้ อย่าเดาจาก context เก่า.

## 6. เอกสารในโปรเจกต์
`docs/`: PRD · SRS · SPEC · BLUEPRINT.yaml (machine-readable) · UI_SITEMAP · COMPETITIVE_BRIEF (กลยุทธ์+license) · ROADMAP_MUSIC (pipeline พิสูจน์แล้ว+license). `CLAUDE.md`=คู่มือ. `AGENTS.md`, `README.md` = ผู้ใช้เพิ่มเอง.
