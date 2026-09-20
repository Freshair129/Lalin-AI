---
version: "0.1.1b"
created_at: "2026-09-20T22:15:00+07:00,LALIN,8429010"
last_update: "2026-09-20T22:50:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "validation"
  scope: "Slice A — headless voice worker boundary and safe executor with a labeled stub engine (CR-005 candidate / ADR-005)"
---

# Headless Voice Worker — Slice A evidence (stub engine)

**Authorization:** ผู้ใช้สั่ง "เริ่ม Slice A ด้วย stub engine ตาม default proposal D1–D7" หลัง
[H0 review](2026-09-20-HEADLESS-VOICE-WORKER-H0-REVIEW.md) · baseline `84290102` บน `main` (working tree มีงาน Play ของ session อื่นปนอยู่)
**Scope:** control-plane boundary + safe executor เท่านั้น — **ไม่มี speech จริง, ไม่มี torch/model/GPU, ไม่ใช่หลักฐาน quality**
**Studio:** ไม่แก้ไฟล์ Studio แม้แต่ไฟล์เดียว (ดู §1)

## 0. Result

| Gate | Result |
|---|---|
| Studio regression (`apps/api/tests` เดิม 86 ข้อ) | **PASS 86/86** (รันรวมชุดเต็ม) |
| Voice worker suite (`apps/api/tests/voice_worker`, 72 ข้อ) | **PASS 72/72** |
| ชุดเต็ม `python -m pytest` (มี `--basetemp`) | **158 passed in 24.83s** |
| `compileall apps/api/app` | PASS |
| Headless smoke `tools/verify/smoke_voice_worker_control.ps1 -Kind tts` และ `-Kind asr` | **PASS** ทั้งสอง (boot → live → describe → ready → 401/403 → operation → output sha ✓ → erase → Studio `DATA_DIR` ไม่ถูกสร้าง) |
| Speech/GPU/quality (LVP-AT-007/008/012/014–019/028–031) | **NOT_RUN / BLOCKED** ตามเดิม |
| Production activation | none |

## 1. Files changed

New (worker):
`apps/api/app/voice_worker/{__init__,__main__,app,admission,auth,contract,engine_stub,errors,profile,receipts,runtime,settings,storage,supervisor,timeutil}.py`
New (profiles/tools): `apps/api/profiles/voice-worker/{asr,tts}-stub.example.json`, `tools/verify/voice_worker_client.py`, `tools/verify/smoke_voice_worker_control.ps1`
New (tests): `apps/api/tests/voice_worker/{__init__,conftest,_race_helper,test_profile_allowlist,test_import_isolation,test_auth_negative,test_receipts_idempotency,test_deadline_cancel,test_admission_target,test_describe_readiness,test_output_and_erase}.py`
Modified (docs only): `docs/architecture/API_SEMANTICS.md` (+section `voice_worker/`), `docs/architecture/BLUEPRINT.yaml` (+`backend_profile.voice-worker`, +8 endpoint rows)
**Existing Python/TS/Rust files modified: 0.** ไม่มี dependency ใหม่ (fastapi, uvicorn, pydantic-settings, python-multipart, httpx, sqlite3/multiprocessing stdlib ที่มีอยู่แล้ว)

## 2. Requirement → implementation → test

