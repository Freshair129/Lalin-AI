#!/usr/bin/env python3
"""Soak test ของ voice worker — หา memory leak ใน engine child ที่รันยาว (Slice B/C, LVP-REQ-012/022).

ที่มา: ระหว่าง A/B (D14/D15) เจอ ``MemoryError: bad allocation`` หลังเรียก transcribe ~60 ครั้งใน process เดียว
ข้อความ ``bad allocation`` มาจาก C++ ``std::bad_alloc`` = จอง **host RAM** ไม่ได้ (ไม่ใช่ข้อความ CUDA OOM)
worker ใน production ถือ engine child ตัวเดียวไว้นาน ถ้ารั่วต่อ request จะพังหลังจำนวนหนึ่ง จึงต้องวัดผ่าน worker จริง

ทำอะไร:
  boot ``python -m app.voice_worker`` ด้วย manifest → รอ ready → ส่งงาน N ครั้งวนคลิป (submit → wait → erase)
  ทุกครั้งอ่านหน่วยความจำของทุก process ใน tree ของ worker (engine = ตัวที่ private bytes สูงสุด)
  และ runtime_epoch (epoch เปลี่ยน = engine ตาย/restart) แล้วสรุป slope ของ private bytes ช่วงครึ่งหลัง

ไม่มี dependency เพิ่ม: อ่านหน่วยความจำ process อื่นผ่าน Windows API ด้วย ctypes (ไม่ใช้ psutil เพื่อไม่แตะ lock file)
หมายเหตุ Windows: ``.venv\\Scripts\\python.exe`` เป็น launcher ที่ spawn interpreter จริงเป็น child
engine จึงอยู่ลึกลงไปหลายชั้นใน tree — เลือกจาก private bytes สูงสุดแทนการเดาชั้น

ใช้ (จาก apps/api, ใน .venv-speech):
  .venv-speech\\Scripts\\python.exe ..\\..\\tools\\verify\\voice_worker_soak.py --clips runtime\\eval\\d14 `
      --manifest asr-th-en-01 --iterations 200 --out runtime\\eval\\soak
"""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
import subprocess
import sys
import time
import uuid
from ctypes import wintypes
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from voice_worker_client import WorkerClient  # noqa: E402

TH32CS_SNAPPROCESS = 0x00000002
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
PROCESS_VM_READ = 0x0010


class PROCESSENTRY32W(ctypes.Structure):
    _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD), ("th32ProcessID", wintypes.DWORD),
                ("th32DefaultHeapID", ctypes.c_size_t), ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", ctypes.c_long), ("dwFlags", wintypes.DWORD),
                ("szExeFile", ctypes.c_wchar * 260)]


class PROCESS_MEMORY_COUNTERS_EX(ctypes.Structure):
    _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
                ("PrivateUsage", ctypes.c_size_t)]


def _declare_win32_types() -> None:
    """ctypes ต้องรู้ว่าเป็น HANDLE 64-bit — ไม่งั้น pseudo-handle ของ GetCurrentProcess (-1) ถูกส่งเป็น int 32-bit
    กลายเป็น 0x00000000FFFFFFFF แล้ว call ล้มเงียบ ๆ (เจอจริง 2026-09-21: RAM ของ benchmark CPU และ memtrace อ่านไม่ได้ทั้งคู่)"""
    kernel32 = ctypes.windll.kernel32
    kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.K32GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
    kernel32.K32GetProcessMemoryInfo.restype = wintypes.BOOL


if os.name == "nt":
    _declare_win32_types()


def process_tree(root_pid: int) -> list[int]:
    """ทุก descendant ของ root_pid (รวม root) จาก snapshot เดียว."""
    kernel32 = ctypes.windll.kernel32
    snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    parents: dict[int, int] = {}
    entry = PROCESSENTRY32W()
    entry.dwSize = ctypes.sizeof(PROCESSENTRY32W)
    try:
        ok = kernel32.Process32FirstW(snap, ctypes.byref(entry))
        while ok:
            parents[entry.th32ProcessID] = entry.th32ParentProcessID
            ok = kernel32.Process32NextW(snap, ctypes.byref(entry))
    finally:
        kernel32.CloseHandle(snap)
    tree, frontier = {root_pid}, [root_pid]
    while frontier:
        current = frontier.pop()
        for pid, parent in parents.items():
            if parent == current and pid not in tree:
                tree.add(pid)
                frontier.append(pid)
    return sorted(tree)


