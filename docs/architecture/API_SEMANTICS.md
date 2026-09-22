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

## voice_worker/ — headless PRP supplier ([CR-005](../product/CR-005--HEADLESS_VOICE_WORKER.md) candidate · [ADR-005](ADR-005-HEADLESS-VOICE-WORKER-PROFILE.md) · Slice A = stub engine)

**คนละ process กับ Studio:** `python -m app.voice_worker` (default `127.0.0.1:8790`) ไม่ mount router ใด ๆ ของ Studio,
ไม่มี `/docs`, ไม่มี CORS, ไม่อ่าน `.env`/`GMUSIC_*`, data dir แยก (`LALIN_VOICE_WORKER_DATA_DIR`, default `runtime/voice-worker`)
profile ไม่รู้จัก/ไม่ valid → process exit code `2` **ไม่ fallback** เป็น full (ต่างจาก `create_app()` ของ Studio)

- **auth:** `Authorization: Bearer <token>`; token `inference` ผูกกับ **issuer** หนึ่งราย (coordinator deployment) และ token `management` แยก —
  management เรียก `describe/readiness` ได้แต่ยิง/อ่าน operation ไม่ได้ (`403 SCOPE_DENIED`); ไม่มี auth → `401` ทุก route ยกเว้น `/health/live`
- **scope:** operation ถูก key ด้วย `(issuer, attempt_id)` — issuer อื่นเห็น `404 NOT_FOUND` รูปเดียวกับ attempt ที่ไม่มีอยู่ (ไม่เผยการมีอยู่)
- **`202` ≠ started:** `POST /operations` คืน `202` หลัง commit receipt แล้ว engine อาจยังไม่เริ่ม; `execution_status` ไล่ `ACCEPTED → DISPATCHING → RUNNING → FINISHED | UNKNOWN`
  และ `FINISHED` ไม่ได้แปลว่าสำเร็จ — ดู `operation_outcome` (`SUCCEEDED|FAILED|CANCELLED`)
- **idempotency:** attempt_id เดิม + envelope digest เดิม → `200` receipt เดิม (ไม่ compute ซ้ำ แม้จบไปแล้ว); digest ต่าง (รวมถึงยืด deadline/เปลี่ยน target) → `409 IDEMPOTENCY_CONFLICT`
  — dedupe ตรวจ**ก่อน** admission จึงคืน receipt เดิมแม้ epoch ใน envelope จะ stale แล้ว
- **ลำดับปฏิเสธก่อน compute:** target/epoch/profile (`409 TARGET_MISMATCH|PROFILE_MISMATCH`) → input (`422`/`413`) → deadline/start window (`409 DEADLINE_EXCEEDED`, `started=false`, ไม่มี receipt)
  → readiness (`503 MODEL_UNAVAILABLE`; device ไม่ตรง profile = `409 TARGET_MISMATCH reason=device_mismatch`) → capacity (`503 WORKER_BUSY`, **ไม่คิว**, ไม่มี receipt)
- **cancel:** ก่อน dispatch → `200 CANCELLED_BEFORE_START` (`stop_evidence.kind=never_started`); ระหว่างทำ → `202 ACK` และ `compute_stopped=null` จน engine คืนผล;
  จบแล้ว → `200 ALREADY_FINISHED`; engine ไม่ตอบ → `202 UNSUPPORTED`. cancel **ไม่ใช่** erase (payload_state ไม่เปลี่ยนเพราะ cancel)
- **deadline:** worker แปลง `deadline_at` เป็น budget ภายใน; engine หยุดเองที่ deadline (`stop_evidence.kind=engine_returned`); ถ้าไม่หยุด → cancel → ยังไม่หยุด → **terminate engine child ของตัวเอง**
  → `stop_evidence.kind=process_exit` (`exited`, `exitcode`, `vram_reclaimed=null`) แล้วเริ่ม engine ใหม่ = **epoch ใหม่**; envelope ที่ถือ epoch เดิมจะได้ `409 stale_epoch`
