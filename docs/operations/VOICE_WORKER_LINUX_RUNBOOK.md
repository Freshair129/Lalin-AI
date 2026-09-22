---
version: "0.1.0b"
created_at: "2026-09-22T22:00:00+07:00,LALIN,b4ffe94"
last_update: "2026-09-22T22:00:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "runbook"
  scope: "Deploy and operate the headless voice worker (ASR) next to the PRP coordinator on one Linux host — D10 CPU, D11 Linux, D13 caps, D16, D17 Unix socket, D18 OOM lockout"
---

# Voice worker on Linux — runbook

Decisions this runbook applies (all in the [H0 review](../validation/2026-09-20-HEADLESS-VOICE-WORKER-H0-REVIEW.md)):
D10 ASR on CPU · D11 Linux host · D13 memory cap ≥ 3 GiB · D16 output may differ between attempts · **D17 (a) Unix
socket on a shared volume** · D18 lockout after 2 OOM kills in a row. Evidence:
[Slice C](../validation/2026-09-22-HEADLESS-VOICE-WORKER-SLICE-C-LINUX.md).

## 1. What runs where

| | Voice worker container | PRP coordinator container |
|---|---|---|
| Network | **none** (`network_mode: none`) | its own |
| Reaches the other side by | serving `unix:/run/voice-worker/worker.sock` | the same socket, through the shared `voice-socket` volume |
| User | uid/gid 10001 (`worker`) | any uid, **plus supplementary group 10001** |
| Filesystem | read-only root, `/tmp` tmpfs, `/data` volume (0700), weights read-only | — |

Access is layered: no network surface at all → socket directory `0750 worker:worker`, so only group 10001 gets in (the
socket file itself is `0666`, uvicorn's choice; the directory is the real gate) → bearer token on every route except
`/health/live`. Both containers must be on the same host (D17 trade-off). Cross-host access would be option (c), a
TLS proxy that needs its own security review.

## 2. Prepare the host

1. **Weights**, read-only, pinned by sha256 in the manifest (the worker never downloads):
   `$LALIN_MODELS_DIR/faster-whisper/large-v3-turbo/` and `$LALIN_MODELS_DIR/vad/silero_vad_v6.onnx`. Copy them from a
   qualified box; a hash mismatch makes the worker refuse to boot (exit 2).
2. **Token file** (`VOICE_WORKER_ENV_FILE`, `chmod 600`, never in git):
   ```
   LALIN_VOICE_WORKER_INFERENCE_CREDENTIALS={"<coordinator-issuer-id>":"<inference token, ≥ 16 chars>"}
   LALIN_VOICE_WORKER_MANAGEMENT_TOKEN=<different token, ≥ 16 chars>
   ```
   The coordinator gets the inference token through its own secret store. (The example's `coordinator-probe` reads
   `LALIN_VOICE_WORKER_CLIENT_TOKEN` from the same file only to prove the path.)
3. **CPU threads.** Set `engine_options.cpu_threads` in the manifest to the `cpus` you give the container. The container
   sees every host core, so `0` over-subscribes. On hybrid CPUs, stay at or below the performance-core count
   (Slice C §7). Re-measure on this host with `tools/verify/voice_worker_sizing.py`. Changing the manifest changes its
   hash, so `profile_revision` should change too.

## 3. Start and verify

```bash
export LALIN_MODELS_DIR=/srv/lalin/models
export VOICE_WORKER_ENV_FILE=/srv/lalin/voice-worker.env
docker compose -f docker/voice-worker/compose.example.yaml up -d --build --wait voice-worker
docker compose -f docker/voice-worker/compose.example.yaml run --rm coordinator-probe   # readiness over the socket
```

`--wait` returns when `/health/live` answers, which is before warm-up ends. Readiness reports `warming_up` for about
15 s and then `ready: true`. The coordinator must gate on readiness, never on liveness.

Verified on the dev box (2026-09-22) with [`compose.example.yaml`](../../docker/voice-worker/compose.example.yaml):

| Check | Result |
|---|---|
| Worker healthy, read-only root, `/data` 0700, socket dir 0750, socket 0666 | PASS |
| Coordinator stand-in (uid 20000 + group 10001): readiness, then a real ASR job over the socket | PASS, `SUCCEEDED`, "Testing the voice worker 1 2 3" |
| Same stand-in **without** group 10001 | refused, `Permission denied` |
| Smoke in socket mode (`smoke_voice_worker.py --unix-socket …`) | PASS 12/12, including "no TCP listener" |

## 4. Operate

| Symptom | Meaning | Action |
|---|---|---|
| Container exits with code 2 | fail-closed config error (manifest, hash, token, socket path); the message says which | fix the config; `restart: on-failure:3` stops retrying |
| readiness `warming_up` | engine loading or warming | wait (~15 s on the dev box) |
| A job ends `RUNTIME_OOM`, and the worker is ready again under a new epoch | one OOM kill, engine restarted | nothing yet; resubmit if `safe_to_retry` |
| readiness `ready: false`, reason **`repeated_oom`**, `oom_lockout` set | D18: 2 OOM kills in a row, the worker stopped restarting the engine | raise `mem_limit`/`memswap_limit` (≥ 3 GiB for `asr-th-en-01`), then restart the container. There is no unlock endpoint on purpose |
| Boot fails: "hit its memory limit while loading" | the cap is too small to load the model | raise the memory limit |
| Two attempts on the same audio return different text | **D16: expected.** The engine is non-deterministic across runs | do not use re-run-and-compare as verification. The same `attempt_id` always returns the same receipt |

## 5. Contract facts the coordinator must honour

- **D16:** a new attempt on the same audio may return different text; the receipt of one attempt never changes.
- **D15:** `input.glossary` is optional per request; send it for **clean audio only** (it truncated far-field audio in the
  A/B). `capabilities.asr_glossary` says whether the profile applies it; `result.glossary_applied` confirms it per job.
- **D18:** treat `repeated_oom` as an operator alert, not a retryable error.

## CHANGELOG

| Version | Date | Status | Change | Evidence | Author |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-22 | beta | First runbook: compose example for D17 (a), verified with a group-gated coordinator stand-in; D13/D16/D18 operations | based on b4ffe94 | LALIN |
