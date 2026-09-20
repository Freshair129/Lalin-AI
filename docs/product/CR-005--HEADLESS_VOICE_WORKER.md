---
version: "0.1.2c"
created_at: "2026-09-20T21:40:00+07:00,LALIN,8429010"
last_update: "2026-09-20T22:15:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "change-request"
  scope: "Headless ASR and preset TTS worker profile for PRP Phase 1 (supplier side)"
---

# CR-005 — Headless Voice Worker สำหรับ PRP (candidate)

## Request and approval boundary

ทีม PRP — Private Runtime Platform ส่ง handoff
`REQ-LALIN-PRP-VOICE-WORKER.md` รุ่น 0.1.0 (20 กันยายน 2026) ขอให้ Lalin เพิ่ม
**deployment role `voice-worker`** ที่ให้บริการ ASR และ preset TTS แบบ headless
ให้ PRP โดย reuse speech pipelines ที่มีอยู่ ไม่เปิด Lalin Studio และไม่ย้าย
PRP Router / API keys / global queue / LINE เข้ามาใน Lalin

เอกสารนี้เป็น **candidate** ยังไม่มีผู้อนุมัติ ไม่ใช่การอนุมัติ implementation,
model/voice license หรือ deployment รหัส `LVP-REQ-xxx` / `LVP-AT-xxx` เป็น
handoff-local; เอกสารนี้จัดสรร canonical ID ตามที่ตรวจจาก tree จริง (ดู §Allocation)

Complexity **C-3**, risk **HIGH**: เพิ่ม entrypoint/process ใหม่ที่แตะ security
boundary (machine-to-machine auth, bounded media decode, payload erasure),
แยก control/model process และต้องคง Studio full/lite behavior ทั้งหมด

[ASSUMPTIONS]

1. Worker เป็น **optional deployment role** ใน repo เดิม (`apps/api`) ไม่ใช่ repo ใหม่
   และไม่แทน Studio full/lite; ไม่มี Tauri/React ใน path นี้
2. Phase 1 รับงานสองชนิดเท่านั้น: `asr` (th/en/auto) และ `tts` ด้วย approved preset;
   ไม่มี dubbing, mastering, music, user voice cloning, brain/LLM หรือ LINE
3. PRP ถือ user API keys, quotas, global GPU admission, public jobs/artifacts;
   Lalin worker รับเฉพาะ authenticated dispatch จาก coordinator
4. Python 3.11 + venv ตาม repo baseline เป็นจุดเริ่ม; dependency/OS matrix
   ตัดสินจากผลทดสอบจริง ไม่สรุปจาก environment เก่า

## Allocation of canonical IDs (verified against the live tree, not from memory)

| Item | Evidence at `8429010` + working tree (2026-09-20 21:25) | Allocated (proposed) |
|---|---|---|
| Change request | tracked: `CR-001`, `CR-002`; untracked (Play work, other session): `CR-003--LALIN_PLAY_LOCAL_VIDEO.md`, `CR-004--LALIN_PLAY_MINIMAL_COMPACT_PREVIEW.md` (ปรากฏขณะเขียนร่างนี้ — ร่างแรกของไฟล์นี้เคยใช้ CR-004 แล้วถอย) | **CR-005** (this file) |
| ADR | tracked: `ADR-001..003`; untracked: `ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md` | **ADR-005** — `docs/architecture/ADR-005-HEADLESS-VOICE-WORKER-PROFILE.md` |
| SRS functional family | `SRS.md` มี `FR-01..FR-18` (+`FR-16W`); ไม่พบ `FR-19` ใน SRS/PRD/CR ใด | **FR-19** (`FR-19.1..`) — headless voice worker |
| SRS non-functional | `NFR-01..NFR-07` + `NFR-TV`; ไม่พบ `NFR-08` | **NFR-08** (worker isolation/security/perf). เลือกเลขแทน suffix เพราะ `tools/doc_graph_scan.py:110` regex `(FR|NFR|...)-[0-9]{2,}` ไม่จับ `NFR-TV-xx` |
| Validation | `docs/validation/<date>-<TOPIC>.md` | `docs/validation/2026-09-20-HEADLESS-VOICE-WORKER-H0-REVIEW.md` |

