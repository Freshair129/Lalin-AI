# summarize_bench.py — สรุป bench_results.jsonl เป็นตาราง pass-rate / latency ต่อ model×variant
# ใช้: python summarize_bench.py [--by variant|model|task]

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load():
    rows = []
    for line in (HERE / "bench_results.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return [r for r in rows if r.get("kind") != "prewarm"], \
           [r for r in rows if r.get("kind") == "prewarm"]


def fmt_group(rows, key_fn, title):
    groups = defaultdict(list)
    for r in rows:
        groups[key_fn(r)].append(r)
    print(f"\n== {title} ==")
    print(f"{'group':58s} {'n':>3s} {'pass':>4s} {'rate':>5s} {'med_lat':>8s} {'med_eval':>8s} {'1fence':>6s}")
    for k in sorted(groups):
        g = groups[k]
        n = len(g)
        p = sum(1 for r in g if r.get("gate") == "pass")
        lats = [r["latency_s"] for r in g if "latency_s" in r]
        evals = [r["eval_count"] for r in g if r.get("eval_count")]
        fence_ok = sum(1 for r in g if r.get("n_fences") == 1)
        print(f"{str(k):58s} {n:3d} {p:4d} {p/n:5.0%} "
              f"{statistics.median(lats):7.1f}s {statistics.median(evals) if evals else 0:8.0f} {fence_ok:4d}/{n}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=None, help="filter เฉพาะโมเดล")
    args = ap.parse_args()
    rows, prewarms = load()
    if args.model:
        rows = [r for r in rows if r["model"] == args.model]

    print("== prewarm (cold-load) ==")
    for p in prewarms:
        print(f"  {p['model']:58s} load={p['load_s']:6.1f}s wall={p['wall_s']:6.1f}s vram={p.get('size_vram_gb', '?')}GB")

    fmt_group(rows, lambda r: (r["model"], r["variant"]), "model x variant")
    fmt_group(rows, lambda r: r["model"], "model")
    fmt_group(rows, lambda r: r["variant"], "variant")

    fails = [r for r in rows if r.get("gate") != "pass"]
    if fails:
        print("\n== FAILURES ==")
        for r in fails:
            why = r.get("error") or "; ".join(
                f"{f.get('kind')}:{f.get('expr', '')[:40]}" for f in r.get("gate_failures", [])[:2])
            print(f"  {r['model']} {r['task_id']} {r['variant']}: {why[:120]}")


if __name__ == "__main__":
    main()
