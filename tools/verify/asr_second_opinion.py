#!/usr/bin/env python3
"""ถอดเสียงแต่ละ segment ซ้ำด้วยโมเดลที่สอง (คนละตระกูล weights) แล้วเทียบกับผลของ large-v3-turbo

ทำไม: ช่วงที่สองโมเดลถอดตรงกันมีโอกาสถูกสูง ส่วนช่วงที่ต่างกันคือช่วงที่คนควรฟังก่อน
**ไม่ใช่เฉลย**: สองโมเดลผิดพร้อมกันได้ (โดยเฉพาะคำเฉพาะและเสียงไกล) — เฉลยยังต้องมาจากคนฟัง
ไฟล์ที่เขียน: ``<data>/reference.priority.json`` (เติมฟิลด์ ``second_model``/``disagreement``) — ไม่แตะ reference.json

โมเดลที่สอง: weights ที่มีอยู่ในเครื่องแล้ว (HF cache) เช่น ``biodatlab/whisper-th-large-combined``
(whisper large fine-tune ภาษาไทย) โหลดผ่าน transformers แบบ offline ล้วน (``HF_HUB_OFFLINE=1``)

ใช้ (จาก apps/api, venv ที่มี torch + transformers):
  .venv-tts/Scripts/python.exe ../../tools/verify/asr_second_opinion.py \
      --clips runtime/eval/asr-th --data runtime/eval/wer-review --model-dir <snapshot dir> --device cuda:0
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from wer_review import edit_distance, normalize  # noqa: E402


def slice_samples(src: Path, start: float, end: float):
    import numpy as np

    with wave.open(str(src), "rb") as handle:
        rate = handle.getframerate()
        handle.setpos(max(0, int(start * rate)))
        raw = handle.readframes(max(1, int((end - start) * rate)))
        channels = handle.getnchannels()
    audio = np.frombuffer(raw, dtype=np.int16).astype("float32") / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, rate


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="second-model transcription for the Thai review segments")
    parser.add_argument("--clips", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True, help="local snapshot directory (no download)")
    parser.add_argument("--device", default="cuda:0")
    args = parser.parse_args(argv)

    os.environ["HF_HUB_OFFLINE"] = "1"  # ห้ามแตะเครือข่าย: weights ต้องมีอยู่แล้วในเครื่อง
    import torch
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    # แคชของโมเดลนี้ไม่มี preprocessor_config.json (โหลดมาไม่ครบ) — สร้าง feature extractor จาก config แทนการดาวน์โหลด
    from transformers import WhisperConfig, WhisperFeatureExtractor, WhisperTokenizer

    config = WhisperConfig.from_pretrained(str(args.model_dir), local_files_only=True)
    extractor = WhisperFeatureExtractor(feature_size=config.num_mel_bins, sampling_rate=16000)
    tokenizer = WhisperTokenizer.from_pretrained(str(args.model_dir), local_files_only=True, language="th", task="transcribe")
    processor = WhisperProcessor(extractor, tokenizer)
    dtype = torch.float16 if args.device.startswith("cuda") else torch.float32
    model = WhisperForConditionalGeneration.from_pretrained(str(args.model_dir), local_files_only=True, dtype=dtype)
    model = model.to(args.device).eval()
    forced = processor.get_decoder_prompt_ids(language="th", task="transcribe")

    segments = json.loads((args.data / "segments.json").read_text(encoding="utf-8"))
    priority_path = args.data / "reference.priority.json"
    report = json.loads(priority_path.read_text(encoding="utf-8")) if priority_path.is_file() else {"clips": {}}
    report.setdefault("clips", {})
    report["_second_model"] = str(args.model_dir.name)

    rows = []
    for name, clip in segments["clips"].items():
        entries = report["clips"].setdefault(name, {})
        for item in clip["segments"]:
            audio, rate = slice_samples(args.clips / f"{name}.wav", item["start"], item["end"])
            features = processor(audio, sampling_rate=rate, return_tensors="pt").input_features.to(args.device, dtype)
            with torch.inference_mode():
                ids = model.generate(features, forced_decoder_ids=forced, max_new_tokens=220)
            text = processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
            primary, second = normalize(item["asr"]), normalize(text)
            disagreement = round(edit_distance(primary, second) / max(len(primary), len(second), 1), 3)
            entry = entries.setdefault(str(item["i"]), {})
            entry["second_model"] = text
            entry["disagreement"] = disagreement
            rows.append((disagreement, name, item["i"], entry.get("instability"), item["asr"], text))
            print(f"{name:14s} {item['i']:2d} disagree {disagreement:.3f} | 1: {item['asr'][:38]} | 2: {text[:38]}", flush=True)

    priority_path.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    rows.sort(reverse=True)
    print("\nboth models agree closely (<0.15), least likely to need a listen:",
          sum(1 for r in rows if r[0] < 0.15), "of", len(rows))
    print("they disagree (>=0.4):", sum(1 for r in rows if r[0] >= 0.4))
    print("\nTOP 10 disagreements:")
    for dis, name, i, inst, a, b in rows[:10]:
        print(f"  {dis:.3f} {name}#{i} (instability {inst})\n     1: {a}\n     2: {b}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
