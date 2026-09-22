---
version: "0.1.3c"
created_at: "2026-09-20T21:40:00+07:00,LALIN,8429010"
last_update: "2026-09-22T22:00:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "architecture-decision-record"
  scope: "Headless voice-worker entrypoint, control/engine process split and profile-scoped exceptions to Studio jobs/WS/auth rules"
---

# ADR-005 — Headless voice-worker profile and process boundary (candidate)

## 1. Status and decision scope

- Source baseline: `Freshair129/Lalin-AI` at `84290102b84fd76dec069bf6d61ffdd2fc8466ab`
  (HEAD ของ checkout นี้ตรงกับ snapshot ที่ handoff ตรวจ)
- Trigger: [CR-005](../product/CR-005--HEADLESS_VOICE_WORKER.md) จาก PRP handoff
  `REQ-LALIN-PRP-VOICE-WORKER.md` 0.1.0
- Status **candidate**: ยังไม่มีการอนุมัติจาก Lalin maintainer, PRP architecture
  หรือ security; ไม่มี code change ใน ADR นี้
- Complexity C-3 / risk HIGH

[ASSUMPTIONS]

1. Studio `full`/`lite` (`app.main`, `app.sidecar_lite`), `jobs.json`, WebSocket
   progress, voice library และ FR-02.5 fallback **คงเดิมทุกประการ**
2. Worker เป็น profile/entrypoint เพิ่ม ไม่ใช่ flag ใน `create_app()` ของ Studio
3. PRP เป็นเจ้าของ admission/lease/quota; worker ตรวจและบังคับ local invariants เท่านั้น

## 2. Context (facts from source)

| Fact | Location | Consequence |
|---|---|---|
| Unknown profile → `full` | `apps/api/app/main.py:25-27` | ห้าม reuse `create_app()` เป็น worker; ต้อง fail-closed entrypoint แยก |
| Base routers mount brain/fs/agent/plugins/packs/projects/speech ทุก profile; CORS `*` | `main.py:32-59`, `sidecar_lite.py` | worker ต้องมี allowlist ของตัวเองและไม่ใส่ CORSMiddleware |
| `health.py` import `..brain` | `routers/health.py:8` | reuse ไม่ได้; เขียน `/health/live` ใหม่ (trivial) |
| ASR/TTS core อ่าน mutable `get_settings()`; `set_model()` เปลี่ยน global | `pipelines/asr.py:37-56`, `routers/speech.py:46` | ต้องเพิ่ม param-injected core functions; worker ไม่เรียก `get_settings()` ของ Studio |
| `get_settings()` สร้าง `uploads/outputs/voices` ใต้ `runtime/data` | `config.py:83-88` (probe ยืนยัน) | worker ใช้ settings/data dir ของตัวเอง (`LALIN_VOICE_WORKER_*`) |
| `cached_path("hf://…")`, faster-whisper โหลดโดยชื่อ | `tts.py:40-42`, `asr.py:48-51` | offline manifest + local paths + `HF_HUB_OFFLINE=1` ใน engine process |
| `ref_text=""` → upstream F5 อาจโหลด Whisper เพื่อถอด ref | `tts.py:63` (comment) | preset manifest บังคับ `ref_text` ไม่ว่าง; verify กับ f5-tts รุ่น pin |
| `language=="th" and engine=="xtts"` → `f5` เงียบ | `tts.py:127-128` | Studio behavior (FR-02.5) คงไว้; worker adapter ไม่เรียก path นี้ (engine allowlist `{f5}`) |
| `JobManager`: process-local dict + JSON snapshot, `asyncio.Lock` GPU FIFO, ไม่มี cancel, `empty_cache` best-effort, task รันใน API process ผ่าน `run_in_executor` | `jobs/manager.py` | ไม่ใช้เป็น worker queue/receipt; inference ต้องอยู่คนละ process กับ API |
| `resolve_device("cuda")` raise เมื่อไม่มี CUDA; `auto` fallback CPU | `runtime_devices.py:24-39` | worker ใช้เฉพาะ explicit device จาก profile; ห้าม `auto` |
| PyInstaller spec excludes ML stack | `g-music-backend.spec` | distribution ของ worker ใช้ lock/venv หรือ container ไม่ใช่ sidecar exe |
| SPEC §8 "No auth", "CORS open" | `docs/architecture/SPEC.md:820-830` | worker ต้องยกเว้นอย่างชัดเจน (ข้อ 4 ด้านล่าง) |
| `.venv` (Py 3.11.16) ไม่มี torch/faster-whisper/f5-tts; ไม่มี HF cache ของโมเดลเสียง | probe 2026-09-20 | B/C qualification NOT_RUN บนเครื่องนี้ |

## 3. Decision (proposed)

### 3.1 Entrypoint and profile

- เพิ่ม package `apps/api/app/voice_worker/` พร้อม `create_worker_app(profile_manifest)`
  และ `python -m app.voice_worker` (uvicorn, bind `127.0.0.1` default)
