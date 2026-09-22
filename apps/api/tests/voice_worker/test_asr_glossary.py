# @req FR-19 (candidate, CR-005) — D15 (a): AsrInput.glossary ต่อ request → whisper initial_prompt
"""ตัดสิน 2026-09-22 (Fable 5.1 แทนเจ้าของ): glossary ต่อ request, optional, ไม่มี default ระดับ profile
- จำกัดขนาด: ≤ 64 รายการ, แต่ละรายการ 1–40 code point หลัง norm-v1, รวม ≤ 400 → เกิน = 422 INVALID_REQUEST
- อยู่ใน envelope_digest (retry ด้วย glossary ต่างกัน = IDEMPOTENCY_CONFLICT) แต่ไม่เก็บข้อความใน receipt/ไฟล์ใด ๆ
- result.glossary_applied มีเฉพาะเมื่อส่ง glossary มา · stub = false (ไม่ใช้จริง) · describe บอก capabilities.asr_glossary
"""
from __future__ import annotations

import pytest

from app.voice_worker.contract import AsrInput, glossary_prompt

from .conftest import auth

TERM = "ลลินโกลเดนเทสต์"  # คำที่ไม่มีทางอยู่ในไฟล์ของ worker โดยบังเอิญ


def _asr(worker, attempt: str, glossary):
    env = worker.envelope(attempt)
    env["input"]["glossary"] = glossary
    return env


def test_terms_are_normalized_and_joined_as_prompt():
    parsed = AsrInput(language="th", audio_sha256="0" * 64, audio_bytes=1, declared_mime_type="audio/wav",
                      glossary=["  ลลิน   สตูดิโอ ", "PRP"])
    assert parsed.glossary == ["ลลิน สตูดิโอ", "PRP"]
    assert glossary_prompt(parsed.glossary) == "ลลิน สตูดิโอ, PRP"
    assert glossary_prompt(None) is None


@pytest.mark.parametrize("glossary", [
    [],                               # ส่ง list ว่าง = ไม่ตั้งใจ ไม่ใช่ "ไม่มี glossary"
    ["x"] * 65,                       # เกิน 64 รายการ
    ["ก" * 41],                       # รายการเดียวยาวเกิน 40
    ["ก" * 40] * 11,                  # รวม 440 > 400
    ["   "],                          # ว่างหลัง normalize
    ["ok​term"],                 # format character (zero-width space)
    ["bad\x00term"],                  # control character
])
def test_out_of_bounds_glossary_is_rejected_before_acceptance(worker_factory, glossary):
    worker = worker_factory("asr")
    response = worker.post_asr(_asr(worker, "gl-bad", glossary))
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "INVALID_REQUEST"
    assert worker.status("gl-bad").status_code == 404  # ไม่มี receipt


def test_stub_accepts_glossary_but_reports_it_unused(worker_factory):
    worker = worker_factory("asr")
    describe = worker.client.get("/worker/v1/describe", headers={"Authorization": f"Bearer {worker.settings.inference_credentials['prp-coordinator']}"}) \
        if "prp-coordinator" in worker.settings.inference_credentials else None
    assert worker.post_asr(_asr(worker, "gl-stub", [TERM])).status_code == 202
    final = worker.wait_terminal("gl-stub")
    assert final["operation_outcome"] == "SUCCEEDED"
    assert final["result"]["glossary_applied"] is False


def test_no_glossary_means_no_glossary_field(worker_factory):
    worker = worker_factory("asr")
    assert worker.post_asr(worker.envelope("gl-none")).status_code == 202
    final = worker.wait_terminal("gl-none")
    assert final["operation_outcome"] == "SUCCEEDED" and "glossary_applied" not in final["result"]


def test_glossary_is_part_of_the_idempotency_digest(worker_factory):
    worker = worker_factory("asr")
    env = _asr(worker, "gl-idem", [TERM])
    assert worker.post_asr(env).status_code == 202
    worker.wait_terminal("gl-idem")
    assert worker.post_asr(env).status_code == 200  # retry เดิมเป๊ะ → receipt เดิม
    changed = _asr(worker, "gl-idem", [TERM, "อีกคำ"])
    changed["admission"] = env["admission"]
    conflict = worker.post_asr(changed)
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"


def test_glossary_text_is_never_written_to_disk(worker_factory):
    """glossary อาจมีชื่อลูกค้า: receipt DB, WAL และไฟล์ใน data dir ต้องไม่มีข้อความนี้เลย"""
    worker = worker_factory("asr")
    assert worker.post_asr(_asr(worker, "gl-disk", [TERM])).status_code == 202
    worker.wait_terminal("gl-disk")
    needle = TERM.encode("utf-8")
    files = [p for p in worker.settings.data_dir.rglob("*") if p.is_file()]
    assert files, "expected receipts on disk"
    leaked = [str(p) for p in files if needle in p.read_bytes()]
    assert leaked == []
