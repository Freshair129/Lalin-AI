#!/usr/bin/env python3
"""จัดลำดับ segment ที่คนควรฟังก่อน โดยไม่ต้องมีเฉลย — เครื่องมือช่วยของ wer_review.py

ถอดเสียงช่วงเดิมซ้ำหลายแบบ (beam 5, beam 1, temperature 0.6) แล้ววัดว่าผลต่างกันแค่ไหน (CER เฉลี่ยระหว่างคู่):
ต่างมาก = โมเดลไม่มั่นใจ = มีโอกาสผิดสูง · ต่างน้อย = โมเดลมั่นใจ (ยังผิดได้ แต่น้อยกว่า)
เป็นแค่การจัดลำดับ **ไม่ใช่เฉลย** และไม่แตะ reference.json — เฉลยต้องมาจากคนฟังเท่านั้น

ใช้ (จาก apps/api):
  .venv-speech/Scripts/python.exe ../../tools/verify/asr_segment_instability.py --clips runtime/eval/asr-th --data runtime/eval/wer-review
ผลลัพธ์: <data>/reference.priority.json — หน้า wer_review serve จะโชว์คะแนนนี้และขีดสีส้มช่วงที่ควรฟังก่อน
"""

import argparse
import json, sys, wave
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from wer_review import normalize, edit_distance
from faster_whisper import WhisperModel

parser = argparse.ArgumentParser(description="rank review segments by decode instability")
parser.add_argument("--clips", type=Path, required=True)
parser.add_argument("--data", type=Path, required=True)
parser.add_argument("--model-dir", type=Path, default=Path(__file__).resolve().parents[2] / "apps" / "api" / "models" / "faster-whisper" / "large-v3-turbo")
parser.add_argument("--device", default="cpu")
parser.add_argument("--compute-type", default="int8")
parser.add_argument("--cpu-threads", type=int, default=8)
args = parser.parse_args()
DATA, CLIPS = args.data, args.clips
seg = json.loads((DATA / "segments.json").read_text(encoding="utf-8"))
draft = json.loads((DATA / "reference.fable-draft.json").read_text(encoding="utf-8")).get("clips", {}) if (DATA / "reference.fable-draft.json").is_file() else {}
model = WhisperModel(str(args.model_dir), device=args.device, compute_type=args.compute_type, cpu_threads=args.cpu_threads)
VARIANTS = [{"beam_size": 5}, {"beam_size": 1}, {"beam_size": 5, "temperature": 0.6}]

def slice_wav(src: Path, start: float, end: float, out: Path) -> None:
    with wave.open(str(src), "rb") as r:
        rate = r.getframerate()
        r.setpos(max(0, int(start * rate)))
        frames = r.readframes(max(1, int((end - start) * rate)))
        with wave.open(str(out), "wb") as w:
            w.setnchannels(r.getnchannels()); w.setsampwidth(r.getsampwidth()); w.setframerate(rate)
            w.writeframes(frames)

out: dict = {"_note": "instability = mean pairwise CER between decodes of the same audio; high = the model is unsure", "clips": {}}
tmp = DATA / "_seg.wav"
rows = []
for name, clip in seg["clips"].items():
    out["clips"][name] = {}
    for s in clip["segments"]:
        slice_wav(CLIPS / f"{name}.wav", s["start"], s["end"], tmp)
        texts = []
        for kw in VARIANTS:
            segs, _ = model.transcribe(str(tmp), language="th", vad_filter=False, **kw)
            texts.append(normalize("".join(x.text for x in segs)))
        pairs = [(a, b) for i, a in enumerate(texts) for b in texts[i + 1:]]
        scores = [edit_distance(a, b) / max(len(a), len(b), 1) for a, b in pairs]
        inst = round(sum(scores) / len(scores), 3)
        d = draft.get(name, {}).get(str(s["i"]), {})
        out["clips"][name][str(s["i"])] = {"instability": inst, "variants": texts,
                                           "llm_changed": bool(d.get("changed")), "llm_listen_first": bool(d.get("listen_first"))}
        rows.append((inst, name, s["i"], bool(d.get("listen_first")), s["asr"][:40]))
        print(f"{name:14s} {s['i']:2d} instability {inst:.3f} {'LLM-flag' if d.get('listen_first') else '        '} {s['asr'][:40]}", flush=True)
tmp.unlink(missing_ok=True)
(DATA / "reference.priority.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
rows.sort(reverse=True)
print("\nTOP 12 to listen to first:")
for inst, name, i, flag, text in rows[:12]:
    print(f"  {inst:.3f} {name}#{i} {'+LLM' if flag else '    '} {text}")
print("\nunstable (>=0.2):", sum(1 for r in rows if r[0] >= 0.2), "| clean (<0.05):", sum(1 for r in rows if r[0] < 0.05))
