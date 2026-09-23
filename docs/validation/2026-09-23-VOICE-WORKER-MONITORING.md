---
version: "0.1.5b"
created_at: "2026-09-23T21:40:00+07:00,LALIN,e833a7c"
last_update: "2026-09-24T00:20:00+07:00,LALIN"
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
| Layer 2 — something outside the host can read them (status gateway) | **PASS** (commit `e833a7c`); reachable from the other host over the tailnet (§2.2) |
| Layer 3a — collector and dashboard: Prometheus + Grafana | **PASS** — both running, scrape healthy, 7 alert rules loaded, dashboard provisioned |
| Layer 3b — an existing dashboard shows `/status` (kit for GoVibe) | **PASS** — proxy and card verified live against the production worker |
| End to end: a real job moves the numbers | **PASS** — one 15.0 s ASR job → `processing_seconds_total` 4.762, RTF **0.317** in Prometheus |
| Layer 4 — notifications reach a person (Alertmanager → LINE) | **PASS, end to end on the real LINE API** (§5.4): three messages delivered to the owner's phone, quota counter confirms it |
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
| Exposure | published on the tailnet IP only, same rule as the gateway; ports 9090 and 3009 are not among the four loopback ports `tailscale serve` has Funnel switched on for (8080, 8088, 8787, 4000) — see §6 for what that switch actually does here |
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

### 2.2 Cross-host reachability (2026-09-23)

Confirmed by the owner from the second host (worker-node-3060, 100.66.206.115): `GET /healthz` on
`http://100.76.19.65:9109` returns **200**. Nothing in Windows Firewall blocks the published port, so a Prometheus or
a dashboard running on that host can scrape this one. `127.0.0.1:9109` still does not answer, which keeps the gateway
off the loopback ports Funnel is configured for (§6).

Note for anyone repeating this: on Windows PowerShell `curl` is an alias for `Invoke-WebRequest`, so the usual
`curl -s -o /dev/null -w "%{http_code}"` fails with a parameter error. Use
`(Invoke-WebRequest -Uri <url> -UseBasicParsing).StatusCode`.

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

## 5. Notifications — Alertmanager → LINE (2026-09-23)

Chosen by the owner: LINE. Alertmanager has no LINE receiver, so a bridge
([`tools/monitoring/line_bridge.py`](../../tools/monitoring/line_bridge.py)) converts the generic webhook into a
`/v2/bot/message/push` call.

| Item | Note |
|---|---|
| Alertmanager | `prom/alertmanager:v0.28.0`, UI on the tailnet IP:9093 (for silences) |
| Bridge | runs from `lalin-voice-worker:dev` (fastapi/uvicorn/httpx already there), **no published port** — only Alertmanager on the compose network can reach it, and it still requires a bearer token |
| Routing | grouped by `alertname` + `host`; critical `group_wait` 10 s / repeat 1 h, others 30 s / 4 h; `send_resolved: true` |
| Inhibition | `VoiceWorkerGatewayDown` silences the rest for that host; `VoiceWorkerOomLockout` silences `VoiceWorkerNotReady` |
| Failure handling | a LINE error returns 5xx so **Alertmanager** retries; the bridge never retries or drops silently |

### 5.1 End-to-end evidence

The status gateway was stopped deliberately (the worker was untouched and stayed healthy; nothing consumes `/status`
yet) so a real rule would fire rather than an injected alert. A stub standing in for `api.line.me` ran on the
monitoring network.

| Time | Event |
|---|---|
| 22:23:49 | `docker stop lalin-voice-status-gateway-1` |
| 22:24:28 | Prometheus: `VoiceWorkerGatewayDown` **pending** (`for: 2m`) |
| 22:27:32 | **firing** — one evaluation cycle after the 2 min, because `evaluation_interval` defaults to 1 min |
| 22:27:39 | LINE push received: `to` correct, one text message, "🔔 แจ้งเตือน · lalin voice worker / 🔴 VoiceWorkerGatewayDown · prp-linux-01" with both annotations |
| 22:27:46 | gateway started again |
| 22:32:35 | resolved push received: "✅ หายแล้ว · …" |

Afterwards: Alertmanager 0 active alerts, both Prometheus targets `up` again.
`GET /api/v1/alertmanagers` shows `http://alertmanager:9093/api/v2/alerts` active and none dropped.

### 5.2 Tests

19 tests in [`test_alert_line_bridge.py`](../../apps/api/tests/test_alert_line_bridge.py): message formatting
(firing/resolved marks, severity marks, missing `host`, >10 alerts summarised, truncation under LINE's limit, empty
payload still says something), the exact route set (only `GET /healthz` and `POST /alert`), the token being required
before any outbound call, the LINE body, both failure modes becoming 5xx, and `main()` exiting 2 for each missing
setting. Mutation-checked: making auth always pass, turning a LINE rejection into 200, and removing truncation each
fail the suite. apps/api **278 passed, 2 skipped**.

### 5.3 Two things worth remembering

