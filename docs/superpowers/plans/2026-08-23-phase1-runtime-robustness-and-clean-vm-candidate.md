---
version: "0.1.0b"
created_at: "2026-08-23T16:51:15+07:00,LALIN (ลลิน),uncommitted"
last_update: "2026-08-23T16:51:15+07:00,LALIN (ลลิน)"
status: "beta"
attributes:
  domain: "runtime-robustness"
  scope: "Phase 1: G-09 -> G-06 -> G-07 plus clean-VM acceptance"
---

# Phase 1 Runtime Robustness + Clean-VM Acceptance (Candidate)

เอกสารนี้ทำให้ Phase 1 ใน `2026-08-20-master-plan.md` พร้อม implement โดยยืนยันกับ
source ปัจจุบันก่อน และแยกหลักฐานของ **full runtime** ออกจากหลักฐานของ **lite installer**
อย่างชัดเจน

> Approved by Boss on 2026-08-23; implementation อยู่ใน beta verification และยังมี
> manual CPU-TTS, RTX 3060 และ clean-VM gates เปิดอยู่

## 1. Classification

- Complexity: **C-2 — Documentation-Driven Implementation**
- Change risk: **MEDIUM** — แตะ config, job lifecycle, REST/WS contract และหลายหน้า UI
- Required order: **G-09 -> G-06 -> G-07**
- Scope boundary: ไม่เพิ่ม cancel/resume อัตโนมัติ, distributed queue, multi-process worker,
  cloud queue หรือ full-ML installer

## 2. Verified current state

| Area | Current source truth | Gap |
|---|---|---|
| G-09 | `Settings.asr_device`/`tts_device` default เป็น `cuda`; ASR `float16` | เครื่องไม่มี CUDA เรียก speech pipeline แล้วล้ม; `/runtime/status` ยังไม่รายงาน effective device |
| G-06 | `JobManager` เก็บ `_jobs` ใน memory; `useJob` และ Batch Queue ไม่ persist job id | ปิด backend/reload UI แล้วงานและการติดตามหาย |
| G-07 | `spawn()` เรียก `asyncio.create_task()` ทุกงานทันที; มี `empty_cache()` เฉพาะ music บางช่วง | งาน CUDA ซ้อนได้และไม่มี admission gate กลาง |
| Clean VM | มี installer `apps/desktop/src-tauri/target/release/bundle/nsis/G-Music_0.1.0_x64-setup.exe` | checklist เดิมยังชี้ `frontend/`, คาดคำว่า `ONLINE` แทน `READY`, และใช้ชื่อแท็บเก่า |

## 3. Architectural decisions

### AD-1 — Requested device แยกจาก effective device

Config รับ `auto | cpu | cuda` โดยค่าเริ่มต้นเป็น `auto` ทั้ง ASR/TTS แต่ไม่ import
`torch` จาก polling endpoint หรือช่วง boot เพื่อรักษา lazy-load ตาม NFR-02.1

- pipeline resolve device ตอนเริ่มใช้ ML ครั้งแรก
- `auto`: CUDA เมื่อ runtime ของ engine นั้นยืนยันว่าใช้ CUDA ได้; ไม่เช่นนั้น CPU
- ASR effective CPU บังคับ `compute_type=int8`; effective CUDA ใช้ `float16`
- ถ้าผู้ใช้ระบุ `cuda` แต่ unavailable ให้ fail แบบข้อความไทยชัดเจน ไม่แอบเปลี่ยน config
- runtime registry เก็บ requested/effective/reason หลัง resolve
- `/runtime/status.runtime.devices` รายงาน registry; ก่อน resolve ค่า `effective=null`

เหตุผล: ถ้า `/runtime/status` import torch เอง จะทำให้ status poll กลายเป็น control-plane
side effect และขัด API semantics ปัจจุบัน

### AD-2 — Persist snapshot แต่ไม่ resume pipeline

