---
version: "0.1.7b"
created_at: "2026-09-22T22:00:00+07:00,LALIN,b4ffe94"
last_update: "2026-09-23T22:45:00+07:00,LALIN"
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

Because the worker has no network, a scraper has to reach the socket. The **status gateway** (§3.3) is that
sidecar, and §3.4 is a Prometheus + Grafana stack already wired to it. Giving a Prometheus container the
`voice-socket` volume and group 10001 (like the coordinator) also works when everything runs on one host.
There is no dashboard in the worker on purpose; dashboards belong in the monitoring stack.

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

**Watch out on this host:** `tailscale serve` has Funnel switched on for four loopback ports (8080, 8088, 8787, 4000),
so the local config is one tailnet-policy change away from publishing them. Measured 2026-09-23: it is **not actually
reachable from the internet today** — public DNS (`8.8.8.8`) returns only `A 100.76.19.65` for the node, a CGNAT
address nothing outside the tailnet can route to, and no ingress record exists. A LINE webhook aimed at one of those
ports failed to deliver, which is consistent.

The rule stands anyway, because it costs nothing and the config already says "Funnel on": never bind the gateway to a
loopback port listed there, and keep the published address pinned to the tailnet IP. Verified: `http://127.0.0.1:9109/`
does not answer, only the tailnet address does.

**Do not test public reachability from this host.** MagicDNS resolves the `ts.net` name to the tailnet IP, so a `curl`
from here (or from any tailnet peer) succeeds over the tailnet and proves nothing about the internet.

### 3.4 Prometheus + Grafana

`docker/monitoring/compose.example.yaml` runs both, already pointed at the gateway. Prometheus keeps the numbers
(30 d / 4 GB, whichever comes first) and evaluates the alert rules; Grafana draws them. Neither is required for the
worker to run — they answer questions `/metrics` alone cannot, such as *when* something started getting worse.

```bash
export MONITORING_BIND_IP=<this host's tailnet IP>          # e.g. 100.76.19.65
export LALIN_MONITORING_SECRETS_DIR=/srv/lalin/monitoring   # contains a file named gateway-token
export MONITORING_ENV_FILE=/srv/lalin/monitoring.env        # GF_SECURITY_ADMIN_USER/PASSWORD, chmod 600
export MONITORING_ALERT_ENV_FILE=/srv/lalin/alert-line.env  # LINE token + destination, chmod 600
docker compose -f docker/monitoring/compose.example.yaml up -d
```

- **The token is a file, not a config value.** `prometheus.yml` points at `credentials_file`, so nothing secret is
  committed. Write it with no trailing newline.
- **Targets live in `docker/monitoring/targets/voice-worker-*.json`** and are re-read every 30 s, so adding a worker
  host is one file, no restart. Workers with a different gateway token need their own scrape job.
- Prometheus joins the `lalin-voice_default` network and scrapes `status-gateway:9109` directly; a worker on another
  host is scraped over its tailnet address instead (`voice-worker-remote.json.example`).
- Both UIs are published on the tailnet IP only, same rule as the gateway. Neither uses a port listed in
  `tailscale funnel status` — check it before changing a port, whether or not Funnel currently reaches the internet.
- `--web.enable-lifecycle` and `--web.enable-admin-api` are left off, so the Prometheus HTTP API cannot reload config
  or delete series. Grafana provisions its datasource and dashboard from files and refuses UI edits to them.

Alert rules (`docker/monitoring/alerts.yml`): gateway unreachable, not ready, **OOM lockout (D18)**, engine flapping,
stale heartbeat, RTF above 1, failure rate above 20 %. Prometheus only evaluates them; Alertmanager decides when and
where they go (§3.4.1).

Prometheus reloads neither config nor rules over HTTP by design, so **editing `prometheus.yml` or `alerts.yml` needs
`docker restart lalin-monitoring-prometheus-1`**. Target files are the exception — those reload on their own.

#### 3.4.1 Notifications: Alertmanager → LINE

Alertmanager groups and de-duplicates, then posts to a small bridge (`tools/monitoring/line_bridge.py`) that turns the
webhook into a LINE push. Alertmanager has no LINE integration of its own; the bridge is ~150 lines and runs from the
worker image, which already has fastapi/uvicorn/httpx, so nothing extra is built.

