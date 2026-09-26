# @req FR-07 — POST /files/upload: กัน path traversal + ไม่ทับไฟล์เดิม (G-10)
"""ก่อนแก้: dest = uploads_dir / file.filename แล้ว write_bytes ตรง ๆ — ไม่มีการกรองเลย
filename ที่มี ../ เขียนออกนอก uploads_dir ได้ และอัปโหลดชื่อซ้ำทับของเดิมเงียบ ๆ
(โปรเจกต์ที่อ้าง asset ชื่อนั้นอยู่จะพังทันทีโดยไม่มีการแจ้งเตือน)
"""
from __future__ import annotations


def _upload(client, filename: str, content: bytes = b"RIFFdata"):
    return client.post("/files/upload", files={"file": (filename, content, "audio/wav")})


def test_upload_rejects_path_traversal(client, data_dir):
    r = _upload(client, "../../evil.txt")
    assert r.status_code == 400
    # ต้องไม่มีอะไรถูกเขียนออกนอก uploads_dir เลย
    assert not (data_dir.parent / "evil.txt").exists()
    assert not (data_dir / "evil.txt").exists()


def test_upload_rejects_a_traversal_disguised_with_a_real_extension(client, data_dir):
    r = _upload(client, "../../../windows/system32/config.wav")
    assert r.status_code == 400


def test_upload_rejects_any_embedded_slash_even_without_escaping(client, data_dir):
    """uploads/ ต้องแบนเสมอ — ที่อื่นในระบบ (asset table, /fs) สมมติไว้แบบนั้น"""
    r = _upload(client, "subdir/file.wav")
    assert r.status_code == 400
    r2 = _upload(client, "subdir\\file.wav")
    assert r2.status_code == 400


def test_upload_rejects_dot_and_dotdot_as_the_whole_name(client, data_dir):
    assert _upload(client, "..").status_code == 400
    assert _upload(client, ".").status_code == 400


def test_upload_same_name_same_content_is_idempotent(client, data_dir):
    first = _upload(client, "song.wav", b"RIFFsong")
    assert first.status_code == 200
    second = _upload(client, "song.wav", b"RIFFsong")
    assert second.status_code == 200
    assert second.json()["filename"] == "song.wav"
    assert len(list((data_dir / "uploads").glob("song*.wav"))) == 1
    assert (data_dir / "uploads" / "song.wav").read_bytes() == b"RIFFsong"


def test_upload_same_name_different_content_never_overwrites(client, data_dir):
    first = _upload(client, "song.wav", b"ORIGINAL")
    assert first.status_code == 200

    second = _upload(client, "song.wav", b"DIFFERENT")
    assert second.status_code == 200
    new_name = second.json()["filename"]

    assert new_name != "song.wav"
    assert (data_dir / "uploads" / "song.wav").read_bytes() == b"ORIGINAL"     # ของเดิมไม่ถูกแตะ
    assert (data_dir / "uploads" / new_name).read_bytes() == b"DIFFERENT"


def test_resolve_upload_rejects_traversal(client, data_dir):
    """resolve_upload() ใช้แปลง source_audio/beat_audio จาก dubbing/mastering/remix —
    ก่อนแก้ไม่มีการเช็ค containment เลย เป็นช่องโหว่อ่านไฟล์นอก uploads_dir ได้"""
    from app.routers.files import resolve_upload
    from fastapi import HTTPException
    import pytest

    with pytest.raises(HTTPException) as exc:
        resolve_upload("../../../etc/passwd")
    assert exc.value.status_code == 400


def test_resolve_upload_still_finds_a_real_upload(client, data_dir):
    _upload(client, "real.wav", b"RIFFreal")
    from app.routers.files import resolve_upload

    p = resolve_upload("real.wav")
    assert p.endswith("real.wav")


def test_playback_resolver_allows_only_existing_files_in_owned_roots(client, data_dir):
    upload = _upload(client, "studio.wav", b"RIFFupload")
    assert upload.status_code == 200
    output_dir = data_dir / "outputs" / "rendered"
    output_dir.mkdir(parents=True)
    (output_dir / "mix.mp3").write_bytes(b"ID3output")
    workspace_dir = data_dir / "workspace" / "ไทย"
    workspace_dir.mkdir(parents=True)
    (workspace_dir / "เสียง.wav").write_bytes(b"RIFFworkspace")

    resolved_upload = client.get("/files/resolve", params={"kind": "upload", "name": "studio.wav"})
    resolved_output = client.get("/files/resolve", params={"kind": "output", "name": "rendered/mix.mp3"})
    resolved_workspace = client.get("/files/resolve", params={"kind": "workspace", "name": "ไทย/เสียง.wav"})

    assert resolved_upload.status_code == 200
    assert resolved_upload.json()["path"] == str(data_dir / "uploads" / "studio.wav")
    assert resolved_output.status_code == 200
    assert resolved_output.json()["path"] == str(output_dir / "mix.mp3")
    assert resolved_workspace.status_code == 200
    assert resolved_workspace.json()["path"] == str(workspace_dir / "เสียง.wav")


def test_playback_resolver_rejects_untrusted_or_unplayable_references(client, data_dir):
    outside = data_dir.parent / "outside.wav"
    outside.write_bytes(b"RIFFoutside")

    assert client.get("/files/resolve", params={"kind": "upload", "name": "missing.wav"}).status_code == 404
    assert client.get("/files/resolve", params={"kind": "upload", "name": "../outside.wav"}).status_code == 400
    assert client.get("/files/resolve", params={"kind": "output", "name": "../outside.wav"}).status_code == 400
    assert client.get("/files/resolve", params={"kind": "workspace", "name": "../outside.wav"}).status_code == 400
    assert client.get("/files/resolve", params={"kind": "workspace", "name": "https://example.com/a.wav"}).status_code == 404
    assert client.get("/files/resolve", params={"kind": "upload", "name": "not-audio.txt"}).status_code == 404
