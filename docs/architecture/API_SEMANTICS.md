# API Semantics — พฤติกรรมที่ Swagger ไม่บอก

**Status:** active
**Scope:** semantics ของ `apps/api/app/routers/` ที่อ่านจาก OpenAPI schema ไม่ได้ —
สถานะที่ซ่อนอยู่, ลำดับการทำงาน, error ที่ไม่ตรงสัญชาตญาณ, และเจตนาเชิงออกแบบ
**ตารางสัญญา (method/path/request/response):** [product/SRS.md §5.1](../product/SRS.md)
**Machine-readable:** [BLUEPRINT.yaml § api](BLUEPRINT.yaml)

> Source of truth ระหว่างพัฒนา = Swagger ที่ `http://127.0.0.1:8756/docs`
> เอกสารนี้เติมสิ่งที่ Swagger บอกไม่ได้ — อ่านคู่กัน

Base: `http://127.0.0.1:8756` · WS: `ws://127.0.0.1:8756`

---

## projects.py — บันทึก/โหลดโปรเจกต์ ([FR-10](../product/SRS.md))

เก็บเป็นไฟล์ JSON เดี่ยวที่ `data/projects/<id>.json` รูปแบบ `{id, name, data}` โดย `data` คือ state ทั้งก้อนของ workspace (tracks/clips/params) — **backend ไม่ตีความ `data` เลย** ทำให้ schema ฝั่ง frontend เปลี่ยนได้โดยไม่ต้องแก้ backend

