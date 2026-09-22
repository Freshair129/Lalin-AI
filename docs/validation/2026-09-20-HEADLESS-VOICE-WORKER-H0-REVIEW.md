---
version: "0.1.9c"
created_at: "2026-09-20T21:45:00+07:00,LALIN,8429010"
last_update: "2026-09-22T20:00:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "validation"
  scope: "H0 source/contract review for the PRP headless voice worker handoff (REQ-LALIN-PRP-VOICE-WORKER 0.1.0)"
---

# Headless Voice Worker — H0 source/contract review

**Input:** `REQ-LALIN-PRP-VOICE-WORKER.md` 0.1.0 + `PROMPT-FOR-LALIN-AGENT.md` (20 ก.ย. 2026)
**Output of this slice:** source review, canonical doc mapping, fit-gap LVP-REQ-001..032,
decisions ที่ต้องปิดก่อน implementation, slices A/B/C ที่เสนอ
**Code changes:** none · **Runtime inference tests:** NOT_RUN · **Production activation:** none

> H0 ตาม handoff §10 จบเมื่อ "ทั้งสองฝ่ายยืนยัน contract/review decisions" — เอกสารนี้คือ
> ฝั่ง Lalin ของการ review; ยังไม่มีการยืนยันจาก PRP/security/Lalin maintainer

## 0. Verdict

| Gate | Status | Note |
|---|---|---|
| Source reviewed (entrypoint, ASR/TTS, assets, devices, jobs, tests, packaging, docs) | **DONE** | §2 |
| Canonical ID allocation | **PROPOSED** — CR-005 / ADR-005 / FR-19 / NFR-08 | §3; ต้อง re-verify ตอน merge (working tree ถูกแก้พร้อมกันโดย session อื่น) |
| Fit-gap 32 ข้อ | **DELIVERED** for review | §4 (LVP-AT-004 evidence) |
| Interface/auth/admission/artifact/receipt/deadline decisions | **OPEN** — 13 ข้อ | §5 |
| Slice A/B/C plan + tests | **A IMPLEMENTED (stub, local)** — ดู [Slice A evidence](2026-09-20-HEADLESS-VOICE-WORKER-SLICE-A.md); B/C PROPOSED | §6 |
| Studio regression baseline | **PASS 86/86** with writable basetemp; default run **21 passed / 65 errors** (environment: `%TEMP%\pytest-of-pc` ACL denied) | §7 |
| GPU/model/quality qualification | **NOT_RUN** — เครื่องนี้ไม่มี torch/faster-whisper/f5-tts/model weights | §1 |
| Joint PRP W2/W3/W4 | **BLOCKED** — ไม่มี PRP environment | owner: PRP |

## 1. Baseline and environment (facts)

| Item | Observed | Command |
|---|---|---|
| HEAD | `84290102b84fd76dec069bf6d61ffdd2fc8466ab` on `main` = snapshot ที่ handoff ตรวจ | `git rev-parse HEAD`, `git branch --show-current` |
| Working tree | dirty: `AGENTS.md`, `PRODUCT.md`, `docs/DOCS_INDEX.md`, `REPOSITORY_ARCHITECTURE_SOT.md`, `LALIN_SITEMAP_SOT.md`, `PRD.md` modified; untracked `apps/play-desktop/`, `CR-003`, `CR-004--LALIN_PLAY_MINIMAL_COMPACT_PREVIEW`, `ADR-004`, Play validation docs — ทั้งหมดเป็นงาน Play split ของ session อื่น ไม่เกี่ยวกับ scope นี้ | `git status --short` |
| Concurrent editing | `docs/DOCS_INDEX.md` และ `CR-004--LALIN_PLAY_MINIMAL_COMPACT_PREVIEW.md` ถูกเขียนเวลา 21:17–21:25 ระหว่าง review นี้ → เลข CR ของงานนี้ถอยเป็น CR-005 | `ls -la docs/product` |
| Python venv | `apps/api/.venv` Python **3.11.16**; ไม่มี `backend/.venv`, ไม่มี `.venv-ci` | `python --version`, `Test-Path` |
| ML modules in venv | torch/torchaudio/faster_whisper/ctranslate2/f5_tts/cached_path/TTS/psutil/librosa/vocos/huggingface_hub = **False**; scipy/pyloudnorm = True | `importlib.util.find_spec` probe |
| Model caches | `~/.cache/huggingface/hub` มีเฉพาะ `models--intfloat--multilingual-e5-small` (ไม่เกี่ยว); ไม่มี F5-TTS-THAI / whisper weights | `Get-ChildItem` |
| `.env` | ไม่มีใน `apps/api` (ไม่ได้อ่าน secrets ใด) | `Test-Path .env` |
| CI | `.github/workflows/release.yml` รัน pytest ใน `.venv-ci` ที่ลงแค่ `requirements.txt` → CI ไม่มี ML stack; sidecar build `-Profile full` แต่ spec excludes ML | grep release.yml |
| Doc tooling | `tools/doc_graph_scan.py` (stdlib) มีจริง; regex requirement `(FR|NFR|AI-AGT|AI-ETH|BR|DR)-[0-9]{2,}` → LVP-xxx จะไม่ถูก index; ไม่มี `docs:govern` หรือ npm doc command ใน `package.json` | `cat package.json`, `sed -n 110p tools/doc_graph_scan.py` |

ผลสรุป: **Slice A ทดสอบได้บนเครื่องนี้ (stub, no-ML)**; Slice B/C ต้องมี environment
ที่ติดตั้ง speech stack + pinned assets + GPU จริง ซึ่งยังไม่มี

## 2. Source review (ณ `84290102`)

### 2.1 Entrypoints and profiles