เก็บ job snapshot แบบ atomic JSON ที่ `data_dir/jobs.json` เพื่อไม่เพิ่ม dependency และให้
อ่าน/กู้ไฟล์ได้ง่าย รูปแบบขั้นต่ำ:

```json
{
  "schema_version": 1,
  "jobs": [{
    "id": "...",
    "kind": "tts",
    "resource": "gpu",
    "status": "interrupted",
    "progress": 0.4,
    "message": "...",
    "result": null,
    "error": null,
    "created_at": "ISO-8601",
    "updated_at": "ISO-8601"
  }]
}
```

- write ผ่าน temp file ใน directory เดียวกันแล้ว `os.replace()`
- persist ตอน create, report และ terminal transition
- boot เปลี่ยนทั้ง `queued` และ `running` ที่โหลดกลับมาเป็น `interrupted` เพราะ callback
  เดิมอยู่ใน process ที่ตายแล้วและ pipeline ยังไม่ idempotent
- `interrupted` เป็น terminal state; WS ส่ง snapshot แล้วปิดเหมือน `done/error`
- ไฟล์เสียให้ quarantine เป็น `jobs.corrupt-<timestamp>.json`, เริ่ม registry ว่าง และ log
  เหตุผล; ห้ามทำให้แอป boot ไม่ได้
- ไม่ persist subscriber queue หรือ Python task/callback

### AD-3 — GPU admission เป็น resource contract แบบ explicit

เพิ่ม `resource="gpu" | "cpu"` ที่ call site ของ `jobs.spawn()` ห้ามเดาจากชื่อ job

- GPU: TTS, Dubbing, Remix เมื่อ effective device เป็น CUDA
- CPU: Render, Render+FX, Mastering, Export FX และงาน speech ที่ fallback เป็น CPU
- GPU queue เป็น FIFO และมี concurrency = 1
- CPU job ไม่รอ GPU semaphore
- ก่อนเริ่ม GPU job ตรวจ free VRAM; ถ้าไม่พอให้อยู่ `queued` พร้อมข้อความไทยแทนการ
  เปลี่ยนเป็น `running`
- threshold ต่อชนิดงานต้องมาจาก peak measurement บน RTX 3060 12GB + headroom 10%; บันทึก
  ใน `model-lifecycle.md` ก่อนเปิด gate นี้ ห้ามตั้งตัวเลขเดา
- หลัง terminal transition ของ GPU job เรียก centralized cleanup แบบ best-effort
  (`gc.collect()` + `torch.cuda.empty_cache()` เมื่อ torch/CUDA ถูกโหลดแล้ว)

หมายเหตุ: `render-with-FX` ใช้ scipy/soundfile/pedalboard ใน source ปัจจุบัน จึงเป็น CPU job;
master plan เดิมที่จัดเป็น GPU-heavy ต้องแก้ให้ตรง implementation

## 4. Work packages and verification

### 4.1 G-09 — CPU fallback

Proposed changes:

1. เพิ่ม resolver/registry ที่แยกตาม engine โดยไม่ cold-import จาก health poll
2. ปรับ config default และ ASR compute type resolution
3. ต่อ effective device เข้า F5/XTTS/faster-whisper และ runtime status contract
4. แสดง footer/status warning: `ไม่พบ GPU — กำลังใช้ CPU งานเสียงจะช้าลง`
5. ปรับ `runtime_device_report.py`, SRS, BLUEPRINT และ API semantics ให้ตรงกัน

Tests first:

- CUDA unavailable + requested auto -> TTS/ASR effective CPU
- ASR CPU -> `int8`; CUDA -> `float16`
- explicit unavailable CUDA -> error ไทยที่ actionable
- `/runtime/status` ไม่ import torch และตอบ `effective=null` ก่อน resolve
- หลัง resolve endpoint/UI แสดง effective device และ fallback reason
- manual full-runtime: `CUDA_VISIBLE_DEVICES=""` แล้ว TTS ประโยคไทยหนึ่งประโยคสำเร็จ

