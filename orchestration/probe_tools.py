# probe_tools.py — วัดความสามารถ tool use (function calling) ของโมเดลใน pool
# 3 สถานการณ์: S1 เรียก tool เดี่ยว (อังกฤษ) · S2 เรียก tool จากคำสั่งไทย (enum + เลขติดลบ)
# · S3 negative case — ต้อง "ไม่" เรียก tool แล้วตอบตรง
# ใช้: python probe_tools.py <model1,model2,...>

import json
import sys
import time
import urllib.request

from dispatch import options_for, append_jsonl, HERE

OLLAMA = "http://localhost:11434"

TOOLS = [
    {"type": "function", "function": {
        "name": "parse_timecode",
        "description": "Convert a timecode string MM:SS.mmm to seconds",
        "parameters": {"type": "object", "properties": {
            "s": {"type": "string", "description": "timecode string like 01:02.500"}},
            "required": ["s"]}}},
    {"type": "function", "function": {
        "name": "set_stem_volume",
        "description": "Adjust the volume of an audio stem by a relative amount in dB",
        "parameters": {"type": "object", "properties": {
            "stem": {"type": "string", "enum": ["vocals", "drums", "bass", "other"]},
            "delta_db": {"type": "number", "description": "relative change in dB, negative lowers the volume"}},
            "required": ["stem", "delta_db"]}}},
]

SCENARIOS = [
    ("S1-call-en", "Use the tools available. Convert the timecode 01:02.500 to seconds.",
     lambda tc, content: len(tc) == 1 and tc[0]["function"]["name"] == "parse_timecode"
     and tc[0]["function"]["arguments"].get("s") == "01:02.500"),
    ("S2-call-th", "ช่วยลดเสียงกลอง (drums) ลง 3 dB หน่อย",
     lambda tc, content: len(tc) == 1 and tc[0]["function"]["name"] == "set_stem_volume"
     and tc[0]["function"]["arguments"].get("stem") == "drums"
     and float(tc[0]["function"]["arguments"].get("delta_db", 0)) == -3.0),
    ("S3-no-call", "What is 2+2? Just answer with the number, do not use any tools.",
     lambda tc, content: len(tc) == 0 and "4" in content),
]


def chat(model, user_msg, timeout=900):
    opts = dict(options_for(model))
    opts["num_predict"] = 1500
    body = {"model": model, "stream": False, "options": opts, "keep_alive": "10m",
            "messages": [{"role": "user", "content": user_msg}], "tools": TOOLS}
    req = urllib.request.Request(f"{OLLAMA}/api/chat", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        out = json.loads(r.read())
    out["_wall_s"] = round(time.perf_counter() - t0, 2)
    return out


def main():
    models = sys.argv[1].split(",") if len(sys.argv) > 1 else ["qwen3:latest"]
    results = HERE / "bench_results.jsonl"
    for model in models:
        print(f"=== {model.split('/')[-1]} ===", flush=True)
        for sid, msg, check in SCENARIOS:
            try:
                r = chat(model, msg)
                m = r.get("message", {})
                tc = m.get("tool_calls", []) or []
                content = m.get("content", "") or ""
                ok = False
                try:
                    ok = bool(check(tc, content))
                except Exception:
                    ok = False
                rec = {"kind": "tooluse", "model": model, "scenario": sid,
                       "pass": ok, "n_tool_calls": len(tc),
                       "tool_calls": json.dumps(tc, ensure_ascii=False)[:300],
                       "content_head": content[:150], "latency_s": r["_wall_s"],
                       "eval_count": r.get("eval_count")}
            except Exception as e:
                rec = {"kind": "tooluse", "model": model, "scenario": sid,
                       "pass": False, "error": str(e)[:200]}
            append_jsonl(results, rec)
            print(f"  {sid:12s} pass={rec['pass']} calls={rec.get('n_tool_calls', '?')} "
                  f"lat={rec.get('latency_s', '?')}s -> {rec.get('tool_calls', rec.get('error', ''))[:110]}", flush=True)


if __name__ == "__main__":
    main()