Working tree ถูกแก้พร้อมกันโดย session อื่น (Play split) เลขทั้งหมดต้อง
**re-verify ตอน merge** ถ้าเลขชนให้เลื่อนเลขนี้ ไม่ทับของผู้อื่น

## Evidence and alignment (source review ณ `84290102`)

- `apps/api/app/main.py` `create_app()` — profile ที่ไม่รู้จักถูกเปลี่ยนเป็น `full` (fail-open);
  base router list mount `brain`, `fs`, `agent`, `plugins`, `packs`, `projects`, `speech`
  ทุก profile; CORS `allow_origins=["*"]` → ตั้ง env `voice-worker` อย่างเดียว
  **ไม่** isolated ต้องมี entrypoint แยก
- `apps/api/app/pipelines/asr.py` — `_get_model()` อ่าน `get_settings().asr_model/asr_device`
  ซึ่ง `POST /speech/config` เปลี่ยนได้ (`set_model`), โหลดโดยชื่อโมเดล (download ครั้งแรก,
  ไม่มี checksum); `transcribe()` คืน language/duration/segments แต่ไม่ surface no-speech
- `apps/api/app/pipelines/tts.py` — `cached_path("hf://<repo>/…")` ดาวน์โหลด ckpt/vocab
  จาก repo ที่ตั้งผ่าน env; `ref_text=""` ถูกคอมเมนต์ว่า "ให้ ASR เดาเอง" (hidden model);
  `language=="th" and engine=="xtts"` สลับเป็น `f5` เงียบ ๆ (FR-02.5 ของ Studio)
- `apps/api/app/jobs/manager.py` — jobs.json single-writer, `asyncio.Lock` GPU FIFO
  ใน process เดียวกับ API, ไม่มี cancel/idempotency, `empty_cache` เป็น best-effort
- `apps/api/app/runtime_devices.py` — `resolve_device("cuda")` fail ชัดเมื่อไม่มี CUDA,
  `auto` fallback CPU พร้อม reason; registry เป็น process-local
- `apps/api/app/config.py` — `get_settings()` สร้าง `uploads/outputs/voices` ใต้
  `runtime/data` (ยืนยันด้วย probe: ไม่สร้างตอน import, สร้างตอนเรียก `get_settings()`)
- `apps/api/app/routers/health.py` import `..brain` → reuse ไม่ได้ใน worker;
  reuse ได้เฉพาะ pattern "ค่าที่วัดไม่ได้เป็น null"
- `apps/api/g-music-backend.spec` excludes torch/whisper/f5 → PyInstaller sidecar
  ไม่ใช่ทางส่ง worker ที่มีโมเดล
- `docs/architecture/SPEC.md §8` ระบุ "No auth — single-user desktop app" และ CORS open
  → worker ขัดกับข้อนี้ จึงต้องมี ADR-005 เป็น profile-scoped exception
- `docs/appendices/C-model-cards.md` — F5-TTS-THAI CC-BY-4.0 (attribution),
  faster-whisper/Whisper MIT, XTTS v2 CPML non-commercial → worker ไม่รวม XTTS
- ไม่มี approved preset voice asset ใน repo; voice library เป็นเสียงผู้ใช้อัปโหลด
  (`services/voices.py`) จึงใช้เป็น preset ไม่ได้

รายละเอียด fit-gap 32 ข้อ, decisions และ evidence commands อยู่ใน
[H0 review](../validation/2026-09-20-HEADLESS-VOICE-WORKER-H0-REVIEW.md)

## Proposed requirements (FR-19 family — candidate text for SRS)