- Prometheus runs without `--web.enable-lifecycle`, so **editing `prometheus.yml` or `alerts.yml` requires a
  container restart**. Only the target files reload by themselves. The alerting block was added and needed exactly
  that restart before Alertmanager appeared.
- `for: 2m` means "first evaluation at least 2 min after it became true" — with a 1 min `evaluation_interval` the
  real delay is 2–3 min. Worth knowing before someone reports the alert as late.

## 4. Open

1. **Quota, not credentials, is now the limit.** 300 messages a month on the free account. `repeat_interval` was
   set from that (§5.3), but a long incident plus a chatty month can still run it out, and an exhausted quota fails
   *silently*. Worth a check on `/v2/bot/message/quota/consumption` if alerting ever goes quiet.
2. **GoVibe integration** — waiting on a decision about who applies the kit to that repository.
3. **Grafana admin password** lives in `/srv/lalin/monitoring.env` (icacls-restricted on this host). No SSO.
4. **One token for all hosts.** Every worker scraped by the same job shares one gateway token; per-host tokens need
   one scrape job each. Fine at two hosts, worth revisiting at ten.
5. **Retention untested** — the 30 d / 4 GB limits have never been reached.

### 5.3 Destination: broadcast, because the account is free (2026-09-24)

The owner chose LINE, and the bot is a dedicated account (`Lalin`, `@546nxdmm`) with no other purpose. Getting a
destination for it turned out to be the hard part:

| Route to a destination | Result |
|---|---|
| `Your user ID` in the console | not shown — it requires the Business ID to be linked to a LINE account |
| `GET /v2/bot/followers/ids` | **403** — verified or premium accounts only, this one is free |
| Webhook event | needs a public HTTPS endpoint, and Funnel on this host does not reach the internet (§6) |
| **`/v2/bot/message/broadcast`** | **works on a free account and needs no id at all** |

So the bridge gained a `broadcast` mode: `LALIN_ALERT_LINE_TO=broadcast` sends to everyone who added the bot, with no
`to` field. The trade-off is real — anyone who later adds this bot receives the alerts — and it is acceptable only
because this account exists for alerting and nothing else. A destination that is neither `broadcast` nor a
well-formed `[UCR][0-9a-f]{32}` id now stops the bridge at boot, so a leftover `REPLACE_ME` cannot survive until the
first real incident.

Also learned the hard way: **the account showed 0 friends**, and a LINE bot with no friends delivers nothing in
either mode. Adding the bot as a friend is a prerequisite, not a detail.

`repeat_interval` was then set from the quota rather than from instinct: 300 messages/month, so hourly repeats on a
stuck critical alert (24/day) would exhaust it in 12 days and then go silent — a failure mode worse than having no
alerting, because the dashboard still looks healthy. Shipped: 6 h for critical, 12 h for the rest.

### 5.4 Delivered, on the real API (2026-09-24)

Three messages reached the owner's phone through `api.line.me`, confirmed by screenshot and by the quota counter
moving from 0 to 1 on the first one (proof of an actual send, not just a 200):

1. a firing test alert injected into Alertmanager,
2. a second one after an encoding fix (below),
3. the `✅ หายแล้ว` resolution after both test alerts were expired with `endsAt`.

The bridge logged `200 OK` for all three and no `line_rejected`. Alertmanager was left with zero active alerts — a
test alert that is never expired keeps re-notifying on the repeat interval, which is its own small trap.

**The Thai text in the first message arrived as mojibake, and that was my test command, not the pipeline.** The
message header, which comes from the bridge's own source, rendered correctly in the same message; only the
annotations I passed through a shell `curl` were mangled. Re-sent from Python with
`json.dumps(..., ensure_ascii=False).encode("utf-8")` and it rendered correctly. Annotations in `alerts.yml` are read
as UTF-8 by Prometheus and were already proven intact in the §5.1 run, so no production path was affected.

### 5.5 A test that hung instead of failing

While mutation-checking the destination validator (`valid_destination` forced to return `True`), the suite **hung**
instead of failing: with validation defeated, `main()` ran on to `uvicorn.run` and served forever inside pytest. A
hanging test says nothing about what broke. Both `main()` tests now take a `no_server` fixture that stubs `uvicorn`
so reaching that line raises. Re-running the same mutation now fails in seconds with a message naming the cause.

## 6. Correction — Tailscale Funnel is configured but not reachable (2026-09-23)

Earlier notes in this file, in the runbook and in two compose files said this host "exposes four loopback ports to the
public internet" through Funnel. **That overstated the exposure**, and the correction matters because it was reported
to the owner as a security finding.

What is true: `tailscale serve status` shows Funnel switched on for `:443 → 8088`, `:8443 → 8080`, `:10000 → 8787` and
`:4000 → 4000`. What is not: those endpoints do not answer from outside the tailnet. Public DNS returns only
`desktop-vetatmq.tail71c7d1.ts.net A 100.76.19.65` — a CGNAT address, not routable on the internet — with no AAAA and
no ingress CNAME. Funnel ingress has never been provisioned for this tailnet, whatever the local config claims.