| FR-19 (CR-005 candidate) | LVP | Implementation | Tests | Status |
|---|---|---|---|---|
| 19.1 fail-closed headless entrypoint | 001/002/006 | `__main__.main` (exit 2), `settings.validate_runtime`, `profile.load_manifest` | `test_profile_allowlist` (missing/invalid manifest, short/shared tokens, non-loopback host, `runtime/data` guard, uvicorn `workers=1` + app object), `test_import_isolation` (subprocess: no torch/app.main/app.brain/app.routers/app.config/app.jobs/app.pipelines; Studio dirs ไม่ถูกสร้าง) | PASS |
| 19.2 route allowlist, no CORS/docs | 002/024 | `app.create_worker_app`, `ROUTE_ALLOWLIST`, `registered_routes` | route enumeration == allowlist; `/docs` `/openapi.json` `/redoc` 404; ไม่มี CORS middleware | PASS |
| 19.3 preserve Studio | 003 | worker ไม่ import Studio modules; data dir แยก | Studio 86/86 + isolation subprocess | PASS (speech-core seams เป็นงาน Slice B) |
| 19.5 describe/readiness/epoch | 009/010 | `runtime.describe/readiness`, `supervisor.snapshot/ready` | `test_describe_readiness` (labeled stub, `qualified=false`, epoch, observation_seq เพิ่ม, engine death → ready false, restart → epoch ใหม่, liveness ตอบขณะ inference < 1 s) | PASS |
| 19.6 target/epoch/profile/window | 011/022 | `admission.check_target/check_window` | `test_admission_target` (runtime_id/physical/epoch/profile/kind → 409, device_mismatch → 409, naive timestamps/kind/ID traversal → 422), `test_deadline_cancel` (deadline passed / start window → 409 `started=false`, ไม่มี receipt) | PASS |
| 19.7 durable receipts + idempotency | 020/023 | `receipts.ReceiptStore` (sqlite WAL, `INSERT OR IGNORE`, `BEGIN IMMEDIATE`) | `test_receipts_idempotency` (32 threads → 1 created; 8 spawn processes → 1 created; duplicate API concurrent → หนึ่ง 202; digest ต่าง/ยืด deadline → 409; duplicate หลังจบ → 200 receipt เดิม; restart → `UNKNOWN`/`never_started`; terminal final; sweep TTL/horizon) | PASS |
| 19.8 bounded intake | 012/021 | `runtime.Capacity` (no queue) | saturation → 503 `WORKER_BUSY` `started=false`, ไม่มี receipt; ว่างแล้วรับใหม่ | PASS |
| 19.9 bounded transfer (A-part) | 013 | Content-Length middleware, chunked read cap, sha256/size match, mime/language allowlist | oversize body 413 early; chunk > cap 413; sha mismatch/empty 422; spoofed mime 422; ไม่มี payload ถูก stage เมื่อ reject | PASS (signature sniff + decoder sandbox = Slice B) |
| 19.11 preset-only TTS schema | 017 | `contract` `extra="forbid"`, `admission.check_tts_input` | `ref_audio/model_path/upstream_url/engine` → 422 `UNSUPPORTED_PARAMETER` ไม่ echo ค่า; unknown/stale preset → `VOICE_NOT_APPROVED`; manifest ที่ `ref_text` ว่าง → ProfileError | PASS (schema/manifest); engine จริง = B |
| 19.12 text policy + output validation | 018/019 | `contract.normalize_text` (`norm-v1`), `storage.validate_wav_output` | 801 cp → 422; collapse whitespace → 799 นับหลัง normalize; `output_seconds=61` → `OUTPUT_LIMIT` ไม่ publish; header/sha/duration ตรง; MP3 NOT_RUN | PASS (wav) |
| 19.13 honest cancel/deadline/restart | 022/023 | `runtime._run_attempt` watchdog, `supervisor.terminate` (own child only), `receipts.reconcile/mark_engine_lost` | cooperative deadline → `engine_returned`; cancel mid → 202 ACK `compute_stopped=null` → FINISHED/CANCELLED; repeat idempotent; hard stop (`ignore_cancel+ignore_budget`) → `process_exit` `exited=true` `vram_reclaimed=null` → epoch ใหม่, stale epoch 409; orphan RUNNING จาก process ก่อน → `UNKNOWN` `safe_to_retry=false` | PASS |
| 19.14 scoped payload/erase/logs | 025/026/027 | `storage.PayloadStore` (issuer hash dir, fixed names), `receipts.request_erase` fence, typed `errors` | issuer อื่น → 404 รูปเดียวกับ unknown; erase หลังจบ → ERASED/410; erase ระหว่างทำ → 202 fence → ผลช้าถูกทิ้ง; cancel ≠ erase; ไม่มี absolute path ใน response; error body ไม่มี traceback | PASS (logs ตรวจด้วยตา; log filter อัตโนมัติ = B) |
| 19.15 load/drain/unload management | 028 | role `management` มีแล้ว (403 บน inference routes) — routes lifecycle ยังไม่มี | management token 403; | PARTIAL → B |
| 19.16 handoff artifacts | 032 | reference client (httpx, `retries=0`, ไม่ import PRP/Zuri/Studio), smoke script, example manifests, เอกสารนี้ | smoke PASS ×2 | PARTIAL (lock/image/runbook = C) |

## 3. Acceptance groups touched by Slice A

