---
version: "0.5.0b"
created_at: "2026-09-22T12:30:00+07:00,LALIN,6508cec"
last_update: "2026-09-22T23:00:00+07:00,LALIN"
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
| **CPU sizing** (§7, container `--cpus`, dev box) | **RUN** — 60 s clip: 4 CPUs RTF 0.48–0.67, **8 CPUs 0.38–0.50 (best)**, 16 CPUs 1.16–1.88 (worse, hybrid P/E cores); container peak memory ~2.3 GB. Indicative only: the real host must be re-measured with the same tool |
| **Worker-only image** (§4) | **PASS** — 1.12 GB → **786 MB** (site-packages 690 → 454 MB), 32 runtime wheels, same pins; suite **135 passed** in the container, smoke **PASS 10/10**, Unix socket PASS (401/200, no TCP listener), no-manifest boot exit 2, uid 10001 |
| **D13 memory caps** (§8, container `--memory`, no swap) | **PASS — fails safely** at every level: 1.5 GB boot refused with the cause named; 2.1 GB each 60 s request OOM-killed → `RUNTIME_OOM` confirmed from cgroup, engine back under a new epoch; 3 GB all pass. **Recommended limit ≥ 3 GiB** |

## 1. What was built

| Item | Path | Note |
|---|---|---|
| Dockerfile (multi-stage: `base`, `test`, `runtime`) | [`docker/voice-worker/Dockerfile`](../../docker/voice-worker/Dockerfile) | base pinned by digest `python@sha256:da047cb8…` (= `python:3.11-slim`, Python 3.11.16, Debian 13, glibc 2.41) · keeps the repo layout under `/repo` because `schema.py` finds the contracts package by walking up from its own file · weights **not baked in**, mounted read-only |
| Build-context allowlist | `docker/voice-worker/Dockerfile.dockerignore` | ignore everything, re-include only what the image needs |
| Linux CPU lock (runtime) | [`requirements-voice-worker-linux-cpu.lock.txt`](../../apps/api/requirements-voice-worker-linux-cpu.lock.txt) | only what the worker imports, resolved with the Windows lock as constraints, so every pin is the version behind the Windows evidence (§4) |
| Test-stage lock | [`requirements-voice-worker-test.lock.txt`](../../apps/api/requirements-voice-worker-test.lock.txt) | pytest and its two deps; `test` stage only, not in the runtime image |
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

- **Image size: 1.12 GB → 786 MB (2026-09-22).** The first lock was the Studio set minus CUDA, so it carried packages the
  worker never imports. The worker-only lock was resolved by pip from the worker's direct imports (faster-whisper,
  fastapi, python-multipart, uvicorn, pydantic-settings, httpx) with the Windows lock as constraints; `pip check` clean.
  Dropped: scipy (143 MB with its libs), imageio-ffmpeg (77 MB), soundfile, pydub, pyloudnorm, openai, anthropic,
  aiofiles, the uvicorn `[standard]` extras, and pytest (moved to the `test` stage).
  **One behaviour change:** without `httptools` installed, uvicorn serves HTTP with its pure-Python `h11` parser. The
  worker's traffic is a few requests per job, so parsing speed is not a factor; the whole suite, the smoke and the Unix
  socket check were re-run on the new image and pass. Largest remaining items: ctranslate2 (134 MB), av (104 MB),
  onnxruntime (67 MB), numpy (71 MB), all required.
- **Short-clip CPU timing in the container:** 3.76 s for a 3.82 s clip, while a soak was running on the same box.
  This is not a sizing number (§5).

## 5. Open (next steps of Slice C)

1. ~~CPU sizing~~ **done (§7), re-measured on the PRP host with the stack running (§10)**: 8 CPUs, `cpu_threads: 8` now shipped.
2. ~~D13 OS caps~~ **done (§8), confirmed on the PRP host (§10)**: 3 GiB; 2.5 GB is not safe.
6. ~~D18~~ **decided (a), N = 2 and applied (§9)**.
3. ~~Long soak verdict~~ **resolved in §6**: a real leak, found and fixed; no restart policy needed for it.
4. ~~D17~~ **decided (a)** Unix socket (H0 review); runbook/compose example still to write.
5. ~~Worker-only requirements~~ **done (§4)**: 786 MB.

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

## 7. CPU sizing (container `--cpus`, 2026-09-22)

Tool: [`voice_worker_sizing.py`](../../tools/verify/voice_worker_sizing.py), run inside the container under a real cgroup CPU
quota, shipped CPU manifest with `cpu_threads` set. Machine quiet (no game, soak stopped). Clips are real Thai meeting audio.

