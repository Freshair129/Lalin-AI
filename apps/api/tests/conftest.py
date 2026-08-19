# @req FR-06 — fixture กลางของเทสต์ backend
"""Fixture กลางของเทสต์ backend — แยก data_dir ออกจากของจริงทุกครั้ง

ไม่มีเทสต์ไหนควรแตะ backend/data ของจริง — ทุกเทสต์ที่ต้องการไฟล์ระบบ
(อัปโหลด/โปรเจกต์/render) ใช้ fixture data_dir ที่ชี้ไป tmp_path แทน
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def data_dir(tmp_path, monkeypatch):
    """ชี้ settings.data_dir ไปที่ tmp_path — เทสต์ห้ามแตะ backend/data ของจริง"""
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from app.config import get_settings

    get_settings.cache_clear()          # lru_cache — ต้องล้างก่อนอ่านค่าใหม่
    settings = get_settings()
    settings.ensure_dirs()
    yield tmp_path
    get_settings.cache_clear()


@pytest.fixture()
def client(data_dir):
    from app.main import app

    with TestClient(app) as c:
        yield c