### 4.2 G-06 — Job continuity

Proposed changes:

1. เพิ่ม schema/timestamps/resource/`interrupted` ใน Job
2. เพิ่ม atomic store และ lifecycle initialization
3. ให้ GET/WS รองรับ history และ terminal `interrupted`
4. เพิ่ม stable storage key ให้ `useJob`; re-attach ด้วย persisted job id หลัง reload
5. persist Batch Queue items/jobId ใน localStorage และ map `interrupted` เป็นสถานะที่ผู้ใช้เห็น
6. อัปเดต SRS FR-06, API Semantics, BLUEPRINT, SPEC และ traceability

Tests first:

- serialize -> manager ใหม่ -> terminal history เท่าเดิม
- loaded `queued/running` -> `interrupted`; `done/error` ไม่เปลี่ยน
- corrupted store ไม่ทำให้ boot ล้มและมี quarantine evidence
- WS reconnect ส่ง snapshot ล่าสุดทันทีและปิดเมื่อ interrupted
- React hook reload แล้ว re-attach job id เดิม; terminal state ล้าง active id
- manual: ปิดแอประหว่าง render, เปิดใหม่, Jobs เห็นรายการเดิมเป็น interrupted

### 4.3 G-07 — GPU admission control

Proposed changes:

1. เพิ่ม explicit resource ที่ทุก spawn call site
2. เพิ่ม FIFO GPU admission queue concurrency 1 โดยไม่ขวาง CPU tasks
3. เพิ่ม VRAM probe/wait reason และ centralized cleanup
4. วัด peak VRAM ของ TTS/Dubbing/Remix และอัปเดต model lifecycle/risk evidence
5. อัปเดต Runtime/Jobs UI ให้แยก `queued: รอ GPU` จาก `running`

Tests first:

- GPU jobs 3 งานเริ่มตาม FIFO และ active พร้อมกันไม่เกิน 1
- CPU job จบได้ขณะ GPU job รอ/รัน
- free VRAM ต่ำ -> งานยัง queued และ task ยังไม่ถูกเรียก
- cleanup ถูกเรียกทั้ง done/error
- CPU fallback ไม่แตะ CUDA admission/probe
- manual RTX 3060: Dubbing + Remix ที่ submit พร้อมกันไม่ OOM และทำตามลำดับ

R-004 จะเปลี่ยนเป็น MITIGATED ได้เมื่อ automated tests ผ่าน **และ** manual RTX 3060 gate
ผ่านพร้อมตัวเลข peak VRAM; การมี semaphore อย่างเดียวไม่พอปิด risk

## 5. Two independent exit gates

### Gate A — Phase 1 full-runtime

- backend + frontend tests green
- CPU-only TTS smoke ผ่านจริง
- restart continuity scenario ผ่านจริง
- RTX 3060 concurrent-submit scenario ผ่านจริงและมี VRAM evidence
- SRS, SPEC, BLUEPRINT, API Semantics, model lifecycle, traceability และ R-004 sync

### Gate B — Clean-VM lite installer

Gate นี้พิสูจน์ R-006/packaging เท่านั้น เพราะ lite installer ไม่ bundle TTS/ASR/Remix
จึงห้ามใช้อ้างว่าพิสูจน์ G-09/G-06/G-07 full runtime แล้ว

สิ่งที่ต้องเตรียมบน VM:

- Windows 10/11 x64 fresh VM; ไม่มี Python/Node/Rust/CUDA/.NET/VC++ ที่ติดตั้งเพิ่ม
- installer จาก `apps/desktop/src-tauri/target/release/bundle/nsis/`
- บันทึก filename, byte size, SHA-256, commit/tag และ Windows build
- ไฟล์เสียงทดสอบที่ผู้ใช้มีสิทธิ์ใช้ 1 ไฟล์ (WAV/MP3 สั้น ๆ)

