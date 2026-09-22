# @req FR-19 (candidate, CR-005) — asset pinning: sha256 แบบ streaming, อ่านไม่ได้ = fail-closed พร้อมข้อความชัด
"""ที่มา (2026-09-22): ตอนรันเทสต์ใน container Linux การอ่าน model.bin 1.6 GB ผ่าน bind mount ของ Docker Desktop
ได้ ``OSError: [Errno 5]`` และเผยว่า ``_assets`` ใช้ ``read_bytes()`` โหลดไฟล์ทั้งก้อนเข้า RAM เพื่อ hash
ทุกครั้งที่บูต — ใน container ที่มีเพดาน memory (D13) ขั้นนี้ขั้นเดียวอาจทำให้บูตไม่ขึ้น
"""
from __future__ import annotations

import hashlib
import os
import tracemalloc

import pytest

from app.voice_worker import profile as profile_module
from app.voice_worker.profile import ProfileError, load_manifest, sha256_file
from tests.voice_worker.conftest import write_manifest


def _blob(tmp_path, mib: float) -> tuple:
    path = tmp_path / "blob.bin"
    data = os.urandom(int(mib * 1024 * 1024))
    path.write_bytes(data)
    return path, hashlib.sha256(data).hexdigest()


def test_streaming_hash_matches_whole_file_hash_across_chunks(tmp_path):
    path, expected = _blob(tmp_path, 3.5)  # หลาย chunk และ chunk สุดท้ายไม่เต็ม
    assert sha256_file(path) == expected


def test_hashing_does_not_load_the_whole_file_into_memory(tmp_path):
    """โค้ดเดิม (read_bytes) มี peak ≥ ขนาดไฟล์; แบบ streaming ต้องอยู่ราว ๆ 1 chunk"""
    path, expected = _blob(tmp_path, 16)
    tracemalloc.start()
    try:
        digest = sha256_file(path)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert digest == expected
    assert peak < 4 * 1024 * 1024, f"peak {peak / 2**20:.1f} MiB — whole file was loaded"


def test_manifest_load_verifies_assets_by_streaming(tmp_path):
    path, digest = _blob(tmp_path, 2)
    manifest = load_manifest(write_manifest(tmp_path, "asr", assets=[{"role": "blob", "path": str(path), "sha256": digest}]))
    assert manifest.assets[0].sha256 == digest


def test_unreadable_asset_is_a_clear_profile_error(tmp_path, monkeypatch):
    """I/O error ตอนอ่าน asset → ProfileError ที่บอกชื่อ asset (เดิมหลุดเป็น OSError ดิบ)"""
    path, digest = _blob(tmp_path, 1)
    manifest_path = write_manifest(tmp_path, "asr", assets=[{"role": "blob", "path": str(path), "sha256": digest}])

    def broken_open(*_args, **_kwargs):
        raise OSError(5, "Input/output error")

    monkeypatch.setattr(profile_module, "open", broken_open, raising=False)
    with pytest.raises(ProfileError) as exc:
        load_manifest(manifest_path)
    assert "blob" in str(exc.value) and "อ่านไม่ได้" in str(exc.value)
