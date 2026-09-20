# @req decision D12 — pydantic เป็น source of truth: JSON Schema export ต้อง sync + validate ผล runtime จริง
from __future__ import annotations

import json

import pytest

from app.voice_worker.contract import (
    CancelResponse,
    DescribeResponse,
    ErasePayloadResponse,
    ErrorResponse,
    OperationStatus,
    ReadinessResponse,
    parse_envelope,
)
from app.voice_worker.schema import SCHEMA_PATH, build_schema

from .conftest import auth

REQUIRED_DEFS = {
    "InvocationEnvelope",
    "OperationStatus",
    "CancelResponse",
    "ErasePayloadResponse",
    "ErrorResponse",
    "DescribeResponse",
    "ReadinessResponse",
}


def test_committed_schema_is_in_sync_with_pydantic_models():
    """decision D12: contract.py เป็น source of truth — ไฟล์ที่ commit ต้องตรงกับ build_schema() เป๊ะ."""
    generated = json.dumps(build_schema(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    assert SCHEMA_PATH.is_file(), (
        f"{SCHEMA_PATH} is missing — run `python -m app.voice_worker.schema --write` and commit the result"
    )
    committed = SCHEMA_PATH.read_text(encoding="utf-8")
    assert committed == generated, (
        f"{SCHEMA_PATH} is out of sync with app/voice_worker/contract.py — "
        "run `python -m app.voice_worker.schema --write` and commit the result"
    )


def test_schema_defs_cover_every_contract_shape_and_kind_discriminator():
    defs = build_schema()["$defs"]
    missing = REQUIRED_DEFS - set(defs)
    assert not missing, f"missing $defs: {missing}"

    envelope = defs["InvocationEnvelope"]
    assert envelope["discriminator"]["propertyName"] == "kind"
    assert envelope["discriminator"]["mapping"] == {
        "asr": "#/$defs/AsrEnvelope",
        "tts": "#/$defs/TtsEnvelope",
    }
    assert {"AsrEnvelope", "TtsEnvelope", "Target", "Admission", "AsrInput", "TtsInput"} <= set(defs)


@pytest.mark.parametrize("kind", ["asr", "tts"])
def test_example_envelopes_round_trip_through_parse_envelope(worker_factory, kind):
    worker = worker_factory(kind)
    envelope = parse_envelope(worker.envelope(f"schema-example-{kind}"))
    assert envelope.kind == kind
    assert envelope.contract_version == "1.0"


@pytest.mark.parametrize("kind", ["asr", "tts"])
def test_describe_and_readiness_validate_against_response_models(worker_factory, kind):
    worker = worker_factory(kind)
    describe_body = worker.client.get("/worker/v1/describe", headers=auth()).json()
    DescribeResponse.model_validate(describe_body)
    readiness_body = worker.wait_ready()
    ReadinessResponse.model_validate(readiness_body)


def test_tts_operation_lifecycle_bodies_validate_against_response_models(worker_factory):
    worker = worker_factory("tts")
    accepted = worker.post_tts(worker.envelope("schema-tts-op"))
    assert accepted.status_code == 202
    OperationStatus.model_validate(accepted.json())

    final = worker.wait_terminal("schema-tts-op")
    assert final["operation_outcome"] == "SUCCEEDED"
    OperationStatus.model_validate(final)

    cancel = worker.client.post("/worker/v1/operations/schema-tts-op/cancel", headers=auth())
    assert cancel.status_code == 200  # already finished
    CancelResponse.model_validate(cancel.json())

    erase = worker.client.delete("/worker/v1/operations/schema-tts-op/payload", headers=auth())
    assert erase.status_code == 200
    ErasePayloadResponse.model_validate(erase.json())


def test_asr_operation_status_validates(worker_factory):
    worker = worker_factory("asr")
    assert worker.post_asr(worker.envelope("schema-asr-op")).status_code == 202
    final = worker.wait_terminal("schema-asr-op")
    assert final["operation_outcome"] == "SUCCEEDED"
    OperationStatus.model_validate(final)


def test_cancel_before_start_disposition_validates(worker_factory):
    worker = worker_factory("tts", engine_options={"work_seconds": 5.0})
    assert worker.post_tts(worker.envelope("schema-cancel")).status_code == 202
    cancel = worker.client.post("/worker/v1/operations/schema-cancel/cancel", headers=auth())
    assert cancel.status_code == 202
    body = CancelResponse.model_validate(cancel.json())
    assert body.disposition in {"ACK", "CANCELLED_BEFORE_START"}
    worker.client.post("/worker/v1/operations/schema-cancel/cancel", headers=auth())  # drain background task cleanly


def test_erase_during_compute_returns_erase_requested(worker_factory):
    worker = worker_factory("tts", engine_options={"work_seconds": 1.0})
    assert worker.post_tts(worker.envelope("schema-erase-mid")).status_code == 202
    erase = worker.client.delete("/worker/v1/operations/schema-erase-mid/payload", headers=auth())
    ErasePayloadResponse.model_validate(erase.json())
    worker.wait_terminal("schema-erase-mid")


def test_deadline_exceeded_error_body_validates(worker_factory):
    worker = worker_factory("tts")
    env = worker.envelope("schema-deadline", start_in=-30, deadline_in=-1)
    response = worker.post_tts(env)
    assert response.status_code == 409
    ErrorResponse.model_validate(response.json())


def test_unauthorized_error_body_validates(worker_factory):
    worker = worker_factory("asr")
    response = worker.client.get("/worker/v1/describe")
    assert response.status_code == 401
    ErrorResponse.model_validate(response.json())


def test_not_found_error_body_validates(worker_factory):
    worker = worker_factory("asr")
    response = worker.status("does-not-exist")
    assert response.status_code == 404
    ErrorResponse.model_validate(response.json())
