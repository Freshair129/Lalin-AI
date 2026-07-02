# reextract.py — re-verify ผล bench เดิมด้วย extractor v2 (offline จาก bench_raw/ ไม่แตะโมเดล)
# extractor v2: เลือก fence ที่มี "export function" (แทน fence แรก); ถ้าไม่มี ลองทั้ง output
# ตอบคำถาม: fail ที่เจอเป็นความผิดโมเดล หรือ extraction naive — วัด rescue rate ต่อโมเดล

import json
import re
from pathlib import Path

from dispatch import THINK_RE, load_tasks, verify

HERE = Path(__file__).resolve().parent
RAW = HERE / "bench_raw"
# fence เปิดกว้างขึ้น: ยอมรับทุก language tag (ts/typescript/tsx/javascript/ว่าง)
FENCE_ANY_RE = re.compile(r"```[a-zA-Z]*\s*\n(.*?)```", re.S)


def extract_v2(text):
    stripped = THINK_RE.sub("", text)
    fences = FENCE_ANY_RE.findall(stripped)
    with_export = [f for f in fences if "export function" in f]
    if with_export:
        return with_export[-1].strip()   # ตัวสุดท้าย = คำตอบสุดท้ายของโมเดล
    if fences:
        return fences[-1].strip()
    if "export function" in stripped:    # ไม่มี fence เลย — ลองทั้งก้อน (ตัด prose นำหน้า)
        return stripped[stripped.index("export function"):].strip()
    return None


def main():
    tasks = load_tasks()
    rows = [json.loads(l) for l in (HERE / "bench_results.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    fails = [r for r in rows if r.get("kind") != "prewarm" and r.get("gate") == "fail"]
    print(f"re-checking {len(fails)} failed runs with extractor v2\n")
    rescued = {}
    for r in fails:
        safe = r["model"].replace("/", "_").replace(":", "_")
        raw_file = RAW / f"{safe}__{r['task_id']}__{r['variant']}.txt"
        if not raw_file.exists():
            continue
        code = extract_v2(raw_file.read_text(encoding="utf-8"))
        if not code:
            verdict = "still-fail (no code found)"
        else:
            gate, _ = verify(code, r["task_id"], workdir=HERE / "bench_raw" / "reextract")
            verdict = "RESCUED" if gate["gate"] == "pass" else f"still-fail ({(gate.get('failures') or [{}])[0].get('kind', '?')})"
        key = r["model"].split("/")[-1][:30]
        rescued.setdefault(key, []).append((r["task_id"], r["variant"], verdict))
        print(f"{key:32s} {r['task_id']:18s} {r['variant']:14s} -> {verdict}")
    print("\n== rescue summary ==")
    for k, v in rescued.items():
        n_res = sum(1 for _, _, verdict in v if verdict == "RESCUED")
        print(f"{k:32s} rescued {n_res}/{len(v)}")


if __name__ == "__main__":
    main()