def memory_of(pid: int) -> dict | None:
    """working set / private bytes / peak ของ process อื่น (MiB) หรือ None ถ้าเปิดไม่ได้."""
    kernel32 = ctypes.windll.kernel32
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, False, pid)
    if not handle:
        return None
    try:
        counters = PROCESS_MEMORY_COUNTERS_EX()
        counters.cb = ctypes.sizeof(PROCESS_MEMORY_COUNTERS_EX)
        if not kernel32.K32GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
            return None
        mib = 2**20
        return {"working_set": round(counters.WorkingSetSize / mib, 1), "private": round(counters.PrivateUsage / mib, 1),
                "peak_working_set": round(counters.PeakWorkingSetSize / mib, 1)}
    finally:
        kernel32.CloseHandle(handle)


def gpu_used_mib() -> int | None:
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                             capture_output=True, text=True, timeout=10)
        return int(out.stdout.strip().splitlines()[0])
    except Exception:  # noqa: BLE001 — ไม่มี GPU/driver ไม่ใช่เหตุหยุด soak
        return None


def slope(xs: list[float], ys: list[float]) -> float:
    """least-squares slope (หน่วยของ y ต่อ 1 iteration)."""
    n = len(xs)
    if n < 2:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    den = sum((x - mx) ** 2 for x in xs)
    return 0.0 if den == 0 else sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den


def main(argv: list[str] | None = None) -> int:
    if os.name != "nt":
        print("this soak reads process memory through the Windows API; run it on the Windows host", file=sys.stderr)
        return 2
    api_dir = Path(__file__).resolve().parents[2] / "apps" / "api"
    parser = argparse.ArgumentParser(description="voice worker soak test (engine child memory over N requests)")
    parser.add_argument("--clips", type=Path, required=True)
    parser.add_argument("--manifest", default="asr-th-en-01")
    parser.add_argument("--iterations", type=int, default=200)
    parser.add_argument("--language", default="th")
    parser.add_argument("--port", type=int, default=8810)
    parser.add_argument("--python", default=str(api_dir / ".venv-speech" / "Scripts" / "python.exe"))
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--checkpoint-every", type=int, default=50, help="write partial results every N requests")
    args = parser.parse_args(argv)
    clips = sorted(args.clips.glob("*.wav"))
    if not clips:
        print(f"no *.wav in {args.clips}", file=sys.stderr)
        return 2
    args.out.mkdir(parents=True, exist_ok=True)
    payloads = [(c.stem, c.read_bytes()) for c in clips]

    token = "soak-" + uuid.uuid4().hex
    env = {**os.environ,
           "LALIN_VOICE_WORKER_PROFILE_PATH": str(api_dir / "profiles" / "voice-worker" / f"{args.manifest}.json"),
           "LALIN_VOICE_WORKER_DATA_DIR": str(args.out / "worker-data"),
           "LALIN_VOICE_WORKER_PORT": str(args.port),
           "LALIN_VOICE_WORKER_INFERENCE_CREDENTIALS": json.dumps({"soak": token}),
           "LALIN_VOICE_WORKER_MANAGEMENT_TOKEN": "mgmt-" + uuid.uuid4().hex,
           "PYTHONIOENCODING": "utf-8"}
    log = open(args.out / "worker.log", "w", encoding="utf-8")
    proc = subprocess.Popen([args.python, "-m", "app.voice_worker"], cwd=str(api_dir), env=env, stdout=log, stderr=subprocess.STDOUT)
    client = WorkerClient(f"http://127.0.0.1:{args.port}", token)
    rows: list[dict] = []
    started = time.time()
    try:
        ready = False
        while time.time() - started < 180 and proc.poll() is None:
            try:
                response = client.readiness()
                if response.status_code == 200 and response.json().get("ready"):
                    ready = True
                    break
            except Exception:  # noqa: BLE001
                pass
            time.sleep(0.5)
        if not ready:
            print("worker never became ready", file=sys.stderr)
            return 1
        described = client.describe().json()
        profile = described["profiles"][0]
        first_epoch = described["runtime_epoch"]
        print(f"ready after {time.time() - started:.1f}s  epoch={first_epoch}  clips={[n for n, _ in payloads]}", flush=True)
        for i in range(args.iterations):
            name, audio = payloads[i % len(payloads)]
            state = client.describe().json()
            target = {"runtime_id": state["runtime_id"], "runtime_epoch": state["runtime_epoch"],
                      "physical_resource_id": state["physical_resource_id"],
                      "profile_id": profile["profile_id"], "profile_revision": profile["profile_revision"]}
            attempt = f"soak-{i:04d}-{uuid.uuid4().hex[:6]}"
            payload = {"language": args.language, "audio_sha256": hashlib.sha256(audio).hexdigest(),
                       "audio_bytes": len(audio), "declared_mime_type": "audio/wav"}
            envelope = client.envelope(kind="asr", attempt_id=attempt, target=target, input_payload=payload,
                                       start_before_s=30, deadline_s=120, lease_id=None, content_fence=None)
            submitted = client.submit_asr(envelope, audio, "audio/wav")
            if submitted.status_code == 202:
                final = client.wait_terminal(attempt, timeout_s=130)
                outcome = final.get("operation_outcome")
                code = (final.get("error") or {}).get("code")
                proc_s = (final.get("usage") or {}).get("processing_seconds")
                client.erase(attempt)
            else:
                outcome, code, proc_s = "SUBMIT_" + str(submitted.status_code), None, None
            tree = process_tree(proc.pid)
            mems = {pid: m for pid in tree if (m := memory_of(pid)) is not None}
            engine_pid, engine_mem = max(mems.items(), key=lambda kv: kv[1]["private"]) if mems else (None, None)
            row = {"i": i, "clip": name, "outcome": outcome, "error": code, "processing_seconds": proc_s,
                   "epoch": state["runtime_epoch"], "engine_pid": engine_pid,
                   "engine_private_mib": engine_mem["private"] if engine_mem else None,
                   "engine_working_set_mib": engine_mem["working_set"] if engine_mem else None,
                   "tree_private_mib": round(sum(m["private"] for m in mems.values()), 1),
                   "gpu_used_mib": gpu_used_mib(), "t": round(time.time() - started, 1)}
            rows.append(row)
            if args.checkpoint_every > 0 and (i + 1) % args.checkpoint_every == 0:
                write_results(args.out, summarize(rows, started), rows, final=False)
            print(f"{i:4d} {name:16s} {str(outcome):10s} {str(code or ''):14s} "
                  f"engine_pid={engine_pid} private={row['engine_private_mib']} ws={row['engine_working_set_mib']} "
                  f"gpu={row['gpu_used_mib']}", flush=True)
    finally:
        client.close()
        proc.terminate()
        try:
            proc.wait(15)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()

    summary = summarize(rows, started)
    write_results(args.out, summary, rows, final=True)
    print("\nSUMMARY", json.dumps(summary, ensure_ascii=False, indent=1), flush=True)
    return 0


