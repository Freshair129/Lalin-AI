# @req FR-19 (candidate, CR-005) — ตรวจเสียงต้นแบบของ TTS preset ก่อนเข้า manifest
"""เทสต์ของ tools/verify/tts_voice_preset.py

เครื่องมือนี้เป็นด่านสุดท้ายก่อนเสียงจริงเข้า production ถ้ามันบอกว่า "ผ่าน" ทั้งที่ไฟล์ใช้ไม่ได้
worker จะไปล้มตอนบูตแทน ซึ่งเจอช้ากว่ามาก เทสต์จึงเน้นที่ขอบเขตที่ engine บังคับจริง
"""
from __future__ import annotations

import importlib.util
import math
import sys
import wave
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
TOOL = ROOT / "tools" / "verify" / "tts_voice_preset.py"


def _load():
    spec = importlib.util.spec_from_file_location("tts_voice_preset", TOOL)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    # ต้องลง sys.modules ก่อน exec: @dataclass หาโมดูลของคลาสผ่าน sys.modules ถ้าไม่มีจะพังตอน import
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


tool = _load()
RATE = 24000


def write_wav(path: Path, *, speech_seconds: float, lead_silence: float = 0.0,
              tail_silence: float = 0.0, amplitude: float = 0.3, channels: int = 1) -> Path:
    """สร้างไฟล์ทดสอบ: เงียบ + โทน + เงียบ (โทนใช้แทนเสียงพูดได้ เพราะเราวัดระดับ ไม่ได้วัดความหมาย)"""
    frames = bytearray()

    def push(value: int) -> None:
        for _ in range(channels):
            frames.extend(int(value).to_bytes(2, "little", signed=True))

    for _ in range(int(lead_silence * RATE)):
        push(0)
    for i in range(int(speech_seconds * RATE)):
        push(max(-32768, min(32767, int(amplitude * 32767 * math.sin(2 * math.pi * 220 * i / RATE)))))
    for _ in range(int(tail_silence * RATE)):
        push(0)

    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes(bytes(frames))
    return path


def findings_for(path: Path, text: str = "ทดสอบเสียงต้นแบบภาษาไทยสำหรับระบบสังเคราะห์เสียง"):
    audio, rate, channels = tool.load_mono(path)
    return {f.what: f for f in tool.inspect(audio, rate, channels, text)}


def levels(path: Path, text: str = "ทดสอบเสียงต้นแบบภาษาไทยสำหรับระบบสังเคราะห์เสียง"):
    audio, rate, channels = tool.load_mono(path)
    return [f.level for f in tool.inspect(audio, rate, channels, text)]


# --- ความยาว: ค่าที่ engine เห็นคือความยาวหลังตัดเงียบ ไม่ใช่ความยาวไฟล์ ---

def test_silence_at_the_edges_is_not_counted(tmp_path):
    # ไฟล์ 11 วิ แต่พูดจริง 5 วิ ต้องถือว่า 5 ไม่ใช่ 11 ไม่งั้นจะปฏิเสธไฟล์ที่ใช้ได้
    path = write_wav(tmp_path / "padded.wav", speech_seconds=5.0, lead_silence=3.0, tail_silence=3.0)
    got = findings_for(path)["ความยาวเหมาะสม"]
    assert got.level == "PASS"
    assert "11." in got.detail and "5.0" in got.detail


def test_longer_than_the_engine_limit_fails(tmp_path):
    path = write_wav(tmp_path / "long.wav", speech_seconds=13.0)
    assert findings_for(path)["ยาวเกินที่ engine ยอมรับ"].level == "FAIL"


def test_just_under_the_engine_limit_is_only_a_warning(tmp_path):
    # 11 วิ เกินช่วงที่แนะนำแต่ engine ยังรับ — ต้องเตือน ไม่ใช่ห้าม
    path = write_wav(tmp_path / "eleven.wav", speech_seconds=11.0)
    assert findings_for(path)["ความยาวนอกช่วงที่แนะนำ"].level == "WARN"


def test_too_short_is_a_warning(tmp_path):
    path = write_wav(tmp_path / "short.wav", speech_seconds=1.0)
    assert findings_for(path)["ความยาวนอกช่วงที่แนะนำ"].level == "WARN"


def test_all_silence_fails_and_stops_there(tmp_path):
    path = write_wav(tmp_path / "silent.wav", speech_seconds=0.0, lead_silence=5.0)
    findings = findings_for(path)
    assert findings["ไม่มีเสียงพูด"].level == "FAIL"
    assert len(findings) == 1          # ไม่ต้องรายงานอย่างอื่นต่อ ไม่มีอะไรให้วัด


# --- ระดับเสียง ---

def test_clipped_audio_fails(tmp_path):
    path = write_wav(tmp_path / "clipped.wav", speech_seconds=4.0, amplitude=2.0)
    assert findings_for(path)["เสียงแตกเพราะอัดดังเกิน"].level == "FAIL"


def test_quiet_audio_warns(tmp_path):
    # ช่องระหว่างสองเกณฑ์แคบแค่ 8 dB: เบากว่า -42 dBFS จะถูกตัดทิ้งเป็นความเงียบไปเลย
    # (ไม่ใช่ "เสียงเบา") ส่วนเกิน -34 dBFS ถือว่าปกติ amplitude นี้ให้ RMS ราว -38 dBFS
    path = write_wav(tmp_path / "quiet.wav", speech_seconds=4.0, amplitude=0.018)
    assert findings_for(path)["เสียงเบา"].level == "WARN"


