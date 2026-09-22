---
version: "0.2.0b"
created_at: "2026-09-22T12:30:00+07:00,LALIN,6508cec"
last_update: "2026-09-22T14:30:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "validation"
  scope: "Slice C step 1 — the headless voice worker in a Linux CPU-only container (D10 = CPU, D11 = Linux); CR-005 candidate / ADR-005"
---

# Headless Voice Worker — Slice C evidence (Linux container, CPU)

**Authorization:** owner decisions 2026-09-22 — D10 "ใช้ CPU", D11 "เป็น Linux" — and download approval ("อนุญาต ดาวน์โหลดได้เลย")
for `python:3.11-slim` (Docker Hub) and the Linux wheels (PyPI). Baseline `6508cec` on `main`.
**Scope:** first time the worker runs on Linux. CPU sizing on the real host, D13 OS caps and the long soak verdict are
**not** in this step (§5).

## 0. Result

| Gate | Result |
|---|---|
| Image build (`--only-binary=:all:`, no source builds) | **PASS** — 52 pinned wheels, identical versions to the Windows evidence |
| Voice worker suite **inside the Linux container**, `--network none`, weights mounted read-only | **124 passed** |
| Cross-platform smoke on Linux (`tools/verify/smoke_voice_worker.py`) | **PASS 10/10** — live, describe (`cpu` effective), readiness after warm-up, 401, 403, speech SUCCEEDED, 6 s silence → `NO_SPEECH` (D14), erase ×2, Studio `DATA_DIR` untouched |
| Runtime image boots with no manifest | **exit 2, fail-closed**, clear message |
| Runtime image user | **uid 10001 (`worker`)**, not root |
| Worker over a Unix domain socket (§3) | **PASS** — `/health/live` 200, describe without token 401, with token 200, **no TCP listener** |
| Windows regression (same commit) | speech venv **124 passed** · full `apps/api` **190 passed, 1 skipped** · `schema --check` in sync |
| **Engine memory leak** (§6) | **FOUND AND FIXED** — the engine spawned a thread per job and CUDA-backed CTranslate2 kept ~0.12 MiB of host memory per thread. Robust growth (median per 50-request window, requests 50–299): **+0.106 → +0.014 MiB/request** on the same GPU config. The production CPU path shows no per-thread leak |
| CPU sizing on the Linux host · D13 memory/CPU caps | **NOT_RUN** (§5) — needs a quiet machine |

## 1. What was built

| Item | Path | Note |
|---|---|---|
| Dockerfile (multi-stage: `base`, `test`, `runtime`) | [`docker/voice-worker/Dockerfile`](../../docker/voice-worker/Dockerfile) | base pinned by digest `python@sha256:da047cb8…` (= `python:3.11-slim`, Python 3.11.16, Debian 13, glibc 2.41) · keeps the repo layout under `/repo` because `schema.py` finds the contracts package by walking up from its own file · weights **not baked in**, mounted read-only |
| Build-context allowlist | `docker/voice-worker/Dockerfile.dockerignore` | ignore everything, re-include only what the image needs |
| Linux CPU lock | [`requirements-speech-asr-linux-cpu.lock.txt`](../../apps/api/requirements-speech-asr-linux-cpu.lock.txt) | the Windows lock minus the three `nvidia-*` CUDA wheels a CPU engine never loads; every other pin identical |
| Cross-platform smoke | [`tools/verify/smoke_voice_worker.py`](../../tools/verify/smoke_voice_worker.py) | Python twin of the Windows-only `.ps1`; adds the D14 silence check |

## 2. Bugs found by moving to Linux (all fixed, all with tests)

1. **Asset hashing loaded the whole model into RAM.** `profile._assets` hashed with `read_bytes()`, so every boot read the
   1.6 GB `model.bin` into memory in one piece. Found when a read through the Docker Desktop bind mount returned
   `OSError: [Errno 5]`. Inside a memory-capped container (D13) this step alone could stop the worker from booting.
   Now `sha256_file` streams 1 MiB chunks. A `tracemalloc` test hashes a 16 MiB file and requires the peak to stay
   under 4 MiB; **mutation check:** restoring `read_bytes()` fails it with a 16.0 MiB peak.
   An unreadable asset now raises a `ProfileError` naming the asset instead of a bare `OSError` (the entrypoint already
   failed closed with exit 2 on any boot exception, so this was about the message, not safety).
   The bind-mount I/O error itself did not recur and is a dev-box artifact: a Linux host reads weights from its own disk.
2. **The advertised Unix-socket option never worked.** `settings` accepted `host = "unix:/path"`, but the entrypoint
   passed it to uvicorn as `host=`, so uvicorn tried to resolve it as a hostname and died with
   `Name or service not known` — exit 1, after the engine had already started. Now the entrypoint passes `uds=`, and
   validation rejects a relative path or a missing parent directory **before** the engine starts (exit 2).
   **Mutation check:** disabling the `uds=` route fails the new test.
3. **The data directory was world-readable.** `/data` (receipts and the submitted audio) was `0755`; now `0700`.
   The socket lives in its own `/run/voice-worker` at `0750`, so a coordinator can reach it through a shared group
   without seeing `/data`. uvicorn sets the socket file itself to `0666` after binding (it overrides umask), so the
   directory modes are the real access control; every route except `/health/live` still needs a bearer token.

## 3. New decision — D17: how does the PRP coordinator reach a containerized worker?

