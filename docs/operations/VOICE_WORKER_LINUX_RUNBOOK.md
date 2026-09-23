---
version: "0.1.4b"
created_at: "2026-09-22T22:00:00+07:00,LALIN,b4ffe94"
last_update: "2026-09-22T23:00:00+07:00,LALIN"
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
3. **CPU threads.** `asr-th-en-01` ships `cpu_threads: 8`, matching `cpus: 8` in the compose example; both were sized
   on the PRP host (Slice C §10). If you change one, change the other: the container sees every host core, so a
   mismatch over- or under-subscribes. On hybrid CPUs, stay at or below the performance-core count. Re-measure with
   `tools/verify/voice_worker_sizing.py`, and bump `profile_revision` whenever the manifest changes.
4. **Memory.** The cap is 3 GiB (peak seen 2.58 GiB). Check that the host has it to spare:
   `docker run --rm lalin-voice-worker:dev sh -c 'grep MemAvailable /proc/meminfo'` (≈ 9.7 GiB on the PRP host with
   vLLM stopped; starting vLLM lowers it).

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

### 3.1 TTS (D19 = GPU)

```bash
docker compose -f docker/voice-worker/compose.example.yaml --profile tts up -d --build --wait voice-worker-tts
```

Separate container from ASR, with its own socket and data volumes, so a host without a GPU can still run ASR.
It needs `--gpus all` (NVIDIA container runtime) and the `tts-th-preset-01` weights under `$LALIN_MODELS_DIR`
(`f5-tts-thai/`, `vocos-mel-24khz/`). The image is ~11.6 GB and warm-up takes ~35 s in-container; memory cap 6 GiB,
VRAM ~0.9 GB. Verified 2026-09-23: suite 153 passed / 1 skipped in-container, socket smoke PASS 14/14
([Slice B TTS §6](../validation/2026-09-22-HEADLESS-VOICE-WORKER-SLICE-B-TTS.md)).

**The GPU is shared.** When vLLM runs it holds most of the VRAM; TTS needs ~1 GB free. There is no VRAM cap in the
worker, so check `nvidia-smi` before starting TTS on a busy GPU.

### 3.2 Monitoring

The worker exposes `GET /worker/v1/metrics` (Prometheus text format) over the same socket, with the same scope as
describe/readiness — the **management token** is enough, so a scraper never needs an inference credential.
It carries numbers only: no transcript, no TTS text, no attempt_id, no issuer (a test enforces this).

Because the worker has no network, a scraper has to reach the socket: give the Prometheus container the
`voice-socket` volume and group 10001 (like the coordinator), or run a tiny sidecar that reads the socket and
re-exposes the text over TCP. There is no dashboard in the worker on purpose; dashboards belong in the monitoring
stack (Grafana or whatever the PRP host already runs).

Worth alerting on: `lalin_voice_worker_ready == 0` for more than a few minutes, `lalin_voice_worker_oom_lockout == 1`
(operator action required, D18), a rising `lalin_voice_worker_engine_deaths_total`, and
`increase(lalin_voice_worker_attempts_failed_total{code="RUNTIME_OOM"}[15m]) > 0`. `lalin_voice_worker_epoch_info`
changing often means the engine keeps restarting.

### 3.3 Status gateway (monitoring from another host)

The worker has no network, so nothing outside the host can scrape it. The **status gateway** is a separate
read-only process (`app.voice_worker.status_gateway`) that accepts TCP and reads the worker's socket with the
**management token** — it can see status and can never submit work.

```bash
export STATUS_GATEWAY_BIND_IP=<this host's tailnet IP>     # e.g. 100.76.19.65
docker compose -f docker/voice-worker/compose.example.yaml --profile monitor up -d status-gateway
```

| Route | Auth | For |
|---|---|---|
| `GET /healthz` | none | the container health check; says only that the gateway itself is alive |
| `GET /metrics` | gateway token | Prometheus (passthrough of the worker's metrics) |
| `GET /status` | gateway token | a dashboard: ready/reason, epoch, profile and revision, device, warm, VRAM, capacity, OOM lockout |

Rules it enforces, fail-closed before it binds: the gateway token and the worker token must both be set, and the bind
address must be loopback or Tailscale CGNAT (100.64.0.0/10). `0.0.0.0` is refused unless `--container-published` is
passed, which is how the compose service runs it: Docker publishes the port **on the tailnet IP only**.

**Watch out on this host:** `tailscale serve`/Funnel proxies from `127.0.0.1` to the public internet (currently ports
8080, 8088, 8787, 4000). Never bind the gateway to a loopback port that Funnel exposes, and keep the published address
pinned to the tailnet IP — verified: `http://127.0.0.1:9109/` does not answer, only the tailnet address does.

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
| 0.1.4b | 2026-09-23 | beta | Status gateway section (tailnet-only, read-only, Funnel warning) | based on 05f869e | LALIN |
| 0.1.3b | 2026-09-23 | beta | /metrics section (Prometheus over the socket, what to alert on) | based on 94884f3 | LALIN |
| 0.1.2b | 2026-09-23 | beta | TTS container section (D19 = GPU) | based on 861c321 | LALIN |
| 0.1.1b | 2026-09-22 | beta | cpu_threads 8 shipped and memory check, from the PRP-host re-measurement (Slice C §10) | based on e6b7be2 | LALIN |
| 0.1.0b | 2026-09-22 | beta | First runbook: compose example for D17 (a), verified with a group-gated coordinator stand-in; D13/D16/D18 operations | based on b4ffe94 | LALIN |
