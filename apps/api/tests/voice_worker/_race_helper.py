"""helper ที่ child process (spawn) import ได้ — ใช้ใน test_receipts_idempotency (cross-process race)."""
from __future__ import annotations

from datetime import timedelta
from pathlib import Path

from app.voice_worker.receipts import ReceiptStore
from app.voice_worker.timeutil import utc_now


def accept_once(path: str, attempt_id: str, digest: str) -> bool:
    store = ReceiptStore(Path(path))
    now = utc_now()
    _receipt, created = store.accept(
        issuer="prp-race", attempt_id=attempt_id, invocation_id="inv", kind="asr", payload_digest=digest,
        profile_id="asr-stub-01", profile_revision="rev-test-1", runtime_id="speech-stub-asr", runtime_epoch="ep-race",
        lease_id="lease", content_fence=None, start_before=now + timedelta(seconds=60), deadline_at=now + timedelta(seconds=120),
        payload_state="AVAILABLE", now=now,
    )
    return created