- **The bridge publishes no port at all.** Only Alertmanager, on the same compose network, can reach it. It still
  requires a bearer token (`credentials_file`, like the scrape token) so a stray container on that network cannot
  make it send messages.
- Routing: grouped by `alertname` + `host`; `critical` waits 10 s and repeats hourly, everything else waits 30 s and
  repeats every 4 h. `send_resolved: true`, so a recovery arrives as its own ✅ message.
- Inhibition: `VoiceWorkerGatewayDown` silences the other alerts for the same host (if metrics cannot be read, they
  would all fire together), and `VoiceWorkerOomLockout` silences `VoiceWorkerNotReady` — cause, not effect.
- Secrets in `/srv/lalin/alert-line.env`: `LALIN_ALERT_LINE_TOKEN` (channel access token), `LALIN_ALERT_LINE_TO`
  (userId or groupId) and `LALIN_ALERT_BRIDGE_TOKEN` (must equal the `bridge-token` file Alertmanager reads).
- A delivery failure returns 5xx on purpose, so Alertmanager retries rather than the bridge dropping the message.
  Check with `docker logs lalin-monitoring-alert-line-bridge-1`; `line_rejected` carries LINE's own reason (expired
  token, wrong destination, quota).
- Alertmanager's UI on `${MONITORING_BIND_IP}:9093` is where silences are created before planned maintenance.


#### 3.4.2 Finding `LALIN_ALERT_LINE_TO`

A **userId** for the console owner is printed in the LINE Developers console under the channel's *Basic settings*
("Your user ID"); that needs nothing else, as long as that account has added the bot as a friend. A **groupId** is
never shown anywhere — it exists only inside a webhook event.

[`tools/monitoring/line_userid_catcher.py`](../../tools/monitoring/line_userid_catcher.py) captures either. It
verifies `X-Line-Signature` against the channel secret, records only the source ids (never the message text), and
serves `GET /captured` behind its own token.

It is a **setup-time tool that has to be publicly reachable over HTTPS**, because LINE's servers call it. Expose it
deliberately, capture the id, then shut it down and close the public route again — do not leave it running.

**Tailscale Funnel does not work on this host** (see §3.3), so it is not a route for this: an attempt on port 10000 was
made and LINE could not deliver. Use a tunnel that terminates at a real public address (ngrok, Cloudflare Tunnel), or
skip the tool when a plain userId is enough and read it from the console instead.

### 3.5 Putting the status on an existing dashboard

`tools/dashboard/` has a drop-in kit (Vite proxy + a React card) for showing `/status` on a dashboard the team already
uses, without Prometheus. The important rule is in its README: **the browser must never hold the gateway token** — the
dashboard's dev server or backend holds it and proxies the request.

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
| 0.1.7b | 2026-09-23 | beta | How to find the LINE destination id (§3.4.2), including the setup-time catcher and its exposure caveat | based on 9c4a25b | LALIN |
| 0.1.6b | 2026-09-23 | beta | Alertmanager and the LINE bridge (§3.4.1); note that Prometheus needs a restart to pick up config/rule edits | based on 7affb29 | LALIN |
| 0.1.5b | 2026-09-23 | beta | Prometheus + Grafana stack (§3.4) and the dashboard kit (§3.5); §3.2 now points at the gateway instead of a hypothetical sidecar | based on e833a7c | LALIN |
| 0.1.4b | 2026-09-23 | beta | Status gateway section (tailnet-only, read-only, Funnel warning) | based on 05f869e | LALIN |
| 0.1.3b | 2026-09-23 | beta | /metrics section (Prometheus over the socket, what to alert on) | based on 94884f3 | LALIN |
| 0.1.2b | 2026-09-23 | beta | TTS container section (D19 = GPU) | based on 861c321 | LALIN |
| 0.1.1b | 2026-09-22 | beta | cpu_threads 8 shipped and memory check, from the PRP-host re-measurement (Slice C §10) | based on e6b7be2 | LALIN |
| 0.1.0b | 2026-09-22 | beta | First runbook: compose example for D17 (a), verified with a group-gated coordinator stand-in; D13/D16/D18 operations | based on b4ffe94 | LALIN |
