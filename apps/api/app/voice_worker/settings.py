"""Worker settings — namespace ``LALIN_VOICE_WORKER_*`` แยกจาก Studio (``GMUSIC_*`` / ``app.config``).

ไม่อ่าน ``.env`` อัตโนมัติ (กันปน Studio secrets) และ data dir ต้องไม่ใช่ ``runtime/data`` ของ Studio
"""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from .contract import ID_PATTERN

MIN_TOKEN_LENGTH = 16
_ID_RE = re.compile(ID_PATTERN)


class ConfigError(ValueError):
    """config ไม่ปลอดภัย/ไม่ครบ → fail-closed ตอน start."""


def _repo_root() -> Path:
    # apps/api/app/voice_worker/settings.py → parents[4] = repo root
    return Path(__file__).resolve().parents[4]


def _default_data_dir() -> Path:
    return _repo_root() / "runtime" / "voice-worker"


class WorkerSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LALIN_VOICE_WORKER_", env_file=None, extra="ignore")

    profile_path: Path | None = None
    data_dir: Path = Field(default_factory=_default_data_dir)
    host: str = "127.0.0.1"
    port: int = 8790
    log_level: str = "info"

    # D2: static service credentials — issuer → token (inference) และ management token แยก
    inference_credentials: dict[str, str] = Field(default_factory=dict)
    management_token: str | None = None
    credentials_expire_at: datetime | None = None

    heartbeat_stale_seconds: float = 2.0
    engine_hello_timeout_seconds: float = 30.0
    cancel_grace_seconds: float = 1.0
    terminate_grace_seconds: float = 3.0
    clock_skew_tolerance_seconds: float = 2.0

    payload_ttl_hours: float = 24.0
    receipt_horizon_hours: float = 48.0

    source_commit: str | None = None

    def validate_runtime(self) -> None:
        """ตรวจก่อน bind port; ผิดข้อเดียว → ConfigError (ไม่ start แบบครึ่งเดียว)."""
        for issuer, token in self.inference_credentials.items():
            if not _ID_RE.match(issuer):
                raise ConfigError(f"issuer id '{issuer}' ต้องตรง pattern {ID_PATTERN}")
            if not isinstance(token, str) or len(token) < MIN_TOKEN_LENGTH:
                raise ConfigError(f"inference token ของ issuer '{issuer}' สั้นกว่า {MIN_TOKEN_LENGTH} ตัวอักษร")
        if self.management_token is not None and len(self.management_token) < MIN_TOKEN_LENGTH:
            raise ConfigError(f"management token สั้นกว่า {MIN_TOKEN_LENGTH} ตัวอักษร")
        if self.management_token is not None and self.management_token in self.inference_credentials.values():
            raise ConfigError("management token ต้องไม่ซ้ำกับ inference token (แยกสิทธิ์ control)")
        if self.credentials_expire_at is not None and self.credentials_expire_at.tzinfo is None:
            raise ConfigError("credentials_expire_at ต้องมี timezone")
        if not (0 < self.payload_ttl_hours <= 24):
            raise ConfigError("payload_ttl_hours ต้องอยู่ใน (0, 24] ตาม LVP-REQ-026")
        if self.receipt_horizon_hours < self.payload_ttl_hours:
            raise ConfigError("receipt_horizon_hours ต้องไม่น้อยกว่า payload_ttl_hours")
        resolved = self.data_dir.resolve()
        if resolved.name == "data" and resolved.parent.name == "runtime":
            raise ConfigError("data_dir ต้องไม่ใช่ runtime/data ของ Studio (LVP-REQ-003/025)")
        if self.host not in {"127.0.0.1", "::1", "localhost"} and not self.host.startswith("unix:"):
            # D2 default: private bind; การเปิด interface อื่นต้องอยู่หลัง TLS/tunnel ที่ review แล้ว
            raise ConfigError("host ต้องเป็น loopback ใน Phase 1 (ใช้ tunnel/reverse proxy สำหรับ private network)")
        if self.host.startswith("unix:"):
            # ตรวจตอน validate เพื่อให้ล้มก่อน engine สตาร์ท (เดิมผ่าน validate แล้วไปพังตอน bind ด้วย exit 1)
            socket_path = self.unix_socket_path
            if socket_path is None or not socket_path.is_absolute():
                raise ConfigError("host unix: ต้องตามด้วย absolute path เช่น unix:/run/voice-worker/worker.sock")
            if not socket_path.parent.is_dir():
                raise ConfigError(f"โฟลเดอร์ของ unix socket ไม่มีอยู่: {socket_path.parent} (สร้างและตั้งสิทธิ์ 0750 ก่อน)")

    @property
    def unix_socket_path(self) -> Path | None:
        """path ของ Unix domain socket เมื่อ host = ``unix:/abs/path`` (Linux deployment, D11) มิฉะนั้น None

        uvicorn ตั้งสิทธิ์ไฟล์ socket เป็น 0666 เองหลัง bind (ทับ umask) → การคุมการเข้าถึงต้องทำที่โฟลเดอร์แม่ (0750)
        ทุก route นอกจาก /health/live ยังต้องใช้ bearer token อยู่ดี"""
        if not self.host.startswith("unix:"):
            return None
        raw = self.host[len("unix:"):]
        return Path(raw) if raw else None

    @property
    def receipts_path(self) -> Path:
        return self.data_dir / "receipts.sqlite3"

    @property
    def attempts_dir(self) -> Path:
        return self.data_dir / "attempts"


__all__ = ["ConfigError", "MIN_TOKEN_LENGTH", "WorkerSettings"]