- Profile ระบุด้วย `LALIN_VOICE_WORKER_PROFILE=<path-or-id>`; ไม่พบ/ไม่ valid →
  process exit non-zero ก่อน bind port (fail-closed) ไม่มี fallback ไป `full`
- ไม่แก้ semantics ของ `GMUSIC_BACKEND_PROFILE` (Studio/Tauri launcher ใช้อยู่ที่
  `apps/desktop/src-tauri/src/lib.rs:220`)
- Route allowlist (สอดคล้อง handoff §6.3 candidate; binding ยังต้อง review):
  `GET /health/live`, `GET /worker/v1/describe`, `GET /worker/v1/readiness`,
  `POST /worker/v1/operations`, `GET /worker/v1/operations/{attempt_id}`,
  `POST /worker/v1/operations/{attempt_id}/cancel`,
  `GET /worker/v1/operations/{attempt_id}/output`,
  `DELETE /worker/v1/operations/{attempt_id}/payload`
- ไม่ mount: brain, agent, fs, files, projects, plugins, packs, voices, speech,
  tts, dubbing, mastering, music, render, jobs, `/docs`/`/openapi.json` (ปิดหรือ
  management-only), ไม่มี CORSMiddleware

### 3.2 Control/engine process split

- **Control (API) process**: FastAPI + receipts + auth + admission checks; ห้าม import
  torch/ctranslate2/f5_tts (test ตรวจ `sys.modules`)
- **Engine process**: หนึ่งตัวต่อ approved profile, spawn/supervise โดย control process
  (stdlib `multiprocessing`/`subprocess` + JSON-lines หรือ `multiprocessing.connection`);
  โหลดโมเดลจาก manifest local paths; ส่ง heartbeat + residency observations
- `runtime_epoch` = ค่าใหม่ทุกครั้งที่ engine process เริ่ม (uuid4 + manifest sha + device id);
  epoch เปลี่ยน → readiness false จน qualify ใหม่
- API process concurrency = 1 ต่อ deployment ใน Phase 1 (uvicorn `--workers 1`); การเพิ่ม
  API workers ต้องไปผ่าน supervisor เดียว ไม่ spawn engine ต่อ worker
- **Decoder**: ffmpeg จาก `imageio_ffmpeg` (reuse path จาก `utils/ffmpeg.configure`) รันเป็น
  subprocess ต่อ request ด้วย `-nostdin`, protocol whitelist `pipe,file`, `timeout`,
  output cap; OS memory/CPU cap: Linux ใช้ `resource`/cgroup; Windows ไม่มีใน stdlib →
  รายงาน **partial** ตามจริง

### 3.3 Speech core reuse

- ใน `pipelines/asr.py` เพิ่ม `load_whisper(model_path, device, compute_type)` และ
  `transcribe_with(model, audio_path, language, ...)`; `_get_model()`/`transcribe()` เดิม
  กลายเป็น wrapper ที่พฤติกรรมเท่าเดิม
- ใน `pipelines/tts.py` เพิ่ม `load_f5(ckpt_file, vocab_file, vocoder_local_path, device)` และ
  `f5_infer(model, ref_audio, ref_text, text, out_path, speed)`; `_get_f5()`/`_f5_synth()`
  เดิมเรียกผ่าน functions ใหม่; `synthesize()` และ FR-02.5 คงเดิม
- worker adapters เรียกเฉพาะ functions ใหม่ด้วยค่าจาก manifest; ไม่เรียก `synthesize()`
  ของ Studio (เพราะมี fallback) และไม่เรียก `set_model()`

### 3.4 Receipts and intake

- Receipt store = **sqlite3 (stdlib) WAL** ใต้ worker data dir, unique `(issuer, attempt_id)`,
  เก็บ payload digest, state (`ACCEPTED/RUNNING/FINISHED/UNKNOWN`), erase fence,
  tombstone horizon; reuse pattern atomic write/quarantine จาก `JobManager` เป็น prior art
  แต่ไม่ใช้ `jobs.json`
- Intake = `asyncio.BoundedSemaphore(profile.max_concurrency)` (default 1) → `WORKER_BUSY`
  ทันที; ไม่มี queue
- Cancel: ก่อน start → `FINISHED`+`CANCELLED`+`never_started`; ระหว่าง compute → ACK;
  hard stop = terminate **เฉพาะ engine child ของ worker** (ตรวจ pid + start time) →
  epoch ใหม่; `compute_stopped=null` จนมี evidence

### 3.5 Profile-scoped exceptions to existing rules (must be explicit)

| Existing rule | Applies to | Worker exception | Why |
|---|---|---|---|
| FR-06 / AGENTS.md "งาน ML รันผ่าน `jobs.spawn()` + WS" | Studio | worker ใช้ receipts + status polling ไม่มี WS/jobs.json | multi-process, idempotent, PRP เป็น job owner |
| FR-02.5 XTTS→F5 fallback | Studio | worker ไม่มี XTTS และไม่ fallback ทุกชนิด | CPML non-commercial + no hidden engine change |
| SPEC §8 "No auth", CORS open | Studio (desktop 127.0.0.1) | worker ต้องมี service auth + ไม่มี CORS wildcard | machine-to-machine endpoint |
| NFR-06.3 config hot-reload ผ่าน API | Studio | worker config immutable ต่อ epoch; เปลี่ยนได้เฉพาะ management + requalify | admission-bound profiles |
| `auto` device default (NFR-02.4) | Studio | worker ใช้ explicit device จาก profile เท่านั้น | exact target binding |

