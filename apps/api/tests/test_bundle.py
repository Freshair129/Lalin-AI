# @req FR-10 — .gmp bundle: export/import โปรเจกต์ + media ข้ามเครื่อง
import io
import json
import zipfile

import pytest


def _make_upload(client, name: str, content: bytes = b"RIFFfake"):
    r = client.post("/files/upload", files={"file": (name, content, "audio/wav")})
    assert r.status_code == 200
    return name


def _project_data(asset_name: str):
    return {
        "schemaVersion": 3,
        "project": {
            "bpm": 120, "key": None, "timeSig": 4, "loop": None, "duration": 3,
            "assets": {"a_1": {"id": "a_1", "kind": "upload", "name": asset_name}},
            "tracks": [{
                "id": "vocal", "label": "V", "color": "#fff", "pan": 0,
                "muted": False, "solo": False, "locked": False, "envelopes": [],
                "clips": [{"id": "c1", "assetId": "a_1", "start": 0, "duration": 3,
                            "offset": 0, "gain": 1, "muted": False, "color": "#fff"}],
            }],
        },
    }


def test_resolve_asset_rejects_traversal(data_dir):
    from app.services import bundle

    with pytest.raises(ValueError):
        bundle.resolve_asset("upload", "../../secret.txt")


def test_resolve_asset_rejects_unknown_kind(data_dir):
    from app.services import bundle

    with pytest.raises(ValueError):
        bundle.resolve_asset("models", "x.wav")


def test_bundle_contains_project_manifest_and_media(client):
    _make_upload(client, "song.wav", b"RIFFsong")
    pid = client.post("/projects", json={"name": "p1", "data": _project_data("song.wav")}).json()["id"]

    r = client.get(f"/projects/{pid}/bundle")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/zip")

    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = set(zf.namelist())
    assert "project.json" in names
    assert "manifest.json" in names
    assert "media/a_1.wav" in names

    manifest = json.loads(zf.read("manifest.json"))
    assert manifest["format"] == "gmp"
    assert manifest["assets"][0]["id"] == "a_1"
    assert manifest["assets"][0]["bytes"] == len(b"RIFFsong")
    assert zf.read("media/a_1.wav") == b"RIFFsong"


def test_bundle_reports_missing_media_instead_of_failing(client):
    pid = client.post("/projects", json={"name": "p2", "data": _project_data("gone.wav")}).json()["id"]

    r = client.get(f"/projects/{pid}/bundle")
    assert r.status_code == 200
    manifest = json.loads(zipfile.ZipFile(io.BytesIO(r.content)).read("manifest.json"))
    assert manifest["assets"][0]["missing"] is True


def test_bundle_404_for_unknown_project(client):
    assert client.get("/projects/nope/bundle").status_code == 404


def test_import_restores_project_and_media(client, data_dir):
    _make_upload(client, "song.wav", b"RIFFsong")
    pid = client.post("/projects", json={"name": "p1", "data": _project_data("song.wav")}).json()["id"]
    raw = client.get(f"/projects/{pid}/bundle").content

    # ลบทั้งโปรเจกต์และไฟล์สื่อ — จำลองเครื่องใหม่ที่ไม่มีอะไรเลย
    (data_dir / "projects" / f"{pid}.json").unlink()
    (data_dir / "uploads" / "song.wav").unlink()

    r = client.post("/projects/import", files={"file": ("p1.gmp", raw, "application/zip")})
    assert r.status_code == 200
    new_id = r.json()["id"]
    assert new_id != pid                       # import สร้าง id ใหม่เสมอ
    assert (data_dir / "uploads" / "song.wav").read_bytes() == b"RIFFsong"

    data = client.get(f"/projects/{new_id}").json()["data"]
    assert data["project"]["assets"]["a_1"]["name"] == "song.wav"


def test_import_renames_on_content_collision(client, data_dir):
    _make_upload(client, "song.wav", b"RIFFsong")
    pid = client.post("/projects", json={"name": "p1", "data": _project_data("song.wav")}).json()["id"]
    raw = client.get(f"/projects/{pid}/bundle").content

    # เครื่องปลายทางมีไฟล์ชื่อเดียวกันแต่เนื้อหาต่าง — ห้ามทับ
    (data_dir / "uploads" / "song.wav").write_bytes(b"DIFFERENT")

    r = client.post("/projects/import", files={"file": ("p1.gmp", raw, "application/zip")})
    assert r.status_code == 200
    assert (data_dir / "uploads" / "song.wav").read_bytes() == b"DIFFERENT"

    data = client.get(f"/projects/{r.json()['id']}").json()["data"]
    new_name = data["project"]["assets"]["a_1"]["name"]
    assert new_name != "song.wav"
    assert (data_dir / "uploads" / new_name).read_bytes() == b"RIFFsong"
    assert r.json()["renamed"] == {"song.wav": new_name}


def test_import_reuses_identical_existing_media(client, data_dir):
    _make_upload(client, "song.wav", b"RIFFsong")
    pid = client.post("/projects", json={"name": "p1", "data": _project_data("song.wav")}).json()["id"]
    raw = client.get(f"/projects/{pid}/bundle").content

    r = client.post("/projects/import", files={"file": ("p1.gmp", raw, "application/zip")})
    assert r.json()["renamed"] == {}
    assert len(list((data_dir / "uploads").glob("*.wav"))) == 1


def test_import_rejects_a_non_bundle(client):
    r = client.post("/projects/import", files={"file": ("x.gmp", b"not a zip", "application/zip")})
    assert r.status_code == 400
