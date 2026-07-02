# dispatch.py — dispatch micro-task ให้ local model (Ollama) ครบ loop:
#   buildPrompt -> dispatch -> Verify Gate (deterministic) -> escalate (maxRework=1) -> log ledger/stats
# ตาม SPEC--LOCAL-LLM-DISPATCH-V2 (§9 prompt/config, §10 gate/escalation, FR-2 stats schema)
# stdlib เท่านั้น (กติกา core) · ใช้: python dispatch.py --task clamp01 --model qwen3:latest [--pool m2,m3]

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
OLLAMA = "http://localhost:11434"
TZ = timezone(timedelta(hours=7))

DEFAULT_OPTIONS = {"temperature": 0.1, "num_ctx": 8192, "num_predict": 2500}
DEFAULT_KEEP_ALIVE = "30m"

# override ต่อโมเดลจาก model card / smoke result (SPEC §9.2)
# Qwythos card: "Avoid greedy decoding and very-low-temperature sampling (T <= 0.3)" -> repetition loop
MODEL_OPTIONS = {
    "hf.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF:Q4_K_M": {
        "temperature": 0.6, "top_p": 0.95, "top_k": 20, "repeat_penalty": 1.05,
        "num_ctx": 8192, "num_predict": 6000,
    },
    # Mellum2 MoE (A2.5B active) — card: temp 0.6/top_p 0.95/top_k 20 (JetBrains official),
    # thinking model → num_predict เผื่อ <think>
    "hf.co/yuxinlu1/Mellum2-12B-A2.5B-Claude-4.6-4.8-Opus-Thinking-GGUF:Q4_K_M": {
        "temperature": 0.6, "top_p": 0.95, "top_k": 20,
        "num_ctx": 8192, "num_predict": 6000,
    },
}


def options_for(model, options=None):
    return options or MODEL_OPTIONS.get(model) or DEFAULT_OPTIONS
SPECIAL_LEAK_RE = re.compile(r"<unused\d+>|<pad>|<\|[^|>]{0,40}\|>")
THINK_RE = re.compile(r"<think>.*?</think>", re.S)
FENCE_RE = re.compile(r"```(?:ts|typescript)?\s*\n?(.*?)```", re.S)
# extractor v2: fence ทุก language tag — บางโมเดล (sushirl, Qwythos) พ่น CoT เปล่า ๆ
# ที่ restate โจทย์ (มี ``` ในเนื้อความ) → ห้ามใช้ fence แรก ให้ใช้ fence ที่มี export function ตัวสุดท้าย
# ผลวัดจริง (reextract.py จาก bench 2026-07-03): sushirl 0/7 → 7/7, gemma-it 9/14 → 14/14
FENCE_ANY_RE = re.compile(r"```[a-zA-Z]*\s*\n(.*?)```", re.S)


def load_tasks():
    data = json.loads((HERE / "bench_tasks.json").read_text(encoding="utf-8"))
    return {t["id"]: t for t in data["tasks"]}


# ---------- prompt variants ----------

def build_prompt(task, variant="v-plain", past_mistakes=None):
    rules = "\n".join(f"- {r}" for r in task["rules"])
    sig = task["signature"]
    path = task["path"]
    acc = task["acceptance_prompt"]

    if variant == "v-bracket":
        return (
            "[ROLE / SMALL_MODEL_RULES]\n"
            "You are a focused code generator. ONE task only. Output ONLY a single TypeScript file's\n"
            "contents inside one ```ts code block. No prose, no explanation. Pure function, no imports,\n"
            "no external deps. Surgical and minimal.\n\n"
            f"[SCAFFOLD]\nFile: {path}\nSignature to implement EXACTLY:\n{sig}\n\n"
            f"[GROUNDED CONTEXT]\n{rules}\n\n"
            f"[TASK + ACCEPTANCE]\n{acc}\n"
            "Return ONLY the file contents in one ```ts block."
        )

    # ตระกูล plain (template ที่ผ่านจริงใน REPORT §4)
    head = (
        "You are a focused code generator. ONE task. Output ONLY the TypeScript file contents\n"
        "in a single ```ts code block. No prose. Pure function, no imports.\n\n"
        f"Implement EXACTLY this signature in {path}:\n{sig}\n\n"
        f"Rules:\n{rules}\n"
    )
    tail = "Output ONLY the ```ts block."
    if variant == "v-plain-nacc":
        return f"{head}\n{tail}"
    pm = ""
    if variant == "v-plain-pm" and past_mistakes:
        pm = "PAST MISTAKES (from ledger, avoid these):\n" + "\n".join(f"- {m}" for m in past_mistakes) + "\n"
    return f"{head}\nAcceptance: {acc}\n{pm}{tail}"


# ---------- Ollama ----------