The worker only binds loopback or a Unix socket (Slice A rule, verified in the container: `0.0.0.0` → exit 2).
Publishing a container port needs a non-loopback bind, so the coordinator cannot reach the worker over a plain
Docker network.

| Option | Tested | Trade-off |
|---|---|---|
| **(a) Unix socket on a shared volume** `unix:/run/voice-worker/worker.sock`, dir `0750`, shared group with the coordinator | **yes** (§0) | No TCP at all; access by file permission plus token. Both containers must share one host |
| (b) Shared network namespace (`network_mode: service:voice-worker` on the coordinator) | no | No code change; couples the coordinator's whole network to the worker's |
| (c) TLS reverse-proxy sidecar exposing a private-network port | no | Works across hosts; a new security surface that H0 says needs review |
| (d) Relax the loopback-only rule | — | **Not recommended**: a security change to the Slice A boundary |

**Recommendation: (a).** It is the only option already proven, it adds no network surface, and it matches D11 (Linux).

## 4. Measurements worth knowing

- **Image size 1.12 GB.** `requirements.txt` belongs to Studio and pulls packages the worker never imports
  (anthropic, openai, scipy, pyloudnorm, pydub, imageio-ffmpeg). A worker-only requirements file would shrink it; not
  done here because it changes the pinned set and needs its own evidence run.
- **Short-clip CPU timing in the container:** 3.76 s for a 3.82 s clip, while a soak was running on the same box.
  This is not a sizing number (§5).

## 5. Open (next steps of Slice C)

1. **CPU sizing on the Linux host** — measure RTF with real core limits (`--cpus 4 / 8 / 16`) once the running soak
   finishes, so the numbers are not skewed by it; this replaces the 28-thread dev-box figure behind D10.
2. **D13 OS caps** — run with `--memory` / `--cpus` limits and confirm the worker fails safely at the cap
   (engine death → attempt reported with evidence → new epoch), now that Linux makes these caps available.
3. ~~Long soak verdict~~ **resolved in §6**: a real leak, found and fixed; no restart policy needed for it.
4. **D17** — owner decision (§3).
5. Worker-only requirements to cut the image size (§4).

## 6. Engine memory leak — found and fixed (2026-09-22)

**Symptom.** The 2,000-request soak through the real worker (GPU dev config) grew the engine's private memory in a
straight line: every 250-request window added 0.11–0.17 MiB/request, +230 MiB over 1,700 requests, one engine PID, no
restarts. An earlier in-process test calling `transcribe` from one thread had shown only ~0.02 MiB/call.

**Cause.** `_execute` started a new `threading.Thread` for every job. Measured in isolation (turbo, `cuda int8_float16`,
150 calls per mode):

| Mode | Growth per call | Released afterwards? |
|---|---|---|
| same thread | +0.006 MiB | — |
| **new thread every call** | **+0.122 MiB** | **no** (stayed after returning to one thread) |
| same thread again | −0.002 MiB | — |

On the production **CPU** path (`int8`, 60 calls per mode) a new thread per call grew −0.003 MiB/call, so the per-thread
leak is CUDA-specific and D10's CPU deployment was not affected.

**Fix.** `_JobRunner`: one thread for the engine's whole life. Warm-up and every job run on it, which also makes warm-up
warm the thread that actually serves requests. `max_concurrency` is 1, so nothing is lost. A structural test drives the
real `_execute` over a real pipe and requires one thread across warm-up and 8 jobs with no thread growth;
**mutation check:** a thread-per-job version fails it ("called from 9 threads").

**Verified end to end** with a 300-request soak on the same GPU config, compared request-for-request with the first
300 of the leaking run. Median private memory per 50-request window:

| Run | Windows (0–49 … 250–299) | Growth, requests 50–299 |
|---|---|---|
| before (thread per job) | 3085 · 3094 · 3097 · 3103 · 3111 · 3115 | **+0.106 MiB/request** |
| after (one runner thread) | 3078 · 3087 · 3088 · 3088 · 3089 · 3089 | **+0.014 MiB/request** |

**A measurement trap worth recording.** The least-squares slope for the fixed run came out at +0.113 MiB/request, the
same as before, because transient dips (2985 MiB at request 1, 3053 at request 50: Windows trimming the working set or
the heap releasing and regrowing) tilt a regression line that starts on one. The series is flat from request 100 to
299. The soak tool now also reports median per window and `robust_growth_mib_per_iter`, which is what decides a leak.

**Other notes from the same runs**
- The first long soak was stopped at 1,750 requests once its verdict was clear (it ran the old code; its checkpoint is kept).
- Its latency figures are **not usable**: processing time rose from 4.7 s to 16.4 s for a 60 s clip, but the machine was
  shared with container builds and test runs and, near the end, a game using the GPU. Memory is per-process and unaffected.
- The engine holds **~4.0 GB of RAM on CPU** (weights live in host memory) versus ~3.1 GB on GPU; this is an input to the
  Linux host sizing still to be done.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.0b | 2026-09-22 | beta | Engine memory leak found (thread per job, CUDA-specific) and fixed with one runner thread: +0.106 -> +0.014 MiB/request; soak tool gains median-window growth after least-squares nearly misread the fixed run | based on 53d77fb | LALIN |
| 0.1.0b | 2026-09-22 | beta | Slice C step 1: Linux CPU container, 124 tests and smoke pass inside it; fixed whole-file asset hashing, the broken Unix-socket route and a world-readable data dir; D17 raised | based on 6508cec | LALIN |
