#!/usr/bin/env python3
"""Real-work ASR eval ผ่าน voice worker (Slice B, LVP-AT-014–016 evidence helper).

boot `python -m app.voice_worker` ต่อ manifest → รอ readiness (รวม warm-up) → ส่งทุก *.wav ใน clip dir ผ่าน
reference client (contract จริง: envelope/admission/erase) → เขียน results.json (outcome, usage, text) ต่อ manifest

คลิปงานจริงเป็นข้อมูลส่วนตัว → เก็บใต้ runtime/ (gitignored) เท่านั้น ห้าม commit เสียง; commit ได้แค่สรุปตัวเลขในเอกสาร

ตัวอย่าง (PowerShell, จาก apps/api):
  ..\..\apps\api\.venv-speech\Scripts\python.exe ..\..\tools\verify\voice_worker_eval_clips.py `
      --clips runtime\eval\asr-th --language th --manifest asr-th-en-01 --manifest asr-th-en-01-medium
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from voice_worker_client import WorkerClient  # noqa: E402


def run_manifest(python: str, api_dir: Path, manifest: str, port: int, clips: list[Path], language: str,
                 data_root: Path, ready_timeout: float) -> dict:
    token = "eval-" + uuid.uuid4().hex
    env = {
        **os.environ,
        "LALIN_VOICE_WORKER_PROFILE_PATH": str(api_dir / "profiles" / "voice-worker" / f"{manifest}.json"),
        "LALIN_VOICE_WORKER_DATA_DIR": str(data_root / f"worker-data-{manifest}"),
        "LALIN_VOICE_WORKER_PORT": str(port),
        "LALIN_VOICE_WORKER_INFERENCE_CREDENTIALS": json.dumps({"eval": token}),
        "LALIN_VOICE_WORKER_MANAGEMENT_TOKEN": "mgmt-" + uuid.uuid4().hex,
        "PYTHONIOENCODING": "utf-8",
    }
    data_root.mkdir(parents=True, exist_ok=True)
    log = open(data_root / f"worker-{manifest}.log", "w", encoding="utf-8")
    proc = subprocess.Popen([python, "-m", "app.voice_worker"], cwd=str(api_dir), env=env, stdout=log, stderr=subprocess.STDOUT)
    client = WorkerClient(f"http://127.0.0.1:{port}", token)
    rows: dict[str, dict] = {}
    boot = time.time()
    ready = False
    try:
        while time.time() - boot < ready_timeout and proc.poll() is None:
            try:
                response = client.readiness()
                if response.status_code == 200 and response.json().get("ready"):
                    ready = True
                    break
            except Exception:  # noqa: BLE001 — ยัง bind port ไม่เสร็จ
                pass
            time.sleep(0.5)
        boot_seconds = round(time.time() - boot, 1)
        print(f"{manifest}: {'ready' if ready else 'NOT READY'} after {boot_seconds}s", flush=True)
        if not ready:
            return {"ready": False, "boot_seconds": boot_seconds, "clips": rows}
        described = client.describe().json()
        profile = described["profiles"][0]
        target = {
            "runtime_id": described["runtime_id"], "runtime_epoch": described["runtime_epoch"],
            "physical_resource_id": described["physical_resource_id"],
            "profile_id": profile["profile_id"], "profile_revision": profile["profile_revision"],
        }
        for clip in clips:
            audio = clip.read_bytes()
            payload = {"language": language, "audio_sha256": hashlib.sha256(audio).hexdigest(),
                       "audio_bytes": len(audio), "declared_mime_type": "audio/wav"}
            attempt = f"eval-{clip.stem}-{uuid.uuid4().hex[:6]}"
            envelope = client.envelope(kind="asr", attempt_id=attempt, target=target, input_payload=payload,
                                       start_before_s=30, deadline_s=120, lease_id=None, content_fence=None)
            submitted = client.submit_asr(envelope, audio, "audio/wav")
            if submitted.status_code != 202:
                rows[clip.stem] = {"submit_status": submitted.status_code, "body": submitted.text[:300]}
                print(f"  {clip.stem:18s} submit {submitted.status_code}", flush=True)
                continue
            final = client.wait_terminal(attempt, timeout_s=130)
            result = final.get("result") or {}
            usage = final.get("usage") or {}
            rows[clip.stem] = {
                "outcome": final.get("operation_outcome"), "error": final.get("error"), "usage": usage,
                "text": result.get("text"), "language": result.get("language"),
                "n_segments": len(result.get("segments") or []),
                "rtf": (round(usage["processing_seconds"] / usage["audio_input_seconds"], 3)
                        if usage.get("processing_seconds") and usage.get("audio_input_seconds") else None),
            }
            print(f"  {clip.stem:18s} {final.get('operation_outcome')}  proc {usage.get('processing_seconds')}s"
                  f" / audio {usage.get('audio_input_seconds')}s", flush=True)
            client.erase(attempt)
        return {"ready": True, "boot_seconds": boot_seconds, "engine": described.get("engine"), "clips": rows}
    finally:
        client.close()
        proc.terminate()
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[2]
    api_dir = root / "apps" / "api"
    parser = argparse.ArgumentParser(description="Run real clips through the voice worker per manifest")
    parser.add_argument("--clips", type=Path, required=True, help="directory of *.wav (kept under runtime/, never committed)")
    parser.add_argument("--manifest", action="append", required=True, help="profile file stem under apps/api/profiles/voice-worker")
    parser.add_argument("--language", default="th")
    parser.add_argument("--python", default=str(api_dir / ".venv-speech" / "Scripts" / "python.exe"))
    parser.add_argument("--port", type=int, default=8792)
    parser.add_argument("--ready-timeout", type=float, default=180.0)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)
    clips = sorted(p for p in args.clips.glob("*.wav"))
    if not clips:
        print(f"no *.wav in {args.clips}", file=sys.stderr)
        return 2
    report = {}
    for offset, manifest in enumerate(args.manifest):
        report[manifest] = run_manifest(args.python, api_dir, manifest, args.port + offset, clips, args.language,
                                        args.clips, args.ready_timeout)
    out = args.out or (args.clips / "results.json")
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote", out)
    return 0 if all(r.get("ready") for r in report.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
