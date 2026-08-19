# probe_pm.py — A/B: PAST MISTAKES จาก semantic recall (FR-4) vs static-irrelevant
# บน 3 task ที่ v-plain-pm (irrelevant) เคยตก gate: parseSrtCues, formatTimecode, pickKeys
# ใช้: python probe_pm.py [model]

import json
import sys
from datetime import datetime

from dispatch import HERE, load_tasks, dispatch_once, append_jsonl
from recall_mistakes import recall

MODEL = sys.argv[1] if len(sys.argv) > 1 else "qwen3:latest"
TASKS = ["parseSrtCues", "formatTimecode", "pickKeys"]
QUERY = {
    "parseSrtCues": "parse SRT subtitle blocks into cue objects, pure string parser",
    "formatTimecode": "format seconds into MM:SS.mmm timecode string, zero-padded",
    "pickKeys": "typescript generic pick keys from object utility",
}


def main():
    tasks = load_tasks()
    results = HERE / "bench_results.jsonl"
    for task_id in TASKS:
        lines = recall(QUERY[task_id], top=2, force_embed=True)
        pm = [l["line"] for l in lines]
        print(f"[pm-recall] {task_id}: inject {len(pm)} lines:")
        for p in pm:
            print(f"    - {p[:90]}")
        rec, text, _ = dispatch_once(model=MODEL, task=tasks[task_id], variant="v-plain-pm",
                                     past_mistakes=pm, raw_dir=HERE / "bench_raw")
        rec["variant"] = "v-plain-pm+recall"
        rec["ts"] = datetime.now().isoformat(timespec="seconds")
        append_jsonl(results, rec)
        safe = MODEL.replace("/", "_").replace(":", "_")
        (HERE / "bench_raw" / f"{safe}__{task_id}__v-plain-pm+recall.txt").write_text(text, encoding="utf-8")
        print(f"[pm-recall] {task_id}: gate={rec['gate']} lat={rec['latency_s']}s eval={rec['eval_count']}")


if __name__ == "__main__":
    main()
