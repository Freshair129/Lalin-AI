# Lalin headless voice worker — Linux, CPU-only (D10 = CPU, D11 = Linux).
#
# Build from the repo root; the Dockerfile.dockerignore next to this file keeps the context small:
#   docker build -f docker/voice-worker/Dockerfile --target runtime     -t lalin-voice-worker:dev .
#   docker build -f docker/voice-worker/Dockerfile --target test        -t lalin-voice-worker:test .
#   docker build -f docker/voice-worker/Dockerfile --target tts-runtime -t lalin-voice-worker-tts:dev .
#   docker build -f docker/voice-worker/Dockerfile --target tts-test    -t lalin-voice-worker-tts:test .
#
# ASR (asr-*) runs on CPU (D10); TTS (tts-*) needs the GPU (D19) — run it with `--gpus all`.
#
# The repo layout is kept under /repo because app/voice_worker/schema.py locates the contracts
# package by walking up from its own file. Model weights are NOT baked in: mount them read-only at
# /repo/apps/api/models (the manifest pins every file by sha256 and the worker never downloads).

FROM python@sha256:da047cb8f9d1d98e5c070f5300ba9f7274e33b8fc0e5be5ed88740aed1b95ba9 AS common
# = python:3.11-slim (Python 3.11.16, Debian 13 trixie), pinned by digest on 2026-09-22

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    LALIN_VOICE_WORKER_DATA_DIR=/data

# /data holds receipts and the submitted audio payloads: owner-only (0700).
# /run/voice-worker is where a Unix socket goes (LALIN_VOICE_WORKER_HOST=unix:/run/voice-worker/worker.sock):
# 0750, so a coordinator can reach the socket through a shared group without seeing /data.
# uvicorn sets the socket file itself to 0666 after bind, so these directory modes are the real access control;
# every route except /health/live still requires a bearer token.
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin worker \
 && mkdir -p /data /run/voice-worker /repo/apps/api/models \
 && chown worker:worker /data /run/voice-worker \
 && chmod 0700 /data \
 && chmod 0750 /run/voice-worker

WORKDIR /repo/apps/api

# ── the worker's own files, in one place so the ASR and TTS images cannot drift apart ──
FROM scratch AS src
COPY apps/api/app /repo/apps/api/app
COPY apps/api/profiles /repo/apps/api/profiles
COPY packages/contracts/schemas /repo/packages/contracts/schemas
COPY tools/verify/voice_worker_client.py tools/verify/smoke_voice_worker.py tools/verify/voice_worker_sizing.py tools/verify/voice_worker_capcheck.py /repo/tools/verify/

FROM scratch AS src-test
COPY apps/api/tests/__init__.py /repo/apps/api/tests/__init__.py
COPY apps/api/tests/voice_worker /repo/apps/api/tests/voice_worker
COPY apps/api/pytest.ini /repo/apps/api/pytest.ini

# ── ASR: CPU only (D10) ──
FROM common AS base
COPY apps/api/requirements-voice-worker-linux-cpu.lock.txt ./
RUN pip install --only-binary=:all: -r requirements-voice-worker-linux-cpu.lock.txt
COPY --from=src / /

FROM base AS test
COPY apps/api/requirements-voice-worker-test.lock.txt ./
RUN pip install --only-binary=:all: -r requirements-voice-worker-test.lock.txt
COPY --from=src-test / /
USER worker
CMD ["python", "-m", "pytest", "tests/voice_worker", "-p", "no:cacheprovider"]

FROM base AS runtime
USER worker
VOLUME ["/data", "/run/voice-worker"]
ENTRYPOINT ["python", "-m", "app.voice_worker"]

# ── TTS: F5-TTS on the GPU (D19). torch cu128 brings the nvidia CUDA wheels, so this image is several GB.
# f5-tts and vocos go in with --no-deps: f5-tts declares the training/UI stack (gradio, wandb, datasets, ...) and
# vocos declares encodec, which ships no wheel. engine_f5.py imports neither (it stubs the trainer, librosa and
# encodec), and the deps they really need are pinned in the lock. ──
FROM common AS tts-base
COPY apps/api/requirements-tts-linux-gpu.lock.txt ./
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked     pip install --only-binary=:all: -r requirements-tts-linux-gpu.lock.txt  && pip install --only-binary=:all: --no-deps vocos==0.1.0 f5-tts==1.1.22
COPY --from=src / /

FROM tts-base AS tts-test
COPY apps/api/requirements-voice-worker-test.lock.txt ./
RUN pip install --only-binary=:all: -r requirements-voice-worker-test.lock.txt
COPY --from=src-test / /
USER worker
CMD ["python", "-m", "pytest", "tests/voice_worker", "-p", "no:cacheprovider"]

FROM tts-base AS tts-runtime
USER worker
VOLUME ["/data", "/run/voice-worker"]
ENTRYPOINT ["python", "-m", "app.voice_worker"]