| LVP-AT | Result on this host (Windows 11, `apps/api/.venv` Py 3.11.16, no ML stack) |
|---|---|
| 001 | PASS (headless boot ไม่มี desktop/cloud creds/ML) — clean-machine install = C |
| 002 | PASS |
| 003 | PASS (Studio 86/86; worker state dir แยก; ไม่มี migration/delete ของผู้ใช้) |
| 004 | DELIVERED (H0) |
| 005 | PASS (synthetic client ไม่ต้องมี PRP; stub engine เปลี่ยนได้โดยไม่แก้ client schema — ยืนยันเชิงออกแบบ, engine จริง = B) |
| 006 | PASS-partial: control process ไม่มี torch; health/cancel ตอบขณะ inference; "เพิ่ม API process 1→2 แล้ว model copies ไม่เพิ่ม" NOT_RUN (`__main__` บังคับ `workers=1`) |
| 009 | PASS (ค่าที่ไม่วัด = `null` + `provenance`) |
| 010 | PASS-partial: kill engine → readiness false, stale epoch → 409; "observer ย้อนลำดับ" ยังไม่มี negative test |
| 011 | PASS-partial: target/epoch/device mismatch ปฏิเสธก่อน compute; auth binding = static service credential (D2 default) — mTLS/tunnel เป็น deployment concern |
| 013 | PASS-partial (ขนาด/digest/mime/ภาษา); signature/codec/actual length = B |
| 018 | PASS-partial (normalization + limit + OUTPUT_LIMIT); golden entity tests = B |
| 019 | PASS-partial (WAV header/duration/sha); MP3, ASYNC_REQUIRED (ฝั่ง PRP) NOT_RUN |
| 020 | PASS |
| 021 | PASS |
| 022 | PASS (cooperative + own-process terminate + UNKNOWN เมื่อ unverifiable) |
| 023 | PASS-partial (restart → UNKNOWN, no replay, client retries=0); network fault injection NOT_RUN |
| 024 | PASS (missing/wrong/malformed/expired/role mismatch; ไม่เผย existence) |
| 025 | PASS-partial (scope, handle-only, no paths); checksum ก่อน PRP commit = ฝั่ง PRP |
| 026 | PASS-partial (fence/TTL/tombstone ใน store; restart-survival ของ fence มาจาก sqlite แต่ยังไม่มี test เฉพาะ) |
| 027 | PASS-partial (typed codes, sanitized, `usage.provenance`); RTF/metrics = B |
| 007/008/012/014/015/016/017(engine)/028/029/030/031 | NOT_RUN / BLOCKED (ต้อง speech stack, assets, rights, GPU, PRP env) |

## 4. Commands and evidence

```text
apps/api> .venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp <writable>   → 158 passed in 24.83s
apps/api> .venv\Scripts\python.exe -m pytest tests/voice_worker -p no:cacheprovider --basetemp <writable> → 72 passed
apps/api> .venv\Scripts\python.exe -m compileall -q app                                   → OK
> powershell -File tools\verify\smoke_voice_worker_control.ps1 -Kind tts -Port 8794      → PASS (describe/readiness/401/403/202→FINISHED SUCCEEDED/output header_matches=true/erase ERASED)
> powershell -File tools\verify\smoke_voice_worker_control.ps1 -Kind asr -Port 8793      → PASS
git diff --check docs/architecture/BLUEPRINT.yaml docs/architecture/API_SEMANTICS.md      → clean
```

Smoke TTS receipt (excerpt): `execution_status=FINISHED`, `operation_outcome=SUCCEEDED`, `stop_evidence.kind=engine_returned`,
`result.sha256=6043c420…db755` = `X-Content-SHA256` = sha256 ของไฟล์ที่ดึงได้ (24,044 bytes, 24 kHz, 0.5 s), `usage.processing_seconds=0.204 (measured)`,
หลัง erase → `payload_state=ERASED`. Studio `DATA_DIR` marker ไม่ถูกสร้าง

Environment note: pytest บนเครื่องนี้ต้องใช้ `--basetemp` เพราะ `%TEMP%\pytest-of-pc` ACL denied (ดู H0 §7) — ไม่ใช่ code defect

## 5. Decisions applied (D1–D7 defaults) และส่วนขยายที่ต้องแจ้ง PRP