| CPUs (`cpu_threads` = quota) | RTF, 60 s clip | Time for the 60 s maximum | Notes |
|---|---|---|---|
| 2 | 0.86 (1 run) | ~52 s | fits a 120 s deadline |
| 4 | 0.48 · 0.49 · 0.67 | ~29–40 s | |
| **8** | **0.38 · 0.41 · 0.50** | **~23–30 s** | **best on this box** |
| 16 | 1.81 · 1.16 · 1.88 | ~70–113 s | slower, all 3 runs |

- **16 threads is slower than 4, consistently.** The dev CPU is an i7-14700KF: 8 performance cores (16 threads) plus 12
  efficiency cores. At 16 threads some work lands on the slower cores and CTranslate2 waits for the slowest one. A server with
  uniform cores should scale further, so **these numbers are indicative, not a sizing for the PRP host**.
- **The container sees all 28 host cores** (`os.cpu_count()`), whatever `--cpus` says. With `cpu_threads: 0` at 4 CPUs the 60 s
  clip took RTF 0.547 against 0.447 with 4 threads (one run each). **Rule for the real manifest: set `cpu_threads` to the CPUs
  allocated**, and on hybrid CPUs no higher than the performance-core count.
- Peak container memory **~2.3–2.4 GB**, independent of thread count. (Windows reported ~4.0 GB of private bytes for the same
  engine; that is a different measure, committed rather than resident memory.)

## 8. D13 memory caps (container `--memory` = `--memory-swap`, no swap, 2026-09-22)

Tool: [`voice_worker_capcheck.py`](../../tools/verify/voice_worker_capcheck.py). 8 CPUs, 60 s clip.

