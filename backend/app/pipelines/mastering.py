"""Mastering — ปรับ/มาสเตอร์เสียงเพลงระดับเผยแพร่

สองโหมด:
  • reference  → ใช้ Matchering ให้เสียงเรา "เหมือน" เพลงอ้างอิงที่ชอบ
                 (จับ EQ + ความดัง + dynamics ตามเพลงอ้างอิง)
  • auto       → ไม่มีเพลงอ้างอิง: normalize ความดังไปที่ target LUFS
                 + จำกัด peak กันคลิป (ใช้ pyloudnorm)

มาตรฐานความดัง streaming ปกติ ~ -14 LUFS (Spotify/YouTube)
"""
from __future__ import annotations

from pathlib import Path

from ..config import get_settings
from ..utils.ids import short_id


def master_with_reference(target: str, reference: str, out_path: str) -> str:
    """Matchering: ทำให้ target ฟังดูเหมือน reference.

    matchering เป็น optional/GPL dep (BYOM) — ถ้ายังไม่ได้ติดตั้ง จะแจ้ง error
    ภาษาไทยบอกวิธีติดตั้ง แทนที่จะ crash แบบไม่มีคำอธิบาย. ใช้โหมด auto
    (`master_auto`, pyloudnorm) แทนได้ถ้าไม่ต้องการติดตั้งปลั๊กอินนี้.
    """
    try:
        import matchering as mg
    except ImportError as e:  # noqa: BLE001
        raise RuntimeError(
            "โหมด reference mastering ต้องใช้ปลั๊กอิน matchering ซึ่งยังไม่ได้ติดตั้ง "
            "(เป็น optional component — license GPLv3) "
            "ติดตั้งด้วยคำสั่ง `uv pip install matchering` แล้วลองใหม่อีกครั้ง "
            "หรือใช้โหมด auto (ปรับความดังอัตโนมัติ ไม่ต้องมีเพลงอ้างอิง) แทนได้"
        ) from e

    mg.process(
        target=target,
        reference=reference,
        results=[mg.pcm24(out_path)],
    )
    return out_path


def master_auto(target: str, out_path: str, target_lufs: float = -14.0) -> str:
    """Auto-master: ปรับความดังไป target LUFS + peak limiting."""
    import numpy as np
    import pyloudnorm as pyln
    import soundfile as sf

    data, sr = sf.read(target)
    meter = pyln.Meter(sr)
    loudness = meter.integrated_loudness(data)
    normalized = pyln.normalize.loudness(data, loudness, target_lufs)

    # peak limiting กันคลิป (true-peak แบบง่าย: scale ลงถ้าเกิน -1 dBFS)
    peak = np.max(np.abs(normalized))
    ceiling = 10 ** (-1.0 / 20)  # -1 dBFS
    if peak > ceiling:
        normalized = normalized * (ceiling / peak)

    sf.write(out_path, normalized, sr)
    return out_path


def run_mastering(
    *,
    source_audio: str,
    reference_audio: str | None = None,
    target_lufs: float = -14.0,
    target_format: str = "wav",
) -> dict:
    settings = get_settings()
    out_path = str(settings.outputs_dir / f"master_{short_id()}.{target_format}")

    if reference_audio:
        master_with_reference(source_audio, reference_audio, out_path)
        mode = "reference"
    else:
        master_auto(source_audio, out_path, target_lufs)
        mode = "auto"

    return {"output": out_path, "mode": mode, "target_lufs": target_lufs}