### 3.5 Decisions recorded 2026-09-22 (by Fable 5.1 on the owner's delegation; see H0 review)

- **D16: non-determinism is a contract fact.** A new attempt on the same audio may return different text; one
  attempt's receipt never changes (idempotency unchanged). Decoding is not forced deterministic.
- **D17: transport is a Unix socket on a shared volume** (`unix:/run/voice-worker/worker.sock`, directory 0750, the
  coordinator joins gid 10001). The worker container has no network. The loopback-only bind rule of §3.1 is unchanged.
  Cost: coordinator and worker share one host. Verified in [the runbook](../operations/VOICE_WORKER_LINUX_RUNBOOK.md) §3.
- **D15** per-request glossary and **D18** repeated-OOM lockout are implemented (API_SEMANTICS, voice_worker section).

## 4. Alternatives considered

- **ตั้ง `GMUSIC_BACKEND_PROFILE=voice-worker` ใน `create_app()`** — ปฏิเสธ: fail-open,
  router base list มี brain/fs; แก้ Studio factory เพิ่ม risk regression
- **ใช้ `JobManager` เป็น worker queue/receipt** — ปฏิเสธ: single-writer JSON, in-process
  GPU lock, ไม่มี idempotency/cancel; ใช้เป็น prior art เท่านั้น
- **โหลดโมเดลใน API process (เหมือน Studio `run_in_executor`)** — ปฏิเสธ: ขัด LVP-REQ-006;
  health/cancel ค้างขณะ inference; เพิ่ม workers = เพิ่ม model copies
- **Xinference/Ray/LiteLLM เป็น dependency บังคับ** — ไม่บังคับ (LVP-REQ-004); stdlib
  process + FastAPI พอสำหรับ Phase 1; ทบทวนเมื่อมี evidence ว่าต้องการ scheduler จริง
- **Ship ผ่าน PyInstaller sidecar** — ปฏิเสธ: spec excludes ML; ใช้ pinned lock/venv
  และ/หรือ container image

## 5. Consequences

- (+) Studio ไม่เปลี่ยน; worker ปิดได้ด้วยการไม่ deploy
- (+) speech core มี seam ที่ทดสอบได้ด้วย fake modules (pattern เดิมใน `test_runtime_devices.py`)
- (−) เพิ่ม surface: IPC, sqlite, auth middleware, decoder subprocess ต้องมี negative tests
- (−) Windows sandbox limits partial; Linux/container coverage ยังไม่มีเครื่องทดสอบ
- (−) B/C ต้องมี GPU + pinned model assets + rights-approved preset ที่ตอนนี้ยังไม่มี

## 6. Open decisions (owners) — ต้องปิดก่อน freeze network implementation

ดู [H0 review §5](../validation/2026-09-20-HEADLESS-VOICE-WORKER-H0-REVIEW.md):
transport binding, service auth/admission proof, payload transfer + ack, receipt store,
cancellation guarantee, identity/epoch vocabulary, Phase 1 profiles และ preset rights,
residency policy, dependency/OS matrix, contract schema owner (Python pydantic → JSON
schema ใน `packages/contracts/schemas/`), Windows sandbox partial acceptance

## 7. Verification gates (ทุกข้อ NOT_RUN ณ candidate)

- Slice A: `pytest apps/api/tests/voice_worker` (allowlist, import isolation, auth negative,
  receipts race/restart, deadline/cancel, target mismatch) + Studio suite เดิมผ่าน
- Slice B: offline startup with network blocked, checksum negative, decoder fault corpus,
  ASR/TTS schema + Thai/English fixtures, no hidden download (network probe), Studio smoke
- Slice C: clean install/rollback บน platform ที่อ้าง, reference client, joint W2/W3/W4

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.3c | 2026-09-22 | candidate | §3.5: D16 (non-determinism as contract fact) and D17 (Unix socket transport) recorded | based on b4ffe94 | LALIN |
| 0.1.2c | 2026-09-20 | candidate | Slice A of §3.1/3.2/3.4 implemented locally with a labeled stub engine (see validation 2026-09-20-HEADLESS-VOICE-WORKER-SLICE-A); §3.3 speech-core seams remain for Slice B | based on 8429010 | LALIN |
| 0.1.1c | 2026-09-20 | candidate | Point trigger at CR-005 after the working-tree CR-004 collision | based on 8429010 | LALIN |
| 0.1.0c | 2026-09-20 | candidate | Propose fail-closed worker entrypoint, control/engine split, speech-core seams, receipts and profile-scoped exceptions; no code change | based on 8429010 | LALIN |
