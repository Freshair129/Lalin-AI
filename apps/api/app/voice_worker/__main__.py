"""``python -m app.voice_worker`` — fail-closed entrypoint (LVP-REQ-001/002).

ลำดับ: อ่าน settings (``LALIN_VOICE_WORKER_*``) → ตรวจ config → โหลด/ตรวจ profile manifest →
สร้าง app → uvicorn (host loopback, workers=1) ผิดพลาดข้อใด → exit code 2 ไม่มี fallback profile
"""
from __future__ import annotations

import sys
from typing import Callable

from .profile import ProfileError, load_manifest
from .settings import ConfigError, WorkerSettings

EXIT_CONFIG_ERROR = 2


def main(argv: list[str] | None = None, *, run_server: Callable[..., None] | None = None) -> int:
    del argv  # ยังไม่มี CLI flags — config มาจาก env เท่านั้น
    try:
        settings = WorkerSettings()
        settings.validate_runtime()
        manifest = load_manifest(settings.profile_path)
    except (ConfigError, ProfileError) as exc:
        print(f"[voice-worker] fail-closed: {exc}", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    except Exception as exc:  # noqa: BLE001 — config parse errors จาก pydantic ก็ต้อง fail-closed
        print(f"[voice-worker] fail-closed: {exc.__class__.__name__}: {exc}", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    from .app import create_worker_app

    app = create_worker_app(settings, manifest)
    if run_server is None:
        import uvicorn

        run_server = uvicorn.run
    # ส่ง app object (ไม่ใช่ import string) → uvicorn ไม่สามารถ fork หลาย workers ได้ = บังคับ workers=1 (LVP-REQ-006)
    common = {"workers": 1, "log_level": settings.log_level, "access_log": False}
    socket_path = settings.unix_socket_path
    if socket_path is not None:
        # Unix domain socket (Linux, D11): uvicorn รับผ่าน uds= ไม่ใช่ host= — เดิมส่ง "unix:/..." เป็น host
        # ทำให้ uvicorn ไป resolve เป็นชื่อเครื่องแล้วล้ม (Name or service not known) หลัง engine สตาร์ทไปแล้ว
        run_server(app, uds=str(socket_path), **common)
    else:
        run_server(app, host=settings.host, port=settings.port, **common)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
