---
version: "0.1.0b"
created_at: "2026-09-23T21:40:00+07:00,LALIN,e833a7c"
last_update: "2026-09-23T21:40:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "validation"
  scope: "Monitoring for the headless voice worker — /metrics, the status gateway, a Prometheus + Grafana stack, and a drop-in kit for an existing dashboard"
---

# Voice worker monitoring — evidence

**Authorization:** owner 2026-09-23, "ลุย" twice (metrics, then the gateway) and "ทำทั้งคู่เลย" for the
dashboard question, having been told the two options were Prometheus/Grafana and GoVibe. Baseline `e833a7c`.

## 0. Result

| Gate | Result |
|---|---|
| Layer 1 — the worker exposes numbers (`/metrics`) | **PASS** (commit `05f869e`; no job content, enforced by a test) |
| Layer 2 — something outside the host can read them (status gateway) | **PASS** (commit `e833a7c`) |
| Layer 3a — collector and dashboard: Prometheus + Grafana | **PASS** — both running, scrape healthy, 7 alert rules loaded, dashboard provisioned |
| Layer 3b — an existing dashboard shows `/status` (kit for GoVibe) | **PASS** — proxy and card verified live against the production worker |
| End to end: a real job moves the numbers | **PASS** — one 15.0 s ASR job → `processing_seconds_total` 4.762, RTF **0.317** in Prometheus |
| Notifications (Alertmanager) | **NOT DONE** — rules evaluate, nothing notifies yet |
| Long-term retention verified | **NOT DONE** — configured 30 d / 4 GB, only minutes of data exist so far |

## 1. The three layers

```
voice worker ──unix socket──▶ status gateway ──HTTP+token──▶ Prometheus ──▶ Grafana
  ไม่มีเครือข่าย (D17)         9109 บน tailnet เท่านั้น        เก็บย้อนหลัง     หน้าจอ
                                     │
                                     └──/status──▶ dashboard ที่มีอยู่แล้ว (kit ใน tools/dashboard/)
```

The split is deliberate: the worker never gains a network, the gateway can read but not submit work (it holds only
the **management** token), and the collector and the screen are replaceable without touching either.

## 2. Prometheus + Grafana (`docker/monitoring/`)

| Item | Note |
|---|---|
| Images | `prom/prometheus:v3.1.0`, `grafana/grafana-oss:11.4.0` |
| Scrape | `status-gateway:9109/metrics` over the `lalin-voice_default` network; targets come from `targets/voice-worker-*.json` (file_sd, re-read every 30 s) so adding a host needs no restart |
| Token | `credentials_file`, mounted read-only from outside the repo — no secret in any committed file |
| Retention | 30 d or 4 GB, whichever first |
| Exposure | published on the tailnet IP only, same rule as the gateway; ports 9090 and 3009 are not among the four that Funnel proxies from loopback (8080, 8088, 8787, 4000) |
| Write paths | `--web.enable-lifecycle` and `--web.enable-admin-api` left off; Grafana provisions datasource and dashboard from files with `allowUiUpdates: false` |
| Alerts | 7 rules: gateway down, not ready, **OOM lockout (D18)**, engine flapping, stale heartbeat, RTF > 1, failure rate > 20 % |
| Dashboard | 13 panels: 6 state tiles, finished-by-outcome, failures/rejections by code, RTF, audio minutes, engine starts/deaths/OOM, heartbeat age, and an identity table from `lalin_voice_worker_info` |

Evidence, all against the running production worker:

- `/api/v1/targets`: both targets `up`, `lastError` empty.
- `/api/v1/rules`: all 7 rules loaded, state `inactive`.
- Grafana `/api/datasources` and `/api/search`: datasource `Prometheus` (default) and dashboard
  `lalin-voice-worker` in folder `Lalin`, both from provisioning files.
