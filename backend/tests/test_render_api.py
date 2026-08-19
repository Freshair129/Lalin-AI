# @req FR-09 — POST /render: render arrangement ทั้งก้อนเป็น job
import numpy as np
import soundfile as sf

SR = 48000


def _fixture_project(data_dir):
    t = np.linspace(0, 1, SR, endpoint=False)
    tone = np.stack([np.sin(2 * np.pi * 440 * t) * 0.25] * 2, axis=1).astype(np.float32)
    sf.write(data_dir / "uploads" / "flat.wav", tone, SR, subtype="FLOAT")
    return {
        "bpm": 120, "key": None, "timeSig": 4, "loop": None, "duration": 1,
        "assets": {"a_1": {"id": "a_1", "kind": "upload", "name": "flat.wav"}},
        "tracks": [{
            "id": "t", "label": "T", "color": "#fff", "pan": 0.0,
            "muted": False, "solo": False, "locked": False, "envelopes": [],
            "clips": [{"id": "c1", "assetId": "a_1", "start": 0.0, "duration": 1.0,
                       "offset": 0.0, "gain": 1.0, "muted": False, "color": "#fff"}],
        }],
    }


def _run(client, body):
    """ยิง render แล้วรอผลผ่าน WebSocket (TestClient รัน event loop ให้ในบล็อกนี้)"""
    job_id = client.post("/render", json=body).json()["job_id"]
    with client.websocket_connect(f"/jobs/ws/{job_id}") as ws:
        while True:
            msg = ws.receive_json()
            if msg["status"] in ("done", "error"):
                return msg


def test_render_produces_a_downloadable_file(client, data_dir):
    msg = _run(client, {"project": _fixture_project(data_dir), "format": "wav"})
    assert msg["status"] == "done", msg.get("error")

    name = msg["result"]["output"]
    assert "/" not in name and "\\" not in name           # ชื่อไฟล์ล้วน ไม่ใช่ path
    assert (data_dir / "outputs" / name).exists()
    assert client.get(f"/files/download/{name}").status_code == 200


def test_render_result_carries_validation(client, data_dir):
    msg = _run(client, {"project": _fixture_project(data_dir), "format": "wav"})
    v = msg["result"]["validation"]
    assert v["ok"] is True
    assert v["channels"] == 2
    assert v["sample_rate"] == SR


def test_render_fails_clearly_when_media_is_missing(client, data_dir):
    project = _fixture_project(data_dir)
    (data_dir / "uploads" / "flat.wav").unlink()
    msg = _run(client, {"project": project, "format": "wav"})
    assert msg["status"] == "error"
    assert "flat.wav" in msg["error"]


def test_render_refuses_master_fx_without_pedalboard(client, data_dir, monkeypatch):
    import app.routers.render as render_router

    monkeypatch.setattr(render_router, "_pedalboard_available", lambda: False)
    msg = _run(client, {"project": _fixture_project(data_dir), "format": "wav",
                        "master": {"reverb": 0.3, "echo": 0.0, "comp": False}})
    assert msg["status"] == "error"
    assert "pedalboard" in msg["error"]


def test_render_without_fx_works_even_without_pedalboard(client, data_dir, monkeypatch):
    import app.routers.render as render_router

    monkeypatch.setattr(render_router, "_pedalboard_available", lambda: False)
    msg = _run(client, {"project": _fixture_project(data_dir), "format": "wav"})
    assert msg["status"] == "done", msg.get("error")
