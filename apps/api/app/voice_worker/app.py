"""FastAPI control-plane app ของ voice worker — LVP-REQ-001/002/005/024.

route allowlist เท่านั้น (ADR-005 §3.1): ไม่มี Studio routers, ไม่มี ``/docs``/``/openapi.json``, ไม่มี CORS
"""
from __future__ import annotations

import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from .auth import Principal, require_any_role, require_inference
from .contract import parse_envelope
from .errors import WorkerError
from .profile import ProfileManifest
from .runtime import WorkerRuntime
from .settings import WorkerSettings
from .timeutil import iso, utc_now

logger = logging.getLogger("lalin.voice_worker.http")

ROUTE_ALLOWLIST: tuple[tuple[str, str], ...] = (
    ("GET", "/health/live"),
    ("GET", "/worker/v1/describe"),
    ("GET", "/worker/v1/readiness"),
    ("POST", "/worker/v1/operations"),
    ("GET", "/worker/v1/operations/{attempt_id}"),
    ("POST", "/worker/v1/operations/{attempt_id}/cancel"),
    ("GET", "/worker/v1/operations/{attempt_id}/output"),
    ("DELETE", "/worker/v1/operations/{attempt_id}/payload"),
)

_MULTIPART_OVERHEAD = 64 * 1024
_CHUNK = 64 * 1024

router = APIRouter(prefix="/worker/v1")


def _runtime(request: Request) -> WorkerRuntime:
    return request.app.state.runtime


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "req-unknown")


@router.get("/describe")
async def describe(request: Request, _: Principal = Depends(require_any_role)) -> dict[str, Any]:
    return _runtime(request).describe()


@router.get("/readiness")
async def readiness(request: Request, _: Principal = Depends(require_any_role)) -> dict[str, Any]:
    return _runtime(request).readiness()


