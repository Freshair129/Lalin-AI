#!/usr/bin/env python3
"""Evidence for D14 (VAD) / D15 (glossary) — runs OUTSIDE the voice worker, no contract change.

รันสามสภาพบนคลิปเดียวกันแล้วเทียบ:
  baseline   : ไม่มี initial_prompt, vad ตามที่สั่ง
  glossary   : initial_prompt จากศัพท์จริงของงาน (ชื่อผู้ร่วมประชุมจาก tile ของ Meet + คำบนสไลด์ที่แชร์)
  wrong      : initial_prompt จากศัพท์คนละโดเมน — ต้องพิสูจน์ว่า glossary ผิดบริบท **ทำให้แย่ลง** ได้จริง

**สำคัญ:** faster-whisper บน GPU int8_float16 **ไม่ deterministic** — input เดิมให้ผลต่างกันทุกครั้ง
(วัดแล้ว: farfield-noisy vad=False ให้ foreign chars 16 / 2 / 6 ใน 3 รอบติดกัน) ดังนั้นทุกตัวเลขต้องมาจาก
หลายรอบ (`--repeats`, default 3) และรายงานเป็น median + ช่วง ห้ามสรุปจากรอบเดียว

ตัวชี้วัด (ไม่มี reference transcript จึงเป็น proxy ที่ตรวจซ้ำได้):
  term_hits        จำนวนศัพท์ใน glossary ที่โผล่ในผลลัพธ์ (เป้าหมายของ D15)
  foreign_chars    อักขระ CJK/ซีริลลิก/ฮันกึล/เทวนาครี = hallucination ข้ามภาษา (เป้าหมายของ D14)
  thai_ratio       สัดส่วนอักขระไทยต่อตัวอักษรทั้งหมด
  avg_logprob      ค่าเฉลี่ยถ่วงน้ำหนักด้วยความยาว segment
  leak             ศัพท์ใน prompt ที่โผล่ทั้งที่ไม่ได้อยู่ในผล baseline และไม่น่าจะถูกพูด (เช็คด้วยมือจาก wrong run)

ใช้: .venv-speech\\Scripts\\python.exe tools/verify/asr_prompt_vad_ab.py --clips apps/api/runtime/eval/asr-th --out <dir>
คลิปงานจริงอยู่ใต้ runtime/ (gitignored) — ห้าม commit เสียงหรือผลถอดความ
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
import time
from pathlib import Path

FOREIGN_RE = re.compile(r"[一-鿿぀-ヿЀ-ӿ가-힯ऀ-ॿ]")
THAI_RE = re.compile(r"[฀-๿]")
LETTER_RE = re.compile(r"[^\W\d_]", re.UNICODE)

# ศัพท์จริงของงาน: ชื่อจาก tile ของ Google Meet + ข้อความบนสไลด์ที่แชร์ในประชุม (ตรวจจากเฟรมวิดีโอ)
GLOSSARY_REAL = [
    "Wannapa Prajaktip", "Phavida Rattanamongkolkul", "FreshAir iBozz", "Etoh Cols Group",
    "Etoh Project", "เอทานอล", "แอลกอฮอล์", "ดิสทริบิวเตอร์", "ขายส่ง", "ขายปลีก",
    "กลุ่มลูกค้า", "ตลาดในไทย", "Personal Care", "Cosmetics", "Pharmaceutical",
    "Food Extract", "Industrial Cleaning", "แบรนด์", "มาร์เก็ตติ้ง", "สินค้า",
]
# ศัพท์คนละโดเมน (การแพทย์/ดาราศาสตร์) เพื่อทดสอบว่า prompt ผิดบริบททำให้แย่ลงหรือไม่
GLOSSARY_WRONG = [
    "กล้องโทรทรรศน์", "ดาวพฤหัสบดี", "กาแล็กซีทางช้างเผือก", "หลุมดำ", "รังสีแกมมา",
    "เคมีบำบัด", "ต่อมไทรอยด์", "คลื่นไฟฟ้าหัวใจ", "ยาปฏิชีวนะ", "วัคซีน",
    "Telescope", "Jupiter", "Chemotherapy", "Antibiotic", "Radiology",
]


def register_cuda_dlls() -> None:
    if os.name != "nt":
        return
    for directory in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
        try:
            os.add_dll_directory(directory)
        except OSError:
            continue
        os.environ["PATH"] = directory + os.pathsep + os.environ.get("PATH", "")


def prompt_from(terms: list[str]) -> str:
    """initial_prompt ของ whisper = ข้อความธรรมดา; คั่นด้วยจุลภาคให้เป็นบริบทคำศัพท์"""
    return "คำศัพท์ที่ใช้ในบทสนทนานี้: " + ", ".join(terms)


def measure(text: str, segments: list, terms: list[str]) -> dict:
    letters = len(LETTER_RE.findall(text))
    total_s = sum(s["end"] - s["start"] for s in segments) or 1.0
    return {
        "chars": len(text),
        "term_hits": sum(1 for t in terms if t.lower() in text.lower()),
        "terms_found": [t for t in terms if t.lower() in text.lower()],
        "foreign_chars": len(FOREIGN_RE.findall(text)),
        "thai_ratio": round(len(THAI_RE.findall(text)) / letters, 3) if letters else 0.0,
        "avg_logprob": round(sum(s["avg_logprob"] * (s["end"] - s["start"]) for s in segments) / total_s, 3),
        "n_segments": len(segments),
    }


def run(model, wav: Path, *, prompt: str | None, vad: bool, min_silence: int) -> tuple[str, list, float]:
    started = time.perf_counter()
    kwargs = {"language": "th", "beam_size": 5, "vad_filter": vad}
    if vad:
        kwargs["vad_parameters"] = {"min_silence_duration_ms": min_silence}
    if prompt:
        kwargs["initial_prompt"] = prompt
    seg_iter, _info = model.transcribe(str(wav), **kwargs)
    segments = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(),
                 "avg_logprob": round(s.avg_logprob, 3), "no_speech_prob": round(s.no_speech_prob, 3)} for s in seg_iter]
    return " ".join(s["text"] for s in segments), segments, time.perf_counter() - started


def main(argv: list[str] | None = None) -> int:
    api_dir = Path(__file__).resolve().parents[2] / "apps" / "api"
    parser = argparse.ArgumentParser(description="A/B evidence for D14 (VAD) and D15 (glossary)")
    parser.add_argument("--clips", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, default=api_dir / "models" / "faster-whisper" / "large-v3-turbo")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--compute-type", default="int8_float16")
    parser.add_argument("--min-silence-ms", type=int, default=700)
    parser.add_argument("--repeats", type=int, default=3, help="รันซ้ำต่อเงื่อนไข (engine ไม่ deterministic)")
    args = parser.parse_args(argv)

    register_cuda_dlls()
    from faster_whisper import WhisperModel

    model = WhisperModel(str(args.model_dir), device=args.device, compute_type=args.compute_type, local_files_only=True)
    clips = sorted(args.clips.glob("*.wav"))
    args.out.mkdir(parents=True, exist_ok=True)
    conditions = [
        ("baseline_novad", None, False),
        ("glossary_novad", prompt_from(GLOSSARY_REAL), False),
        ("wrong_novad", prompt_from(GLOSSARY_WRONG), False),
        ("baseline_vad", None, True),
        ("glossary_vad", prompt_from(GLOSSARY_REAL), True),
    ]
    report: dict = {"model": args.model_dir.name, "device": args.device, "compute_type": args.compute_type,
                    "min_silence_ms": args.min_silence_ms, "glossary_real": GLOSSARY_REAL,
                    "glossary_wrong": GLOSSARY_WRONG, "clips": {}}
    def med(values: list[float]) -> float:
        ordered = sorted(values)
        return ordered[len(ordered) // 2]

    print(f"{'clip':16s} {'condition':16s} {'hits':>10s} {'wrong':>5s} {'foreign':>12s} {'logprob':>8s} {'chars':>12s}")
    for wav in clips:
        rows = {}
        for name, prompt, vad in conditions:
            runs = []
            for _ in range(args.repeats):
                text, segments, took = run(model, wav, prompt=prompt, vad=vad, min_silence=args.min_silence_ms)
                stats = measure(text, segments, GLOSSARY_REAL)
                wrong = measure(text, segments, GLOSSARY_WRONG)
                stats["wrong_term_hits"] = wrong["term_hits"]
                stats["wrong_terms_found"] = wrong["terms_found"]
                stats["seconds"] = round(took, 2)
                stats["text"] = text
                runs.append(stats)
            agg = {
                "repeats": args.repeats,
                "identical_across_runs": len({r["text"] for r in runs}) == 1,
                "term_hits": [r["term_hits"] for r in runs],
                "wrong_term_hits": [r["wrong_term_hits"] for r in runs],
                "foreign_chars": [r["foreign_chars"] for r in runs],
                "avg_logprob": [r["avg_logprob"] for r in runs],
                "chars": [r["chars"] for r in runs],
                "n_segments": [r["n_segments"] for r in runs],
                "median": {k: med([r[k] for r in runs]) for k in ("term_hits", "foreign_chars", "avg_logprob", "chars", "n_segments")},
                "runs": runs,
            }
            rows[name] = agg
            m = agg["median"]
            print(f"{wav.stem:16s} {name:16s} {m['term_hits']:4.0f} {str(agg['term_hits']):>5s} "
                  f"{m['foreign_chars']:4.0f} {str(agg['foreign_chars']):>7s} "
                  f"{m['avg_logprob']:8.3f} {m['chars']:5.0f} {str(agg['chars']):>6s}", flush=True)
        report["clips"][wav.stem] = rows
    report["determinism_note"] = "engine is not deterministic on GPU int8_float16; every figure is a median over --repeats runs"
    (args.out / "ab-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\nwrote", args.out / "ab-results.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
