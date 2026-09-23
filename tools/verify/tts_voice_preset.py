#!/usr/bin/env python3
# @req FR-19 (candidate, CR-005) — ตรวจและ pin เสียงต้นแบบของ TTS preset
"""ตรวจไฟล์เสียงต้นแบบก่อนเอาเข้า manifest แล้วสร้างบล็อกที่ pin ด้วย sha256 ให้

ทำไมต้องมี: preset เสียงที่ shipped อยู่ตอนนี้เป็น sample ของ model repo ซึ่ง ``rights_status: dev-only``
เพราะไม่รู้ว่าเจ้าของเสียงยินยอมไหม การเปลี่ยนเป็นเสียงจริงต้องผ่านสองด่าน:
  1. **ด่านเทคนิค** — ไฟล์ต้องผ่านข้อจำกัดที่ engine บังคับจริง ไม่ใช่เดาเอา
  2. **ด่านสิทธิ์** — ต้องมีคนระบุที่มาของความยินยอม ``rights_status: approved`` จึงจะมีความหมาย

ข้อจำกัดที่ตรวจ อ้างจาก engine_f5.py ตรง ๆ:
  • หลังตัดเงียบหัวท้าย (−42 dBFS) ต้อง **ไม่เกิน 12 วินาที** ไม่งั้น worker ปฏิเสธตั้งแต่บูต (MAX_REF_SECONDS)
  • model card แนะนำ 2–8 วินาที — สั้นกว่านี้โคลนเสียงไม่พอ ยาวกว่านี้คุณภาพไม่ได้ดีขึ้น
  • engine แปลงเป็น mono 24 kHz ให้เอง ไฟล์ต้นทางเป็นอะไรก็ได้ที่อ่านได้

ใช้ (จาก apps/api ด้วย venv ที่มี numpy):
  .venv/Scripts/python.exe ../../tools/verify/tts_voice_preset.py check --audio ref.wav --text "ข้อความที่พูด"
  .venv/Scripts/python.exe ../../tools/verify/tts_voice_preset.py pin   --audio ref.wav --text "..." \\
      --preset-id th-prod-01 --revision rev-2026-09-24 --consent "ใบยินยอมเลขที่ ... ลงวันที่ ..."
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import wave
from dataclasses import dataclass
from pathlib import Path

MAX_REF_SECONDS = 12.0      # engine_f5.MAX_REF_SECONDS — เกินกว่านี้ worker ปฏิเสธตั้งแต่บูต
REF_SILENCE_DBFS = -42.0    # engine_f5.REF_SILENCE_DBFS
RECOMMENDED = (2.0, 8.0)    # จาก model card ของ F5-TTS-THAI
BLOCK_MS = 10               # ช่วงที่ remove_silence_edges ใช้
MIN_RMS_DBFS = -34.0        # เงียบกว่านี้ engine ต้องขยาย ทำให้ noise floor ลอยขึ้นมาด้วย
MAX_CLIPPED_RATIO = 0.001   # ตัวอย่างที่ชนเพดานเกิน 0.1% = อัดดังเกินจนเพี้ยน
EXIT_FAIL = 1


@dataclass
class Finding:
    level: str      # PASS / WARN / FAIL
    what: str
    detail: str


def load_mono(path: Path):
    """อ่าน WAV เป็น float mono — ใช้ stdlib + numpy เท่านั้น ไม่ต้องมี torch

    รองรับ WAV PCM อย่างเดียวโดยตั้งใจ: ฟอร์แมตอื่นให้แปลงก่อนด้วย ffmpeg
    จะได้เห็นชัดว่าไฟล์ถูกแปลงตอนไหน ไม่ใช่ให้เครื่องมือแปลงเงียบ ๆ
    """
    import numpy as np

    with wave.open(str(path), "rb") as handle:
        channels, width, rate = handle.getnchannels(), handle.getsampwidth(), handle.getframerate()
        frames = handle.readframes(handle.getnframes())
    if width != 2:
        raise ValueError(f"รองรับ PCM 16-bit เท่านั้น (ไฟล์นี้ {width * 8}-bit) — แปลงด้วย ffmpeg ก่อน")
    audio = np.frombuffer(frames, dtype="<i2").astype("float32") / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, rate, channels


def dbfs(block) -> float:
    import numpy as np

    rms = float(np.sqrt(np.mean(np.square(block)))) if len(block) else 0.0
    return -float("inf") if rms <= 0 else 20.0 * float(np.log10(rms))


def trimmed_bounds(audio, rate: int) -> tuple[int, int]:
    """หาขอบเสียงหลังตัดความเงียบ — เลียนแบบ remove_silence_edges ของ engine ให้ได้ตัวเลขเดียวกัน"""
    step = max(1, int(rate * BLOCK_MS / 1000))
    blocks = [(i, dbfs(audio[i:i + step])) for i in range(0, len(audio), step)]
    loud = [i for i, level in blocks if level > REF_SILENCE_DBFS]
    if not loud:
        return 0, 0
    return loud[0], min(len(audio), loud[-1] + step)


def inspect(audio, rate: int, channels: int, text: str) -> list[Finding]:
    import numpy as np

    out: list[Finding] = []
    raw_seconds = len(audio) / rate
    start, end = trimmed_bounds(audio, rate)
    speech = audio[start:end]
    seconds = len(speech) / rate

    if seconds == 0:
        out.append(Finding("FAIL", "ไม่มีเสียงพูด", f"ทั้งไฟล์เงียบกว่า {REF_SILENCE_DBFS:.0f} dBFS"))
        return out

    # ความยาวหลังตัดเงียบคือค่าที่ engine เห็นจริง ไม่ใช่ความยาวไฟล์
    detail = f"ไฟล์ {raw_seconds:.2f} วิ · หลังตัดเงียบหัวท้าย {seconds:.2f} วิ"
    if seconds > MAX_REF_SECONDS:
        out.append(Finding("FAIL", "ยาวเกินที่ engine ยอมรับ",
                           f"{detail} — เกิน {MAX_REF_SECONDS:.0f} วิ worker จะปฏิเสธตั้งแต่บูต"))
    elif not (RECOMMENDED[0] <= seconds <= RECOMMENDED[1]):
        side = "สั้นกว่า" if seconds < RECOMMENDED[0] else "ยาวกว่า"
        out.append(Finding("WARN", "ความยาวนอกช่วงที่แนะนำ",
                           f"{detail} — {side}ช่วง {RECOMMENDED[0]:.0f}–{RECOMMENDED[1]:.0f} วิ ที่ model card แนะนำ"))
    else:
        out.append(Finding("PASS", "ความยาวเหมาะสม", detail))

    level = dbfs(speech)
    if level < MIN_RMS_DBFS:
        out.append(Finding("WARN", "เสียงเบา", f"RMS {level:.1f} dBFS — engine ต้องขยาย ทำให้เสียงรบกวนลอยตามขึ้นมา"))
    else:
        out.append(Finding("PASS", "ระดับเสียงพอดี", f"RMS {level:.1f} dBFS"))

    clipped = float(np.mean(np.abs(speech) >= 0.999))
    if clipped > MAX_CLIPPED_RATIO:
        out.append(Finding("FAIL", "เสียงแตกเพราะอัดดังเกิน", f"{clipped * 100:.2f}% ของตัวอย่างชนเพดาน"))
    else:
        out.append(Finding("PASS", "ไม่มีเสียงแตก", f"ชนเพดาน {clipped * 100:.3f}%"))

    offset = float(np.mean(speech))
    if abs(offset) > 0.01:
        out.append(Finding("WARN", "มี DC offset", f"ค่าเฉลี่ย {offset:+.4f} — ควรผ่าน high-pass ก่อน"))

    if channels > 1:
        out.append(Finding("WARN", "ไม่ใช่ mono", f"{channels} ช่อง — engine รวมเป็น mono ให้ แต่ควรอัด mono มาแต่แรก"))
    if rate < 16000:
        out.append(Finding("WARN", "sample rate ต่ำ", f"{rate} Hz — engine แปลงเป็น 24 kHz แต่ข้อมูลที่หายไปแล้วไม่กลับมา"))
    else:
        out.append(Finding("PASS", "sample rate ใช้ได้", f"{rate} Hz (engine แปลงเป็น 24 kHz ให้)"))

    out.extend(inspect_text(text, seconds))
    return out


def inspect_text(text: str, seconds: float) -> list[Finding]:
    out: list[Finding] = []
    stripped = text.strip()
    if not stripped:
        out.append(Finding("FAIL", "ไม่มีข้อความถอด", "ref_text ว่าง — engine ต้องใช้คู่กับเสียงเสมอ"))
        return out
    if "\n" in stripped:
        out.append(Finding("FAIL", "ข้อความมีขึ้นบรรทัดใหม่", "ต้องเป็นบรรทัดเดียว"))

    chars = len(stripped)
    # เกณฑ์หยาบ ๆ ของคนพูดไทยปกติ ~8–20 code point ต่อวินาที — ไว้จับกรณีข้อความไม่ตรงกับเสียง
    rate = chars / seconds if seconds else 0.0
    if rate < 4 or rate > 28:
        out.append(Finding("WARN", "ข้อความอาจไม่ตรงกับเสียง",
                           f"{chars} ตัวอักษรใน {seconds:.2f} วิ = {rate:.1f} ตัว/วิ ซึ่งผิดปกติ "
                           "— ข้อความต้องตรงกับที่พูดเป๊ะ ไม่ใช่ใกล้เคียง"))
    else:
        out.append(Finding("PASS", "อัตราพูดสมเหตุสมผล", f"{chars} ตัวอักษร = {rate:.1f} ตัว/วินาที"))

    if stripped[-1] in ".!?。":
        out.append(Finding("WARN", "ลงท้ายด้วยเครื่องหมายวรรคตอน",
                           "engine เติม '. ' ต่อท้ายให้เองอยู่แล้ว อาจซ้ำซ้อน"))
    return out


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def report(findings: list[Finding]) -> int:
    mark = {"PASS": "  ok ", "WARN": " เตือน", "FAIL": " ไม่ผ่าน"}
    for f in findings:
        print(f"{mark[f.level]:8s} {f.what:28s} {f.detail}")
    fails = sum(1 for f in findings if f.level == "FAIL")
    warns = sum(1 for f in findings if f.level == "WARN")
    print(f"\nสรุป: ไม่ผ่าน {fails} · เตือน {warns} · ผ่าน {len(findings) - fails - warns}")
    if fails:
        print("แก้ข้อที่ 'ไม่ผ่าน' ก่อน ไฟล์นี้ยังเอาเข้า manifest ไม่ได้")
    elif warns:
        print("ไม่มีข้อห้าม แต่ข้อที่ 'เตือน' อาจทำให้เสียงที่โคลนออกมาแย่ลง")
    return EXIT_FAIL if fails else 0


def manifest_blocks(*, preset_id: str, revision: str, language: str, text: str,
                    audio_path: Path, digest: str, consent: str) -> str:
    asset_role = f"voice.{preset_id}"
    voice = {
        "voice_preset_id": preset_id,
        "voice_revision": revision,
        "language": language,
        "ref_text": text.strip(),
        "rights_status": "approved",
        "ref_audio": asset_role,
        "_consent": consent,
    }
    asset = {"role": asset_role, "path": str(audio_path).replace("\\", "/"), "sha256": digest}
    return ("วางใน voices[]:\n" + json.dumps(voice, ensure_ascii=False, indent=2)
            + "\n\nวางใน assets[]:\n" + json.dumps(asset, ensure_ascii=False, indent=2))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ตรวจและ pin เสียงต้นแบบของ TTS preset")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("check", "pin"):
        p = sub.add_parser(name)
        p.add_argument("--audio", type=Path, required=True, help="WAV PCM 16-bit ของเสียงต้นแบบ")
        p.add_argument("--text", required=True, help="ข้อความที่พูดในไฟล์นั้น ต้องตรงเป๊ะ")
        if name == "pin":
            p.add_argument("--preset-id", required=True)
            p.add_argument("--revision", required=True)
            p.add_argument("--language", default="th")
            p.add_argument("--manifest-path", default="../../models/voices/<ชื่อไฟล์>.wav",
                           help="path ที่จะเขียนลง manifest (relative กับไฟล์ manifest)")
            p.add_argument("--consent", required=True,
                           help="ที่มาของความยินยอม — บังคับ เพราะ rights_status approved ไม่มีความหมายถ้าไม่มีหลักฐาน")
    args = parser.parse_args(argv)

    try:
        audio, rate, channels = load_mono(args.audio)
    except FileNotFoundError:
        print(f"ไม่พบไฟล์ {args.audio}", file=sys.stderr)
        return EXIT_FAIL
    except Exception as exc:
        print(f"อ่านไฟล์ไม่ได้: {exc}", file=sys.stderr)
        return EXIT_FAIL

    print(f"ไฟล์: {args.audio}\n")
    findings = inspect(audio, rate, channels, args.text)
    code = report(findings)
    if args.command == "check" or code:
        if code:
            print("\n(ยังไม่ออกบล็อกสำหรับ manifest เพราะไฟล์ยังไม่ผ่าน)")
        return code

    digest = sha256_of(args.audio)
    print(f"\nsha256: {digest}\n")
    print(manifest_blocks(preset_id=args.preset_id, revision=args.revision, language=args.language,
                          text=args.text, audio_path=Path(args.manifest_path), digest=digest,
                          consent=args.consent))
    print("\nอย่าลืม: คัดลอกไฟล์เสียงไปไว้ที่ path นั้นจริง และเปลี่ยน profile_revision ของ manifest ด้วย")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
