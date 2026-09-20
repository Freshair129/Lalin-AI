"""Operation-scoped temporary payload storage — LVP-REQ-025/026.

``<data_dir>/attempts/<sha256(issuer)[:16]>/<attempt_id>/`` ชื่อไฟล์ภายในคงที่ (ไม่ใช้ชื่อจาก client)
ไม่มี directory listing และไม่คืน absolute path ให้ผู้เรียก
"""
from __future__ import annotations

import hashlib
import shutil
import wave
from pathlib import Path
from typing import Any

INPUT_NAME = "input.bin"
OUTPUT_NAMES = {"wav": "output.wav", "mp3": "output.mp3"}


def issuer_scope(issuer: str) -> str:
    return hashlib.sha256(issuer.encode("utf-8")).hexdigest()[:16]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class PayloadStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def attempt_dir(self, issuer: str, attempt_id: str) -> Path:
        return self.root / issuer_scope(issuer) / attempt_id

    def write_input(self, issuer: str, attempt_id: str, data: bytes) -> Path:
        target_dir = self.attempt_dir(issuer, attempt_id)
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / INPUT_NAME
        tmp = target.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(target)
        return target

    def input_path(self, issuer: str, attempt_id: str) -> Path:
        return self.attempt_dir(issuer, attempt_id) / INPUT_NAME

    def output_path(self, issuer: str, attempt_id: str, fmt: str) -> Path:
        target_dir = self.attempt_dir(issuer, attempt_id)
        target_dir.mkdir(parents=True, exist_ok=True)
        return target_dir / OUTPUT_NAMES[fmt]

    def existing_output(self, issuer: str, attempt_id: str) -> Path | None:
        target_dir = self.attempt_dir(issuer, attempt_id)
        for name in OUTPUT_NAMES.values():
            candidate = target_dir / name
            if candidate.is_file():
                return candidate
        return None

    def delete_input(self, issuer: str, attempt_id: str) -> None:
        path = self.input_path(issuer, attempt_id)
        if path.exists():
            path.unlink()

    def erase(self, issuer: str, attempt_id: str) -> bool:
        target_dir = self.attempt_dir(issuer, attempt_id)
        if not target_dir.exists():
            return False
        shutil.rmtree(target_dir, ignore_errors=True)
        return not target_dir.exists()


def validate_wav_output(path: Path, *, max_seconds: float) -> dict[str, Any]:
    """ตรวจ header/duration/sha256 ก่อนประกาศ AVAILABLE (LVP-REQ-019) — คืน metadata ที่วัดจริง.

    โยน ValueError(code) โดย code ∈ {OUTPUT_INVALID, OUTPUT_LIMIT}
    """
    if not path.is_file() or path.stat().st_size == 0:
        raise ValueError("OUTPUT_INVALID")
    try:
        with wave.open(str(path), "rb") as handle:
            channels = handle.getnchannels()
            sample_rate = handle.getframerate()
            sample_width = handle.getsampwidth()
            frames = handle.getnframes()
    except (wave.Error, EOFError, OSError):
        raise ValueError("OUTPUT_INVALID") from None
    if channels < 1 or sample_rate <= 0 or sample_width <= 0 or frames <= 0:
        raise ValueError("OUTPUT_INVALID")
    duration = frames / float(sample_rate)
    if duration > max_seconds:
        raise ValueError("OUTPUT_LIMIT")
    return {
        "format": "wav",
        "mime_type": "audio/wav",
        "channels": channels,
        "sample_rate": sample_rate,
        "sample_width_bytes": sample_width,
        "duration_seconds": round(duration, 6),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


__all__ = ["PayloadStore", "issuer_scope", "sha256_file", "validate_wav_output"]
