# recall_mistakes.py — L1 semantic retrieval ของ PAST MISTAKES จาก ledger.jsonl (FR-4)
# embed lesson ด้วย bge-m3 (Ollama /api/embeddings) + cache → คืนบรรทัดพร้อมแทรก prompt
# กติกา: blacklist entry ถูก inject เสมอ · ledger < 10 entries → ข้าม embedding (match task_type)
# ใช้: python recall_mistakes.py --task "implement SRT cue parser, pure function" --top 3

import argparse
import json
import math
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OLLAMA = "http://localhost:11434"
EMBED_MODEL = "bge-m3:latest"
LEDGER = HERE / "ledger.jsonl"
VEC_CACHE = HERE / "ledger_vec.json"
SIM_THRESHOLD = 0.5
EMBED_MIN_ENTRIES = 10


def embed(text):
    body = {"model": EMBED_MODEL, "prompt": text}
    req = urllib.request.Request(f"{OLLAMA}/api/embeddings", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())["embedding"]


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


def load_ledger():
    if not LEDGER.exists():
        return []
    out = []
    for line in LEDGER.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out


def entry_key(e):
    return f"{e.get('ts', '')}|{e.get('task_id', '')}|{e.get('model', '')}"


def get_vectors(entries):
    """embed เฉพาะ entry ใหม่ (cache ใน ledger_vec.json)"""
    cache = json.loads(VEC_CACHE.read_text(encoding="utf-8")) if VEC_CACHE.exists() else {}
    changed = False
    for e in entries:
        k = entry_key(e)
        if k not in cache:
            cache[k] = embed(e["lesson"])
            changed = True
    if changed:
        VEC_CACHE.write_text(json.dumps(cache), encoding="utf-8")
    return cache


def recall(task_desc, top=3, task_type=None, force_embed=False):
    entries = load_ledger()
    if not entries:
        return []
    blacklists = [e for e in entries if e.get("blacklist")]
    rest = [e for e in entries if not e.get("blacklist")]

    if len(entries) < EMBED_MIN_ENTRIES and not force_embed:
        picked = [e for e in rest if not task_type or e.get("task_type") == task_type]
        scored = [(1.0, e) for e in picked]
    else:
        cache = get_vectors(rest)
        qv = embed(task_desc)
        scored = sorted(((cosine(qv, cache[entry_key(e)]), e) for e in rest),
                        key=lambda t: -t[0])
        scored = [(s, e) for s, e in scored if s >= SIM_THRESHOLD]

    out = [(None, e) for e in blacklists] + scored[:top]
    seen, lines = set(), []
    for sim, e in out[: top + len(blacklists)]:
        if e["lesson"] in seen:
            continue
        seen.add(e["lesson"])
        tag = "BLACKLIST" if e.get("blacklist") else f"sim={sim:.3f}"
        lines.append({"line": e["lesson"], "tag": tag, "model": e.get("model"), "task_id": e.get("task_id")})
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", required=True)
    ap.add_argument("--top", type=int, default=3)
    ap.add_argument("--task-type", default=None)
    ap.add_argument("--force-embed", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    lines = recall(args.task, top=args.top, task_type=args.task_type, force_embed=args.force_embed)
    if args.json:
        print(json.dumps(lines, ensure_ascii=False, indent=1))
    else:
        for l in lines:
            print(f"- {l['line']}")


if __name__ == "__main__":
    main()
