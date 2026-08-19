"""ตัวช่วยจัดการไฟล์เสียง (ใช้ pydub/soundfile)"""
# @req FR-03 — วางคลิปเสียงพากย์ลงไทม์ไลน์ตอน mix (FR-03.7)
from __future__ import annotations

from pathlib import Path


def overlay_on_timeline(
    clips: list[tuple[float, str]], total_ms: int, out_path: str
) -> str:
    """วางคลิปเสียงแต่ละชิ้นลงบนไทม์ไลน์ตามเวลาเริ่ม (วินาที)

    clips = [(start_sec, wav_path), ...]
    ใช้สำหรับ dubbing: พากย์แต่ละ segment แล้ววางทับให้ตรงจังหวะต้นฉบับ
    """
    from .ffmpeg import configure
    configure()
    from pydub import AudioSegment

    base = AudioSegment.silent(duration=total_ms)
    for start_sec, path in clips:
        seg = AudioSegment.from_file(path)
        base = base.overlay(seg, position=int(start_sec * 1000))
    base.export(out_path, format=Path(out_path).suffix.lstrip(".") or "wav")
    return out_path


def fit_duration(wav_path: str, target_sec: float, out_path: str) -> str:
    """ยืด/บีบความยาวเสียงให้พอดีช่วงเวลา (time-stretch แบบรักษา pitch)

    ช่วยให้เสียงพากย์ยาวพอดีกับช่วงต้นฉบับ ไม่ทับ segment ถัดไป
    """
    import soundfile as sf

    data, sr = sf.read(wav_path)
    cur = len(data) / sr
    if target_sec <= 0 or abs(cur - target_sec) < 0.05:
        sf.write(out_path, data, sr)
        return out_path
    rate = cur / target_sec  # >1 = เร่งให้สั้นลง
    try:
        import librosa

        mono = data.mean(axis=1) if data.ndim > 1 else data
        stretched = librosa.effects.time_stretch(mono, rate=rate)
        sf.write(out_path, stretched, sr)
    except ImportError:
        # ไม่มี librosa → ข้ามการ stretch (คืนไฟล์เดิม)
        sf.write(out_path, data, sr)
    return out_path
