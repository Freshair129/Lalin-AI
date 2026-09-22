#!/usr/bin/env python3
"""สร้าง reference transcript ภาษาไทยด้วยการฟัง-แก้ทีละ segment แล้วคำนวณ CER ของ ASR (Slice B qualification)

ทำไมเป็น CER ไม่ใช่ WER: ภาษาไทยไม่เว้นวรรคระหว่างคำ WER ต้องใช้ตัวตัดคำ (เช่น pythainlp) ซึ่งจะเพิ่ม dependency
ใน lock file · CER (character error rate) เป็นมาตรฐานสำหรับภาษาไทยและไม่ต้องพึ่งอะไรเพิ่ม
หน่วยของ CER = Unicode code point: สระและวรรณยุกต์นับแยกเป็นตัว ("ครับ" = 4) ตามธรรมเนียมทั่วไป — ต้องรู้ไว้เมื่อเทียบกับตัวเลขที่อื่น

เสียงงานจริงเป็นข้อมูลส่วนตัว: server ผูก 127.0.0.1 เท่านั้น เสิร์ฟเฉพาะไฟล์ใน clips dir (ชื่อต้องอยู่ใน allowlist)
และเขียนได้เฉพาะ reference.json ใน data dir (ใต้ runtime/ ที่ gitignored) · ไม่มีการอัปโหลดไปที่ไหน

ขั้นตอน:
  prepare  ถอดเสียงคลิปเป็น segment (large-v3-turbo, th, VAD เปิดเหมือน asr-th-en-01) → data/segments.json
           ค่าเริ่มต้นใช้ CPU เพราะ GPU อาจถูกใช้อยู่ (เช่น soak) — segment เป็นแค่ตัวช่วยฟัง ไม่ใช่ตัวที่ถูกวัด
  serve    หน้าเว็บในเครื่อง: เล่นทีละ segment, แก้ข้อความ, ทำเครื่องหมาย "ไม่ได้ยิน", บันทึกอัตโนมัติ
  score    CER ของ hypothesis (ผล ASR ทั้งคลิป) เทียบ reference — คำนวณเฉพาะคลิปที่ตรวจครบทุก segment

ใช้ (จาก apps/api):
  .venv-speech\\Scripts\\python.exe ..\\..\\tools\\verify\\wer_review.py prepare --clips runtime\\eval\\asr-th --data runtime\\eval\\wer-review
  .venv-speech\\Scripts\\python.exe ..\\..\\tools\\verify\\wer_review.py serve   --clips runtime\\eval\\asr-th --data runtime\\eval\\wer-review --port 8830
  .venv-speech\\Scripts\\python.exe ..\\..\\tools\\verify\\wer_review.py score   --data runtime\\eval\\wer-review --hyp runtime\\eval\\d14\\results.json
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
import threading
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

_SAVE_LOCK = threading.Lock()


# ── prepare ────────────────────────────────────────────────────────────
def _register_cuda_dlls() -> None:
    if os.name != "nt":
        return
    for directory in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
        try:
            os.add_dll_directory(directory)
        except OSError:
            continue
        os.environ["PATH"] = directory + os.pathsep + os.environ.get("PATH", "")


def prepare(clips_dir: Path, data_dir: Path, model_dir: Path, device: str, compute_type: str) -> int:
    if device.startswith("cuda"):
        _register_cuda_dlls()
    from faster_whisper import WhisperModel

    model = WhisperModel(str(model_dir), device=device, compute_type=compute_type, local_files_only=True)
    out: dict = {"model": model_dir.name, "device": device, "compute_type": compute_type, "vad_filter": True, "clips": {}}
    for wav in sorted(clips_dir.glob("*.wav")):
        seg_iter, info = model.transcribe(str(wav), language="th", beam_size=5, vad_filter=True,
                                          vad_parameters={"min_silence_duration_ms": 700})
        segments = [{"i": n, "start": round(s.start, 2), "end": round(s.end, 2), "asr": s.text.strip()}
                    for n, s in enumerate(seg_iter)]
        out["clips"][wav.stem] = {"duration": round(info.duration, 2), "segments": segments}
        print(f"  {wav.stem:16s} {len(segments):3d} segments  {info.duration:5.1f}s", flush=True)
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "segments.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote", data_dir / "segments.json")
    return 0


# ── score ──────────────────────────────────────────────────────────────
def normalize(text: str) -> str:
    """เทียบเฉพาะตัวอักษร: NFC, ตัดช่องว่าง/เครื่องหมายวรรคตอน, Latin เป็นตัวเล็ก
    (การเว้นวรรคในภาษาไทยไม่มีมาตรฐาน ถ้านับช่องว่างจะลงโทษการเว้นวรรคแทนการถอดผิด)"""
    text = unicodedata.normalize("NFC", text).lower()
    return "".join(ch for ch in text if not ch.isspace() and unicodedata.category(ch)[0] not in {"P", "S"})


def edit_distance(ref: str, hyp: str) -> int:
    prev = list(range(len(hyp) + 1))
    for i, rc in enumerate(ref, 1):
        cur = [i] + [0] * len(hyp)
        for j, hc in enumerate(hyp, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc))
        prev = cur
    return prev[-1]


def reference_text(clip: dict, reviewed: dict) -> tuple[str | None, int, int]:
    """(reference ทั้งคลิป หรือ None ถ้ายังตรวจไม่ครบ, ตรวจแล้ว, ทั้งหมด)
    segment ที่ "ไม่ได้ยิน" ไม่ใส่ใน reference — คำที่ ASR ใส่ตรงนั้นจะนับเป็น insertion (เข้มกว่า ไม่ใช่ใจดีกว่า)"""
    segs = clip["segments"]
    done = [reviewed.get(str(s["i"])) for s in segs]
    n_done = sum(1 for d in done if d and d.get("reviewed"))
    if n_done < len(segs):
        return None, n_done, len(segs)
    return " ".join(d["ref"] for d in done if not d.get("inaudible")), n_done, len(segs)


def score(data_dir: Path, hyp_path: Path | None) -> int:
    segments = json.loads((data_dir / "segments.json").read_text(encoding="utf-8"))
    ref_path = data_dir / "reference.json"
    reference = json.loads(ref_path.read_text(encoding="utf-8")) if ref_path.is_file() else {}
    hypotheses: dict[str, dict[str, str]] = {
        f"prepare ({segments['model']} {segments['device']} {segments['compute_type']})":
            {name: " ".join(s["asr"] for s in clip["segments"]) for name, clip in segments["clips"].items()},
    }
    if hyp_path:
        raw = json.loads(hyp_path.read_text(encoding="utf-8"))
        for manifest, run in raw.items():  # voice_worker_eval_clips.py format: {manifest: {clips: {name: {text}}}}
            clips = run.get("clips", {}) if isinstance(run, dict) else {}
            hypotheses[f"worker {manifest}"] = {name: (row.get("text") or "") for name, row in clips.items()}
    report: dict = {"metric": "CER (characters, spaces and punctuation removed)", "clips": {}}
    for name, clip in segments["clips"].items():
        ref, n_done, n_all = reference_text(clip, reference.get(name, {}))
        entry: dict = {"reviewed": f"{n_done}/{n_all}"}
        if ref is None:
            entry["status"] = "incomplete — not scored"
        else:
            nref = normalize(ref)
            entry["reference_chars"] = len(nref)
            entry["inaudible_segments"] = sum(1 for v in reference.get(name, {}).values() if v.get("inaudible"))
            for label, hyps in hypotheses.items():
                if name in hyps:
                    dist = edit_distance(nref, normalize(hyps[name]))
                    entry[label] = {"cer": round(dist / max(len(nref), 1), 4), "edits": dist}
        report["clips"][name] = entry
    print(json.dumps(report, ensure_ascii=False, indent=1))
    (data_dir / "cer-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


# ── serve ──────────────────────────────────────────────────────────────
PAGE = """<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ตรวจ transcript</title>
<style>
:root{--bg:#fafaf7;--fg:#1d1d1b;--muted:#6b6b66;--line:#e2e1db;--card:#fff;--accent:#2f6f4f;--warn:#9a5b00;--sel:#eef6f1}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ecebe6;--muted:#9b9a93;--line:#2c2c2a;--card:#1c1c1a;--accent:#7cc4a0;--warn:#e0a34a;--sel:#1f2d26}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,"Noto Sans Thai",sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 16px;z-index:2}
h1{font-size:17px;margin:0 0 4px}.sub{color:var(--muted);font-size:13px}
main{max-width:980px;margin:0 auto;padding:16px}
.clip{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:0 0 18px}
.clip h2{font-size:15px;margin:0 0 8px;display:flex;gap:10px;align-items:baseline}.clip h2 span{color:var(--muted);font-weight:400;font-size:13px}
audio{width:100%;margin:4px 0 10px}
.seg{display:grid;grid-template-columns:auto 96px 1fr auto;gap:8px;align-items:start;padding:8px 0;border-top:1px solid var(--line)}
.seg.playing{background:var(--sel)}.seg.done .t{color:var(--accent)}
button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:6px;padding:4px 10px;cursor:pointer}
button:hover{border-color:var(--accent)}
.t{font:12px ui-monospace,monospace;color:var(--muted);padding-top:6px}
textarea{width:100%;font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 8px;resize:vertical;min-height:38px}
.opts{display:flex;flex-direction:column;gap:4px;font-size:13px;white-space:nowrap}
.asr{font-size:12px;color:var(--muted);margin-top:3px}
.status{font-size:13px}.ok{color:var(--accent)}.bad{color:var(--warn)}
.draft{font-size:12.5px;margin-top:4px;padding:4px 8px;border-left:3px solid var(--line)}.draft.chg{border-color:var(--accent)}
.draft button{font-size:12px;padding:1px 8px;margin-left:6px}.seg.listen{box-shadow:inset 3px 0 0 var(--warn)}
.flag{color:var(--warn);font-size:12px}
.risk{font:11px ui-monospace,monospace;border:1px solid var(--line);border-radius:10px;padding:0 6px;margin-left:6px}
.risk.hi{border-color:var(--warn);color:var(--warn)}
</style></head><body>
<header><h1>ตรวจ transcript ภาษาไทย</h1>
<div class="sub">ช่วงที่ขีดส้ม = ควรฟังก่อน (ถอดไม่นิ่ง หรือ LLM สงสัย) · ถ้ามี "ร่าง LLM" เป็นแค่ข้อเสนอจากการอ่านข้อความ ไม่ได้ฟังเสียง ต้องฟังเองก่อนติ๊กเสมอ ·
กด ▶ เพื่อฟังทีละช่วง แก้ข้อความให้ตรงกับที่ได้ยินจริง แล้วติ๊ก "ตรวจแล้ว" · ช่วงที่ฟังไม่ออกให้ติ๊ก "ไม่ได้ยิน" · บันทึกอัตโนมัติ
· <span id="prog"></span> · <span class="status" id="st"></span></div></header>
<main id="app">กำลังโหลด…</main>
<script>
const $=s=>document.querySelector(s);let DATA=null,stopAt=null,playingRow=null;
const fmt=x=>{const m=Math.floor(x/60),s=(x%60).toFixed(1).padStart(4,"0");return m+":"+s};
function progress(){let d=0,a=0;for(const c of DATA.clips)for(const s of c.segments){a++;if(s.reviewed)d++}$("#prog").textContent="ตรวจแล้ว "+d+"/"+a+" ช่วง"}
let timers={};
const esc=t=>String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;");
// ฉบับร่างจาก LLM (อ่านแค่ข้อความ ไม่ได้ฟังเสียง) — เป็นตัวช่วยเท่านั้น: กด "ใช้ข้อความนี้" แล้วยังต้องฟังและติ๊ก "ตรวจแล้ว" เอง
// ความไม่นิ่ง = ถอดซ้ำหลายแบบแล้วผลต่างกันแค่ไหน (สูง = โมเดลไม่มั่นใจ = ควรฟังก่อน)
function riskHtml(r){if(typeof r!=="number")return "";return `<span class="risk${r>=0.2?" hi":""}" title="ความไม่นิ่งของการถอดเสียงช่วงนี้">${r.toFixed(2)}</span>`}
function draftHtml(d){if(!d)return "";const flag=d.listen_first?'<span class="flag"> · ควรฟังก่อน</span>':"";
 if(!d.changed)return `<div class="draft">ร่าง LLM: ไม่แก้ (${esc(d.confidence||"")})${flag}</div>`;
 return `<div class="draft chg">ร่าง LLM: ${esc(d.text)} <button class="use" type="button">ใช้ข้อความนี้</button><br><span class="asr">${esc(d.confidence||"")} · ${esc(d.reason||"")}</span>${flag}</div>`}