- **restart:** งานของ epoch ก่อนหน้าที่ยังไม่จบ → `UNKNOWN` (`safe_to_retry=false`, `compute_stopped=null`) ถ้าเคย dispatch แล้ว; ยังไม่ dispatch → `FINISHED/FAILED` + `never_started` (`safe_to_retry=true`); ไม่ replay
- **payload/erase:** `payload_state` ∈ `NONE|AVAILABLE|ERASE_REQUESTED|ERASED|EXPIRED`; `DELETE …/payload` ระหว่างทำ → `202 ERASE_REQUESTED` เป็น fence — ผลที่มาช้าถูกทิ้ง (`result=null`, ไฟล์ถูกลบ) แต่ `operation_outcome` ยังบันทึกตามจริง;
  TTL payload ≤ 24 h จาก intake แม้ operation ค้าง (`EXPIRED`); receipt/tombstone อยู่จน horizon (48 h default) เพื่อ dedupe
- **output:** `GET …/output` มีเฉพาะ tts (asr → `422`), ต้อง `FINISHED/SUCCEEDED` (`409 OUTPUT_NOT_READY`) และ payload ยังอยู่ (`410 PAYLOAD_ERASED`); header `X-Content-SHA256` = `result.sha256`; ไฟล์ที่ header/duration ไม่ผ่านไม่ถูก publish (`OUTPUT_INVALID|OUTPUT_LIMIT`)
- **stub ที่ติดป้าย:** Slice A engine = `stub` — `describe.engine.labeled_stub=true`, `profiles[].state.qualified=false`, ASR คืน `text="[stub] …"`, `duration_seconds=null`, `segments=[]`; **ไม่ใช่หลักฐาน speech/GPU**
- รหัส error worker-local ที่เพิ่มจากตาราง handoff (ต้องให้ PRP map): `NOT_FOUND`, `OUTPUT_NOT_READY`, `PAYLOAD_ERASED`; สถานะ payload เพิ่ม `NONE`
- **ผลไม่ deterministic (D16):** envelope เดิมแต่ `attempt_id` ใหม่บนเสียงเดิม อาจได้ข้อความต่างกัน (วัดแล้ว 3 ใน 4 คลิป) — ส่วน `attempt_id` เดิมได้ receipt เดิมเสมอ
  (ไม่ถอดใหม่) · coordinator **ห้าม**ใช้ "ถอดซ้ำแล้วเทียบ" เป็นการตรวจสอบผล
- **glossary (D15):** `input.glossary` optional ต่อ request (≤ 64 คำ, คำละ 1–40 code point, รวม ≤ 400 หลัง norm-v1) → เข้า whisper `initial_prompt`
  เป็น bias ไม่ใช่คำสั่ง; อยู่ใน digest (เปลี่ยน glossary = `409 IDEMPOTENCY_CONFLICT`); ไม่เขียนลงดิสก์ · `result.glossary_applied` มีเฉพาะเมื่อส่งมา
  (stub = `false`) · `capabilities.asr_glossary` บอกว่า profile ใช้จริงไหม · **ใช้กับเสียงชัดเท่านั้น** — บนเสียงไกล/มีเสียงรบกวนทำให้เนื้อหาหาย
- **OOM ซ้ำ (D18):** engine ถูก OOM killer ฆ่า (ยืนยันจาก cgroup) ติดกัน `oom_lockout_after` ครั้ง (default 2, ไม่มีงานจบคั่น) → ไม่ restart engine อีก,
  readiness `ready=false` reason `repeated_oom` + `oom_lockout`, request ใหม่ `503 MODEL_UNAVAILABLE` จน operator ขยายเพดานแล้ว restart worker · ครั้งเดียว = `RUNTIME_OOM` + epoch ใหม่
- **transport (D17):** Linux deployment ใช้ `LALIN_VOICE_WORKER_HOST=unix:/run/voice-worker/worker.sock` บน volume ที่แชร์กับ coordinator
  (dir 0750, coordinator เข้ากลุ่ม 10001) — ไม่มี TCP เลย · ดู [runbook](../operations/VOICE_WORKER_LINUX_RUNBOOK.md)
- **machine-readable contract:** `packages/contracts/schemas/lalin-voice-worker.schema.json` (สร้างจาก pydantic ใน `app/voice_worker/contract.py` ด้วย
  `python -m app.voice_worker.schema --write`; `--check`/`test_contract_schema.py` บังคับ sync) และ TS types ใน `packages/contracts/src/voiceWorker.ts` — แก้ที่ pydantic ก่อนเสมอ

---

อัปเดตเอกสารนี้เมื่อเปลี่ยน semantics ของ router — สัญญาแบบตารางอัปเดตที่
[product/SRS.md §5.1](../product/SRS.md) และ [BLUEPRINT.yaml § api](BLUEPRINT.yaml) คู่กัน
