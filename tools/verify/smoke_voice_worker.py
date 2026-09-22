#!/usr/bin/env python3
"""Headless smoke of the voice worker — cross-platform (Linux container + Windows dev box).

Python twin of ``smoke_voice_worker_control.ps1`` (which only runs on Windows PowerShell 5.1), needed
because the PRP host is Linux (D11). Checks, in order:

  boot ``python -m app.voice_worker`` with a manifest → /health/live → describe → readiness (waits for
  engine warm-up) → wrong token = 401 → management token on /operations = 403 → one ASR operation that
  must SUCCEED (``--audio``) → optional silence that must return NO_SPEECH (``--silence``, D14) → erase
  → the Studio DATA_DIR was never created → stop the worker

PASS = the control plane and the engine honour the contract on this OS. It is not a Thai-quality check.

  python tools/verify/smoke_voice_worker.py --manifest profiles/voice-worker/asr-th-en-01.json \\
      --audio tests/voice_worker/fixtures/en-short.wav --language en --silence
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
import wave
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from voice_worker_client import WorkerClient, http_client  # noqa: E402


def silence_wav(seconds: float = 6.0, rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(b"\x00\x00" * int(rate * seconds))
    return buf.getvalue()


def main(argv: list[str] | None = None) -> int:
    api_dir = Path(__file__).resolve().parents[2] / "apps" / "api"
    parser = argparse.ArgumentParser(description="voice worker headless smoke (cross-platform)")
    parser.add_argument("--manifest", required=True, help="path to the profile manifest (relative to apps/api or absolute)")
    parser.add_argument("--audio", type=Path, help="speech clip that must be transcribed successfully")
    parser.add_argument("--language", default="th", help="must be one the manifest qualifies (D8 manifests: th, en)")
    parser.add_argument("--silence", action="store_true", help="also send 6 s of silence and require NO_SPEECH (D14)")
    parser.add_argument("--port", type=int, default=8790)
    parser.add_argument("--unix-socket", help="serve on this absolute socket path instead of TCP (D17, Linux only)")
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--ready-timeout", type=float, default=180.0)
    args = parser.parse_args(argv)

    manifest = Path(args.manifest)
    if not manifest.is_absolute():
        manifest = api_dir / manifest
    if not manifest.is_file():
        print(f"FAIL: missing manifest {manifest}")
        return 1
    if args.unix_socket and (os.name == "nt" or not os.path.isabs(args.unix_socket)):
        print("FAIL: --unix-socket needs Linux and an absolute path")
        return 1

    work = Path(tempfile.mkdtemp(prefix="lalin-voice-smoke-"))
    studio_data = work / "studio-data-must-not-exist"
    token, mgmt = "smoke-inference-" + uuid.uuid4().hex, "smoke-management-" + uuid.uuid4().hex
    env = {**os.environ,
           "LALIN_VOICE_WORKER_PROFILE_PATH": str(manifest),
           "LALIN_VOICE_WORKER_DATA_DIR": str(work / "worker-data"),
           "LALIN_VOICE_WORKER_PORT": str(args.port),
           "LALIN_VOICE_WORKER_INFERENCE_CREDENTIALS": json.dumps({"smoke-coordinator": token}),
           "LALIN_VOICE_WORKER_MANAGEMENT_TOKEN": mgmt,
           "DATA_DIR": str(studio_data),
           "PYTHONIOENCODING": "utf-8"}
    if args.unix_socket:
        env["LALIN_VOICE_WORKER_HOST"] = "unix:" + args.unix_socket
    log = open(work / "worker.log", "w", encoding="utf-8")
    proc = subprocess.Popen([args.python, "-m", "app.voice_worker"], cwd=str(api_dir), env=env,
                            stdout=log, stderr=subprocess.STDOUT)
    base = ("unix:" + args.unix_socket) if args.unix_socket else f"http://127.0.0.1:{args.port}"
    client = WorkerClient(base, token)
    raw = http_client(base, timeout=5)  # ไม่มี Authorization ติดมา — ใช้เช็ค 401/403
    failures: list[str] = []

    def check(label: str, ok: bool, detail: str = "") -> None:
        print(f"[{'ok' if ok else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}", flush=True)
        if not ok:
            failures.append(label)

    try:
        started = time.time()
        live = False
        while time.time() - started < 60 and proc.poll() is None:
            try:
                live = raw.get("/health/live", timeout=2).status_code == 200
                if live:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.5)
        check("/health/live 200", live)
        if not live:
            print((work / "worker.log").read_text(encoding="utf-8")[-2000:])
            return 1

        described = client.describe()
        body = described.json() if described.status_code == 200 else {}
        engine = body.get("engine", {})
        check("describe 200", described.status_code == 200,
              f"engine={engine.get('name')} stub={engine.get('labeled_stub')} device={body.get('profiles', [{}])[0].get('device')}")

        ready, reason = False, None
        while time.time() - started < args.ready_timeout:
            snap = client.readiness().json()
            ready, reason = bool(snap.get("ready")), snap.get("reason")
            if ready:
                break
            time.sleep(0.5)
        check("readiness true (after warm-up)", ready, f"reason={reason}" if not ready else f"{time.time() - started:.1f}s")

        wrong = raw.get("/worker/v1/describe", headers={"Authorization": "Bearer wrong-token-xxxxxxxxxxxxxxxx"})
        check("wrong token rejected with 401", wrong.status_code == 401, f"got {wrong.status_code}")
        scoped = raw.get("/worker/v1/operations/does-not-exist", headers={"Authorization": f"Bearer {mgmt}"})
        check("management token refused on operations with 403", scoped.status_code == 403, f"got {scoped.status_code}")

        body = client.describe().json()
        profile = body["profiles"][0]
        target = {"runtime_id": body["runtime_id"], "runtime_epoch": body["runtime_epoch"],
                  "physical_resource_id": body["physical_resource_id"],
                  "profile_id": profile["profile_id"], "profile_revision": profile["profile_revision"]}

        def run(attempt: str, audio: bytes) -> dict:
            payload = {"language": args.language, "audio_sha256": hashlib.sha256(audio).hexdigest(),
                       "audio_bytes": len(audio), "declared_mime_type": "audio/wav"}
            envelope = client.envelope(kind="asr", attempt_id=attempt, target=target, input_payload=payload,
                                       start_before_s=30, deadline_s=120, lease_id=None, content_fence=None)
            submitted = client.submit_asr(envelope, audio, "audio/wav")
            if submitted.status_code != 202:
                return {"submit_status": submitted.status_code, "body": submitted.text[:300]}
            return client.wait_terminal(attempt, timeout_s=130)

        attempts: list[str] = []
        if args.audio:
            attempt = "smoke-" + uuid.uuid4().hex[:10]
            attempts.append(attempt)
            final = run(attempt, args.audio.read_bytes())
            text = (final.get("result") or {}).get("text", "")
            usage = final.get("usage") or {}
            check("speech clip SUCCEEDED", final.get("operation_outcome") == "SUCCEEDED",
                  f"text={text[:60]!r} processing={usage.get('processing_seconds')}s audio={usage.get('audio_input_seconds')}s"
                  if final.get("operation_outcome") == "SUCCEEDED" else json.dumps(final, ensure_ascii=False)[:300])
        if args.silence:
            attempt = "smoke-silence-" + uuid.uuid4().hex[:8]
            attempts.append(attempt)
            final = run(attempt, silence_wav())
            code = (final.get("error") or {}).get("code")
            check("6 s of silence returns NO_SPEECH, not fabricated text (D14)",
                  final.get("operation_outcome") == "FAILED" and code == "NO_SPEECH",
                  f"outcome={final.get('operation_outcome')} code={code} result={final.get('result')}")
        for attempt in attempts:
            erased = client.erase(attempt)
            check(f"erase {attempt}", erased.status_code == 200, f"got {erased.status_code}")

        check("Studio DATA_DIR never created (isolation)", not studio_data.exists())
        if args.unix_socket:
            import socket
            import stat
            sock = Path(args.unix_socket)
            check("unix socket exists", sock.exists() and stat.S_ISSOCK(sock.stat().st_mode),
                  f"dir mode {oct(sock.parent.stat().st_mode & 0o777)}")
            probe = socket.socket()
            probe.settimeout(1)
            tcp_open = probe.connect_ex(("127.0.0.1", args.port)) == 0
            probe.close()
            check("no TCP listener on the worker port (socket only)", not tcp_open)
    finally:
        client.close()
        raw.close()
        proc.terminate()
        try:
            proc.wait(15)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()

    if failures:
        print(f"FAIL: {len(failures)} check(s): " + "; ".join(failures))
        print(f"worker log: {work / 'worker.log'}")
        return 1
    print(f"PASS: voice worker honoured the contract on {sys.platform} with {manifest.name} (not a Thai-quality qualification)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