| ID | Requirement / exit evidence | Handoff |
|---|---|---|
| FR-19.1 | มี entrypoint `python -m app.voice_worker` ที่บูตได้โดยไม่ import brain/routers ของ Studio, ไม่โหลด weights, ไม่ initialize CUDA และไม่สร้าง Studio data directories; profile ไม่รู้จัก → exit non-zero | LVP-REQ-001/002/006 |
| FR-19.2 | worker mount เฉพาะ route allowlist `/health/live`, `/worker/v1/{describe,readiness,operations…}`; ไม่มี CORS wildcard; ทดสอบด้วย route enumeration | LVP-REQ-002/024 |
| FR-19.3 | speech core (`pipelines/asr.py`, `pipelines/tts.py`) มี param-injected loader/infer functions ที่ Studio และ worker เรียกร่วมกัน; Studio wrapper และ FR-02.5/FR-06 behavior ไม่เปลี่ยน; test suite เดิมผ่าน | LVP-REQ-003 |
| FR-19.4 | worker โหลดโมเดล/vocab/vocoder/preset จาก local paths ใน approved profile manifest ที่มี sha256; ไม่มี network fetch จาก inference request; asset ขาด/checksum ผิด → `MODEL_UNAVAILABLE`/`PROFILE_MISMATCH` | LVP-REQ-007/008 |
| FR-19.5 | `describe`/`readiness` แยก configured/supported/loaded/qualified, มี `runtime_epoch`, `observed_at`, sequence; ค่าที่วัดไม่ได้เป็น `null` | LVP-REQ-009/010 |
| FR-19.6 | invoke ต้องมี envelope (`invocation_id`, `attempt_id`, target, admission, `deadline_at`) จาก authenticated coordinator; target/epoch/profile ไม่ตรง → 409 ก่อน compute; worker ไม่ใช้ device `auto` | LVP-REQ-011/022 |
| FR-19.7 | execution receipt แบบ durable (issuer+attempt_id, payload digest) crash-safe; duplicate เดิมคืน receipt เดิม, digest ต่าง → `IDEMPOTENCY_CONFLICT`; ไม่ใช้ `jobs.json` | LVP-REQ-020/023 |
| FR-19.8 | local capacity เป็น bounded semaphore ต่อ profile; เกิน → `WORKER_BUSY` ทันที ไม่มีคิวไม่จำกัด | LVP-REQ-012/021 |
| FR-19.9 | ASR input: ≤10 MiB, ≤60 s, sniff signature/codec, decode ใน subprocess ที่มี timeout/output cap/ไม่มี network; ชื่อไฟล์ภายในเป็น random ID | LVP-REQ-013/014 |
| FR-19.10 | ASR result: text/language/duration/segments จากหลักฐานจริง, `NO_SPEECH`/`AUDIO_UNINTELLIGIBLE` ตาม policy ที่ versioned; ไม่มี LLM | LVP-REQ-015/016 |
| FR-19.11 | TTS รับเฉพาะ `voice_preset_id`+`voice_revision` ที่ approved; schema `extra=forbid`; `ref_text` ว่างทำให้ profile ไม่ qualify; engine allowlist `{f5}` เท่านั้น | LVP-REQ-017 |
| FR-19.12 | text normalization policy revision ตรึง; ≤800 code points; output ≤60 s มิฉะนั้น `OUTPUT_LIMIT`; output ผ่าน header/duration/sha256 validation ก่อน `AVAILABLE` | LVP-REQ-018/019 |
| FR-19.13 | cancel: ก่อน compute → never_started; ระหว่าง compute → ACK/UNSUPPORTED และ `compute_stopped` เป็น `null` จนมี evidence; API/engine restart → attempt เดิมเป็น `UNKNOWN` ไม่ replay | LVP-REQ-022/023 |
| FR-19.14 | payload ผูก issuer+attempt scope; erase/TTL ≤24 h; tombstone คง dedupe horizon; logs ไม่มี transcript/audio/credential | LVP-REQ-025/026/027 |
| FR-19.15 | load/drain/unload เป็น management operation ด้วย credential แยก; evidence ระบุ process/model refs; ไม่อ้าง VRAM คืนจาก `empty_cache` | LVP-REQ-028 |
| FR-19.16 | ส่ง pinned lock/requirements แยก API กับ engine, reference client, conformance suite, runbook และ handoff report แยก supplier/joint/production | LVP-REQ-029..032 |

