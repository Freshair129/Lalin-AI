"""Durable execution receipts — LVP-REQ-020/023/026 (sqlite3 WAL, stdlib).

หนึ่ง deployment = หนึ่ง store; key = (issuer, attempt_id); ``payload_digest`` ตรึงเนื้อหา envelope
สถานะ execution: ACCEPTED → DISPATCHING → RUNNING → FINISHED | UNKNOWN
outcome: SUCCEEDED | FAILED | CANCELLED (เฉพาะ FINISHED)
payload_state: NONE | AVAILABLE | ERASE_REQUESTED | ERASED | EXPIRED

ไม่ใช้ ``jobs.json``/``JobManager`` ของ Studio — reuse เฉพาะแนวคิด atomic write + quarantine (ADR-005)
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

from .timeutil import iso, parse_iso

EXECUTION_STATES = ("ACCEPTED", "DISPATCHING", "RUNNING", "FINISHED", "UNKNOWN")
TERMINAL_STATES = frozenset({"FINISHED", "UNKNOWN"})
OUTCOMES = ("SUCCEEDED", "FAILED", "CANCELLED")
PAYLOAD_STATES = ("NONE", "AVAILABLE", "ERASE_REQUESTED", "ERASED", "EXPIRED")
_CONTENT_GONE = frozenset({"ERASE_REQUESTED", "ERASED", "EXPIRED"})

_SCHEMA = """
CREATE TABLE IF NOT EXISTS receipts (
    issuer TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    invocation_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload_digest TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    profile_revision TEXT NOT NULL,
    runtime_id TEXT NOT NULL,
    runtime_epoch TEXT NOT NULL,
    lease_id TEXT,
    content_fence TEXT,
    start_before TEXT,
    deadline_at TEXT,
    execution_status TEXT NOT NULL,
    operation_outcome TEXT,
    cancellation_requested INTEGER NOT NULL DEFAULT 0,
    compute_stopped INTEGER,
    stop_evidence TEXT,
    payload_state TEXT NOT NULL,
    payload_created_at TEXT,
    result TEXT,
    error TEXT,
    usage TEXT,
    safe_to_retry INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    PRIMARY KEY (issuer, attempt_id)
);
CREATE INDEX IF NOT EXISTS receipts_epoch_status ON receipts (runtime_epoch, execution_status);
CREATE INDEX IF NOT EXISTS receipts_finished_at ON receipts (finished_at);
"""

_JSON_COLUMNS = ("stop_evidence", "result", "error", "usage")
_BOOL_COLUMNS = ("cancellation_requested", "compute_stopped", "safe_to_retry")


def _to_bool(value: Any) -> bool | None:
    if value is None:
        return None
    return bool(value)


def _to_json(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _from_json(value: Any) -> Any:
    if value is None:
        return None
    return json.loads(value)


@dataclass(frozen=True)
class Receipt:
    issuer: str
    attempt_id: str
    invocation_id: str
    kind: str
    payload_digest: str
    profile_id: str
    profile_revision: str
    runtime_id: str
    runtime_epoch: str
    lease_id: str | None
    content_fence: str | None
    start_before: str | None
    deadline_at: str | None
    execution_status: str
    operation_outcome: str | None
    cancellation_requested: bool
    compute_stopped: bool | None
    stop_evidence: dict[str, Any] | None
    payload_state: str
    payload_created_at: str | None
    result: dict[str, Any] | None
    error: dict[str, Any] | None
    usage: dict[str, Any] | None
    safe_to_retry: bool | None
    created_at: str
    updated_at: str
    started_at: str | None
    finished_at: str | None

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "Receipt":
        data = dict(row)
        for column in _JSON_COLUMNS:
            data[column] = _from_json(data.get(column))
        for column in _BOOL_COLUMNS:
            data[column] = _to_bool(data.get(column))
        data["cancellation_requested"] = bool(data.get("cancellation_requested"))
        return cls(**data)

    @property
    def is_terminal(self) -> bool:
        return self.execution_status in TERMINAL_STATES

    def to_status(self) -> dict[str, Any]:
        """รูปที่ส่งให้ coordinator — ไม่มี path ในระบบไฟล์, ไม่มี digest ของเนื้อหาผู้ใช้."""
        return {
            "attempt_id": self.attempt_id,
            "invocation_id": self.invocation_id,
            "kind": self.kind,
            "runtime_id": self.runtime_id,
            "runtime_epoch": self.runtime_epoch,
            "profile_id": self.profile_id,
            "profile_revision": self.profile_revision,
            "content_fence": self.content_fence,
            "execution_status": self.execution_status,
            "operation_outcome": self.operation_outcome,
            "cancellation_requested": self.cancellation_requested,
            "compute_stopped": self.compute_stopped,
            "stop_evidence": self.stop_evidence,
            "payload_state": self.payload_state,
            "result": self.result,
            "error": self.error,
            "usage": self.usage,
            "safe_to_retry": self.safe_to_retry,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }


class ReceiptStore:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = self._connect()
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(_SCHEMA)
        finally:
            conn.close()

    # ── plumbing ─────────────────────────────────────────────
    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.path), timeout=15.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=15000")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def _tx(self, fn: Callable[[sqlite3.Connection], Any]) -> Any:
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                result = fn(conn)
            except Exception:
                conn.execute("ROLLBACK")
                raise
            conn.execute("COMMIT")
            return result
        finally:
            conn.close()

    def _read(self, fn: Callable[[sqlite3.Connection], Any]) -> Any:
        conn = self._connect()
        try:
            return fn(conn)
        finally:
            conn.close()

    @staticmethod
    def _fetch(conn: sqlite3.Connection, issuer: str, attempt_id: str) -> Receipt | None:
        row = conn.execute(
            "SELECT * FROM receipts WHERE issuer = ? AND attempt_id = ?", (issuer, attempt_id)
        ).fetchone()
        return Receipt.from_row(row) if row is not None else None

    @staticmethod
    def _set(conn: sqlite3.Connection, issuer: str, attempt_id: str, now: datetime, **columns: Any) -> None:
        columns["updated_at"] = iso(now)
        assignments = ", ".join(f"{name} = ?" for name in columns)
        values = [_to_json(v) if name in _JSON_COLUMNS else v for name, v in columns.items()]
        conn.execute(
            f"UPDATE receipts SET {assignments} WHERE issuer = ? AND attempt_id = ?",
            [*values, issuer, attempt_id],
        )

    # ── intake ───────────────────────────────────────────────
    def accept(
        self,
        *,
        issuer: str,
        attempt_id: str,
        invocation_id: str,
        kind: str,
        payload_digest: str,
        profile_id: str,
        profile_revision: str,
        runtime_id: str,
        runtime_epoch: str,
        lease_id: str,
        content_fence: str | None,
        start_before: datetime,
        deadline_at: datetime,
        payload_state: str,
        now: datetime,
    ) -> tuple[Receipt, bool]:
        """insert-if-absent แบบ atomic ข้าม thread/process → (receipt, created)."""
        stamp = iso(now)

        def fn(conn: sqlite3.Connection) -> tuple[Receipt, bool]:
            cur = conn.execute(
                """
                INSERT OR IGNORE INTO receipts (
                    issuer, attempt_id, invocation_id, kind, payload_digest, profile_id, profile_revision,
                    runtime_id, runtime_epoch, lease_id, content_fence, start_before, deadline_at,
                    execution_status, payload_state, payload_created_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACCEPTED', ?, ?, ?, ?)
                """,
                (
                    issuer, attempt_id, invocation_id, kind, payload_digest, profile_id, profile_revision,
                    runtime_id, runtime_epoch, lease_id, content_fence, iso(start_before), iso(deadline_at),
                    payload_state, stamp if payload_state == "AVAILABLE" else None, stamp, stamp,
                ),
            )
            created = cur.rowcount == 1
            receipt = self._fetch(conn, issuer, attempt_id)
            assert receipt is not None
            return receipt, created

        return self._tx(fn)

    def get(self, issuer: str, attempt_id: str) -> Receipt | None:
        return self._read(lambda conn: self._fetch(conn, issuer, attempt_id))

    def mark_dispatching(self, issuer: str, attempt_id: str, now: datetime) -> Receipt | None:
        """ACCEPTED → DISPATCHING; คืน None ถ้าถูก cancel/erase ไปก่อน (caller ห้าม dispatch)."""

        def fn(conn: sqlite3.Connection) -> Receipt | None:
            current = self._fetch(conn, issuer, attempt_id)
            if current is None or current.execution_status != "ACCEPTED":
                return None
            self._set(conn, issuer, attempt_id, now, execution_status="DISPATCHING")
            return self._fetch(conn, issuer, attempt_id)

        return self._tx(fn)

    def mark_running(self, issuer: str, attempt_id: str, now: datetime) -> Receipt | None:
        def fn(conn: sqlite3.Connection) -> Receipt | None:
            current = self._fetch(conn, issuer, attempt_id)
            if current is None or current.execution_status != "DISPATCHING":
                return current
            self._set(conn, issuer, attempt_id, now, execution_status="RUNNING", started_at=iso(now))
            return self._fetch(conn, issuer, attempt_id)

        return self._tx(fn)

    # ── terminal transitions ─────────────────────────────────
    def finish(
        self,
        issuer: str,
        attempt_id: str,
        *,
        outcome: str,
        result: dict[str, Any] | None,
        error: dict[str, Any] | None,
        usage: dict[str, Any] | None,
        compute_stopped: bool | None,
        stop_evidence: dict[str, Any] | None,
        safe_to_retry: bool | None,
        now: datetime,
    ) -> Receipt | None:
        """ปิด attempt; เคารพ erase fence (ผลลัพธ์ที่มาช้าไม่ทำให้เนื้อหากลับมา); FINISHED/UNKNOWN เป็น final."""
        if outcome not in OUTCOMES:
            raise ValueError(outcome)

        def fn(conn: sqlite3.Connection) -> Receipt | None:
            current = self._fetch(conn, issuer, attempt_id)
            if current is None:
                return None
            if current.is_terminal:
                return current
            payload_state = current.payload_state
            stored_result = result
            payload_created_at = current.payload_created_at
            if payload_state in _CONTENT_GONE:
                stored_result = None
                payload_state = "EXPIRED" if payload_state == "EXPIRED" else "ERASED"
            elif outcome == "SUCCEEDED" and stored_result is not None:
                payload_state = "AVAILABLE"
                payload_created_at = payload_created_at or iso(now)
            else:
                # ไม่มีเนื้อหาให้เก็บ (ล้มเหลว/ยกเลิก) → caller ลบไฟล์แล้ว → NONE
                payload_state = "NONE"
                stored_result = None
            self._set(
                conn, issuer, attempt_id, now,
                execution_status="FINISHED",
                operation_outcome=outcome,
                result=stored_result,
                error=error,
                usage=usage,
                compute_stopped=None if compute_stopped is None else int(compute_stopped),
                stop_evidence=stop_evidence,
                safe_to_retry=None if safe_to_retry is None else int(safe_to_retry),
                payload_state=payload_state,
                payload_created_at=payload_created_at,
                finished_at=iso(now),
            )
            return self._fetch(conn, issuer, attempt_id)

        return self._tx(fn)

    def request_cancel(self, issuer: str, attempt_id: str, now: datetime) -> tuple[Receipt | None, str]:
        """คืน (receipt, disposition) — ACK | CANCELLED_BEFORE_START | ALREADY_FINISHED | UNSUPPORTED."""

        def fn(conn: sqlite3.Connection) -> tuple[Receipt | None, str]:
            current = self._fetch(conn, issuer, attempt_id)
            if current is None:
                return None, "NOT_FOUND"
            if current.execution_status == "FINISHED":
                return current, "ALREADY_FINISHED"
            if current.execution_status == "UNKNOWN":
                return current, "UNSUPPORTED"
            if current.execution_status == "ACCEPTED":
                self._set(
                    conn, issuer, attempt_id, now,
                    execution_status="FINISHED",
                    operation_outcome="CANCELLED",
                    cancellation_requested=1,
                    compute_stopped=1,
                    stop_evidence={"kind": "never_started", "observed_at": iso(now)},
                    safe_to_retry=1,
                    result=None,
                    finished_at=iso(now),
                )
                return self._fetch(conn, issuer, attempt_id), "CANCELLED_BEFORE_START"
            self._set(conn, issuer, attempt_id, now, cancellation_requested=1)
            return self._fetch(conn, issuer, attempt_id), "ACK"

        return self._tx(fn)

    def request_erase(self, issuer: str, attempt_id: str, now: datetime) -> Receipt | None:
        """สร้าง erase fence: terminal → ERASED ทันที; ยังทำอยู่ → ERASE_REQUESTED (ผลที่มาช้าถูกทิ้ง)."""

        def fn(conn: sqlite3.Connection) -> Receipt | None:
            current = self._fetch(conn, issuer, attempt_id)
            if current is None:
                return None
            if current.payload_state in {"ERASED", "EXPIRED"}:
                return current
            new_state = "ERASED" if current.is_terminal else "ERASE_REQUESTED"
            self._set(conn, issuer, attempt_id, now, payload_state=new_state, result=None)
            return self._fetch(conn, issuer, attempt_id)

        return self._tx(fn)

    def mark_erased(self, issuer: str, attempt_id: str, now: datetime) -> Receipt | None:
        def fn(conn: sqlite3.Connection) -> Receipt | None:
            current = self._fetch(conn, issuer, attempt_id)
            if current is None or current.payload_state in {"ERASED", "EXPIRED"}:
                return current
            self._set(conn, issuer, attempt_id, now, payload_state="ERASED", result=None)
            return self._fetch(conn, issuer, attempt_id)

        return self._tx(fn)

    # ── restart / engine-loss reconciliation ─────────────────
    def reconcile(self, current_epoch: str, now: datetime) -> dict[str, int]:
        """หลัง process restart: งานของ epoch เก่าที่ยังไม่จบ → never_started (ถ้ายังไม่ dispatch) หรือ UNKNOWN."""
        counts = {"never_started": 0, "unknown": 0}

        def fn(conn: sqlite3.Connection) -> dict[str, int]:
            rows = conn.execute(
                "SELECT * FROM receipts WHERE runtime_epoch != ? AND execution_status IN ('ACCEPTED', 'DISPATCHING', 'RUNNING')",
                (current_epoch,),
            ).fetchall()
            for row in rows:
                receipt = Receipt.from_row(row)
                if receipt.execution_status == "ACCEPTED":
                    self._set(
                        conn, receipt.issuer, receipt.attempt_id, now,
                        execution_status="FINISHED",
                        operation_outcome="FAILED",
                        error={"code": "RUNTIME_FAILED", "message": "worker restarted before the attempt was dispatched"},
                        compute_stopped=1,
                        stop_evidence={"kind": "never_started", "observed_at": iso(now)},
                        safe_to_retry=1,
                        result=None,
                        finished_at=iso(now),
                    )
                    counts["never_started"] += 1
                else:
                    self._set(
                        conn, receipt.issuer, receipt.attempt_id, now,
                        execution_status="UNKNOWN",
                        error={"code": "EXECUTION_UNKNOWN", "message": "worker restarted while the attempt was in flight; compute state unverified"},
                        compute_stopped=None,
                        stop_evidence={"kind": "parent_restarted_unverified", "observed_at": iso(now)},
                        safe_to_retry=0,
                        result=None,
                    )
                    counts["unknown"] += 1
            return counts

        return self._tx(fn)

    def mark_engine_lost(
        self, epoch: str, *, evidence: dict[str, Any], compute_stopped: bool | None, now: datetime,
        exclude: tuple[str, str] | None = None,
    ) -> int:
        """engine child ตาย/ถูก terminate: งาน in-flight ของ epoch นั้น → FINISHED/FAILED (มี process-exit evidence) หรือ UNKNOWN."""

        def fn(conn: sqlite3.Connection) -> int:
            rows = conn.execute(
                "SELECT * FROM receipts WHERE runtime_epoch = ? AND execution_status IN ('DISPATCHING', 'RUNNING')",
                (epoch,),
            ).fetchall()
            touched = 0
            for row in rows:
                receipt = Receipt.from_row(row)
                if exclude is not None and (receipt.issuer, receipt.attempt_id) == exclude:
                    continue
                if compute_stopped:
                    self._set(
                        conn, receipt.issuer, receipt.attempt_id, now,
                        execution_status="FINISHED",
                        operation_outcome="FAILED",
                        error={"code": "RUNTIME_FAILED", "message": "engine process exited before returning a result"},
                        compute_stopped=1,
                        stop_evidence=evidence,
                        safe_to_retry=1,
                        result=None,
                        finished_at=iso(now),
                    )
                else:
                    self._set(
                        conn, receipt.issuer, receipt.attempt_id, now,
                        execution_status="UNKNOWN",
                        error={"code": "EXECUTION_UNKNOWN", "message": "engine process unreachable; compute state unverified"},
                        compute_stopped=None,
                        stop_evidence=evidence,
                        safe_to_retry=0,
                        result=None,
                    )
                touched += 1
            return touched

        return self._tx(fn)

    # ── retention ────────────────────────────────────────────
    def sweep(self, now: datetime, *, payload_ttl: timedelta, receipt_horizon: timedelta) -> dict[str, Any]:
        """TTL: payload ที่ค้างเกิน ttl → EXPIRED (caller ลบไฟล์); receipt terminal เกิน horizon → ลบ tombstone."""
        payload_cutoff = iso(now - payload_ttl)
        horizon_cutoff = iso(now - receipt_horizon)

        def fn(conn: sqlite3.Connection) -> dict[str, Any]:
            expired = conn.execute(
                """
                SELECT issuer, attempt_id FROM receipts
                WHERE payload_state IN ('AVAILABLE', 'ERASE_REQUESTED')
                  AND COALESCE(payload_created_at, created_at) < ?
                """,
                (payload_cutoff,),
            ).fetchall()
            pairs = [(row["issuer"], row["attempt_id"]) for row in expired]
            for issuer, attempt_id in pairs:
                self._set(conn, issuer, attempt_id, now, payload_state="EXPIRED", result=None)
            purged = conn.execute(
                "DELETE FROM receipts WHERE execution_status IN ('FINISHED', 'UNKNOWN') AND finished_at IS NOT NULL AND finished_at < ?",
                (horizon_cutoff,),
            ).rowcount
            return {"expired_payloads": pairs, "purged_receipts": purged}

        return self._tx(fn)

    def count_active(self, epoch: str) -> int:
        return self._read(
            lambda conn: conn.execute(
                "SELECT COUNT(*) FROM receipts WHERE runtime_epoch = ? AND execution_status IN ('ACCEPTED', 'DISPATCHING', 'RUNNING')",
                (epoch,),
            ).fetchone()[0]
        )


def remaining_budget_seconds(deadline_at: str, now: datetime) -> float:
    return (parse_iso(deadline_at) - now).total_seconds()


__all__ = [
    "EXECUTION_STATES",
    "OUTCOMES",
    "PAYLOAD_STATES",
    "TERMINAL_STATES",
    "Receipt",
    "ReceiptStore",
    "remaining_budget_seconds",
]