| Evidence | Finding | Consequence for worker |
|---|---|---|
| `apps/api/app/main.py` `create_app()` | `selected_profile` นอก `{full, lite}` → `"full"` (fail-open); base list mount `health, brain, voices, files, fs, packs, projects, render, jobs, agent, plugins, speech` ทุก profile; `CORSMiddleware(allow_origins=["*"])`; `app = create_app()` ที่ module import | ห้าม reuse; ต้องมี `create_worker_app()` แยก + fail-closed + ไม่มี CORS wildcard (LVP-REQ-002) |
| `apps/api/app/sidecar_lite.py` | lite list hard-coded, ยังมี brain/fs/agent | ไม่ใช่ template ของ worker |
| `apps/api/sidecar_entry.py`, `apps/desktop/src-tauri/src/lib.rs:220` | Tauri ส่ง `GMUSIC_BACKEND_PROFILE`/`GMUSIC_BACKEND_VERSION`; entry โหลด `app.main:app` | ห้ามเปลี่ยน semantics ของ env นี้; worker ใช้ env namespace ใหม่ (`LALIN_VOICE_WORKER_*`) |
| `apps/api/g-music-backend.spec` | excludes torch/faster_whisper/ctranslate2/f5_tts/cached_path/huggingface_hub… | PyInstaller sidecar ใช้เป็น worker distribution ไม่ได้ (LVP-REQ-029) |
| import probe (`app.pipelines.asr`, `app.pipelines.tts`, `app.runtime_devices`, `app.jobs.manager`) | import แล้ว `app.brain`/`app.routers`/`fastapi`/`torch` **ไม่**เข้า `sys.modules`; `DATA_DIR` **ไม่**ถูกสร้างตอน import แต่ถูกสร้าง (`uploads/outputs/voices`) เมื่อเรียก `get_settings()` | speech core import สะอาดพอจะ reuse; worker ต้องไม่เรียก `app.config.get_settings()` (LVP-AT-002) |

### 2.2 ASR (`apps/api/app/pipelines/asr.py`)

- `_get_model()` อ่าน `get_settings().asr_model` + `asr_device` → `resolve_asr_runtime()` →
  `WhisperModel(name, device, compute_type)`; โหลดโดย **ชื่อ** (`large-v3`) → faster-whisper
  ดาวน์โหลดจาก HF ครั้งแรก ไม่มี checksum/pin/offline flag (LVP-REQ-007 gap)
- `set_model(name)` แก้ `settings.asr_model` และล้าง cache — เรียกจาก `POST /speech/config`
  (end-user เปลี่ยน global ได้) → ห้าม mount ใน worker
- `transcribe(path, language)` → `vad_filter=True`, `word_timestamps=False`, คืน
  `Transcript(language, duration, segments[start,end,text])`; **ไม่** surface
  `no_speech_prob`/`avg_logprob`/`language_probability` → no-speech policy ต้องเพิ่ม (LVP-REQ-016)
- REUSE ได้: dataclasses `Segment/Transcript`, ลำดับ VAD/segments; ADAPT: ต้องมี
  `load_whisper(model_path, device, compute_type)` + `transcribe_with(model, …)` ที่ไม่แตะ settings

### 2.3 TTS (`apps/api/app/pipelines/tts.py`)

- `_get_f5()` → `cached_path(f"hf://{s.f5_model_repo}/model_1000000.pt")` + `vocab.txt` →
  network download ตาม env `F5_MODEL_REPO` (mutable), ไม่มี checksum; `F5TTS(model="F5TTS_Base", …)`
  อาจดึง vocoder จาก HF เพิ่ม (ต้อง verify กับรุ่น f5-tts ที่ pin — package ไม่ได้ติดตั้งที่นี่)
- `_f5_synth(..., ref_text, ...)` คอมเมนต์ `"" = ให้ ASR เดาเอง` → upstream F5 โหลด Whisper
  เพื่อถอด reference เมื่อ `ref_text` ว่าง = hidden model (LVP-REQ-017) → preset manifest ต้องบังคับ
  `ref_text` ไม่ว่าง และ qualification ต้อง fail ถ้าว่าง
- `synthesize()` — `language=="th" and engine=="xtts"` → `engine="f5"` เงียบ (FR-02.5 Studio);
  ไม่มี output validation; `out_path` เขียนได้ทุกที่ (`mkdir parents`)
- XTTS (`_get_xtts`) = Coqui, CPML non-commercial, ไม่รองรับไทย → **ไม่รวมใน worker**
- REUSE ได้: F5 loader/infer call shape; ADAPT: `load_f5(ckpt_file, vocab_file, vocoder_local_path, device)`
  + `f5_infer(model, ref_audio, ref_text, text, out_path, speed)`; worker ไม่เรียก `synthesize()`

### 2.4 Model caches / assets / rights

| Source | Finding |
|---|---|
| `docs/appendices/C-model-cards.md`, `docs/ai-system/model-cards/*.md` | F5-TTS-THAI **CC-BY-4.0** (attribution), faster-whisper + Whisper large-v3 **MIT**, XTTS v2 **CPML** (non-commercial) |
| `docs/ai-system/model-lifecycle.md §1` | กติกา pin checkpoint ห้าม `latest`; acquisition = HF download ครั้งแรก |
| `docs/appendices/E-risk-matrix.md` R-005 | "pin ckpt · TODO mirror + checksum" → ตรงกับ LVP-REQ-007; ยังไม่ทำ |
| `apps/api/app/services/voices.py` | voice library = เสียงผู้ใช้อัปโหลด + `consent` flag; ไม่มี approved preset asset ใน repo → LVP-REQ-008 **BLOCKED** จน rights owner เลือก/บันทึก preset |

### 2.5 Device selection (`apps/api/app/runtime_devices.py`, `jobs/resources.py`)

