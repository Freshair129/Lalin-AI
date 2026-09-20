#!/usr/bin/env python3
"""Offline eval helper: speaker diarization (pyannote 3.1) + merge into a faster-whisper transcript.

**นอก scope ของ voice worker** (handoff = ASR/TTS เท่านั้น) — ใช้สร้าง reference transcript แบบมีผู้พูดจากงานจริง
เพื่อทำ WER/ตรวจคุณภาพ ไม่ต่อเข้า worker ต้องรันใน `apps/api/.venv-diar` (torch cu128 + pyannote.audio; ดู
`apps/api/requirements-diar.lock.txt`) และผู้ใช้ต้อง login Hugging Face + ยอมรับเงื่อนไข gated repos ด้วยตัวเอง:
  pyannote/speaker-diarization-3.1, pyannote/segmentation-3.0, pyannote/wespeaker-voxceleb-resnet34-LM
script นี้ไม่รับ/ไม่พิมพ์ token — huggingface_hub อ่านจาก login ของผู้ใช้เอง

ขั้นตอน:
  1) transcribe   wav → <out>.json  (large-v3-turbo, `--language th` บังคับ; ห้าม auto กับงานไทย — ดู Slice B evidence §5)
  2) diarize      wav → <out>.diar.json (turns: start/end/speaker)
  3) merge        transcript.json + diar.json → <out>.txt  `[hh:mm:ss] S1: ข้อความ` (S? = ทับซ้อน/จับคู่ < 50%)

ตัวอย่าง (PowerShell จาก apps/api):
  .\.venv-diar\Scripts\python.exe ..\..\tools\verify\diarize_transcript.py all runtime\eval\meeting16k.wav --out runtime\eval\meeting
  (เสียงงานจริงเป็นข้อมูลส่วนตัว → เก็บใต้ runtime/ ที่ gitignored เท่านั้น)
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import time
from pathlib import Path


def _register_cuda_dlls() -> None:
    """faster-whisper (CTranslate2) บน Windows ต้องเห็น nvidia/*/bin ของ venv (เหมือน engine_faster_whisper)."""
    if os.name != "nt":
        return
    for directory in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
        try:
            os.add_dll_directory(directory)
        except OSError:
            continue
        os.environ["PATH"] = directory + os.pathsep + os.environ.get("PATH", "")


def transcribe(wav: Path, out_json: Path, model_dir: Path, language: str, device: str, compute_type: str) -> None:
    _register_cuda_dlls()
    from faster_whisper import WhisperModel

    model = WhisperModel(str(model_dir), device=device, compute_type=compute_type, local_files_only=True)
    started = time.time()
    segments_iter, info = model.transcribe(str(wav), language=language, beam_size=5, vad_filter=True,
                                           vad_parameters={"min_silence_duration_ms": 700})
    segments = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(),
                 "no_speech_prob": round(s.no_speech_prob, 3), "avg_logprob": round(s.avg_logprob, 3)} for s in segments_iter]
    took = time.time() - started
    out_json.write_text(json.dumps({"language": info.language, "duration": info.duration, "model": model_dir.name,
                                    "transcribe_s": round(took, 1), "segments": segments}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"transcribe: {len(segments)} segments, {info.duration:.0f} s audio, {took:.0f} s, rtf {took / max(info.duration, 1):.3f}")


def diarize(wav: Path, out_json: Path, pipeline_name: str, device: str) -> None:
    import soundfile as sf
    import torch
    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained(pipeline_name)  # token มาจาก login ของผู้ใช้ (huggingface-cli login)
    if device.startswith("cuda") and torch.cuda.is_available():
        pipeline.to(torch.device(device))
    audio, sample_rate = sf.read(str(wav), dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    started = time.time()
    result = pipeline({"waveform": torch.from_numpy(audio).unsqueeze(0), "sample_rate": sample_rate})
    annotation = getattr(result, "speaker_diarization", result)  # pyannote 4 คืน object ห่อ, 3.x คืน Annotation ตรง
    turns = [{"start": round(seg.start, 2), "end": round(seg.end, 2), "speaker": speaker}
             for seg, _, speaker in annotation.itertracks(yield_label=True)]
    out_json.write_text(json.dumps(turns, ensure_ascii=False), encoding="utf-8")
    speakers = sorted({t["speaker"] for t in turns})
    print(f"diarize: {len(turns)} turns, {len(speakers)} speakers, {time.time() - started:.0f} s")


def merge(transcript_json: Path, diar_json: Path, out_txt: Path) -> None:
    segments = json.loads(transcript_json.read_text(encoding="utf-8"))["segments"]
    turns = json.loads(diar_json.read_text(encoding="utf-8"))
    names = sorted({t["speaker"] for t in turns})
    label = {name: f"S{i + 1}" for i, name in enumerate(names)}

    def speaker_for(a: float, b: float) -> tuple[str, float]:
        overlap: dict[str, float] = {}
        for t in turns:
            ov = min(b, t["end"]) - max(a, t["start"])
            if ov > 0:
                overlap[t["speaker"]] = overlap.get(t["speaker"], 0.0) + ov
        if not overlap:
            return "UNKNOWN", 0.0
        best = max(overlap, key=overlap.get)
        return best, overlap[best] / max(b - a, 1e-6)

    lines: list[str] = []
    previous = None
    for s in segments:
        speaker, confidence = speaker_for(s["start"], s["end"])
        tag = label.get(speaker, speaker)
        minutes, seconds = divmod(int(s["start"]), 60)
        hours, minutes = divmod(minutes, 60)
        if tag != previous:
            lines.append("")
            previous = tag
        lines.append(f"[{hours:02d}:{minutes:02d}:{seconds:02d}] {tag}{'' if confidence >= 0.5 else '?'}: {s['text']}")
    out_txt.write_text("\n".join(lines).lstrip("\n") + "\n", encoding="utf-8")
    talk: dict[str, float] = {}
    for t in turns:
        talk[label[t["speaker"]]] = talk.get(label[t["speaker"]], 0.0) + t["end"] - t["start"]
    print("merge:", {k: f"{v / 60:.1f} min" for k, v in sorted(talk.items())}, "->", out_txt)


def main(argv: list[str] | None = None) -> int:
    api_dir = Path(__file__).resolve().parents[2] / "apps" / "api"
    parser = argparse.ArgumentParser(description="diarize + merge into a whisper transcript (offline eval helper)")
    parser.add_argument("step", choices=["transcribe", "diarize", "merge", "all"])
    parser.add_argument("wav", type=Path, help="mono/stereo wav (16 kHz recommended)")
    parser.add_argument("--out", type=Path, required=True, help="output stem: <out>.json / <out>.diar.json / <out>.txt")
    parser.add_argument("--language", default="th", help="forced language for whisper (auto is unsafe for Thai)")
    parser.add_argument("--model-dir", type=Path, default=api_dir / "models" / "faster-whisper" / "large-v3-turbo")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--compute-type", default="int8_float16")
    parser.add_argument("--pipeline", default="pyannote/speaker-diarization-3.1")
    args = parser.parse_args(argv)
    transcript_json = args.out.with_suffix(".json")
    diar_json = args.out.with_suffix(".diar.json")
    out_txt = args.out.with_suffix(".txt")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    if args.step in {"transcribe", "all"}:
        transcribe(args.wav, transcript_json, args.model_dir, args.language, args.device, args.compute_type)
    if args.step in {"diarize", "all"}:
        diarize(args.wav, diar_json, args.pipeline, args.device)
    if args.step in {"merge", "all"}:
        merge(transcript_json, diar_json, out_txt)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