**How the mistake happened, so it is not repeated:** reachability was checked with `curl` from this host against the
`ts.net` name. MagicDNS resolves that name to the tailnet IP, so the request went over the tailnet and returned 200
while proving nothing about the internet. Testing an "is it public?" question from inside the perimeter cannot answer
it. The check that did answer it was `Resolve-DnsName … -Server 8.8.8.8`, plus one real external client: LINE's
servers could not deliver a webhook to `:10000`.

Two of the four also point at nothing at all — ports 8080 and 8787 have no listener, and only `prp-mvp-edge` (8088)
and `prp-mvp-litellm` (4000) are live. Those two belong to PRP and were left alone.

**Nothing in the design changes.** Binding the gateway, Prometheus and Grafana to the tailnet address rather than
loopback costs nothing, and the local config is one tailnet-policy change away from making the exposure real. The
warning stays; its severity was wrong, not its direction.

## 7. Host network posture, measured (2026-09-24)

§6 corrected one claim; this is the full picture for the host the worker runs on, because "who can reach what" is the
premise every binding decision here rests on. Measured, not assumed.

### 7.1 Reachable from the public internet

One thing only: `https://unspirited-expostulatory-angila.ngrok-free.dev` → `zuri-ai-web:3000`, an ngrok tunnel that
belongs to the Zuri project and has been up for two days. Unlike the `ts.net` names this is genuinely public — DNS
resolves to `47.130.23.15`, an ngrok edge address, and it answers 200. Reported to the owner; not touched, it is
another team's.

### 7.2 Reachable from the tailnet

`9109` status gateway, `9090` Prometheus, `3009` Grafana, `9093` Alertmanager — all ours, all intended.

### 7.3 Ollama was open to the LAN and the tailnet — closed 2026-09-24

`ollama` was listening on `[::]:11434` and answered `/api/tags` **without authentication** from both the tailnet
address and the LAN address (`192.168.1.100`), exposing 29 models and the GPU to anyone on the same wifi or tailnet.
The owner asked for it to be closed.

The fix is not the obvious one. Setting `OLLAMA_HOST=127.0.0.1:11434` in the user environment **had no effect**: the
Windows tray app passes its own value, and `server.log` showed the server still starting with
`OLLAMA_HOST:http://0.0.0.0:11434`. The real switch is `settings.expose` in the app's own SQLite database at
`%LOCALAPPDATA%\Ollama\db.sqlite`, which was `1`. With the app stopped it was set to `0` (the database was backed up
first), and the server now reports `Listening on 127.0.0.1:11434`.

Verified after: loopback 200 with all 29 models, tailnet and LAN both refused. No container references Ollama or port
11434, so nothing depended on the old binding. The environment variable was left in place as a second layer for anyone
running `ollama serve` by hand. To reopen it, use the toggle in the Ollama app's own settings rather than the database.

### 7.4 Docker disk

With the owner's approval, `vllm/vllm-openai:latest` (30.5 GB, PRP's, no container referenced it) was removed and
unused build cache pruned (4.25 GB): images 95.1 → 64.6 GB. **`C:` free space did not change**, because
`docker_data.vhdx` is not a sparse file and does not shrink on deletion — the space is reusable by Docker but only
returns to the host after a compaction, which needs the WSL VM stopped and was therefore left to the owner via Docker
Desktop. 53.7 GB is still reclaimable, almost all of it Zuri's images including one tagged `rollback-before-*`, which
is why a blanket `docker image prune -a` was refused.

## CHANGELOG

| Version | Date | Status | Change | Evidence | Author |
|---|---|---|---|---|---|
| 0.1.5b | 2026-09-24 | beta | LINE delivery proven on the real API (§5.4); broadcast mode for a free account and quota-driven repeat_interval (§5.3); a hanging test fixed (§5.5) | based on ed41618 | LALIN |
| 0.1.4b | 2026-09-24 | beta | Host network posture (§7): the one real public route is Zuri's ngrok; Ollama closed to loopback (the app's expose flag overrides OLLAMA_HOST); Docker disk cleanup and why C: did not change | based on a3986a9 | LALIN |
| 0.1.3b | 2026-09-23 | beta | Correction (§6): Funnel is configured but has no public ingress; the earlier "exposed to the internet" finding overstated the risk, and the test that produced it was run from inside the tailnet | based on 24147fe | LALIN |
| 0.1.2b | 2026-09-23 | beta | Alertmanager + LINE bridge (§5); pipeline proven end to end with a real alert, last hop blocked on LINE credentials | based on 7affb29 | LALIN |
| 0.1.1b | 2026-09-23 | beta | Cross-host reachability confirmed from worker-node-3060 (§2.2) | based on dd26c13 | LALIN |
| 0.1.0b | 2026-09-23 | beta | First monitoring evidence: Prometheus + Grafana stack and the dashboard kit, both verified live; end-to-end job → RTF 0.317 in Prometheus | based on e833a7c | LALIN |