- `resolve_device(requested, cuda_available)` pure + injectable; `"cuda"` ที่ไม่มี CUDA →
  `DeviceUnavailableError`; `"auto"` → CPU fallback `reason="cuda_unavailable"` → worker ใช้
  explicit device เท่านั้น (REUSE function, ห้าม `auto`) (LVP-REQ-011)
- `DeviceRegistry` process-local snapshot `requested/effective/fallback/reason/compute_type`
  → REUSE shape ใน `describe`
- `configured_gpu_probe()`/`has_required_vram()` ใช้ `torch.cuda.mem_get_info`; thresholds
  default `0` (ไม่ enforce) → REUSE probe code เป็น observation ไม่ใช่ admission (LVP-REQ-012)

### 2.6 Job persistence (`apps/api/app/jobs/manager.py`)

- in-memory dict + `jobs.json` whole-file atomic rewrite (`tmp` + `os.replace`), corrupt →
  quarantine `jobs.corrupt-*.json`; restart → `queued/running` = `interrupted`
- `asyncio.Lock` GPU FIFO ใน API process; task รันด้วย `run_in_executor` (inference อยู่ใน
  API process); ไม่มี cancel (API_SEMANTICS ระบุ), ไม่มี idempotency key, `job.error=str(e)`
  (raw exception ไปถึง client), `cleanup_gpu_memory()` = gc + `empty_cache` best-effort
- Tests G-06/G-07 (`test_job_continuity.py`, `test_gpu_admission.py`) cover FIFO/wait/cleanup/restart
- Disposition: **prior art only** (atomic write + quarantine + "unknown after restart" idea);
  ไม่ใช้เป็น receipt store/queue ของ worker (LVP-REQ-020/021/023)

### 2.7 Config (`apps/api/app/config.py`)

- pydantic-settings, `env_file=".env"` จาก CWD, `extra="ignore"`; speech fields `asr_model`,
  `asr_device`, `asr_compute_type`, `tts_engine`, `tts_device`, `f5_model_repo` mutable at runtime
- `get_settings()` `lru_cache` + `ensure_dirs()` → สร้าง Studio dirs → worker ต้องมี Settings ของตัวเอง

### 2.8 Routers reusable / not

| Router | Reuse? | Why |
|---|---|---|
| `health.py` | ❌ module / ✅ pattern | import `..brain`; แต่ pattern "null เมื่อไม่มี probe, ไม่ cold-import torch" ใช้ได้ |
| `speech.py` | ❌ | เปลี่ยน global ASR model จาก end-user |
| `files.py` `_resolve_flat()` | ✅ pattern | containment check; แต่ `upload()` อ่านทั้ง body ไม่มี size cap (LVP-REQ-013 gap) |
| `voices.py` `_as_wav_bytes()` | ❌ | pydub decode in-process ไม่มี timeout/sandbox (LVP-REQ-014 gap) |
| `jobs.py` WS | ❌ | Studio-only (ADR-005 exception) |
| `utils/validate.py` `validate_audio()` | ✅ | duration/peak/NaN/DC/LUFS → ใช้ตรวจ TTS output (เพิ่ม header/MIME/sha256) |
| `utils/ffmpeg.py` `configure()` | ✅ path only | bundled ffmpeg path สำหรับ decoder subprocess |
| `utils/ids.py` | ✅ pattern | ใช้ uuid4 เต็มสำหรับ internal names |

### 2.9 Tests and tooling

- `apps/api/tests`: **86 collected** (bundle, render, validate, agent contract, files upload,
  gpu admission, job continuity, runtime devices, smoke API, release signing)
- ไม่มี test ของ `create_app()` profile selection; pattern fake modules ใน
  `test_runtime_devices.py` (`types.ModuleType` แทน torch/faster_whisper/f5_tts) → REUSE สำหรับ stub-engine tests
- `tools/verify/smoke_full_profile_readiness.ps1` ตรวจ modules + routes ของ `full` — template
  สำหรับ `smoke_voice_worker_control.ps1` (ตรวจว่า **ไม่มี** torch และ **ไม่มี** Studio routes)
- `packages/contracts/`: TS types (`speech.ts`, `jobs.ts`, `runtime.ts`) + JSON schemas
  (`schemas/lalin-runtime.schema.json`) → candidate home ของ worker contract schema (owner = contracts)

### 2.10 Docs that conflict or need explicit exception

`SPEC.md §8` (No auth, CORS open, single-user), `SRS FR-02.5` (XTTS→F5 fallback),
`FR-06`/AGENTS.md (งาน ML ผ่าน `jobs.spawn()` + WS), `NFR-06.3` (config hot-reload),
`NFR-02.4` (`auto` device) → ADR-005 §3.5 กำหนดเป็น profile-scoped exceptions

## 3. Canonical doc mapping (proposed; **not applied** — tree dirty by another session, doc-first review)

