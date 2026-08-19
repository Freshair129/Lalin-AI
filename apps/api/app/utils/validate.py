# @req FR-04 — ตรวจ artifact ทุกไฟล์ที่ระบบผลิต (peak/LUFS/NaN/DC/ความยาว)
"""ตรวจคุณภาพไฟล์เสียงที่เพิ่งผลิต — กันไฟล์เสีย/เงียบ/NaN หลุดถึงผู้ใช้

RCA 2026-07-01 (remix mastering clipping) เสนอไว้ว่าต้อง "verify peak + LUFS
หลังมาสเตอร์" — โมดูลนี้คือข้อนั้น ใช้ได้กับทุก pipeline ที่เขียนไฟล์
"""
from __future__ import annotations

import numpy as np

_SILENCE_DBFS = -70.0
_DC_LIMIT = 0.05


def validate_audio(path: str) -> dict:
    """คืนสถิติ + รายการปัญหา (ภาษาไทย) — ok=False ถ้ามีปัญหาอย่างน้อยหนึ่งข้อ"""
    import soundfile as sf

    data, sr = sf.read(path, dtype="float64", always_2d=True)
    issues: list[str] = []

    n, ch = data.shape
    duration = n / sr if sr else 0.0
    if n == 0:
        issues.append("ไฟล์มีความยาวเป็นศูนย์")

    has_nan = bool(np.isnan(data).any() or np.isinf(data).any())
    if has_nan:
        issues.append("พบค่า NaN/Inf ในสัญญาณเสียง")
        data = np.nan_to_num(data)

    peak = float(np.max(np.abs(data))) if n else 0.0
    peak_dbfs = 20 * np.log10(peak) if peak > 0 else -np.inf
    if n and peak_dbfs < _SILENCE_DBFS:
        issues.append(f"ไฟล์เงียบทั้งไฟล์ (peak {peak_dbfs:.1f} dBFS)")

    dc = float(np.max(np.abs(data.mean(axis=0)))) if n else 0.0
    if dc > _DC_LIMIT:
        issues.append(f"พบ DC offset สูงผิดปกติ ({dc:.3f})")

    lufs = None
    if n and duration >= 0.4:            # pyloudnorm ต้องการอย่างน้อย 400 ms
        try:
            import pyloudnorm as pyln

            value = float(pyln.Meter(sr).integrated_loudness(data))
            lufs = round(value, 2) if np.isfinite(value) else None
        except Exception:  # noqa: BLE001 — วัดไม่ได้ไม่ควรทำให้ทั้ง job ล้ม
            lufs = None

    return {
        "ok": not issues,
        "issues": issues,
        "duration": round(duration, 3),
        "sample_rate": int(sr),
        "channels": int(ch),
        "peak_dbfs": None if peak == 0 else round(float(peak_dbfs), 2),
        "lufs": lufs,
        "dc_offset": round(dc, 5),
    }
