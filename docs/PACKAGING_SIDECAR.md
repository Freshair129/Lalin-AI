# Packaging: Backend เป็น Tauri Sidecar (WP 5.2)

> **สถานะ: SCAFFOLDING เท่านั้น** — เอกสารและสคริปต์นี้เขียนขึ้นโดยยังไม่เคยรัน
> PyInstaller build จริงบนเครื่องนี้ และยังไม่เคย spawn sidecar จาก Tauri จริง
> ต้องมีคน "ผ่านการ build จริงอย่างน้อย 1 รอบ" เพื่อ validate ทุกจุดที่ทำเครื่องหมาย
> ⚠️ ก่อนเชื่อว่าใช้งานได้ ดู [Known limitations](#known-limitations--สิ่งที่ยังไม่ validate)
> ท้ายเอกสาร

| Field | Value |
|-------|-------|
| **Doc Version** | 1.0.1 |
| **Status** | **Draft** (SCAFFOLDING — ยังไม่เคย build จริง → ดู E-risk R-006) |
| **Author** | Boss |
| **Created** | — (WP 5.2, ~2026-07-02) |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | ~2026-07-02 | Boss | ฉบับแรก (scaffolding) |
| 1.0.1 | 2026-08-09 | Boss | เพิ่ม Document Control + เข้าระบบ doc-graph (rwang:doc-architect) |

## เป้าหมาย

ทำให้ G-Music เป็นแอป **one-click install** ที่ไม่ต้องให้ผู้ใช้ปลายทางเปิด
`uvicorn` เองหรือมี Python ติดตั้งในเครื่อง — โดยฝัง backend (FastAPI) เป็น
standalone `.exe` แล้วให้ Tauri spawn มันเป็น "sidecar" ตอนแอปเปิด

## ภาพรวมสถาปัตยกรรม

```
G-Music.exe (Tauri/WebView2)
   │  spawn ตอน startup ผ่าน tauri-plugin-shell
   ▼
g-music-backend-x86_64-pc-windows-msvc.exe   (PyInstaller --onedir bundle)
   │  uvicorn app.main:app --host 127.0.0.1 --port 8756
   ▼
FastAPI app (backend/app/main.py)
   - โมเดล ML (F5-TTS ckpt, faster-whisper, demucs, ...) โหลดจาก
     huggingface/torch cache ตอน "เรียกใช้ครั้งแรก" (lazy) — ไม่ได้ฝังใน .exe
```

## Prerequisites (สำหรับคนที่จะรัน build จริง)

- `backend/.venv` ต้องมีอยู่แล้วและ **ใช้ Python 3.11** (ตาม `CLAUDE.md` —
  torch/f5-tts ยังไม่มี wheel สำหรับ 3.12/3.13) สร้างด้วย
  `scripts/setup_windows.ps1` ก่อน
- `.venv` ควรมี ML deps ที่จำเป็นติดตั้งแล้วตามที่ต้องการ bundle เข้าไปจริง
  (อย่างน้อย fastapi/uvicorn; ถ้าต้องการ dubbing/mastering/remix ครบ ต้องมี
  torch, faster-whisper, f5-tts, matchering, demucs, psola, pedalboard ด้วย —
  ดู caveat เรื่องขนาดไฟล์ด้านล่าง)
- `pyinstaller` — สคริปต์จะพยายามติดตั้งให้อัตโนมัติใน venv ถ้ายังไม่มี
- (ทางเลือก) Rust toolchain สำหรับ `rustc -vV` เพื่อ auto-detect
  target-triple — ถ้าไม่มี สคริปต์ fallback เป็น `x86_64-pc-windows-msvc`
  ซึ่งถูกต้องสำหรับเครื่อง Windows x64 ทั่วไปอยู่แล้ว

## วิธีรัน

```powershell
cd D:\G-Music
powershell -ExecutionPolicy Bypass -File scripts\build_sidecar.ps1
```

สิ่งที่สคริปต์ทำ (ดูคอมเมนต์ในสคริปต์เองสำหรับรายละเอียด/เหตุผล):

1. ตรวจว่ามี `backend\.venv\Scripts\python.exe` — ถ้าไม่มี **fail ทันทีพร้อมคำแนะนำ**
   ให้รัน `scripts/setup_windows.ps1` ก่อน
2. ตรวจว่ามี `pyinstaller` ใน venv นั้น — ถ้าไม่มี ติดตั้งให้อัตโนมัติ
   (`pip install pyinstaller`) แล้ว fail ถ้าติดตั้งไม่สำเร็จ
3. หา target-triple ของเครื่อง (ผ่าน `rustc -vV` ถ้ามี ไม่งั้น fallback)
4. ลบ `backend\dist`, `backend\build`, `backend\g-music-backend.spec` เก่าทิ้ง
   (ทำให้ **idempotent** — รันซ้ำได้โดยไม่ค้างของเก่า)
5. สร้าง `backend\sidecar_entry.py` อัตโนมัติถ้ายังไม่มี (entrypoint บาง ๆ ที่
   เรียก `uvicorn.run("app.main:app", host="127.0.0.1", port=8756)`)
6. รัน `pyinstaller --onedir --console sidecar_entry.py` จาก `backend/`
7. copy ผลลัพธ์ (`backend\dist\g-music-backend\*` ทั้งโฟลเดอร์ รวม `_internal\`)
   เข้า `frontend\src-tauri\binaries\` แล้ว rename ตัว `.exe` หลักเป็น
   `g-music-backend-<target-triple>.exe` ตามที่ Tauri sidecar คาดหวัง

ผลลัพธ์:
```
frontend/src-tauri/binaries/
  g-music-backend-x86_64-pc-windows-msvc.exe   <- ตัวที่ externalBin ชี้ถึง
  _internal/...                                 <- dependency ของ PyInstaller (จำเป็นต้องอยู่ข้าง ๆ .exe)
```

## การเปลี่ยนแปลงใน `tauri.conf.json`

เพิ่ม 2 คีย์ใน `bundle` (ของเดิม `nsis` + `updater` ไม่ถูกแตะ):

```jsonc
"bundle": {
  ...
  "externalBin": [
    "binaries/g-music-backend"
  ],
  "resources": [
    "binaries/_internal/**/*"
  ],
  ...
}
```

- **`externalBin`**: ชื่อ "base name" ของ sidecar (ไม่มี target-triple/`.exe`) —
  Tauri v2 จะเติม `-<target-triple>.exe` เองตอน build/runtime และฝังไฟล์
  `binaries/g-music-backend-x86_64-pc-windows-msvc.exe` เข้า bundle
  พร้อมสิทธิ์ execute ให้อัตโนมัติ นี่คือ path ที่ `build_sidecar.ps1` เขียนถึง
- **`resources`**: PyInstaller `--onedir` แยก dependency (native DLLs, .pyd,
  data files) ไว้ในโฟลเดอร์ `_internal\` ข้าง ๆ `.exe` — `externalBin` ฝังได้
  แค่ตัว exe เดี่ยว ๆ ไม่ใช่ทั้งโฟลเดอร์ จึงต้องประกาศ `_internal\` เป็น
  `resources` แยกต่างหากเพื่อให้ install อยู่ path เดียวกันตอนรันจริง
  (ยังไม่ validate ว่า relative path ระหว่าง resources กับ externalBin ตรง
  กับที่ `.exe` คาดหวังหรือไม่ — ดู known limitations)

## Capability / permission ที่ต้องมี (ยังไม่ได้แก้ไฟล์ Rust)

`frontend/src-tauri/capabilities/default.json` มี `shell:allow-open` และ
`process:default` อยู่แล้ว แต่การ **spawn sidecar ต้องมี permission เพิ่ม**
ที่ยังไม่ได้เพิ่ม (นอกขอบเขตของ worker นี้ ซึ่งแก้ได้แค่ scripts/docs/
tauri.conf.json ไม่แตะไฟล์ Rust หรือ capabilities):

- ต้องเพิ่ม permission เช่น `shell:allow-execute` หรือ scope เจาะจงสำหรับ
  sidecar ตาม pattern `tauri-plugin-shell` v2 (ดู Tauri v2 docs:
  "Embedding External Binaries") ใน `capabilities/default.json`
- ต้องมีโค้ด Rust ใน `src-tauri/src/lib.rs` (หรือ `main.rs`) เรียก
  `app.shell().sidecar("g-music-backend")?.spawn()` ตอน `setup()` ของ
  `tauri::Builder` — ปัจจุบัน `lib.rs` ยังไม่มีโค้ดนี้ (มีแค่ plugin
  registration) — **ต้องเพิ่มโดย worker ที่รับผิดชอบไฟล์ Rust**
- ควร spawn แบบ "รอ health check" — poll `GET http://127.0.0.1:8756/` (มี
  router `health` อยู่แล้วใน `backend/app/routers/health.py`) จนตอบ 200
  ก่อนให้ frontend เริ่มยิง API อื่น ๆ (ยังไม่ได้ implement — เป็นงาน
  frontend/Rust ต่างหาก)

## First-run model download

- Model weights (F5-TTS `model_1000000.pt`+`vocab.txt`, faster-whisper
  `large-v3`, demucs `htdemucs`, ...) **ไม่ได้ฝังใน sidecar .exe** —
  ใหญ่เกินไปสำหรับ installer (หลาย GB) และเป็น license/ต้นทางที่แยกจากโค้ด
- ทุกอย่างยังคงโหลดแบบ **lazy** ตาม pattern เดิมใน `tts.py`/`asr.py`/
  `music.py` ผ่าน `cached_path` / HuggingFace cache — ครั้งแรกที่ผู้ใช้
  เรียกใช้ฟีเจอร์ที่ต้องการโมเดลนั้น จะดาวน์โหลดอัตโนมัติ (ต้องมีเน็ต +
  ใช้เวลา + พื้นที่ดิสก์) เหมือนตอนรันจาก source ทุกประการ — ไม่มีอะไร
  เปลี่ยนจากพฤติกรรมเดิม
- **ยังไม่มี** UI progress/first-run wizard สำหรับดาวน์โหลดโมเดลใน installer
  นี้ — เป็นเรื่องที่ต้องออกแบบเพิ่ม (แนะนำ: ใช้ WebSocket progress ที่มีอยู่
  แล้วสำหรับ jobs เพื่อโชว์สถานะดาวน์โหลดโมเดลครั้งแรกด้วย)

## CUDA vs CPU fallback

- sidecar `.exe` ที่ build จาก `backend/.venv` จะพก **torch build เดียวกับที่
  venv ลงไว้** (ตาม `CLAUDE.md`: `torch==2.5.1+cu121` ผ่าน
  `--index-url https://download.pytorch.org/whl/cu121`) — เครื่องผู้ใช้ปลายทาง
  ที่ไม่มี NVIDIA GPU/CUDA driver ที่ตรงกัน **จะ import ได้แต่ inference จะ error
  หรือ fallback ช้ามาก** ขึ้นกับว่า pipeline โค้ดมี CPU fallback path หรือไม่
  (ยังไม่ตรวจสอบว่า `asr.py`/`tts.py`/`music.py` มี try/except สลับไป
  `device="cpu"` ครบทุกจุดหรือไม่ — งานนี้อยู่นอกขอบเขต worker)
- สำหรับ distribution จริงที่ต้องรองรับทั้งเครื่องมี GPU/ไม่มี GPU อาจต้อง
  build sidecar 2 ตัวแยกกัน (cu121 กับ cpu-only torch) หรือ detect
  CUDA ตอน runtime แล้วเลือก path — **ยังไม่ implement**, เป็นแค่ข้อสังเกต
  ไว้ในเอกสารนี้

## Known limitations / สิ่งที่ยังไม่ validate

สคริปต์และ config นี้เป็น **scaffolding ที่เขียนจากการอ่านโค้ด+เอกสาร
Tauri v2 เท่านั้น** — ยังไม่เคยรัน build จริงในสภาพแวดล้อมนี้ (worker ที่เขียน
ไฟล์นี้ถูกห้ามรัน pyinstaller/npm/cargo หรือ start server) จุดที่ต้อง validate
ก่อนถือว่า "ใช้งานได้จริง":

1. **ขนาดไฟล์ / เวลา build** — ถ้า venv มี torch+demucs+matchering ครบ ผลลัพธ์
   PyInstaller อาจใหญ่หลาย GB และใช้เวลา build นาน — ยังไม่วัดจริง
2. **Missing hidden imports** — PyInstaller มักมองไม่เห็น native extension
   ของ torch/ctranslate2(faster-whisper)/demucs โดย static analysis อย่าง
   เดียว มีโอกาสสูงที่ต้องเพิ่ม `--collect-all torch` ฯลฯ (มี comment ไว้ใน
   `build_sidecar.ps1` แล้ว แต่ยังไม่ทดสอบว่าพอหรือไม่)
3. **`resources` vs `externalBin` relative path** — ยังไม่ยืนยันว่า Tauri v2
   วาง `resources` ไว้ในตำแหน่งที่ sidecar `.exe` (ซึ่งมองหา `_internal\`
   แบบ relative-to-self) จะหาเจอจริงตอนรันจาก installed app — ต้องทดสอบบน
   เครื่องที่ install แล้วจริง ไม่ใช่แค่ `tauri dev`
4. **Capability/permission wiring + Rust spawn code** — ยังไม่มีโค้ด Rust
   เรียก sidecar และยังไม่ได้เพิ่ม `shell:allow-execute` permission
   (นอกขอบเขตไฟล์ที่ worker นี้แก้ได้) — แอปจะ **ยังไม่ spawn backend เอง**
   จนกว่าจะมีคนเพิ่มส่วนนี้
5. **`sidecar_entry.py`** ที่สคริปต์สร้างอัตโนมัติยังไม่ได้ตรวจว่า
   `configure_ffmpeg()` และ side-effects อื่น ๆ ตอน import `app.main` ทำงาน
   ถูกต้องภายใต้ frozen/PyInstaller environment (เช่น path resolution ของ
   `imageio-ffmpeg` bundle) หรือไม่
6. **installer size** ผ่าน NSIS จะโตขึ้นมากถ้ารวม sidecar ที่มี ML deps —
   ยังไม่ได้ตรวจสอบ NSIS ว่ารองรับไฟล์ขนาดนี้ลื่นไหลแค่ไหน

**สรุป:** โครงสร้าง config/สคริปต์นี้ทำตาม documented shape ของ Tauri v2
sidecar (`externalBin` + `resources`) และ PyInstaller `--onedir` ที่ถูกต้อง
ตามทฤษฎี แต่ **ต้องผ่านการ build+run จริงอย่างน้อย 1 รอบเต็ม** (รวม install
จริงจาก NSIS ไม่ใช่แค่ `tauri dev`) ก่อนเชื่อว่าใช้งานได้ในสภาพแวดล้อมจริง
