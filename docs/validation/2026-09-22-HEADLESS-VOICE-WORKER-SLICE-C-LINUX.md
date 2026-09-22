---
version: "0.1.0b"
created_at: "2026-09-22T12:30:00+07:00,LALIN,6508cec"
last_update: "2026-09-22T12:30:00+07:00,LALIN"
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
| CPU sizing on the Linux host · D13 memory/CPU caps · long soak verdict | **NOT_RUN in this step** (§5) |

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
3. **Long soak verdict** — 2,000 requests in progress; at 1,139 the engine had grown +146 MiB (~0.13 MiB/request,
   not yet flattening). Decides whether a restart policy is needed.
4. **D17** — owner decision (§3).
5. Worker-only requirements to cut the image size (§4).

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-22 | beta | Slice C step 1: Linux CPU container, 124 tests and smoke pass inside it; fixed whole-file asset hashing, the broken Unix-socket route and a world-readable data dir; D17 raised | based on 6508cec | LALIN |
