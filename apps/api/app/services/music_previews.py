"""Expiring, immutable storage for Slice B2 audio previews and maps."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ..config import get_settings

PREVIEW_TTL_SECONDS = 30 * 60
_ID = re.compile(r"^[a-f0-9]{24}$")


class MusicPreviewError(Exception):
    def __init__(self, status_code: int, code: str):
        super().__init__(code)
        self.status_code = status_code
        self.code = code


def preview_root() -> Path:
    root = (get_settings().data_dir / "music-previews").resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def new_preview_id() -> str:
    return uuid.uuid4().hex[:24]


def fingerprint_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def fingerprint_json(value: object) -> str:
    body = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return f"sha256:{hashlib.sha256(body.encode('utf-8')).hexdigest()}"


def revision_dir(preview_id: str, revision: int, *, create: bool = False) -> Path:
    folder = _preview_dir(preview_id) / f"r{int(revision)}"
    if create:
        folder.mkdir(parents=True, exist_ok=True)
    return folder


def save_revision(preview_id: str, revision: int, manifest: dict) -> None:
    folder = revision_dir(preview_id, revision, create=True)
    _atomic_json(folder / "manifest.json", manifest)
    _atomic_json(_preview_dir(preview_id) / "latest.json", {"revision": revision})


def latest_revision(preview_id: str) -> int:
    pointer = _preview_dir(preview_id) / "latest.json"
    if not pointer.is_file():
        raise MusicPreviewError(404, "preview_not_found")
    try:
        value = json.loads(pointer.read_text(encoding="utf-8"))
        return int(value["revision"])
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise MusicPreviewError(404, "preview_not_found") from exc


def load_revision(preview_id: str, revision: int, *, require_latest: bool = True) -> tuple[dict, Path]:
    current = latest_revision(preview_id)
    if require_latest and int(revision) != current:
        raise MusicPreviewError(409, "stale_warp_preview")
    folder = revision_dir(preview_id, revision)
    manifest_path = folder / "manifest.json"
    if not manifest_path.is_file():
        raise MusicPreviewError(404, "preview_not_found")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MusicPreviewError(404, "preview_not_found") from exc
    expires = _parse_time(manifest.get("expires_at"))
    if expires is None or expires <= datetime.now(timezone.utc):
        shutil.rmtree(_preview_dir(preview_id), ignore_errors=True)
        raise MusicPreviewError(410, "preview_expired")
    return manifest, folder


def audio_file(preview_id: str, revision: int, mode: str) -> tuple[dict, Path]:
    if mode not in {"global_only", "warp_candidate"}:
        raise MusicPreviewError(404, "preview_audio_not_found")
    manifest, folder = load_revision(preview_id, revision)
    available = manifest.get("audio_preview", {}).get(mode + "_url")
    if not available:
        raise MusicPreviewError(404, "preview_audio_not_found")
    filename = "global_only.wav" if mode == "global_only" else "warp_candidate.wav"
    path = (folder / filename).resolve()
    if folder.resolve() not in path.parents or not path.is_file():
        raise MusicPreviewError(410, "preview_expired")
    return manifest, path


def cleanup_expired() -> None:
    root = preview_root()
    now = datetime.now(timezone.utc)
    for folder in root.iterdir():
        if not folder.is_dir() or not _ID.fullmatch(folder.name):
            continue
        latest = folder / "latest.json"
        try:
            revision = int(json.loads(latest.read_text(encoding="utf-8"))["revision"])
            manifest = json.loads((folder / f"r{revision}" / "manifest.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
            continue
        expires = _parse_time(manifest.get("expires_at"))
        if expires is None or expires <= now:
            shutil.rmtree(folder, ignore_errors=True)


def expires_at() -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=PREVIEW_TTL_SECONDS)).isoformat()


def _preview_dir(preview_id: str) -> Path:
    if not _ID.fullmatch(preview_id or ""):
        raise MusicPreviewError(400, "invalid_preview_id")
    root = preview_root()
    folder = (root / preview_id).resolve()
    if root not in folder.parents:
        raise MusicPreviewError(400, "invalid_preview_id")
    return folder


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    os.replace(temp, path)


def _parse_time(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except ValueError:
        return None
