"""TTS + Voice Cloning — สังเคราะห์เสียงพูดจากข้อความ โดยโคลนเสียงจากตัวอย่าง

เอนจิน:
  • f5   → F5-TTS (รองรับไทยดีมากผ่านโมเดล VIZINTZOR/F5-TTS-THAI) เป็นค่าเริ่มต้น
  • xtts → Coqui XTTS v2 (อังกฤษ/หลายภาษา; *ไม่รองรับไทยอย่างเป็นทางการ*)

โหลดโมเดลแบบ lazy + cache
"""
# @req FR-02 — เอนจิน F5-TTS หลัก + XTTS สำรอง + fallback ไทย (FR-02.3/02.4/02.5)
# @req NFR-01 — เป้า inference <= 15 วินาที/ประโยคบน GPU (NFR-01.2)
from __future__ import annotations

from pathlib import Path

from ..config import get_settings

_f5 = None
_xtts = None


# ════════════════════════════════════════════════════════════
#  F5-TTS (เสียงไทย/อังกฤษ — แนะนำ)
# ════════════════════════════════════════════════════════════
def _get_f5():
    """โหลดโมเดล F5-TTS ไทย (VIZINTZOR/F5-TTS-THAI) — รองรับทั้งไทยและอังกฤษ

    โมเดลต่อยอดจาก SWivid/F5-TTS → สถาปัตยกรรม F5TTS_Base (vocos)
    ดาวน์โหลด checkpoint (~1.3GB) + vocab อัตโนมัติครั้งแรกผ่าน cached_path
    """
    global _f5
    if _f5 is None:
        try:
            from cached_path import cached_path
            from f5_tts.api import F5TTS
        except ImportError as e:  # noqa: BLE001
            raise RuntimeError(
                "ยังไม่ได้ติดตั้ง f5-tts — ดู scripts/setup_windows.ps1"
            ) from e
        s = get_settings()
        repo = s.f5_model_repo  # VIZINTZOR/F5-TTS-THAI
        ckpt = str(cached_path(f"hf://{repo}/model_1000000.pt"))
        vocab = str(cached_path(f"hf://{repo}/vocab.txt"))
        _f5 = F5TTS(
            model="F5TTS_Base",
            ckpt_file=ckpt,
            vocab_file=vocab,
            device=s.tts_device,
        )
    return _f5


def _f5_synth(
    text: str, ref_audio: str, ref_text: str, out_path: str, speed: float
) -> str:
    model = _get_f5()
    model.infer(
        ref_file=ref_audio,
        ref_text=ref_text,      # ข้อความที่ตรงกับ ref_audio ("" = ให้ ASR เดาเอง)
        gen_text=text,
        file_wave=out_path,
        speed=speed,
        remove_silence=True,
    )
    return out_path


# ════════════════════════════════════════════════════════════
#  XTTS v2 (fallback หลายภาษา)
# ════════════════════════════════════════════════════════════
def _get_xtts():
    global _xtts
    if _xtts is None:
        try:
            from TTS.api import TTS
        except ImportError as e:  # noqa: BLE001
            raise RuntimeError("ยังไม่ได้ติดตั้ง TTS (Coqui) — ดู setup script") from e
        s = get_settings()
        _xtts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(s.tts_device)
    return _xtts


def _xtts_synth(
    text: str, ref_audio: str, out_path: str, language: str, speed: float
) -> str:
    model = _get_xtts()
    # XTTS ใช้รหัสภาษา ISO; ไม่มี th → เตือนผู้เรียก
    lang = "en" if language not in _XTTS_LANGS else language
    model.tts_to_file(
        text=text, speaker_wav=ref_audio, language=lang,
        file_path=out_path, speed=speed,
    )
    return out_path


_XTTS_LANGS = {
    "en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl",
    "cs", "ar", "zh-cn", "ja", "hu", "ko", "hi",
}


# ════════════════════════════════════════════════════════════
#  Public API
# ════════════════════════════════════════════════════════════
def synthesize(
    text: str,
    out_path: str,
    *,
    ref_audio: str,
    ref_text: str = "",
    language: str = "th",
    speed: float = 1.0,
    engine: str | None = None,
) -> str:
    """สังเคราะห์เสียง 1 ประโยค/ก้อน คืน path ไฟล์ wav

    ref_audio = ตัวอย่างเสียงที่จะโคลน (สำคัญที่สุด, 6-15 วินาทีกำลังดี)
    """
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    engine = engine or get_settings().tts_engine

    # ไทย → บังคับใช้ F5 เสมอ (XTTS ไม่รองรับไทย)
    if language == "th" and engine == "xtts":
        engine = "f5"

    if engine == "f5":
        return _f5_synth(text, ref_audio, ref_text, out_path, speed)
    return _xtts_synth(text, ref_audio, out_path, language, speed)
