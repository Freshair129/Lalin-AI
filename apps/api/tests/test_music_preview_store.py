from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services import music_previews


def test_expired_preview_is_rejected_and_removed(tmp_path, monkeypatch):
    monkeypatch.setattr(music_previews, "preview_root", lambda: tmp_path)
    preview_id = music_previews.new_preview_id()
    expires = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    music_previews.save_revision(preview_id, 1, {
        "preview_id": preview_id,
        "revision": 1,
        "expires_at": expires,
        "audio_preview": {"global_only_url": "/unused"},
    })

    with pytest.raises(music_previews.MusicPreviewError) as error:
        music_previews.load_revision(preview_id, 1)
    assert error.value.status_code == 410
    assert error.value.code == "preview_expired"
    assert not (tmp_path / preview_id).exists()


def test_old_revision_is_stale_after_manual_revision(tmp_path, monkeypatch):
    monkeypatch.setattr(music_previews, "preview_root", lambda: tmp_path)
    preview_id = music_previews.new_preview_id()
    future = music_previews.expires_at()
    music_previews.save_revision(preview_id, 1, {"revision": 1, "expires_at": future})
    music_previews.save_revision(preview_id, 2, {"revision": 2, "expires_at": future})

    with pytest.raises(music_previews.MusicPreviewError) as error:
        music_previews.load_revision(preview_id, 1)
    assert error.value.status_code == 409
    assert error.value.code == "stale_warp_preview"
    loaded, _ = music_previews.load_revision(preview_id, 2)
    assert loaded["revision"] == 2
