#!/usr/bin/env python3
"""Memory-cap check of the voice worker (D13) — run INSIDE a memory-limited Linux container.

Boots the worker with the shipped CPU manifest, reports whether it became ready, then sends the 60 s clip and prints the
outcome, error code, stop evidence (including ``oom_killed`` read from cgroup v2) and whether the engine came back under a
new epoch. Use it on the real PRP host to confirm the memory limit before production.

  docker run --rm --network none --cpus 8 --memory 3g --memory-swap 3g \
      -v <models>:/repo/apps/api/models:ro -v <clips>:/clips:ro \
      lalin-voice-worker:test python /repo/tools/verify/voice_worker_capcheck.py

Measured on the dev box (2026-09-22): 1500m → boot fails, "the container hit its memory limit while loading";
2100m → boots, every 60 s request is OOM-killed and reported RUNTIME_OOM, the engine restarts; 3g → all pass (peak ~2.3 GB).
"""
import hashlib, json, os, subprocess, sys, tempfile, time, uuid
from pathlib import Path
sys.path.insert(0, "/repo/tools/verify")
import httpx
from voice_worker_client import WorkerClient
api = Path("/repo/apps/api"); work = Path(tempfile.mkdtemp())
tok = "cap-" + uuid.uuid4().hex
env = {**os.environ, "LALIN_VOICE_WORKER_PROFILE_PATH": str(api / "profiles/voice-worker/asr-th-en-01.json"),
       "LALIN_VOICE_WORKER_DATA_DIR": str(work / "d"), "LALIN_VOICE_WORKER_INFERENCE_CREDENTIALS": json.dumps({"c": tok}),
       "LALIN_VOICE_WORKER_MANAGEMENT_TOKEN": "m-" + uuid.uuid4().hex}
log = open(work / "w.log", "w")
p = subprocess.Popen([sys.executable, "-m", "app.voice_worker"], cwd=str(api), env=env, stdout=log, stderr=subprocess.STDOUT)
c = WorkerClient("http://127.0.0.1:8790", tok, timeout=30)
def peak():
    try: return round(int(open("/sys/fs/cgroup/memory.peak").read()) / 2**20)
    except OSError: return None
def ready(limit=240):
    t = time.time()
    while time.time() - t < limit:
        if p.poll() is not None: return f"worker exited code {p.returncode}"
        try:
            r = c.readiness().json()
            if r.get("ready"): return "ready epoch " + str(r.get("runtime_epoch"))
            if r.get("oom_lockout"): return "NOT READY (D18 lockout) " + json.dumps(r["oom_lockout"])
        except Exception: pass
        time.sleep(0.5)
    last = c.readiness().json() if p.poll() is None else {}
    return "not ready after %ss (reason %s)" % (limit, ((last.get("profiles") or [{}])[0]).get("reason"))
print("boot:", ready(), "| peak", peak(), "MiB", flush=True)
if p.poll() is None:
    audio = Path(os.environ.get("CAPCHECK_CLIP", "/clips/clean-long.wav")).read_bytes()
    for n in range(2):
        d = c.describe().json(); prof = d["profiles"][0]
        tgt = {"runtime_id": d["runtime_id"], "runtime_epoch": d["runtime_epoch"], "physical_resource_id": d["physical_resource_id"],
               "profile_id": prof["profile_id"], "profile_revision": prof["profile_revision"]}
        a = f"cap-{n}-{uuid.uuid4().hex[:6]}"
        env_ = c.envelope(kind="asr", attempt_id=a, target=tgt, input_payload={"language": "th", "audio_sha256": hashlib.sha256(audio).hexdigest(),
               "audio_bytes": len(audio), "declared_mime_type": "audio/wav"}, start_before_s=60, deadline_s=300, lease_id=None, content_fence=None)
        s = c.submit_asr(env_, audio, "audio/wav")
        f = c.wait_terminal(a, timeout_s=320) if s.status_code == 202 else {"submit": s.status_code}
        ev = f.get("stop_evidence") or {}
        print(f"request {n}: oom_killed={ev.get('oom_killed')} status={f.get('execution_status')} outcome={f.get('operation_outcome')} error={(f.get('error') or {}).get('code')} "
              f"evidence={ev.get('kind')} exitcode={ev.get('exitcode')} | epoch_before={tgt['runtime_epoch']} | peak {peak()} MiB", flush=True)
        print("   after:", ready(), flush=True)
p.terminate(); p.wait(15); log.close()
print("worker log tail:", " | ".join(l.strip() for l in open(work / "w.log").read().splitlines()[-4:]))