function save(clip){clearTimeout(timers[clip.name]);$("#st").textContent="กำลังบันทึก…";$("#st").className="status";
 timers[clip.name]=setTimeout(async()=>{try{const r=await fetch("/api/save",{method:"POST",headers:{"Content-Type":"application/json"},
 body:JSON.stringify({clip:clip.name,segments:clip.segments.map(s=>({i:s.i,ref:s.ref,inaudible:!!s.inaudible,reviewed:!!s.reviewed}))})});
 if(!r.ok)throw new Error(r.status);$("#st").textContent="บันทึกแล้ว";$("#st").className="status ok"}catch(e){$("#st").textContent="บันทึกไม่สำเร็จ: "+e.message;$("#st").className="status bad"}},400)}
function render(){const app=$("#app");app.innerHTML="";
 for(const clip of DATA.clips){const box=document.createElement("section");box.className="clip";
  box.innerHTML=`<h2>${clip.name}<span>${fmt(clip.duration)} · ${clip.segments.length} ช่วง</span></h2><audio controls preload="auto" src="/audio/${encodeURIComponent(clip.name)}.wav"></audio>`;
  const audio=box.querySelector("audio");
  audio.addEventListener("timeupdate",()=>{if(stopAt!==null&&audio.currentTime>=stopAt){audio.pause();stopAt=null;if(playingRow)playingRow.classList.remove("playing")}});
  for(const s of clip.segments){const row=document.createElement("div");row.className="seg"+(s.reviewed?" done":"");
   row.innerHTML=`<button title="ฟังช่วงนี้">▶</button><div class="t">${fmt(s.start)}–${fmt(s.end)}${riskHtml(s.instability)}</div>
   <div><textarea rows="2"></textarea><div class="asr">ASR เดิม: ${esc(s.asr)}</div>${draftHtml(s.draft)}</div>
   <div class="opts"><label><input type="checkbox" class="rv"> ตรวจแล้ว</label><label><input type="checkbox" class="na"> ไม่ได้ยิน</label></div>`;
   if((s.draft&&s.draft.listen_first)||s.instability>=0.2)row.classList.add("listen");
   const ta=row.querySelector("textarea"),rv=row.querySelector(".rv"),na=row.querySelector(".na");
   const use=row.querySelector(".use");if(use)use.onclick=()=>{ta.value=s.draft.text;s.ref=ta.value;save(clip)};
   ta.value=s.ref;rv.checked=!!s.reviewed;na.checked=!!s.inaudible;
   row.querySelector("button").onclick=()=>{document.querySelectorAll("audio").forEach(a=>{if(a!==audio)a.pause()});
    if(playingRow)playingRow.classList.remove("playing");playingRow=row;row.classList.add("playing");
    audio.currentTime=Math.max(0,s.start-0.15);stopAt=s.end+0.15;audio.play()};
   const mark=()=>{row.classList.toggle("done",!!s.reviewed);progress();save(clip)};
   ta.oninput=()=>{s.ref=ta.value;s.reviewed=true;rv.checked=true;mark()};
   rv.onchange=()=>{s.reviewed=rv.checked;mark()};
   na.onchange=()=>{s.inaudible=na.checked;if(na.checked){s.reviewed=true;rv.checked=true}mark()};
   box.appendChild(row)}
  app.appendChild(box)}
 progress()}