- `pid` ที่มี `/` `\` หรือ `..` ถูกปฏิเสธเป็น **`404` ไม่ใช่ `400`** — ตั้งใจให้ path traversal ดูเหมือน "ไม่พบ"
- `POST` สร้าง id ใหม่เสมอ (= **Save As**) ส่วน `PUT` คือ **Save** (คง id เดิม)
- `DELETE` **idempotent** — ลบของที่ไม่มีอยู่ก็ตอบ `200`
- ตอน `GET /projects` ไฟล์ที่ parse ไม่ผ่านถูก**ข้ามเงียบ ๆ** (ไม่ทำให้ทั้งรายการล่ม)

## plugins.py + packs.py — Plugin Manager / Marketplace ([FR-11](../product/SRS.md))

- `GET /plugins` เช็คด้วย `importlib.util.find_spec` — **ไม่ import จริง** จึงไม่ดึง GPL dep เข้า process และไม่กิน VRAM
- `POST /plugins/{name}/install` **ไม่รัน pip** แต่คืนคำสั่ง (`uv pip install <pkg>`) ให้ผู้ใช้รันเองใน venv ของ backend — เจตนาคือ dep GPL (pedalboard GPLv3 · psola→parselmouth GPL · matchering GPLv3) ต้องเป็น **optional เสมอ ห้าม bundle ใน core ที่ขาย** (ดู [ROADMAP_MUSIC.md](../product/ROADMAP_MUSIC.md))
- แคตตาล็อก pack v0.1 เป็น **mock** และสถานะ `installed` เก็บใน memory — **reset เมื่อรีสตาร์ต backend**

## fs.py — File Manager ใน workspace ([FR-15](../product/SRS.md))

ทุก endpoint ทำงานใต้ `data/workspace/` เท่านั้น

**สัญญา error:** หลุด workspace root → `400` · ไม่พบ → `404` · ชื่อซ้ำ (สร้าง/rename/move) → `409` · ลบ root → `400` · ปลายทาง move ไม่ใช่โฟลเดอร์ → `400`

- `entries` เรียง**โฟลเดอร์ก่อน** แล้วตามชื่อ (case-insensitive)
- `type` มีแค่ `folder` \| `file` · `modified` เป็น **epoch seconds** (`st_mtime`) **ไม่ใช่ ISO**
- path ถูก resolve **สองรอบ** (ทั้งโฟลเดอร์แม่ และ path ปลายทางหลังต่อชื่อ) เพื่อกัน traversal ผ่าน**ชื่อไฟล์**

## agent.py — Workspace Agent ([FR-14](../product/SRS.md))

**สัญญาหลัก — propose-only:** endpoint นี้ **ไม่แก้ project เอง** คืนแค่ข้อเสนอให้ frontend `commit()` แบบ undo ได้

- read tools (`get_project_state`, `analyze_project`) ตอบแบบ deterministic โดยแนบสรุป + state ดิบไปใน system context ตั้งแต่แรก — **ไม่ round-trip กับสมอง** และถ้าสมองเผลอเรียก จะถูก**ข้าม** (ไม่นับเป็น mutation)
- write tools 8 ชนิด: `move_clip` · `set_gain` · `set_pan` · `set_fx` · `set_lufs` · `mute_clip` · `slice_clip` · `reorder_track`
- mutation ที่ op ไม่รู้จักหรือ required args ไม่ครบ ถูก**ตัดทิ้งเงียบ ๆ** (ไม่ error) — `mutations` ที่คืนมาจึงอาจ**น้อยกว่า**ที่สมองเรียก
- `temperature=0.2` ตายตัว · ต้องใช้สมองที่รองรับ `chat_with_tools`

## jobs.py — สถานะงาน + progress ([FR-06](../product/SRS.md))

- WS ส่ง **snapshot ปัจจุบันเป็นข้อความแรกเสมอ** แล้วจึงตามด้วย update
- ถ้า job จบไปแล้วตอนต่อ (`done`/`error`/`interrupted`) จะส่ง snapshot แล้ว**ปิดทันที**
- job ไม่มีจริง → ส่ง `{"error": "ไม่พบงาน"}` **ใน payload แล้วปิด — ไม่ใช่ HTTP 404** (ต่างจาก `GET /jobs/{id}` ที่ตอบ 404 จริง)
- unsubscribe ทำใน `finally` เสมอ
- **ไม่มี endpoint ยกเลิก job** — Batch Queue (FR-13) จึง pause ได้แค่แบบ "หยุดหลังงานปัจจุบันเสร็จ"
- snapshot ถูกเขียนแบบ atomic ที่ `data_dir/jobs.json`; เปิด backend ใหม่แล้ว `GET /jobs` ยังเห็น history เดิม
- งาน `queued`/`running` จาก process ก่อนหน้าเปลี่ยนเป็น terminal `interrupted` เพราะ callback เดิมกู้คืนไม่ได้และ pipeline ยังไม่ idempotent
- `resource` เป็น contract จาก call site (`cpu`/`gpu`) — GPU FIFO concurrency 1; CPU job ไม่รอ GPU lock
- GPU job ที่ free VRAM ต่ำกว่า configured measured threshold คงสถานะ `queued` พร้อมข้อความ `รอ GPU: VRAM ว่างยังไม่พอ`

## voices.py — คลังเสียง ([FR-01](../product/SRS.md))

- **consent-first:** `POST /voices` ที่ `consent=false` ตอบ `422` — ห้ามสร้าง voice profile โดยไม่ยืนยันสิทธิ์
- ⚠️ ลำดับปัจจุบัน: ไฟล์ถูก decode เป็น wav (`_as_wav_bytes`) **ก่อน** ตรวจ `consent` — ไฟล์ที่อ่านไม่ได้จึงตอบ `422` ของ audio แม้จะไม่ได้ให้ consent มาด้วย
- อัปโหลดทุกฟอร์แมตถูก normalize เป็น **`.wav`** ผ่าน pydub · อ่านไม่ได้ → `422` พร้อมข้อความไทย
- `PATCH /voices/{id}` เป็น partial update (`name`/`ref_text`/`language` ส่งเฉพาะที่จะแก้) · ไม่พบ → `404`

## speech.py — โปรไฟล์ ASR

- endpoint นี้ **ไม่โหลดโมเดลเอง** — แค่ตั้งค่าที่ pipeline จะใช้ตอนเรียกจริง
- โปรไฟล์ที่รองรับ: `base` · `small` · `medium` · `large-v3` · `turbo`
- ทั้งสอง error ตอบ **HTTP `200`** พร้อม `{ok: false, error}` (ไม่ใช่ 4xx):
  - `model` นอกรายการ → `unsupported_asr_model`
  - `app.state.backend_profile != "full"` → `asr_unavailable_in_lite`
- `asr_available`/`tts_available` ใน `GET /speech/config` สะท้อน `backend_profile` เดียวกัน

## health.py — `/health` + `/runtime/status`

`GET /runtime/status` เป็น best-effort สำหรับ status bar — **ไม่มี control-plane side effect**

- telemetry probe ที่ไม่มีในรันไทม์นั้นคืนค่า **`null`** (ไม่ error, ไม่ทิ้ง field)
- CPU/RAM มาจาก `psutil` ถ้าติดตั้ง; ไม่มีก็ `null`
- GPU/VRAM อ่านจาก `sys.modules.get("torch")` — **ไม่ cold-import torch** จาก poll ทุกไม่กี่วินาที · ก่อน audio pipeline โหลด torch ค่าเหล่านี้จึงเป็น `null` โดยตั้งใจ
- `runtime.devices.tts/asr` แยก `requested` จาก `effective`; ก่อน pipeline resolve ค่า effective เป็น `null` และ fallback CPU รายงาน `reason=cuda_unavailable` (ASR CPU ใช้ `int8`)
- `activity` = job **ล่าสุด**ที่ยัง `queued`/`running` (สแกนย้อนจากท้ายรายการ) — ไม่มีงานค้างก็เป็น `null` ทุก field

## endpoint ที่เพิ่มในของเดิม

| Endpoint | พฤติกรรมที่ควรรู้ |
|---|---|
| `GET /files/input/{name}` | เสิร์ฟต้นฉบับจาก `uploads/` ให้ frontend วาด waveform ([FR-07](../product/SRS.md)) |
| `GET /files/export/{name}` | `fmt=mp3` แปลง 320k ด้วย ffmpeg ฝังในตัว แล้ว**เขียนไฟล์ .mp3 ข้าง ๆ ต้นฉบับ** (ไม่ลบทิ้ง) |
| `POST /dubbing/refine` | สมอง error → **คืนข้อความเดิม** ไม่ throw (เป็นตัวช่วยเสริม ไม่ควรทำให้ flow ล้ม) ([FR-03](../product/SRS.md)) |
| `POST /music/export` | เบค master FX เป็น **job**; ผลลัพธ์ `{output: "<ชื่อไฟล์>"}` ([FR-04b](../product/SRS.md)) |

`/files/download` · `/files/input` · `/files/export` · `/music/export` ตรวจ prefix ของ path **หลัง resolve** เพื่อกันหลุดออกนอก `uploads/` · `outputs/` — หลุดหรือไม่พบตอบ `404` เหมือนกัน (ไม่แยกสาเหตุ)

---

อัปเดตเอกสารนี้เมื่อเปลี่ยน semantics ของ router — สัญญาแบบตารางอัปเดตที่
[product/SRS.md §5.1](../product/SRS.md) และ [BLUEPRINT.yaml § api](BLUEPRINT.yaml) คู่กัน