| Limit | What happened | Verdict |
|---|---|---|
| 1.5 GB | Model load cannot fit. The engine thrashes (the kernel keeps evicting the model file's pages) instead of being killed; the worker exits code 3 after the hello timeout, nothing served | safe. The message was "did not report hello within the configured timeout"; it now adds **"the container hit its memory limit while loading (raise the memory limit)"** from the cgroup `max` counter |
| 2.1 GB | Boots (peak 2,074 MiB); every 60 s request drives the engine over the limit and the kernel kills it (exitcode −9). The attempt ends FAILED with process-exit evidence; the engine restarts under a new epoch and the worker is ready again; the control plane survives | safe. It was reported `RUNTIME_FAILED`; now **`RUNTIME_OOM` with `oom_killed: true`**, confirmed from the cgroup `oom_kill` counter rather than guessed from −9 |
| 3 GB | Two 60 s requests succeed, peak 2,224–2,312 MiB | **recommended minimum: 3 GiB** |

**Fixed (with tests and a mutation check):** OOM kills reported as a generic failure, and a boot that died or stalled on
memory reported only as a timeout. `StopEvidence` already allows extra fields, so `oom_killed` is not a contract change. Where
no cgroup exists (the Windows dev box) the value is `null` and the code stays `RUNTIME_FAILED`: unknown is never reported as OOM.

**Open — D18 (owner decision):** at 2.1 GB *every* request is killed and the engine reloads (~14 s) each time, while the
worker keeps reporting ready, so a coordinator keeps sending work that will fail. Options: (a) after N consecutive OOM kills
with no success in between, report not-ready with a reason until an operator restarts it; (b) the same, but retry on its own
after a back-off; (c) leave it to the coordinator, which sees `RUNTIME_OOM`. Recommendation: (a) with N = 2 — fail closed,
since a memory limit does not fix itself.

## 9. D18 applied — repeated OOM locks the worker out (2026-09-22)

**Decision:** (a), N = 2, made by Fable 5.1 on the owner's delegation (H0 review D18).
**Behaviour:** after `oom_lockout_after` (default 2, setting `LALIN_VOICE_WORKER_OOM_LOCKOUT_AFTER`, must be ≥ 1)
cgroup-confirmed OOM kills in a row, the worker stops restarting the engine. Readiness and describe report
`ready: false`, reason `repeated_oom`; readiness carries `oom_lockout` (count, threshold, since, action). New requests get
`503 MODEL_UNAVAILABLE` with reason `repeated_oom`. The count resets when the engine returns any result, because it
survived that job. Kills that the cgroup does not confirm (`oom_killed: null`, e.g. Windows) never count. There is no
unlock endpoint: raise the memory limit and restart the worker.

| Evidence | Result |
|---|---|
| Unit tests (`test_repeated_oom_lockout.py`, 5) | pass; **mutation checks:** disabling the lockout fails the lockout test, removing the reset fails the reset test |
| **Real OOM in the container**, `--memory 2100m`, 60 s clip (`voice_worker_capcheck.py`) | 3 runs: request 1 `RUNTIME_OOM` → engine back under a new epoch, ready; request 2 `RUNTIME_OOM` → **NOT READY, `repeated_oom`, 2/2**, engine not restarted |
| Unexplained, not reproduced | the first run of the same image ended with the client's `httpx.RemoteProtocolError` (server disconnected) after both requests had printed; the following 3 runs were clean. Left open, not claimed as fixed |

## 10. Re-measured on the PRP host (2026-09-22)

**Which host.** The PRP stack (`prp-mvp-*`: litellm, postgres, nginx, blind; vLLM stopped by the owner, single-host mode)
runs in Docker Desktop on the PRP workstation, so the PRP Linux host **is** that Docker engine: WSL2 VM, kernel
6.18.33.2-microsoft-standard-WSL2, cgroup v2, 28 visible CPUs (i7-14700KF, 8 P-cores + 12 E-cores), 15.5 GiB RAM, of
which ~9.7 GiB was available with the PRP and Zuri stacks up. The second PRP host (DESKTOP-8UR61U8, RTX 3060) runs only
Ollama and is not a Linux host. §7–§8 had run on the same engine with the stacks idle; this run keeps them up and
repeats the tools unchanged.

| CPUs (`cpu_threads` = quota) | RTF, 60 s clip, 3 runs | Peak memory |
|---|---|---|
| 4 | 0.44 · 0.59 · 0.61 | 2,576 MiB |
| **8** | **0.26 · 0.44 · 0.51** | 2,319 MiB |
| 12 | 0.61 · 0.59 · 0.45 | 2,339 MiB |

| Memory cap (no swap), 8 CPUs | Clip ×2 | Result |
|---|---|---|
| 3 GB | clean-long, farfield-noisy, mid-meeting | all SUCCEEDED, peak 2,215–2,267 MiB, no restart |
| 2.5 GB | clean-long | SUCCEEDED, peak 2,350 MiB, **but** the 4-CPU sizing run peaked at 2,576 MiB, above 2.5 GB: not safe |

**Conclusions, applied:** 8 CPUs (12 buys nothing on this hybrid CPU); `asr-th-en-01` now ships `cpu_threads: 8`
(revision `rev-2026-09-22-large-v3-turbo-vad-cpu8`, bumped because thread count changes numerics, D16) to match the
compose example's `cpus: 8`; memory cap **3 GiB**. The worker fits beside the stacks (3 GiB of ~9.7 GiB available).
**Watch:** if the owner starts vLLM again it takes host RAM as well; re-check `MemAvailable` before relying on the cap.
**Not measured:** a busy PRP (concurrent LLM traffic) and more than one ASR job at a time (`max_concurrency` is 1).
After the change: suite 153 passed on Windows and in the container, socket smoke PASS under `--memory 3g`.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.5.0b | 2026-09-22 | beta | §10 sizing and memory cap re-measured on the PRP host with the stack up; cpu_threads 8 shipped; 3 GiB confirmed, 2.5 GB rejected | based on e6b7be2 | LALIN |
| 0.4.0b | 2026-09-22 | beta | D18 applied: repeated OOM lockout, proven against a real OOM in the container; D17 decided | based on a42cec0 | LALIN |
| 0.3.1b | 2026-09-22 | beta | Worker-only runtime lock and test-stage lock: image 1.12 GB → 786 MB; suite, smoke and Unix socket re-run on the new image | based on 46eeb0a | LALIN |
| 0.3.0b | 2026-09-22 | beta | CPU sizing under real CPU quotas (8 CPUs best; hybrid cores make 16 slower); D13 memory caps pass with a 3 GiB minimum; OOM now reported as RUNTIME_OOM from cgroup and a memory-bound boot names its cause; D18 raised | based on ed156d4 | LALIN |
| 0.2.0b | 2026-09-22 | beta | Engine memory leak found (thread per job, CUDA-specific) and fixed with one runner thread: +0.106 -> +0.014 MiB/request; soak tool gains median-window growth after least-squares nearly misread the fixed run | based on 53d77fb | LALIN |
| 0.1.0b | 2026-09-22 | beta | Slice C step 1: Linux CPU container, 124 tests and smoke pass inside it; fixed whole-file asset hashing, the broken Unix-socket route and a world-readable data dir; D17 raised | based on 6508cec | LALIN |
