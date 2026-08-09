# bench.py — benchmark matrix: model × task × prompt-variant (warm, pre-warm ก่อนเสมอ)
# เก็บผลลง bench_results.jsonl (append, resume ได้ — ข้ามคู่ที่มีผลแล้ว)
# ใช้: python bench.py --models qwen3:latest --variants v-plain,v-bracket [--tasks all]

import argparse
import json
import time
from datetime import datetime
from pathlib import Path

from dispatch import (HERE, DEFAULT_OPTIONS, options_for, load_tasks, build_prompt,
                      ollama_generate, ollama_ps, dispatch_once, append_jsonl)

RESULTS = HERE / "bench_results.jsonl"
RAW_DIR = HERE / "bench_raw"

# บทเรียนจริงจาก LOCAL_MODEL_LEDGER (ใช้กับ variant v-plain-pm)
PAST_MISTAKES = [
    "Do not accumulate floating point in a loop (use index*step, not time += step) — caused drift in metronomeTicks.",
    "Acceptance values are computed exactly; match them to the digit (round only where the rules say).",
]


def prewarm(model):
    """dummy call 1 ครั้ง → คืน (load_s, wall_s, size_vram_gb)
    สำคัญ: ต้องใช้ options ชุดเดียวกับ dispatch จริง (โดยเฉพาะ num_ctx) —
    ถ้า num_ctx ต่างกัน Ollama จะ reload โมเดล ทำให้ pre-warm เสียเปล่า (วัดพบจริง)"""
    resp = ollama_generate(model, "Reply with exactly: ok",
                           options={**options_for(model), "num_predict": 8}, timeout=1200)
    load_s = round(resp.get("load_duration", 0) / 1e9, 1)
    vram = 0
    for m in ollama_ps().get("models", []):
        if m["name"] == model or m["model"] == model:
            vram = round(m.get("size_vram", 0) / 1e9, 2)
    return {"model": model, "kind": "prewarm", "load_s": load_s, "wall_s": resp["_wall_s"],
            "size_vram_gb": vram, "eval_count": resp.get("eval_count"),
            "ts": datetime.now().isoformat(timespec="seconds")}


def done_keys():
    keys = set()
    if RESULTS.exists():
        for line in RESULTS.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(line)
                if r.get("kind") != "prewarm":
                    keys.add((r["model"], r["task_id"], r["variant"]))
            except Exception:
                pass
    return keys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True, help="comma list — รันเป็น batch ต่อโมเดล")
    ap.add_argument("--variants", default="v-plain")
    ap.add_argument("--tasks", default="all", help="all | ไม่รวม smoke | comma list ของ id")
    ap.add_argument("--include-smoke", action="store_true")
    ap.add_argument("--skip-tsc", action="store_true")
    ap.add_argument("--tag", default="", help="ต่อท้ายชื่อ variant ในผลลัพธ์ (สำหรับ re-run เงื่อนไขใหม่)")
    args = ap.parse_args()

    tasks = load_tasks()
    if args.tasks == "all":
        ids = [t for t, v in tasks.items() if args.include_smoke or not v.get("smoke")]
    else:
        ids = args.tasks.split(",")
    variants = args.variants.split(",")
    RAW_DIR.mkdir(exist_ok=True)
    done = done_keys()

    for model in args.models.split(","):
        print(f"[bench] === {model} ===", flush=True)
        pw = prewarm(model)
        append_jsonl(RESULTS, pw)
        print(f"[bench] prewarm load={pw['load_s']}s wall={pw['wall_s']}s vram={pw['size_vram_gb']}GB", flush=True)
        for task_id in ids:
            for variant in variants:
                label = f"{variant}+{args.tag}" if args.tag else variant
                if (model, task_id, label) in done:
                    print(f"[bench] skip (done): {task_id} {label}", flush=True)
                    continue
                t0 = time.perf_counter()
                try:
                    rec, text, ts_file = dispatch_once(
                        model=model, task=tasks[task_id], variant=variant,
                        past_mistakes=PAST_MISTAKES if variant == "v-plain-pm" else None,
                        skip_tsc=args.skip_tsc, raw_dir=RAW_DIR)
                except Exception as e:
                    rec = {"task_id": task_id, "model": model, "variant": variant,
                           "gate": "fail", "error": str(e)[:300],
                           "latency_s": round(time.perf_counter() - t0, 1),
                           "ts": datetime.now().isoformat(timespec="seconds")}
                    text = ""
                rec["variant"] = label
                append_jsonl(RESULTS, rec)
                if text:
                    safe = model.replace("/", "_").replace(":", "_")
                    (RAW_DIR / f"{safe}__{task_id}__{label}.txt").write_text(text, encoding="utf-8")
                print(f"[bench] {task_id:18s} {label:14s} gate={rec['gate']:4s} "
                      f"lat={rec.get('latency_s', '?')}s eval={rec.get('eval_count', '?')}", flush=True)
    print("[bench] done", flush=True)


if __name__ == "__main__":
    main()
