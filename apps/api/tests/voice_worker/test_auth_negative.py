# @req FR-19.2 (candidate) — LVP-AT-024: negative service auth + control separation
from __future__ import annotations

from datetime import timedelta

from app.voice_worker.timeutil import utc_now

from .conftest import INFERENCE_TOKEN, MANAGEMENT_TOKEN, OTHER_TOKEN, auth

PROTECTED = (
    ("GET", "/worker/v1/describe"),
    ("GET", "/worker/v1/readiness"),
    ("GET", "/worker/v1/operations/attempt-x"),
    ("POST", "/worker/v1/operations/attempt-x/cancel"),
    ("GET", "/worker/v1/operations/attempt-x/output"),
    ("DELETE", "/worker/v1/operations/attempt-x/payload"),
    ("POST", "/worker/v1/operations"),
)


def _call(client, method, path, headers=None, **kwargs):
    return client.request(method, path, headers=headers or {}, **kwargs)


def test_missing_credential_is_denied_everywhere_except_liveness(worker_factory):
    worker = worker_factory("asr")
    assert worker.client.get("/health/live").status_code == 200
    for method, path in PROTECTED:
        response = _call(worker.client, method, path)
        assert response.status_code == 401, (method, path, response.text)
        body = response.json()["error"]
        assert body["code"] == "UNAUTHORIZED"
        assert body["request_id"].startswith("req-")
        assert "Traceback" not in response.text


def test_wrong_and_malformed_credentials_are_denied(worker_factory):
    worker = worker_factory("asr")
    for headers in ({"Authorization": "Bearer nope-nope-nope-nope-nope"}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer "}):
        response = worker.client.get("/worker/v1/describe", headers=headers)
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_management_credential_cannot_invoke_inference_but_can_observe(worker_factory):
    worker = worker_factory("tts")
    assert worker.client.get("/worker/v1/describe", headers=auth(MANAGEMENT_TOKEN)).status_code == 200
    assert worker.client.get("/worker/v1/readiness", headers=auth(MANAGEMENT_TOKEN)).status_code == 200
    denied = worker.post_tts(worker.envelope("attempt-mgmt"), token=MANAGEMENT_TOKEN)
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "SCOPE_DENIED"
    assert worker.status("attempt-mgmt", token=MANAGEMENT_TOKEN).status_code == 403
    assert worker.status("attempt-mgmt").status_code == 404  # ไม่เคยถูก accept


def test_expired_credentials_are_denied(worker_factory):
    worker = worker_factory("asr", settings={"credentials_expire_at": utc_now() - timedelta(seconds=1)})
    response = worker.client.get("/worker/v1/describe", headers=auth(INFERENCE_TOKEN))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_unauthorized_status_lookup_does_not_reveal_existence(worker_factory):
    worker = worker_factory("tts")
    accepted = worker.post_tts(worker.envelope("attempt-secret"))
    assert accepted.status_code == 202
    anonymous = worker.status("attempt-secret", token="not-a-real-token-xxxxxxxx")
    assert anonymous.status_code == 401
    assert anonymous.json()["error"]["code"] == "UNAUTHORIZED"
    # issuer อื่น (scope อื่น) ได้ 404 รูปเดียวกับ attempt ที่ไม่มีอยู่จริง
    other_existing = worker.status("attempt-secret", token=OTHER_TOKEN).json()
    other_missing = worker.status("attempt-never", token=OTHER_TOKEN).json()
    assert other_existing["error"]["code"] == other_missing["error"]["code"] == "NOT_FOUND"
    assert set(other_existing["error"]) == set(other_missing["error"])


def test_liveness_body_carries_no_runtime_details(worker_factory):
    worker = worker_factory("asr")
    body = worker.client.get("/health/live").json()
    assert body["status"] == "live"
    assert not ({"runtime_epoch", "profiles", "engine", "residency"} & set(body))