async def _read_bounded(upload: Any, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise WorkerError("AUDIO_TOO_LARGE", "audio part exceeds the profile limit", started=False, details={"max_audio_bytes": limit})
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/operations")
async def create_operation(request: Request, principal: Principal = Depends(require_inference)) -> JSONResponse:
    runtime = _runtime(request)
    content_type = (request.headers.get("content-type") or "").lower()
    audio: bytes | None = None
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        raw = form.get("envelope")
        if not isinstance(raw, str):
            raise WorkerError("INVALID_REQUEST", "multipart field 'envelope' (JSON string) is required", started=False)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            raise WorkerError("INVALID_REQUEST", "envelope is not valid JSON", started=False) from None
        upload = form.get("audio")
        if upload is None or isinstance(upload, str):
            raise WorkerError("INVALID_REQUEST", "multipart file field 'audio' is required for asr", started=False)
        audio = await _read_bounded(upload, runtime.manifest.limits.max_audio_bytes)
    elif content_type.startswith("application/json"):
        try:
            data = await request.json()
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
            raise WorkerError("INVALID_REQUEST", "body is not valid JSON", started=False) from None
    else:
        raise WorkerError("INVALID_REQUEST", "content-type must be multipart/form-data (asr) or application/json (tts)", started=False)

    envelope = parse_envelope(data)
    http_status, body = await runtime.submit(principal, envelope, audio)
    headers = {"Location": f"/worker/v1/operations/{envelope.attempt_id}", "X-Request-ID": _request_id(request)}
    return JSONResponse(body, status_code=http_status, headers=headers)


@router.get("/operations/{attempt_id}")
async def get_operation(attempt_id: str, request: Request, principal: Principal = Depends(require_inference)) -> dict[str, Any]:
    return _runtime(request).status(principal, attempt_id)


@router.post("/operations/{attempt_id}/cancel")
async def cancel_operation(attempt_id: str, request: Request, principal: Principal = Depends(require_inference)) -> JSONResponse:
    http_status, body = _runtime(request).cancel(principal, attempt_id)
    return JSONResponse(body, status_code=http_status, headers={"X-Request-ID": _request_id(request)})


@router.get("/operations/{attempt_id}/output")
async def get_output(attempt_id: str, request: Request, principal: Principal = Depends(require_inference)) -> FileResponse:
    path, metadata = _runtime(request).output_file(principal, attempt_id)
    return FileResponse(
        path,
        media_type=metadata.get("mime_type", "application/octet-stream"),
        filename=f"{attempt_id}.{metadata.get('format', 'bin')}",
        headers={
            "X-Content-SHA256": str(metadata.get("sha256", "")),
            "X-Attempt-ID": attempt_id,
            "X-Request-ID": _request_id(request),
            "Cache-Control": "no-store",
        },
    )


@router.delete("/operations/{attempt_id}/payload")
async def erase_payload(attempt_id: str, request: Request, principal: Principal = Depends(require_inference)) -> JSONResponse:
    http_status, body = _runtime(request).erase(principal, attempt_id)
    return JSONResponse(body, status_code=http_status, headers={"X-Request-ID": _request_id(request)})


def create_worker_app(settings: WorkerSettings, manifest: ProfileManifest) -> FastAPI:
    """สร้าง app ที่ mount เฉพาะ allowlist; profile ถูกตรวจแล้วก่อนถึงตรงนี้ (fail-closed ใน ``__main__``)."""
    settings.validate_runtime()
    runtime = WorkerRuntime(settings, manifest)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await runtime.startup()
        try:
            yield
        finally:
            await runtime.shutdown()

    app = FastAPI(title="Lalin Voice Worker", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.settings = settings
    app.state.manifest = manifest
    app.state.runtime = runtime

    @app.middleware("http")
    async def request_context(request: Request, call_next: Any) -> Any:
        request.state.request_id = f"req-{uuid.uuid4().hex[:16]}"
        if request.method == "POST" and request.url.path == "/worker/v1/operations":
            declared = request.headers.get("content-length")
            if declared is not None and declared.isdigit() and int(declared) > manifest.limits.max_audio_bytes + _MULTIPART_OVERHEAD:
                error = WorkerError("AUDIO_TOO_LARGE", "request body exceeds the profile limit", started=False,
                                    details={"max_audio_bytes": manifest.limits.max_audio_bytes})
                return JSONResponse(error.to_body(request.state.request_id), status_code=error.http_status)
        response = await call_next(request)
        response.headers.setdefault("X-Request-ID", request.state.request_id)
        response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.exception_handler(WorkerError)
    async def worker_error_handler(request: Request, exc: WorkerError) -> JSONResponse:
        return JSONResponse(exc.to_body(_request_id(request)), status_code=exc.http_status)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        error = WorkerError("INVALID_REQUEST", "request failed validation",
                            details={"invalid_fields": sorted({".".join(str(p) for p in e.get("loc", ())) for e in exc.errors()})[:20]})
        return JSONResponse(error.to_body(_request_id(request)), status_code=error.http_status)

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error request_id=%s", _request_id(request))
        error = WorkerError("RUNTIME_FAILED", f"internal worker error: {exc.__class__.__name__}")
        return JSONResponse(error.to_body(_request_id(request)), status_code=error.http_status)

    @app.get("/health/live")
    async def health_live() -> dict[str, Any]:
        # generic process liveness เท่านั้น — ไม่บอก readiness/engine/profile (LVP-REQ-010)
        return {"status": "live", "service": "lalin-voice-worker", "observed_at": iso(utc_now())}

    app.include_router(router)
    return app


def registered_routes(app: FastAPI) -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    for route in app.routes:
        methods = getattr(route, "methods", None) or set()
        path = getattr(route, "path", None)
        if path is None:
            continue
        for method in methods:
            if method in {"HEAD", "OPTIONS"}:
                continue
            routes.add((method, path))
    return routes


__all__ = ["ROUTE_ALLOWLIST", "create_worker_app", "registered_routes", "router"]