def test_below_the_silence_threshold_counts_as_silence_not_as_quiet(tmp_path):
    # เกณฑ์เดียวกับที่ engine ใช้ตัดหัวท้าย ถ้าทั้งไฟล์เบากว่านั้นก็ไม่มีอะไรให้โคลน
    path = write_wav(tmp_path / "toosoft.wav", speech_seconds=4.0, amplitude=0.004)
    assert findings_for(path)["ไม่มีเสียงพูด"].level == "FAIL"


def test_healthy_level_passes(tmp_path):
    path = write_wav(tmp_path / "ok.wav", speech_seconds=4.0, amplitude=0.3)
    findings = findings_for(path)
    assert findings["ระดับเสียงพอดี"].level == "PASS"
    assert findings["ไม่มีเสียงแตก"].level == "PASS"


def test_stereo_warns_but_does_not_fail(tmp_path):
    path = write_wav(tmp_path / "stereo.wav", speech_seconds=4.0, channels=2)
    findings = findings_for(path)
    assert findings["ไม่ใช่ mono"].level == "WARN"
    assert "FAIL" not in levels(path)


# --- ข้อความถอด ---

def test_empty_text_fails():
    assert [f.level for f in tool.inspect_text("   ", 4.0)] == ["FAIL"]


def test_newline_in_text_fails():
    assert any(f.level == "FAIL" for f in tool.inspect_text("บรรทัดหนึ่ง\nบรรทัดสอง", 4.0))


def test_text_far_too_short_for_the_audio_warns():
    # ข้อความสั้นจู๋กับเสียงยาว = คนถอดไม่ครบ ซึ่งทำให้เสียงที่โคลนออกมาเพี้ยน
    warn = [f for f in tool.inspect_text("สวัสดี", 10.0) if f.level == "WARN"]
    assert warn and "ไม่ตรงกับเสียง" in warn[0].what


def test_plausible_text_passes():
    assert any(f.level == "PASS" for f in tool.inspect_text("สวัสดีครับ วันนี้อากาศดีมาก", 2.0))


def test_trailing_punctuation_warns():
    assert any(f.level == "WARN" and "วรรคตอน" in f.what
               for f in tool.inspect_text("สวัสดีครับ วันนี้อากาศดีมาก.", 2.0))


# --- sha256 และบล็อกสำหรับ manifest ---

def test_sha256_matches_hashlib(tmp_path):
    import hashlib
    path = write_wav(tmp_path / "hash.wav", speech_seconds=2.0)
    assert tool.sha256_of(path) == hashlib.sha256(path.read_bytes()).hexdigest()


def test_manifest_blocks_carry_approval_and_its_evidence(tmp_path):
    out = tool.manifest_blocks(preset_id="th-prod-01", revision="rev-2026-09-24", language="th",
                               text="สวัสดีครับ", audio_path=Path("../../models/voices/a.wav"),
                               digest="a" * 64, consent="ใบยินยอมเลขที่ 42")
    assert '"rights_status": "approved"' in out
    assert "ใบยินยอมเลขที่ 42" in out
    # ref_audio ต้องชี้ไป role ของ asset ไม่ใช่ path ตรง ๆ (profile.py บังคับ)
    assert '"ref_audio": "voice.th-prod-01"' in out
    assert '"role": "voice.th-prod-01"' in out
    assert "\\" not in out               # path ใน manifest ใช้ / เสมอ ข้ามระบบได้


# --- ทางเข้าแบบคำสั่ง ---

def test_pin_refuses_to_emit_for_a_file_that_failed(tmp_path, capsys):
    path = write_wav(tmp_path / "toolong.wav", speech_seconds=13.0)
    code = tool.main(["pin", "--audio", str(path), "--text", "ก" * 120,
                      "--preset-id", "p", "--revision", "r", "--consent", "x"])
    assert code == tool.EXIT_FAIL
    out = capsys.readouterr().out
    assert "rights_status" not in out        # ห้ามยื่นบล็อกให้คัดลอกเมื่อไฟล์ยังไม่ผ่าน


def test_check_passes_on_a_good_file(tmp_path, capsys):
    path = write_wav(tmp_path / "good.wav", speech_seconds=5.0, lead_silence=0.2, tail_silence=0.2)
    code = tool.main(["check", "--audio", str(path), "--text", "สวัสดีครับ วันนี้อากาศเย็นสบายดีมากเลยนะครับ"])
    assert code == 0
    assert "ไม่ผ่าน 0" in capsys.readouterr().out


def test_missing_file_reports_instead_of_raising(tmp_path):
    assert tool.main(["check", "--audio", str(tmp_path / "nope.wav"), "--text", "x"]) == tool.EXIT_FAIL


def test_non_pcm16_is_refused_with_a_clear_message(tmp_path):
    path = tmp_path / "eight.wav"
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(1)          # 8-bit
        handle.setframerate(RATE)
        handle.writeframes(b"\x80" * RATE)
    with pytest.raises(ValueError, match="16-bit"):
        tool.load_mono(path)
