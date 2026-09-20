"""Headless voice worker — PRP supplier role (CR-005 / ADR-005, Slice A).

แพ็กเกจนี้เป็น deployment role แยกจาก Lalin Studio:
  • ห้าม import ``app.main``, ``app.brain``, ``app.routers`` หรือ ``app.config`` ของ Studio
  • control process (FastAPI) ห้าม import torch/ctranslate2/f5_tts — model execution อยู่ใน
    engine child process ที่ supervisor เป็นเจ้าของ (ดู ``supervisor.py``)
  • Slice A มีเฉพาะ **stub engine ที่ติดป้าย** (``engine_stub.py``) — ไม่ใช่หลักฐาน speech quality

``__init__`` ต้องเบา: engine child (multiprocessing spawn) import แพ็กเกจนี้ก่อน ``engine_stub``
"""
from __future__ import annotations

WORKER_NAME = "lalin-voice-worker"
WORKER_CONTRACT_VERSION = "1.0"

__all__ = ["WORKER_NAME", "WORKER_CONTRACT_VERSION"]