| Doc | Proposed edit | Applied? |
|---|---|---|
| `docs/product/CR-005--HEADLESS_VOICE_WORKER.md` | created (candidate) | ✅ new file |
| `docs/architecture/ADR-005-HEADLESS-VOICE-WORKER-PROFILE.md` | created (candidate) | ✅ new file |
| `docs/validation/2026-09-20-HEADLESS-VOICE-WORKER-H0-REVIEW.md` | this file | ✅ new file |
| `docs/product/SRS.md` | add `### FR-19` (text in CR-005) + `### NFR-08`; §5.1 add worker routes marked "worker profile only"; §7 add "worker: service auth required" | ⏳ after approval |
| `docs/product/PRD.md` | §1.1 add row "Lalin voice-worker (headless deployment role, PRP supplier) — optional, not a product surface"; §5 note worker ไม่ใช้ Windows-only assumption | ⏳ |
| `docs/product/ROADMAP_EXECUTION_BACKLOG.md` | Track C add Slice C4 "headless voice worker (CR-005)" status `proposed` | ⏳ |
| `docs/architecture/SPEC.md` | §2.2 add worker startup; §3.1/3.2 document param-injected core functions; §4 add "worker receipts (not JobManager)"; §8 add exception row | ⏳ |
| `docs/architecture/API_SEMANTICS.md` | new section `voice_worker` (202≠started, cancel ACK semantics, 409 epoch, erase fence) | ⏳ |
| `docs/architecture/BLUEPRINT.yaml` | `sitemap.backend_profile.voice-worker: [allowlist]`, `pipelines` note, `api` rows | ⏳ then run `apps/api/.venv/Scripts/python.exe tools/doc_graph_scan.py` (2 passes) |
| `docs/DOCS_INDEX.md` | index 3 files | ⏳ (file currently being edited by another session) |
| `docs/appendices/D-traceability.md` | FR-19 row → code/tests | ⏳ with Slice A |
| `docs/appendices/C-model-cards.md`, `docs/ai-system/model-lifecycle.md` | preset voice card + offline pin/checksum policy | ⏳ with Slice B / rights owner |
| `docs/appendices/E-risk-matrix.md` | R-005 link to LVP-REQ-007; new risk "worker auth/erasure" | ⏳ |
| `packages/contracts/schemas/lalin-voice-worker.schema.json` (+ `src/voiceWorker.ts`) | exported from Python pydantic models; owner = contracts package | ⏳ decision D12 |

## 4. Fit-gap matrix — LVP-REQ-001..032

Disposition: **REUSE** (ใช้ของเดิมตรง ๆ) · **CONFIGURE** (ของเดิม + config) · **ADAPT** (ของเดิม + แก้/ห่อ) ·
**BUILD-GAP** (ไม่มีของเดิม ต้องสร้าง พร้อมเหตุผล) · **DEFER** (ต้องรอ decision/owner อื่น; Must → BLOCKED)
Status ทุกข้อ = **NOT_RUN** ยกเว้นที่ระบุ