def ollama_generate(model, prompt, options=None, keep_alive=DEFAULT_KEEP_ALIVE, timeout=900):
    body = {
        "model": model, "prompt": prompt, "stream": False,
        "options": options or DEFAULT_OPTIONS, "keep_alive": keep_alive,
    }
    req = urllib.request.Request(
        f"{OLLAMA}/api/generate", data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        out = json.loads(r.read())
    out["_wall_s"] = round(time.perf_counter() - t0, 2)
    return out


def ollama_ps():
    with urllib.request.urlopen(f"{OLLAMA}/api/ps", timeout=30) as r:
        return json.loads(r.read())


# ---------- output analysis ----------

def analyze_output(text):
    had_think = bool(THINK_RE.search(text))
    stripped = THINK_RE.sub("", text)
    # orphan </think>: template ของ qwen3.5-family (Qwythos/sushirl) auto-open <think>
    # ตอน generation → CoT ต้นๆ response ไม่มี tag เปิด — ตัดทุกอย่างก่อน </think> ตัวสุดท้าย
    if "</think>" in stripped:
        had_think = True
        stripped = stripped.rsplit("</think>", 1)[1]
    fences = FENCE_ANY_RE.findall(stripped)
    outside = FENCE_ANY_RE.sub("", stripped).strip()
    # v2: เลือก fence ที่มี export function (ตัวสุดท้าย = คำตอบสุดท้าย); fallback ตามลำดับ
    with_export = [f for f in fences if "export function" in f]
    if with_export:
        code = with_export[-1].strip()
    elif fences:
        code = fences[-1].strip()
    elif "export function" in stripped:  # ไม่มี fence เลย — ตัด prose นำหน้าออก
        code = stripped[stripped.index("export function"):].strip()
    else:
        code = None
    return {
        "had_think": had_think,
        "n_fences": len(fences),
        "prose_chars_outside_fence": len(outside),
        "special_leak": bool(SPECIAL_LEAK_RE.search(stripped)),
        "code": code,
    }


# ---------- Verify Gate (เรียก node — deterministic) ----------

def verify(code, task_id, workdir=None, skip_tsc=False):
    workdir = Path(workdir or (HERE / "bench_raw"))
    workdir.mkdir(exist_ok=True)
    ts_file = workdir / f"candidate_{task_id}_{int(time.time()*1000)}.ts"
    ts_file.write_text(code or "", encoding="utf-8")
    args = ["node", str(HERE / "verify_gate.mjs"), str(ts_file), task_id]
    if skip_tsc:
        args.append("--skip-tsc")
    p = subprocess.run(args, capture_output=True, text=True, timeout=300)
    try:
        return json.loads(p.stdout.strip().splitlines()[-1]), ts_file
    except Exception:
        return {"gate": "fail", "error": f"gate crashed: {p.stderr[:300]}"}, ts_file


# ---------- 1 dispatch = generate + analyze + verify ----------

def dispatch_once(model, task, variant="v-plain", past_mistakes=None, options=None,
                  keep_alive=DEFAULT_KEEP_ALIVE, skip_tsc=False, raw_dir=None):
    prompt = build_prompt(task, variant, past_mistakes)
    resp = ollama_generate(model, prompt, options=options_for(model, options), keep_alive=keep_alive)
    text = resp.get("response", "")
    ana = analyze_output(text)
    if ana["code"]:
        gate, ts_file = verify(ana["code"], task["id"], workdir=raw_dir, skip_tsc=skip_tsc)
    else:
        gate, ts_file = {"gate": "fail", "error": "no code block extracted"}, None
    load_s = round(resp.get("load_duration", 0) / 1e9, 2)
    rec = {
        "task_id": task["id"], "task_type": task["task_type"], "model": model, "variant": variant,
        "gate": gate.get("gate", "fail"),
        "verify": {
            "tsc_ok": gate.get("tsc_ok"), "visible_exit": 0 if gate.get("visible_pass") else 1,
            "holdout_exit": 0 if gate.get("holdout_pass") else 1,
        },
        "gate_failures": gate.get("failures", [])[:4],
        "latency_s": resp["_wall_s"], "load_s": load_s, "warm": load_s < 1.0,
        "eval_count": resp.get("eval_count", 0), "prompt_eval_count": resp.get("prompt_eval_count", 0),
        "eval_tok_per_s": round(resp.get("eval_count", 0) / max(resp.get("eval_duration", 1) / 1e9, 1e-9), 1),
        "had_think": ana["had_think"], "n_fences": ana["n_fences"],
        "prose_chars_outside_fence": ana["prose_chars_outside_fence"], "special_leak": ana["special_leak"],
        "ts": datetime.now(TZ).isoformat(timespec="seconds"),
    }
    return rec, text, ts_file


def append_jsonl(path, obj):
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


# ---------- CLI: loop เต็ม (escalate ใน pool, maxRework=1) ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--pool", default="", help="comma list ของโมเดลสำรอง (escalate ภายใน T1)")
    ap.add_argument("--variant", default="v-plain")
    ap.add_argument("--max-rework", type=int, default=1)
    ap.add_argument("--stats-file", default=str(HERE / "model_stats.jsonl"))
    ap.add_argument("--run-id", default=None)
    args = ap.parse_args()

    tasks = load_tasks()
    task = tasks[args.task]
    run_id = args.run_id or f"run-{datetime.now(TZ).strftime('%Y%m%d-%H%M%S')}"
    chain = [args.model] + [m for m in args.pool.split(",") if m]

    escalated = None
    final = None
    for round_i, model in enumerate(chain[: args.max_rework + 1]):
        rec, text, _ = dispatch_once(model, task, args.variant)
        rec.update({"run_id": run_id, "attempt_id": round_i + 1, "tier": "T1", "rework_round": round_i,
                    "escalated_to": None})
        final = rec
        if rec["gate"] == "pass":
            break
    else:
        escalated = "T2"
    if final is not None and escalated:
        final["escalated_to"] = escalated
    append_jsonl(args.stats_file, final)
    print(json.dumps({"gate": final["gate"], "model": final["model"],
                      "escalated_to": final["escalated_to"], "latency_s": final["latency_s"]}))
    sys.exit(0 if final["gate"] == "pass" else 2)


if __name__ == "__main__":
    main()