NFR-08 (candidate): worker control process ไม่โหลด torch; `/health/live` ตอบขณะ
inference; process-wide model copies ไม่เพิ่มเมื่อเพิ่ม API workers; ทุก error
sanitized; ไม่มี outbound Internet ระหว่าง inference

## Architecture delta (summary; รายละเอียดใน ADR-005)

```text
PRP coordinator ──TLS/tunnel + service auth──▶ voice-worker API (thin, no torch)
                                                 │ receipts (sqlite WAL)   │ allowlist routes
                                                 ▼                          ▼
                                     supervised engine process(es)   decoder subprocess (ffmpeg, bounded)
                                     one per approved profile        no network, timeout, output cap
                                     reuse pipelines/asr.py, tts.py core functions
Studio full/lite ── unchanged ── app.main / sidecar_lite / jobs.json / WS
```

## Execution after approval (slices; ทุกข้อเริ่ม NOT_RUN)

1. **H0** — review นี้ + decisions ที่ PRP/security/Lalin ต้องปิด (ดู H0 doc §5)
2. **A** — headless boundary + safe executor ด้วย stub engine ที่ติดป้าย; tests: allowlist,
   import isolation, negative auth, receipts race/restart, deadline/cancel, target mismatch
3. **B** — ASR/TTS provider: param-injected core, offline manifest, preset, decoder sandbox,
   output validation, retention; ต้องมี GPU/model environment จริง (เครื่องนี้ยังไม่มี)
4. **C** — lock/image, reference client, runbook, joint W2/W3/W4 กับ PRP (BLOCKED จน PRP env พร้อม)

Success: FR-19.1–16 มี implementation+evidence, Studio 86 tests เดิมผ่าน,
ไม่มี hidden download/fallback, ไม่มี Studio route ใน worker

## Not included

PRP gateway/keys/LINE/Zuri, dubbing/mastering/music, user voice cloning ผ่าน worker,
XTTS, cloud fallback, UI, การเปลี่ยน Studio jobs/WS semantics, การเลือก/อนุมัติสิทธิ์
preset voice (rights owner), production activation

## Rollback

H0/CR/ADR เป็นเอกสารเท่านั้น — ลบไฟล์สามฉบับนี้ Slices A–C เป็น additive:
ปิด worker ด้วยการไม่ deploy/ไม่ตั้ง profile; ไม่ลบ Studio data, ไม่ลบ receipts
ของ attempt ที่ยัง unsettled, ไม่เปิด cloud fallback

## Implementation status

Slice A implemented locally under user instruction (2026-09-20, default D1–D7): fail-closed
`python -m app.voice_worker`, allowlist routes, static two-role service auth, sqlite receipts,
supervised **stub** engine, admission/deadline/cancel/erase semantics. Evidence: 158/158 tests,
headless smoke PASS — see [Slice A validation](../validation/2026-09-20-HEADLESS-VOICE-WORKER-SLICE-A.md).
CR ยังเป็น **candidate**: ไม่มี speech engine จริง, ไม่มี GPU/quality evidence, ไม่มี production activation

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.2c | 2026-09-20 | candidate | Record local Slice A stub implementation and evidence; CR remains candidate | based on 8429010 | LALIN |
| 0.1.1c | 2026-09-20 | candidate | Renumber to CR-005 after a concurrent Play candidate took CR-004 in the working tree | based on 8429010 | LALIN |
| 0.1.0c | 2026-09-20 | candidate | Propose headless voice worker CR from PRP handoff 0.1.0 with verified ID allocation and FR-19/NFR-08 candidate text; no code change | based on 8429010 | LALIN |