- D1 HTTP `/worker/v1/*` บน loopback (host อื่นถูก `ConfigError`; private network ผ่าน tunnel/reverse proxy)
- D2 static credentials: `LALIN_VOICE_WORKER_INFERENCE_CREDENTIALS` (issuer→token ≥16 chars) + `LALIN_VOICE_WORKER_MANAGEMENT_TOKEN` (ต่างกัน), optional `CREDENTIALS_EXPIRE_AT`
- D3 envelope trusted จาก issuer ที่ authenticate; worker ตรวจ runtime_id/physical_resource_id/epoch/profile/kind/window/deadline; ไม่ query PRP
- D4 multipart push (`envelope` + `audio`) ≤ 10 MiB; output pull `GET …/output`; ack = `DELETE …/payload`
- D5 sqlite WAL receipts; dedupe key `(issuer, attempt_id)`; digest ครอบ target+admission+input; tombstone horizon 48 h (ค่า replay window ของ PRP ยังต้องยืนยัน)
- D6 cooperative → ACK → own-child terminate → `process_exit` evidence → epoch ใหม่; `UNKNOWN` เมื่อ unverifiable
- D7 `runtime_id`/`physical_resource_id` จาก manifest; `runtime_epoch = ep-<uuid12>-<manifest_sha8>` ต่อการ start engine
- **ส่วนขยาย taxonomy ที่ PRP ต้อง map:** error codes `NOT_FOUND`(404), `OUTPUT_NOT_READY`(409), `PAYLOAD_ERASED`(410); payload_state `NONE`; execution_status `DISPATCHING`
- **D12 applied (2026-09-20, ผู้ใช้สั่งต่อจาก Slice A):** pydantic ใน `contract.py` เป็น source (เพิ่ม response models `OperationStatus`, `CancelResponse`,
  `ErasePayloadResponse`, `ErrorResponse`, `DescribeResponse`, `ReadinessResponse` + nested) → `python -m app.voice_worker.schema --write` สร้าง
  `packages/contracts/schemas/lalin-voice-worker.schema.json` (draft 2020-12, 32 `$defs`, discriminator `kind` → Asr/TtsEnvelope) + TS mirror
  `packages/contracts/src/voiceWorker.ts` (export จาก `index.ts`); `tests/voice_worker/test_contract_schema.py` (13 ข้อ) บังคับ sync และ validate
  response จริงของ asr/tts worker กับโมเดล. ตรวจซ้ำ: `schema --check` exit 0 · full suite **171 passed in 26.49s** · `npm run build:contracts` OK.
  runtime code ไม่ถูกแก้; `StopEvidence` ยอม extra fields เพราะคีย์ต่างตาม `kind` (ระบุใน docstring)

## 6. Known limits and risks

- stub engine ไม่ decode เสียง ไม่ validate codec — LVP-REQ-013/014 ครบเฉพาะขอบเขตขนาด/digest/mime
- multi-worker API scaling ยังไม่ทดสอบ (บังคับ `workers=1` โดยส่ง app object ให้ uvicorn)
- Windows: ไม่มี OS memory/CPU cap สำหรับ engine child (D13); terminate = `TerminateProcess`
- concurrent session อื่นแก้ `DOCS_INDEX.md`/PRD อยู่ → ยังไม่ index เอกสารชุดนี้ใน `DOCS_INDEX.md`; ต้องทำตอน merge
- `.ps1` ที่เขียนโดยเครื่องมือไม่มี BOM → PowerShell 5.1 อ่านเป็น ANSI; สคริปต์ smoke จึงเป็น ASCII-only (เจอจริงและแก้แล้ว 2026-09-20)

## 7. Rollback

ลบ `apps/api/app/voice_worker/`, `apps/api/tests/voice_worker/`, `apps/api/profiles/voice-worker/`, `tools/verify/voice_worker_client.py`,
`tools/verify/smoke_voice_worker_control.ps1`, เอกสาร CR-005/ADR-005/H0/Slice-A และ revert 2 hunks ใน `BLUEPRINT.yaml`/`API_SEMANTICS.md`
ไม่มี Studio code/config/data ถูกแตะ; worker state อยู่ใต้ `runtime/voice-worker` (gitignored ผ่าน `runtime/`) เท่านั้น

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-09-20 | beta | D12 applied: JSON schema + TS types exported from pydantic with sync test; suite 171/171 | based on 8429010 | LALIN |
| 0.1.0b | 2026-09-20 | beta | Slice A implemented locally with labeled stub engine; 158/158 tests, headless smoke PASS ×2; speech/GPU/quality NOT_RUN | based on 8429010 | LALIN |
