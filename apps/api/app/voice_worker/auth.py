"""Service authentication — LVP-REQ-024 (D2 default: static service credentials, สองบทบาท).

  • ``inference`` — coordinator deployment (issuer) ที่ส่งงาน/อ่านสถานะ/ดึงผล/cancel/erase
  • ``management`` — lifecycle (load/drain/unload ใน Slice B); ใช้ยิงงานไม่ได้ (SCOPE_DENIED)
ไม่มี CORS, ไม่มี end-user key; เปรียบเทียบด้วย ``hmac.compare_digest``
"""
from __future__ import annotations

import hmac
from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, Request

from .errors import WorkerError
from .settings import WorkerSettings
from .timeutil import utc_now

Role = Literal["inference", "management"]


def constant_time_token_match(expected: str, presented: str | None) -> bool:
    """เทียบ token แบบเวลาไม่ขึ้นกับเนื้อหา (hmac.compare_digest) — ใช้ทั้ง worker และ status gateway"""
    if not expected or not presented:
        return False
    return hmac.compare_digest(expected.encode("utf-8"), presented.encode("utf-8"))


@dataclass(frozen=True)
class Principal:
    role: Role
    issuer: str


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def authenticate(request: Request, settings: WorkerSettings) -> Principal:
    token = _bearer(request)
    if token is None:
        raise WorkerError("UNAUTHORIZED", "missing or malformed bearer credential")
    expires = settings.credentials_expire_at
    if expires is not None and utc_now() >= expires:
        raise WorkerError("UNAUTHORIZED", "service credential expired")
    matched: Principal | None = None
    # เทียบทุก credential เสมอ (ไม่ early-return) เพื่อไม่ให้เวลาตอบบอกว่า issuer ไหนมีอยู่
    for issuer, expected in settings.inference_credentials.items():
        if constant_time_token_match(expected, token):
            matched = Principal("inference", issuer)
    if settings.management_token is not None and constant_time_token_match(settings.management_token, token):
        matched = Principal("management", "management")
    if matched is None:
        raise WorkerError("UNAUTHORIZED", "credential not recognized")
    return matched


def _settings(request: Request) -> WorkerSettings:
    return request.app.state.settings


def current_principal(request: Request) -> Principal:
    return authenticate(request, _settings(request))


def require_inference(principal: Principal = Depends(current_principal)) -> Principal:
    if principal.role != "inference":
        raise WorkerError("SCOPE_DENIED", "management credential cannot invoke inference operations")
    return principal


def require_any_role(principal: Principal = Depends(current_principal)) -> Principal:
    return principal


__all__ = ["Principal", "authenticate", "constant_time_token_match", "current_principal", "require_any_role", "require_inference"]
