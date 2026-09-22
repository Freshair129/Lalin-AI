#!/usr/bin/env python3
"""CPU sizing of the voice worker on Linux (D10 = CPU, D11 = Linux) — run INSIDE the container.

Start the container with a real CPU quota, e.g. ``docker run --cpus 4 ...``, then this script boots the worker with the
shipped CPU manifest (``cpu_threads`` overridden), sends each clip through the real contract and reports RTF plus the
container's peak memory from cgroup v2.

Why ``cpu_threads`` is a parameter: under ``--cpus N`` the container still *sees* every host core
(``os.cpu_count()`` is unchanged), so ``cpu_threads: 0`` may start more threads than the quota allows and make them
fight each other. Measuring ``0`` against ``N`` tells what the manifest must set on the real host.

  docker run --rm --network none --cpus 4 -v <models>:/repo/apps/api/models:ro -v <clips>:/clips:ro \\
      lalin-voice-worker:test python /repo/tools/verify/voice_worker_sizing.py --clips /clips --cpu-threads 4
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from voice_worker_client import WorkerClient  # noqa: E402


def cgroup_cpu_quota() -> float | None:
    try:
        quota, period = Path("/sys/fs/cgroup/cpu.max").read_text().split()
        return None if quota == "max" else int(quota) / int(period)
    except (OSError, ValueError):
        return None


def cgroup_memory_peak_mib() -> float | None:
    for name in ("memory.peak", "memory.max_usage_in_bytes"):
        try:
            return round(int(Path("/sys/fs/cgroup", name).read_text().strip()) / 2**20, 1)
        except (OSError, ValueError):
            continue
    return None


def main(argv: list[str] | None = None) -> int:
    api_dir = Path(__file__).resolve().parents[2] / "apps" / "api"
    parser = argparse.ArgumentParser(description="voice worker CPU sizing (run inside a CPU-limited container)")
    parser.add_argument("--clips", type=Path, required=True)
    parser.add_argument("--only", nargs="*", help="clip stems to use (default: all *.wav)")
    parser.add_argument("--manifest", default="profiles/voice-worker/asr-th-en-01.json")
    parser.add_argument("--cpu-threads", type=int, required=True, help="0 = CTranslate2 default")
    parser.add_argument("--language", default="th")
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--deadline-s", type=float, default=900.0)
    parser.add_argument("--port", type=int, default=8790)
    args = parser.parse_args(argv)

    src = api_dir / args.manifest
    manifest = json.loads(src.read_text(encoding="utf-8"))
    manifest["engine_options"]["cpu_threads"] = args.cpu_threads
    for asset in manifest["assets"]:  # the temp manifest lives elsewhere, so make asset paths absolute
        asset["path"] = str((src.parent / asset["path"]).resolve())
    work = Path(tempfile.mkdtemp(prefix="sizing-"))
    tmp_manifest = work / "manifest.json"
    tmp_manifest.write_text(json.dumps(manifest), encoding="utf-8")

    clips = sorted(args.clips.glob("*.wav"))
    if args.only:
        clips = [c for c in clips if c.stem in set(args.only)]
    token = "sizing-" + uuid.uuid4().hex
    env = {**os.environ, "LALIN_VOICE_WORKER_PROFILE_PATH": str(tmp_manifest),
           "LALIN_VOICE_WORKER_DATA_DIR": str(work / "data"), "LALIN_VOICE_WORKER_PORT": str(args.port),
           "LALIN_VOICE_WORKER_INFERENCE_CREDENTIALS": json.dumps({"sizing": token}),
           "LALIN_VOICE_WORKER_MANAGEMENT_TOKEN": "mgmt-" + uuid.uuid4().hex}
    log = open(work / "worker.log", "w", encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-m", "app.voice_worker"], cwd=str(api_dir), env=env, stdout=log, stderr=subprocess.STDOUT)
    client = WorkerClient(f"http://127.0.0.1:{args.port}", token, timeout=60.0)
    report: dict = {"cpu_quota": cgroup_cpu_quota(), "visible_cpus": os.cpu_count(), "cpu_threads": args.cpu_threads, "clips": {}}
    try:
        started = time.time()
        while time.time() - started < 300:
            try:
                if client.readiness().json().get("ready"):
                    break
            except (httpx.HTTPError, ValueError):
                pass
            time.sleep(0.5)
        else:
            print("worker never became ready", file=sys.stderr)
            return 1
        report["ready_seconds"] = round(time.time() - started, 1)
        body = client.describe().json()
        profile = body["profiles"][0]
        target = {"runtime_id": body["runtime_id"], "runtime_epoch": body["runtime_epoch"],
                  "physical_resource_id": body["physical_resource_id"],
                  "profile_id": profile["profile_id"], "profile_revision": profile["profile_revision"]}
        for clip in clips:
            audio = clip.read_bytes()
            runs = []
            for _ in range(args.repeats):
                attempt = f"size-{clip.stem}-{uuid.uuid4().hex[:6]}"
                payload = {"language": args.language, "audio_sha256": hashlib.sha256(audio).hexdigest(),
                           "audio_bytes": len(audio), "declared_mime_type": "audio/wav"}
                envelope = client.envelope(kind="asr", attempt_id=attempt, target=target, input_payload=payload,
                                           start_before_s=60, deadline_s=args.deadline_s, lease_id=None, content_fence=None)
                if client.submit_asr(envelope, audio, "audio/wav").status_code != 202:
                    runs.append({"error": "submit refused"})
                    continue
                final = client.wait_terminal(attempt, timeout_s=args.deadline_s + 30)
                usage = final.get("usage") or {}
                proc_s, audio_s = usage.get("processing_seconds"), usage.get("audio_input_seconds")
                runs.append({"outcome": final.get("operation_outcome"), "processing_seconds": proc_s,
                             "audio_seconds": audio_s, "rtf": round(proc_s / audio_s, 3) if proc_s and audio_s else None})
                client.erase(attempt)
            report["clips"][clip.stem] = runs
            print(f"cpus={report['cpu_quota']} threads={args.cpu_threads:2d} {clip.stem:16s} "
                  f"{[r.get('rtf') for r in runs]} {[r.get('outcome') for r in runs]}", flush=True)
        report["memory_peak_mib"] = cgroup_memory_peak_mib()
    finally:
        client.close()
        proc.terminate()
        try:
            proc.wait(15)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()
    print("RESULT " + json.dumps(report), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
