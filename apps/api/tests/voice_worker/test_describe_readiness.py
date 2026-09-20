# @req FR-19.5 (candidate) — LVP-AT-006/009/010: describe truthfulness, readiness/epoch, liveness under load
from __future__ import annotations

import time

from .conftest import auth


def test_describe_reports_stub_engine_and_unqualified_profile(worker_factory):
    worker = worker_factory("tts")
    body = worker.client.get("/worker/v1/describe", headers=auth()).json()
    assert body["contract_version"] == "1.0"
    assert body["engine"] == {"name": "stub", "version": "0.1.0-stub", "labeled_stub": True}
    assert body["runtime_epoch"] == worker.epoch and body["runtime_id"] == "speech-stub-tts"
    profile = body["profiles"][0]
    assert profile["state"]["qualified"] is False and "stub" in profile["state"]["qualification_note"]
    assert profile["state"]["loaded"] is True and profile["state"]["ready"] is True
    assert profile["device"] == {"configured": "cpu", "effective": "cpu"}
    assert profile["voices"] == [{"voice_preset_id": "preset-stub-th", "voice_revision": "r1", "language": "th", "rights_status": "stub-synthetic"}]
    assert profile["limits"]["max_text_code_points"] == 800
    assert body["capabilities"]["output_fetch"] is True and body["capabilities"]["text_policy_revision"] == "norm-v1"
    assert body["residency"]["provenance"] == "stub" and body["residency"]["vram_bytes_allocated"] is None
    assert body["capacity"] == {"max_concurrency": 1, "in_use": 0}
    assert isinstance(body["observation_seq"], int) and body["observed_at"]


def test_readiness_is_true_after_startup_and_observations_advance(worker_factory):
    worker = worker_factory("asr")
    first = worker.client.get("/worker/v1/readiness", headers=auth()).json()
    assert first["ready"] is True and first["engine_alive"] is True
    assert first["heartbeat_age_seconds"] is not None and first["heartbeat_age_seconds"] < 2.0
    time.sleep(0.4)
    second = worker.client.get("/worker/v1/readiness", headers=auth()).json()
    assert second["observation_seq"] > first["observation_seq"]
    assert second["observed_at"] >= first["observed_at"]


def test_engine_death_flips_readiness_false_and_restart_changes_epoch(worker_factory):
    worker = worker_factory("asr")
    old_epoch = worker.epoch
    evidence = worker.runtime.supervisor.terminate(grace_seconds=3.0)
    assert evidence["exited"] is True and evidence["kind"] == "process_exit"
    readiness = worker.client.get("/worker/v1/readiness", headers=auth()).json()
    assert readiness["ready"] is False and readiness["engine_alive"] is False
    assert readiness["profiles"][0]["reason"] == "engine_not_running"
    describe = worker.client.get("/worker/v1/describe", headers=auth()).json()
    assert describe["profiles"][0]["state"]["loaded"] is False
    unavailable = worker.post_asr(worker.envelope("while-dead"))
    assert unavailable.status_code == 503 and unavailable.json()["error"]["code"] == "MODEL_UNAVAILABLE"
    assert unavailable.json()["error"]["started"] is False

    new_epoch = worker.runtime.supervisor.start()
    assert new_epoch != old_epoch
    ready = worker.wait_ready()
    assert ready["runtime_epoch"] == new_epoch
    assert worker.post_asr(worker.envelope("after-restart", epoch=old_epoch)).status_code == 409
    assert worker.post_asr(worker.envelope("after-restart-ok")).status_code == 202
    final = worker.wait_terminal("after-restart-ok")
    assert final["operation_outcome"] == "SUCCEEDED" and final["runtime_epoch"] == new_epoch


def test_liveness_and_status_respond_while_inference_runs(worker_factory):
    worker = worker_factory("tts", engine_options={"work_seconds": 2.0})
    assert worker.post_tts(worker.envelope("busy")).status_code == 202
    started = time.monotonic()
    live = worker.client.get("/health/live")
    status = worker.status("busy")
    readiness = worker.client.get("/worker/v1/readiness", headers=auth()).json()
    elapsed = time.monotonic() - started
    assert live.status_code == 200 and status.status_code == 200
    assert status.json()["execution_status"] in {"DISPATCHING", "RUNNING"}
    assert readiness["engine_alive"] is True
    assert elapsed < 1.0, elapsed  # control plane ไม่ถูก block โดย inference
    worker.wait_terminal("busy")