| REQ | Disposition | Evidence in repo | Gap → action (slice) | Owner | Status |
|---|---|---|---|---|---|
| 001 Headless service | **ADAPT** | FastAPI/uvicorn/pydantic-settings pinned in `requirements.txt`; `create_app()` fail-open | new `app/voice_worker/` + `python -m app.voice_worker`; no Tauri/brain/Ollama (A) | Lalin | NOT_RUN |
| 002 Route/profile allowlist | **BUILD-GAP** | `main.py` base list has brain/fs/agent; CORS `*`; no profile test | explicit allowlist, fail-closed profile, no CORS; tests: route enum + `sys.modules` + no Studio dirs (A) | Lalin | NOT_RUN |
| 003 Preserve Studio + shared core | **ADAPT** | `asr.py`/`tts.py` import-clean (probe); Studio wrappers bound to settings | add param-injected `load_whisper/transcribe_with`, `load_f5/f5_infer`; wrappers unchanged; 86 tests remain (B) | Lalin | NOT_RUN |
| 004 Reuse-before-build evidence | **REUSE** (this doc) | §2, §4 | none | Lalin | **DELIVERED** for review |
| 005 App-neutral contract | **BUILD-GAP** | `packages/contracts` has JSON-schema precedent; no worker contract | pydantic models `extra=forbid` → JSON schema; httpx reference client (A) | Lalin + PRP API owner | NOT_RUN |
| 006 Separate API/model processes | **BUILD-GAP** | Studio runs inference in API process via `run_in_executor` | supervised engine child (stdlib multiprocessing/subprocess IPC); API never imports torch; workers=1 (A stub, B real) | Lalin | NOT_RUN |
| 007 Pinned offline models | **ADAPT** | `cached_path("hf://")`, `WhisperModel(name)`; R-005 TODO | profile manifest (paths+sha256+revision); `local_files_only`/`HF_HUB_OFFLINE=1`; checksum → `MODEL_UNAVAILABLE` (B) | Lalin | NOT_RUN |
| 008 Rights manifest | **BUILD-GAP + DEFER** | model cards exist (F5 CC-BY-4.0, whisper MIT); **no approved preset voice asset** | manifest schema (B); preset selection/consent/license = rights owner | product + rights | **BLOCKED** (no preset) |
| 009 Describe capabilities | **BUILD-GAP** | `/runtime/status` null-pattern; `DeviceRegistry.snapshot` shape | `describe` with configured/supported/loaded/qualified + provenance (A) | Lalin | NOT_RUN |
| 010 Readiness/epoch | **BUILD-GAP** | none | epoch = engine start uuid + manifest sha + device id; heartbeat; monotonic seq; stale epoch → 409 (A) | Lalin | NOT_RUN |
| 011 Exact target/admission | **ADAPT + DEFER** | `resolve_device("cuda")` raises if absent | envelope validation (target/epoch/window/lease ref); GPU UUID mapping from operator config; **auth binding = D2/D3** (A) | Lalin + security + PRP | NOT_RUN / decision open |
| 012 Residency/local bound | **ADAPT** | `has_required_vram`, `mem_get_info` probe, `_system_telemetry` | `BoundedSemaphore(profile.max_concurrency)`; engine reports `memory_allocated/reserved`; `empty_cache` never proof (A/B) | Lalin | NOT_RUN |
| 013 Bounded audio transfer | **BUILD-GAP** | `files.upload` reads whole body, no cap; `_resolve_flat` containment | streamed read cap 10 MiB; signature sniff; duration via decoder; uuid names (B) | Lalin | NOT_RUN |
| 014 Sandbox decoder | **ADAPT (partial on Windows)** | `utils/ffmpeg.configure()` bundled ffmpeg; `_as_wav_bytes` in-process | ffmpeg subprocess `-nostdin`, protocol whitelist, timeout ≤30 s, PCM cap 64 MiB; OS mem/CPU cap only on Linux (B) | Lalin | NOT_RUN; Windows = partial (D13) |
| 015 ASR output semantics | **REUSE + ADAPT** | `transcribe()` → language/duration/segments | language allowlist per profile; timestamp monotonic/within-duration check; no confidence field (B) | Lalin | NOT_RUN |
| 016 No-speech policy | **ADAPT** | VAD on; `no_speech_prob`/`avg_logprob` not surfaced | policy v1 (empty segments → `NO_SPEECH`; thresholds → `AUDIO_UNINTELLIGIBLE`); corpus ≥20 clips needed (B) | Lalin + client | NOT_RUN; corpus **BLOCKED** |
| 017 Preset-only TTS | **ADAPT** | `synthesize()` fallback th→f5; `ref_text=""` hidden ASR | worker adapter → `f5_infer` only; `extra=forbid` rejects `ref_audio/model_path/upstream_url`; `ref_text` non-empty at qualification; engine allowlist `{f5}`; verify upstream ASR path in pinned f5-tts (B) | Lalin | NOT_RUN |
| 018 Text fidelity/bounds | **BUILD-GAP** | none | normalization v1 = NFC + whitespace only; ≤800 cp → 422; output ≤60 s via `validate_audio().duration` → `OUTPUT_LIMIT`; speed range from profile (FR-02.6 0.5–1.5 as ceiling) (B) | Lalin | NOT_RUN |
| 019 Validated results | **REUSE + ADAPT** | `validate_audio()` | + header via soundfile, sha256, MIME; MP3 via bundled ffmpeg + decode roundtrip; PRP maps public (B) | Lalin / PRP | NOT_RUN |
| 020 Receipts/idempotency | **BUILD-GAP** | `JobManager._persist` atomic pattern (prior art) | sqlite3 WAL `UNIQUE(issuer, attempt_id)` + digest + fence; cross-thread/process/restart tests (A) | runtime owner (Lalin) | NOT_RUN; D5 |
| 021 Bounded intake | **ADAPT** | `asyncio.Lock` FIFO (Studio) | semaphore + immediate `WORKER_BUSY`; no queue; `started=false` evidence (A) | Lalin | NOT_RUN |
| 022 Deadline/cancel | **BUILD-GAP** | no cancel in Studio (API_SEMANTICS) | absolute deadline → monotonic budget; cancel semantics; terminate own engine child only → new epoch; `compute_stopped=null` w/o evidence (A) | Lalin + ops | NOT_RUN; D6 |
| 023 Restart reconciliation | **ADAPT** | `interrupted` on restart (Studio) | `UNKNOWN` for unverifiable RUNNING; readiness false until reconciled; httpx client `retries=0` (A) | Lalin | NOT_RUN |
| 024 Service auth/control sep. | **DEFER + BUILD** | SPEC §8 no auth; CORS `*` | middleware (inference vs management credential); bind 127.0.0.1; no CORS; **mechanism = D2** (A) | security + PRP | NOT_RUN; decision open |
| 025 Scoped artifacts | **BUILD-GAP** | Studio `outputs/` flat dir | `<worker_data>/attempts/<issuer-hash>/<attempt_id>/` random names; handle-only fetch; separate from `runtime/data` (B) | Lalin | NOT_RUN |
| 026 Erasure/TTL | **BUILD-GAP** | none | fence in receipts; sweep; TTL ≤24 h; tombstone horizon; late result checks fence (B) | Lalin | NOT_RUN |
| 027 Typed errors/usage/logs | **BUILD-GAP** | `job.error=str(e)` leaks raw | error enum (§6.7 handoff); monotonic timing; RTF; log filter (B) | Lalin | NOT_RUN |
| 028 Load/drain/unload | **BUILD-GAP** | none | management CLI/socket; unload = terminate child + fresh probe observation (B) | Lalin + ops | NOT_RUN |
| 029 Reproducible distribution | **BUILD-GAP** | PyInstaller spec excludes ML; `setup_windows.ps1` unpinned installs | `uv pip compile` locks: `worker-api`, `worker-engine-cpu`, `worker-engine-cu121`; Linux container; OS matrix from tests (C) | Lalin build owner | NOT_RUN; only Windows 11 host here |
| 030 Supplier conformance/quality | **BUILD-GAP** | 86 Studio tests; no ASR/TTS quality tests | `tests/voice_worker/` suite; corpus scoring needs licensed corpus + GPU (C) | Lalin | NOT_RUN; corpus **BLOCKED** |
| 031 Joint PRP integration | **DEFER** | — | W2/W3/W4 on two hosts with vLLM (C) | PRP | **BLOCKED** (no PRP env) |
| 032 Complete handoff | **BUILD-GAP** | — | runbook, reference client, report split source/build/runtime/production (C) | Lalin | NOT_RUN |

No Must is silently narrowed: DEFER rows stay **BLOCKED** until their owner decides.

## 5. Decisions to close before freezing network implementation