def summarize(rows: list[dict], started: float) -> dict:
    half = rows[len(rows) // 2:]
    series = [(r["i"], r["engine_private_mib"]) for r in half if r["engine_private_mib"] is not None]
    epochs = [r["epoch"] for r in rows]
    return {
        "iterations": len(rows),
        "outcomes": {k: sum(1 for r in rows if r["outcome"] == k) for k in sorted({str(r["outcome"]) for r in rows})},
        "engine_restarts": sum(1 for a, b in zip(epochs, epochs[1:]) if a != b),
        "engine_pids_seen": sorted({r["engine_pid"] for r in rows if r["engine_pid"]}),
        "engine_private_mib_first": rows[0]["engine_private_mib"] if rows else None,
        "engine_private_mib_last": rows[-1]["engine_private_mib"] if rows else None,
        "engine_private_mib_max": max((r["engine_private_mib"] or 0) for r in rows) if rows else None,
        "second_half_slope_mib_per_iter": round(slope([x for x, _ in series], [y for _, y in series]), 3),
        "gpu_used_mib_first": rows[0]["gpu_used_mib"] if rows else None,
        "gpu_used_mib_last": rows[-1]["gpu_used_mib"] if rows else None,
        "wall_seconds": round(time.time() - started, 1),
    }


def write_results(out: Path, summary: dict, rows: list[dict], *, final: bool) -> None:
    """เขียนแบบ atomic (tmp แล้ว replace) — ถ้า soak ถูกตัดกลางทาง ไฟล์ล่าสุดยังอ่านได้เสมอ"""
    tmp = out / "soak-results.json.tmp"
    tmp.write_text(json.dumps({"final": final, "summary": summary, "rows": rows}, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    os.replace(tmp, out / "soak-results.json")


if __name__ == "__main__":
    raise SystemExit(main())
