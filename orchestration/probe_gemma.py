# probe_gemma.py — root-cause probe: gemma-4-12B-coder คืน <unusedNN> เพราะอะไร
# สมมติฐาน: template Jinja (arch gemma4, token <|turn>/<|channel>) ไม่ถูก tokenize
# เป็น special token → โมเดลพ่น token ที่ vocab GGUF ยังตั้งชื่อ <unusedNN>
# probe: (1) /api/generate ปกติ (repro), (2) /api/chat + system role, (3) raw:true + template มือ
# ใช้: python probe_gemma.py <model_tag>

import json
import sys
import time
import urllib.request

OLLAMA = "http://localhost:11434"
MODEL = sys.argv[1] if len(sys.argv) > 1 else "hf.co/yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF:Q4_K_M"

TASK = (
    "You are a focused code generator. ONE task. Output ONLY the TypeScript file contents\n"
    "in a single ```ts code block. No prose. Pure function, no imports.\n\n"
    "Implement EXACTLY this signature in frontend/src/audio/clamp01.ts:\n"
    "export function clamp01(x: number): number\n\n"
    "Rules:\n- return x clamped to the range [0, 1].\n- if x is NaN return 0.\n\n"
    "Acceptance: clamp01(-1) -> 0. clamp01(0.5) -> 0.5. clamp01(2) -> 1. clamp01(NaN) -> 0.\n"
    "Output ONLY the ```ts block."
)
OPTS = {"temperature": 0.1, "num_ctx": 8192, "num_predict": 400}


def post(path, body, timeout=900):
    req = urllib.request.Request(f"{OLLAMA}{path}", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        out = json.loads(r.read())
    out["_wall_s"] = round(time.perf_counter() - t0, 1)
    return out


def show(name, resp, text):
    print(f"--- {name} ---")
    print(f"wall={resp['_wall_s']}s load={round(resp.get('load_duration', 0) / 1e9, 1)}s "
          f"eval_count={resp.get('eval_count')} done_reason={resp.get('done_reason')}")
    print(f"output[:400]: {text[:400]!r}")
    print()


def main():
    print(f"model: {MODEL}\n")

    # P1: /api/generate ปกติ (path เดิมที่ fail ใน dispatch #1)
    r = post("/api/generate", {"model": MODEL, "prompt": TASK, "stream": False,
                               "options": OPTS, "keep_alive": "10m"})
    show("P1 /api/generate (template ของโมเดล)", r, r.get("response", ""))

    # P2: /api/chat + system role + messages array
    r = post("/api/chat", {"model": MODEL, "stream": False, "options": OPTS, "keep_alive": "10m",
                           "messages": [
                               {"role": "system", "content": "You are a focused TypeScript code generator. Output only code."},
                               {"role": "user", "content": TASK},
                           ]})
    show("P2 /api/chat + system role", r, r.get("message", {}).get("content", ""))

    # P3: raw=true — ประกอบ template gemma4 เอง (<|turn> ตาม template ที่ ollama show โชว์)
    raw_prompt = f"<|turn>user\n{TASK}<turn|>\n<|turn>model\n<|channel>thought\n<channel|>"
    r = post("/api/generate", {"model": MODEL, "prompt": raw_prompt, "raw": True, "stream": False,
                               "options": OPTS, "keep_alive": "10m"})
    show("P3 raw:true + gemma4 template มือ", r, r.get("response", ""))

    # P4: raw=true + template gemma แบบดั้งเดิม (<start_of_turn> ของ gemma มาตรฐาน)
    raw_prompt = f"<start_of_turn>user\n{TASK}<end_of_turn>\n<start_of_turn>model\n"
    r = post("/api/generate", {"model": MODEL, "prompt": raw_prompt, "raw": True, "stream": False,
                               "options": OPTS, "keep_alive": "10m"})
    show("P4 raw:true + gemma template ดั้งเดิม (start_of_turn)", r, r.get("response", ""))


if __name__ == "__main__":
    main()