| # | Decision | Default proposal (Lalin) | Decider | Blocks |
|---|---|---|---|---|
| D1 | Internal transport binding | HTTP `/worker/v1/*` per handoff §6.3 on private bind (127.0.0.1 or tunnel); FastAPI is the "framework equivalent" | Lalin + PRP API owner | A |
| D2 | Service auth | mTLS/tunnel for transport + two static service credentials (inference, management) with constant-time compare; **no** JWT lib in Phase 1 unless PRP requires signed grants | security + PRP | A |
| D3 | Admission proof | envelope trusted because caller = authenticated coordinator; worker verifies target/epoch/profile/window/deadline/replay; no PRP DB lookup | PRP | A |
| D4 | Payload transfer + ack | multipart push ≤10 MiB for ASR; output pull via `/output`; ack = `DELETE …/payload`; no grant-pull in Phase 1 | both artifact owners | A/B |
| D5 | Receipt store | sqlite3 WAL (stdlib), one writer per deployment, dedupe key issuer+attempt_id, horizon ≥ PRP replay window (**value needed**) | runtime owner + PRP | A |
| D6 | Cancellation guarantee | cooperative before start; ACK during compute; hard stop = terminate own engine child → requalify; `UNKNOWN` when unverifiable; PRP quarantines | ops + PRP | A |
| D7 | Identity vocabulary | `runtime_id` from config, `runtime_epoch` per engine start, `physical_resource_id` = operator mapping to GPU UUID | PRP | A |
| D8 | Phase 1 profiles | `asr-th-en-01` (faster-whisper large-v3; int8 CPU / float16 CUDA) and `tts-th-preset-01` (F5-TTS-THAI + **one approved preset**) — candidates, not approvals. **Slice B update 2026-09-21:** `asr-th-en-01` = large-v3-turbo `cuda:0 int8_float16`, **profile เดียว** — `asr-th-en-01-medium` ถูกตัดออกหลัง CPU benchmark ([proposal §4.5](2026-09-21-VOICE-WORKER-D14-D15-PROPOSAL.md)); `auto` language removed ([Slice B §5](2026-09-21-HEADLESS-VOICE-WORKER-SLICE-B-ASR.md)) — **applied on the owner's instruction 2026-09-21** | product + rights + technical | B |
| D9 | Preset voice + model rights | who records/licenses the preset; consent record. **Model facts verified 2026-09-20** ([JaiTTS comparison §2.2](../architecture/JAITTS_EASY_COMPARISON.md)): `SWivid/F5-TTS` base weights CC BY-NC-4.0 per authors; `VIZINTZOR/F5-TTS-THAI` tag CC-BY-4.0 on CC BY-SA-4.0 Thai data; `JTS-AI/JaiTTS-F5TTS` not public (404) → rights owner must rule on commercial/PRP use before any TTS profile is approved | rights owner | B (**BLOCKED**) · **DECIDED 2026-09-22 by Fable 5.1 on the owner's delegation**: keep TTS out of the worker (`ALLOWED_ENGINES` stays `stub`, `faster-whisper`; `operations` = asr only) until (1) written confirmation from the F5-TTS-THAI author or a licensing review of the CC BY-NC base-weights question and (2) a consented, licensed preset recording. Fallback if slow: a separate spike on a permissively licensed Thai TTS. **Not a legal clearance**: an AI cannot grant or certify rights |
| D10 | Residency policy | CPU-first trial until GPU envelope measured; no LLM eviction. **Measured 2026-09-22 on the dev box (RTX 5060 Ti 16 GB):** the PRP LLM runs on the same GPU — Docker container `prp-mvp-vllm` (`typhoon2.5-qwen3-4b`, unquantized bf16, `--gpu-memory-utilization 0.70`) holds ~11.9 GB; its own log gives a floor of 9.84 GiB (8.59 weights + 1.09 activation + 0.16 CUDA graphs) plus ~1.15 GiB KV for one 8192-token request, so lowering its utilization frees only ~0.3 GiB · **16 GB: ASR coexists** (~2.7 GB free vs ~1.3 GB needed; the 200-request soak ran with vLLM up) · **12 GB RTX 3060 (computed from vLLM's accounting, not measured): cannot coexist** — vLLM alone needs ~11 GiB of ~11.6 usable, so it would not even start at 0.70 · options for the PRP owner: quantize the LLM (weights 8.6 → ~2.5–4.5 GB), shorten `max-model-len`, or run ASR on CPU (turbo int8 RTF 0.72) · dev-box workaround for heavy GPU jobs only: `tools/dev/gpu_exclusive.ps1` (stops vLLM, always restarts it) | PRP admission + ops → **owner decision 2026-09-22** | **DECIDED: ASR runs on CPU** (never competes with the PRP LLM for VRAM; works on a 12 GB RTX 3060). Applied: `asr-th-en-01.json` → `device: cpu`, `compute_type: int8`, revision `rev-2026-09-22-large-v3-turbo-vad-cpu`; the GPU config is kept only as `asr-th-en-01.gpu-dev.json` for dev-box evidence. **Open: CPU sizing of the real Linux host** (RTF 0.72 measured on 28 threads only) |
| D11 | Dependency/OS matrix | **DECIDED 2026-09-22 (owner): PRP host is Linux.** Python 3.11 baseline; Windows stays the dev host. Consequences for Slice C: build and test the worker in a Linux container; with D10 the container is **CPU-only**, so no CUDA/nvidia wheels are needed (the current lock pins nvidia-cublas/cudnn for the Windows GPU dev box and needs a Linux CPU lock); Windows-only helpers (`register_cuda_dlls`, the ctypes memory tools, `.ps1` smoke) need Linux equivalents | Lalin build owner + PRP | C (**decided**) |
| D12 | Contract schema owner | **APPLIED 2026-09-20 (user instruction):** pydantic = source; `packages/contracts/schemas/lalin-voice-worker.schema.json` + `src/voiceWorker.ts` generated/mirrored; `test_contract_schema.py` asserts sync (see Slice A evidence §5) | Lalin maintainer | done |
| D13 | Windows sandbox limits | accept timeout + output cap + no-network as **partial**; OS mem/CPU cap only in Linux container | security + Lalin | B · **2026-09-22: with D11 = Linux the OS-level memory/CPU caps become available (cgroups via the container runtime), so the Windows "partial" applies to the dev box only** · **Measured 2026-09-22 in the Linux container:** all three memory limits fail safely; minimum **3 GiB** ([Slice C §8](2026-09-22-HEADLESS-VOICE-WORKER-SLICE-C-LINUX.md)) |
| D14 | VAD at manifest level (ASR) | `engine_options.vad_filter` per profile, no per-request override; evidence: far-field/overlap clips hallucinate foreign script without VAD — [proposal](2026-09-21-VOICE-WORKER-D14-D15-PROPOSAL.md) §1 | PRP owner → owner instruction | B.1 (**APPLIED 2026-09-21**: VAD on in `asr-th-en-01`, VAD hash pinned, revision bumped — [proposal §6](2026-09-21-VOICE-WORKER-D14-D15-PROPOSAL.md)) |
| D15 | Per-request glossary → `initial_prompt` (ASR) | `AsrInput.glossary` (optional, bounded, in digest, not stored); contract change → D12 regenerate; A/B evidence still to collect — [proposal](2026-09-21-VOICE-WORKER-D14-D15-PROPOSAL.md) §2 | PRP owner | B.2 · **DECIDED 2026-09-22 by Fable 5.1 on the owner's delegation**: option (a) per-request `AsrInput.glossary`, optional, never a profile default; documented as clean-audio only (it truncated far-field audio in the A/B). **APPLIED 2026-09-22**: `AsrInput.glossary` (≤ 64 terms, 1–40 code points each, ≤ 400 total after norm-v1, no control/format chars) → `initial_prompt`; in the idempotency digest; never written to disk (test); `result.glossary_applied` only when sent; `capabilities.asr_glossary` |
| D17 | Coordinator ↔ containerized worker connectivity | Worker binds loopback or a Unix socket only (`0.0.0.0` → exit 2, verified in the container), so it cannot be reached over a plain Docker network. Options: **(a) Unix socket on a shared volume** `unix:/run/voice-worker/worker.sock` (dir 0750, shared group) — **tested, recommended**; (b) shared network namespace — untested; (c) TLS reverse-proxy sidecar — new surface, needs review; (d) relax loopback rule — not recommended. [Slice C §3](2026-09-22-HEADLESS-VOICE-WORKER-SLICE-C-LINUX.md) | PRP owner | C · **DECIDED 2026-09-22 by Fable 5.1 on the owner's delegation**: option (a) Unix socket on a shared volume (`/run/voice-worker`, 0750, shared group). Coordinator and worker share one host; cross-host (c) only as a separately reviewed change |
| D16 | Run-to-run output non-determinism (ASR) | Identical requests can return different text (3 of 4 clips, [proposal §4.1](2026-09-21-VOICE-WORKER-D14-D15-PROPOSAL.md)). Options: (a) document it as a contract fact; (b) force deterministic decoding at a speed cost | PRP owner | C · **DECIDED 2026-09-22 by Fable 5.1 on the owner's delegation**: option (a) — same `attempt_id` returns the same receipt; a new attempt on the same audio may differ, so PRP must not use re-run-and-compare as verification. Doc-only (API_SEMANTICS / ADR-005 note pending) |
| D18 | Repeated OOM kills | Under a too-small memory limit every request is OOM-killed and the engine reloads each time, while the worker keeps reporting ready. Options: (a) after N consecutive OOM kills with no success, report not-ready until an operator restarts; (b) the same with automatic back-off retry; (c) leave it to the coordinator (it sees `RUNTIME_OOM`). **Recommended: (a), N = 2.** [Slice C §8](2026-09-22-HEADLESS-VOICE-WORKER-SLICE-C-LINUX.md) | PRP owner | C · **DECIDED 2026-09-22 by Fable 5.1 on the owner's delegation**: option (a), N = 2 — after 2 consecutive cgroup-confirmed OOM kills with no success between, report not-ready (`repeated_oom`) and stop respawning until an operator restarts. **APPLIED 2026-09-22**, proven against a real container OOM ([Slice C §9](2026-09-22-HEADLESS-VOICE-WORKER-SLICE-C-LINUX.md)) |

## 6. Implementation slices (proposed; nothing implemented)

### Slice A — headless boundary & safe executor (stub engine, no ML, runs on this machine)

New files (all under `apps/api/`):
`app/voice_worker/{__init__,__main__,app,settings,contract,errors,auth,admission,receipts,intake,supervisor,engine_stub}.py`,
`tests/voice_worker/{test_profile_allowlist,test_import_isolation,test_auth_negative,test_receipts_idempotency,test_deadline_cancel,test_admission_target,test_describe_readiness}.py`,
`tools/verify/smoke_voice_worker_control.ps1`, `tools/verify/voice_worker_client.py` (reference caller)
Existing files changed: **none** (Studio untouched)
Exit evidence: route enumeration = allowlist exactly; `sys.modules` has no `torch`/`app.brain`/`app.routers`; no `runtime/data` dirs created; bad profile → exit≠0; negative auth (missing/wrong/role mismatch/expired); duplicate submit concurrent + after restart → one receipt; digest mismatch → 409; stale epoch → 409; cancel before/during (stub) semantics; `WORKER_BUSY` at saturation; `--basetemp` pytest run + 86 Studio tests still pass

### Slice B — ASR/TTS provider (needs venv with speech stack + pinned assets; GPU for CUDA profile)

Existing files changed (minimal): `pipelines/asr.py` (+`load_whisper`, `transcribe_with`; wrappers delegate),
`pipelines/tts.py` (+`load_f5`, `f5_infer`; `_get_f5/_f5_synth` delegate; `synthesize()` unchanged)
New: `app/voice_worker/{manifest,engine_process,decoder,asr_adapter,tts_adapter,outputs,retention,management}.py`,
`profiles/*.example.json` (no weights), `tests/voice_worker/test_{manifest_checksum,decoder_faults,asr_semantics,tts_preset_only,text_policy,output_validation,erase_ttl}.py`
Exit evidence: offline startup with network blocked; checksum negative; decode-bomb/polyglot/spoofed MIME corpus; Thai/English/code-switch fixtures (schema); preset-only rejects; no hidden download (socket monitor); Studio smoke (`smoke_tts.py`) still passes; RTF/residency measured with units

### Slice C — qualification & handoff (BLOCKED on PRP env + rights)

Locks (`requirements-voice-worker-*.lock`), container image digest, `docs/operations/VOICE_WORKER_RUNBOOK.md`,
conformance report with PASS/FAIL/NOT_RUN/BLOCKED per LVP-AT, W2/W3/W4 joint results, install/rollback evidence

## 7. Evidence log (commands and outputs, 2026-09-20)

```text
git rev-parse HEAD                      → 84290102b84fd76dec069bf6d61ffdd2fc8466ab (main)
apps/api/.venv/Scripts/python.exe --version → Python 3.11.16
find_spec probe                         → torch/faster_whisper/ctranslate2/f5_tts/cached_path/TTS/psutil/librosa/vocos/huggingface_hub: False
import probe (asr, tts, runtime_devices, jobs.manager)
                                        → brain_imported=false routers_imported=false torch_imported=false fastapi_imported=false
                                        → data_dir_created_at_import=false; after get_settings(): true (outputs, uploads, voices)
pytest (default TEMP)                   → 21 passed, 65 errors in 8.74s
                                          all errors: PermissionError [WinError 5] 'C:\Users\pc\AppData\Local\Temp\pytest-of-pc'
pytest --basetemp <writable dir>        → 86 passed (86 collected)  [two runs]
git ls-files docs/product | grep CR-    → CR-001, CR-002 tracked; CR-003, CR-004 (Play) untracked
```

Reproducible Studio baseline command (PowerShell, from `apps/api`):

```powershell
$env:DATA_DIR = "<any writable temp dir>"; .\.venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp "<any writable temp dir>\pytest"
```

Environment note (not a code defect): `%TEMP%\pytest-of-pc` (last write 2026-09-19) denies
access to this user → pytest `tmp_path` fixture fails without `--basetemp`. Fix is a local
ACL/cleanup action for the workstation owner; not performed here.

## 8. Acceptance snapshot — LVP-AT-001..032

| Group | Status | Note |
|---|---|---|
| AT-004 | DELIVERED (review pending) | this document = reuse matrix |
| AT-001..003, 005..007, 009..030, 032 | NOT_RUN | no implementation yet; A-group runnable on this host, B/C need speech stack + assets + GPU |
| AT-008 | BLOCKED | no approved preset voice / rights record |
| AT-016, AT-030 (quality) | BLOCKED | no licensed corpus in repo |
| AT-031 | BLOCKED | no PRP environment / second host |

No mock PASS is reported as GPU/quality evidence.

## 9. Known risks and rollback

- **Concurrent edits**: another session is editing `docs/DOCS_INDEX.md`, PRD, AGENTS.md; this
  review did **not** modify shared docs to avoid clobbering; ID numbers must be re-verified at merge
- **Hidden upstream assets**: F5 vocoder download and empty-`ref_text` ASR are upstream behaviors
  to verify against the pinned `f5-tts` version before Slice B claims "no hidden download"
- **Windows sandbox**: only partial OS-level limits available without extra deps
- **XTTS exclusion**: worker has no multilingual fallback; unsupported language → `LANGUAGE_UNSUPPORTED`
- **Rollback (H0)**: delete the three new files (`CR-005`, `ADR-005`, this review). No code, config, data or runtime state was changed. No network calls to PRP, HF or cloud were made.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1c | 2026-09-20 | candidate | Link Slice A stub implementation evidence after user approval of D1–D7 defaults | based on 8429010 | LALIN |
| 0.1.9c | 2026-09-22 | candidate | D15 and D18 applied | based on a42cec0 | LALIN |
| 0.1.8c | 2026-09-22 | candidate | D15 (a), D16 (a), D17 (a), D18 (a, N = 2) decided and D9 kept BLOCKED with a stated path — by Fable 5.1 on the owner's delegation | based on a42cec0 | LALIN |
| 0.1.7c | 2026-09-22 | candidate | D13 measured (3 GiB minimum); D18 raised (repeated OOM policy) | based on ed156d4 | LALIN |
| 0.1.6c | 2026-09-22 | candidate | D17 raised (coordinator ↔ containerized worker); Slice C Linux evidence linked | based on 6508cec | LALIN |
| 0.1.5c | 2026-09-22 | candidate | D10 decided (ASR on CPU, applied to the production manifest) and D11 decided (Linux host); D13 caps become available on Linux | based on fdc427d | LALIN |
| 0.1.4c | 2026-09-22 | candidate | D10: measured GPU envelope with the PRP vLLM on the same card; ASR coexists on 16 GB, not on a 12 GB RTX 3060 with the current LLM | based on 9b090bd | LALIN |
| 0.1.3c | 2026-09-21 | candidate | D14 applied | based on 877a121 | LALIN |
| 0.1.2c | 2026-09-21 | candidate | D8 resolved and applied: single ASR profile, medium dropped | based on e5ce2d3 | LALIN |
| 0.1.1c | 2026-09-21 | candidate | Add D14/D15 rows (proposed, link to proposal doc); D8 row notes Slice B manifests and pending PRP confirmation | based on 16b3daa | LALIN |
| 0.1.0c | 2026-09-20 | candidate | H0 source/contract review, fit-gap 32, decisions D1–D13, slices A/B/C, evidence; no code change, GPU/quality NOT_RUN, joint BLOCKED | based on 8429010 | LALIN |