Proposed checklist replacement:

| # | Action | Expected evidence |
|---|---|---|
| 1 | รัน installer ด้วย Windows user ปกติ | ติดตั้งได้โดยไม่ขอ Python/Node/Rust/.NET/VC++ เพิ่ม |
| 2 | เปิดจาก Start menu | หน้าต่างเปิด; badge `CONNECTING` -> `READY` ภายใน 60 วินาที |
| 3 | เปิด Library -> Plugins | pedalboard/psola/matchering เป็น `ยังไม่ติดตั้ง`, แสดง license และคำสั่งติดตั้ง |
| 4 | เปิด Library -> Files | workspace ว่างและไม่มี error |
| 5 | เปิด Arrange แล้วโหลดไฟล์ผ่าน Source | waveform/clip แสดง; Space เล่น/หยุดได้ |
| 6 | ตั้ง fade และ pan แล้วกด `WAV` | ได้ไฟล์ที่เล่นได้และได้ยิน fade/pan ตามที่ตั้ง |
| 7 | เปิด Voice Studio -> Text to speech แล้วลองใช้งาน | lite profile ปฏิเสธอย่างตรงไปตรงมาเป็นข้อความไทย/availability; ไม่มี stack trace และแอปยังใช้ต่อได้ |
| 8 | Save project, ปิดแอป แล้วดู Task Manager | ไม่มี `g-music-backend*.exe` ค้าง |
| 9 | เปิดแอปใหม่และ Open project ที่บันทึก | backend กลับเป็น `READY`; project/clip/fade/pan เหมือนเดิม |

ทุกแถวต้องบันทึก `PASS/FAIL`, actual result, เวลา และ screenshot/log เมื่อ fail. ถ้าแถวใด
fail ให้หยุด gate; R-006 ยังเปิด ห้ามเฉลี่ยผลหรือใช้ local dev smoke แทน

เมื่อผ่านครบจึงแก้ `CLEAN_VM_CHECKLIST.md` เป็นผลจริง, ปิด R-006 ตาม evidence และอัปเดต
`PACKAGING_SIDECAR.md`; ห้ามบันทึกผล PASS ล่วงหน้า

## 6. Acceptance, success, and exit criteria

Acceptance criteria:

- implementation ตรง AD-1 ถึง AD-3 และไม่ขยาย scope
- ทุก status/endpoint/doc ใช้ lifecycle vocabulary เดียวกัน
- lite/full evidence ถูกแยก ไม่ claim ข้าม profile

Success criteria:

- CPU-only full runtime ทำงานได้
- งานที่ถูก interrupt ยังมองเห็นหลัง restart
- GPU-heavy jobs ไม่ overlap และ CPU job ไม่ถูก block
- clean VM รัน installer ได้โดยไม่พึ่ง dev toolchain

Exit criteria:

- Gate A และ Gate B มีผลจริงครบถ้วน
- automated tests และ manual evidence ที่ระบุผ่าน
- R-004/R-006 และเอกสาร canonical อัปเดตตามหลักฐานเท่านั้น
- ไม่มี known regression ใน flow TTS/Dubbing/Remix/Render/Jobs/installer

## 7. Out-of-scope findings

- `PluginsPanel.tsx` ยังแสดงตัวอย่าง path `backend\.venv` เก่า; ให้แก้เป็น `apps\api\.venv`
  เฉพาะเมื่ออนุมัติ checklist/UI wording scope
- product name/identifier ยังเป็น `G-Music` แม้ UI ใช้ Lalin; rename/release identity ไม่รวม Phase 1
- installer เป็น lite profile; full ML workstation distribution ยังเป็น gate แยกตาม
  `PACKAGING_SIDECAR.md`

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-08-23 | beta | Approved G-09 -> G-06 -> G-07 implementation contract and separated clean-VM lite-installer acceptance gate. | uncommitted | LALIN (ลลิน) |