- Every panel expression was run against live data; all returned values (the identity table carries
  `profile_id=asr-th-en-01`, `profile_revision=rev-2026-09-22-large-v3-turbo-vad-cpu8`, `engine=faster-whisper 1.2.1`,
  `device_effective=cpu`).
- One real ASR job (15.0 s of Thai audio, submitted over the socket with the inference token, then erased):
  `attempts_accepted_total` 1, `attempts_finished_total{outcome="SUCCEEDED"}` 1,
  `processing_seconds_total` 4.761761, `audio_input_seconds_total` 15 → **RTF 0.317**, matching the Slice C range.

### 2.1 Two corrections to earlier advice

- Runbook §3.2 previously suggested giving a Prometheus container the socket volume *or* writing a sidecar. The
  gateway **is** that sidecar; §3.2 now points at §3.3/§3.4.
- `--web.enable-lifecycle=false` is not valid: Prometheus's boolean flags take no value and the container
  crash-looped with `unexpected false`. The flags are simply left off, which is the same result.

## 3. Kit for an existing dashboard (`tools/dashboard/`)

For a team that already has a dashboard and does not want Prometheus. The finding that shapes it: **a browser cannot
hold the gateway token.** Anything shipped to the page is readable in devtools, and that token reads the status of
every worker sharing it. The gateway also sets no CORS headers, so a direct cross-origin call fails anyway.

So the dashboard's **server** holds the token: a Vite `server.proxy` in development, a small backend or an nginx
`proxy_set_header` in production. The page only ever calls its own `/api/voice-worker/*`.

| File | What |
|---|---|
| `govibe/vite-proxy.snippet.ts` | the proxy block, token from `LALIN_STATUS_GATEWAY_TOKEN` |
| `govibe/voiceWorkerStatus.ts` | types for `/status`, `probeVoiceWorker()`, `summarize()`; framework-free |
| `govibe/VoiceWorkerPanel.tsx` | a React card, polls every 10 s |

Evidence:

- `tsc --noEmit` clean on both TS files (the first run caught a real narrowing bug: `probe.detail` was read on a
  union member that does not have it — fixed by extracting `StatusBody`).
- A scratch Vite 7.3.5 project was run with the snippet as its actual config: `/api/voice-worker/status` returned the
  production worker's JSON and `/api/voice-worker/metrics` returned Prometheus text, both through the proxy.
- `<VoiceWorkerPanel />` rendered in a real browser against the live worker: badge "พร้อมรับงาน", correct profile,
  revision, engine, device, capacity and heartbeat.
- Failure paths exercised in the page: a missing path and a closed port both produce `gateway-unreachable` and the
  badge "ติดต่อไม่ได้".

**Not applied to GoVibe.** `F:\govibe\source` is a separate repository, currently on branch
`feat/nondeveloper-production-foundation` with uncommitted changes that belong to someone else, and the instance the
team watches runs on the other host (100.66.206.115:3200). Dropping files into that working tree was not something to
do unasked. Its own `node_modules` was used read-only for the Vite check and left untouched (verified with
`git status` afterwards).

## 4. Open

1. **Alertmanager** — until it exists, an alert is only visible to someone looking at the page. A Slack/e-mail route
   is the obvious next step and is a config file, not code.
2. **GoVibe integration** — waiting on a decision about who applies the kit to that repository.
3. **Grafana admin password** lives in `/srv/lalin/monitoring.env` (icacls-restricted on this host). No SSO.
4. **One token for all hosts.** Every worker scraped by the same job shares one gateway token; per-host tokens need
   one scrape job each. Fine at two hosts, worth revisiting at ten.
5. **Retention untested** — the 30 d / 4 GB limits have never been reached.

## CHANGELOG

| Version | Date | Status | Change | Evidence | Author |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-23 | beta | First monitoring evidence: Prometheus + Grafana stack and the dashboard kit, both verified live; end-to-end job → RTF 0.317 in Prometheus | based on e833a7c | LALIN |