fetch("/api/data").then(r=>r.json()).then(d=>{DATA=d;render()}).catch(e=>{$("#app").textContent="โหลดข้อมูลไม่ได้: "+e});
</script></body></html>"""


def make_handler(clips_dir: Path, data_dir: Path):
    segments_path, ref_path = data_dir / "segments.json", data_dir / "reference.json"
    draft_path = data_dir / "reference.fable-draft.json"
    priority_path = data_dir / "reference.priority.json"  # คะแนนความไม่นิ่งจาก priority.py (ถ้ามี)  # ร่างจาก LLM (ถ้ามี) — แสดงเป็นข้อเสนอ ไม่เคยเขียนลง reference.json เอง
    allowed = {p.stem: p for p in clips_dir.glob("*.wav")}

    def load_payload() -> dict:
        seg = json.loads(segments_path.read_text(encoding="utf-8"))
        ref = json.loads(ref_path.read_text(encoding="utf-8")) if ref_path.is_file() else {}
        drafts = json.loads(draft_path.read_text(encoding="utf-8")).get("clips", {}) if draft_path.is_file() else {}
        risk = json.loads(priority_path.read_text(encoding="utf-8")).get("clips", {}) if priority_path.is_file() else {}
        clips = []
        for name, clip in seg["clips"].items():
            if name not in allowed:
                continue
            saved = ref.get(name, {})
            rows = []
            for s in clip["segments"]:
                got = saved.get(str(s["i"]), {})
                rows.append({**s, "ref": got.get("ref", s["asr"]), "inaudible": bool(got.get("inaudible")),
                             "reviewed": bool(got.get("reviewed"))})
                scored = risk.get(name, {}).get(str(s["i"]))
                if scored is not None:
                    rows[-1]["instability"] = scored.get("instability")
                d = drafts.get(name, {}).get(str(s["i"]))
                if d:
                    rows[-1]["draft"] = {"text": d.get("draft", s["asr"]), "changed": bool(d.get("changed")),
                                         "confidence": d.get("confidence", ""), "reason": d.get("reason", ""),
                                         "listen_first": bool(d.get("listen_first"))}
            clips.append({"name": name, "duration": clip["duration"], "segments": rows})
        return {"clips": clips}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):  # เงียบ ไม่พิมพ์ทุก request
            return

        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):  # noqa: N802
            if self.path == "/":
                return self._send(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")
            if self.path == "/api/data":
                return self._send(200, json.dumps(load_payload(), ensure_ascii=False).encode("utf-8"), "application/json")
            m = re.fullmatch(r"/audio/([A-Za-z0-9._-]+)\.wav", self.path)
            if m and m.group(1) in allowed:  # allowlist: ชื่อไฟล์ที่อยู่ใน clips dir เท่านั้น กัน path traversal
                return self._send(200, allowed[m.group(1)].read_bytes(), "audio/wav")
            return self._send(404, b"not found", "text/plain")

        def do_POST(self):  # noqa: N802
            if self.path != "/api/save":
                return self._send(404, b"not found", "text/plain")
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > 2_000_000:
                return self._send(413, b"bad size", "text/plain")
            try:
                body = json.loads(self.rfile.read(length).decode("utf-8"))
                clip = body["clip"]
                if clip not in allowed:
                    return self._send(400, b"unknown clip", "text/plain")
                rows = {str(int(s["i"])): {"ref": str(s["ref"]), "inaudible": bool(s["inaudible"]), "reviewed": bool(s["reviewed"])}
                        for s in body["segments"]}
            except (ValueError, KeyError, TypeError):
                return self._send(400, b"bad payload", "text/plain")
            with _SAVE_LOCK:
                current = json.loads(ref_path.read_text(encoding="utf-8")) if ref_path.is_file() else {}
                current[clip] = rows
                tmp = ref_path.with_suffix(".json.tmp")
                tmp.write_text(json.dumps(current, ensure_ascii=False, indent=1), encoding="utf-8")
                os.replace(tmp, ref_path)
            return self._send(200, b'{"ok":true}', "application/json")

    return Handler


def serve(clips_dir: Path, data_dir: Path, port: int) -> int:
    if not (data_dir / "segments.json").is_file():
        print(f"missing {data_dir / 'segments.json'} — run prepare first", file=sys.stderr)
        return 2
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(clips_dir, data_dir))
    print(f"review page: http://127.0.0.1:{port}/  (saves to {data_dir / 'reference.json'})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


def main(argv: list[str] | None = None) -> int:
    api_dir = Path(__file__).resolve().parents[2] / "apps" / "api"
    parser = argparse.ArgumentParser(description="Thai reference transcript review + CER")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prepare")
    p.add_argument("--clips", type=Path, required=True)
    p.add_argument("--data", type=Path, required=True)
    p.add_argument("--model-dir", type=Path, default=api_dir / "models" / "faster-whisper" / "large-v3-turbo")
    p.add_argument("--device", default="cpu", help="cpu by default: the GPU may be busy (e.g. a soak run)")
    p.add_argument("--compute-type", default="int8")
    s = sub.add_parser("serve")
    s.add_argument("--clips", type=Path, required=True)
    s.add_argument("--data", type=Path, required=True)
    s.add_argument("--port", type=int, default=8830)
    c = sub.add_parser("score")
    c.add_argument("--data", type=Path, required=True)
    c.add_argument("--hyp", type=Path, help="voice_worker_eval_clips.py results.json to score as well")
    args = parser.parse_args(argv)
    if args.cmd == "prepare":
        return prepare(args.clips, args.data, args.model_dir, args.device, args.compute_type)
    if args.cmd == "serve":
        return serve(args.clips, args.data, args.port)
    return score(args.data, args.hyp)


if __name__ == "__main__":
    raise SystemExit(main())
