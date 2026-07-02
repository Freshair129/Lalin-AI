# -*- coding: utf-8 -*-
"""Smoke test: โคลนเสียงไทยจริงด้วย F5-TTS-THAI
ดาวน์โหลด ref จาก repo + โมเดล แล้วสังเคราะห์ 1 ประโยค
"""
import sys, time
from pathlib import Path
from huggingface_hub import hf_hub_download

sys.stdout.reconfigure(encoding="utf-8")

REF_TEXT = "ฉันเดินทางไปเที่ยวที่จังหวัดเชียงใหม่ในช่วงฤดูหนาวเพื่อสัมผัสอากาศเย็นสบาย"
GEN_TEXT = "สวัสดีครับ นี่คือการทดสอบโคลนเสียงด้วยโปรแกรม จีมิวสิค บนการ์ดจอ อาร์ทีเอกซ์ สามพันหกร้อย"

print(">>> downloading Thai reference audio...", flush=True)
ref = hf_hub_download("VIZINTZOR/F5-TTS-THAI", "sample/ref_audio.wav")
print("    ref:", ref, flush=True)

out = str(Path("data/outputs/smoke_thai.wav").resolve())
Path("data/outputs").mkdir(parents=True, exist_ok=True)

print(">>> loading model + synthesizing (first run downloads ~1.3GB)...", flush=True)
t0 = time.time()
from app.pipelines.tts import synthesize
synthesize(GEN_TEXT, out, ref_audio=ref, ref_text=REF_TEXT, language="th", engine="f5")
dt = time.time() - t0

import soundfile as sf
data, sr = sf.read(out)
dur = len(data) / sr
print(f">>> DONE in {dt:.1f}s | output={out} | {dur:.2f}s @ {sr}Hz", flush=True)
