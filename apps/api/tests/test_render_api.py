# @req FR-09 — POST /render: render arrangement ทั้งก้อนเป็น job
import numpy as np
import pytest
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


def test_render_reproduces_a_multi_track_arrangement_end_to_end(client, data_dir):
    """Automated equivalent of the plan's Phase C manual parity check (two tracks,
    an offset clip with a fade-in, a halved gain, a hard pan, and a muted clip) --
    substituted because the Browser pane renders 0x0 headless in this environment
    (confirmed on three separate attempts across Phases A, B and C; see commit
    messages). This exercises the *exact* JSON shape JSON.stringify(engine.project)
    produces: camelCase assetId/fadeIn/fadeOut/timeSig, clip-level muted, track-level
    pan -- there is no case-conversion layer anywhere on this path, so a project dict
    shaped exactly like this is byte-identical to what RemixPanel's doExport() sends.
    """
    sf.write(data_dir / "uploads" / "a.wav",
              np.full((SR * 2, 2), 0.2, dtype=np.float32), SR, subtype="FLOAT")
    sf.write(data_dir / "uploads" / "b.wav",
              np.full((SR * 2, 2), 0.2, dtype=np.float32), SR, subtype="FLOAT")

    project = {
        "bpm": 120, "key": None, "timeSig": 4, "loop": None, "duration": 0,
        "assets": {
            "a_1": {"id": "a_1", "kind": "upload", "name": "a.wav"},
            "a_2": {"id": "a_2", "kind": "upload", "name": "b.wav"},
        },
        "tracks": [
            {  # A: full length, gain halved via the clip, pan centre (identity)
                "id": "A", "label": "A", "color": "#fff", "pan": 0.0,
                "muted": False, "solo": False, "locked": False, "envelopes": [],
                "clips": [{"id": "c1", "assetId": "a_1", "start": 0.0, "duration": 2.0,
                           "offset": 0.0, "gain": 0.5, "muted": False, "color": "#fff"}],
            },
            {  # B: starts at 4s, 1s fade-in, hard left
                "id": "B", "label": "B", "color": "#fff", "pan": -1.0,
                "muted": False, "solo": False, "locked": False, "envelopes": [],
                "clips": [{"id": "c2", "assetId": "a_2", "start": 4.0, "duration": 2.0,
                           "offset": 0.0, "gain": 1.0, "muted": False, "color": "#fff",
                           "fadeIn": 1.0, "fadeOut": 0.0}],
            },
            {  # C: muted clip -- must contribute nothing, anywhere
                "id": "C", "label": "C", "color": "#fff", "pan": 0.0,
                "muted": False, "solo": False, "locked": False, "envelopes": [],
                "clips": [{"id": "c3", "assetId": "a_1", "start": 0.0, "duration": 2.0,
                           "offset": 0.0, "gain": 1.0, "muted": True, "color": "#fff"}],
            },
        ],
    }

    msg = _run(client, {"project": project, "format": "wav"})
    assert msg["status"] == "done", msg.get("error")

    data, sr = sf.read(data_dir / "outputs" / msg["result"]["output"], dtype="float32", always_2d=True)
    assert sr == SR
    assert data.shape[0] == pytest.approx(SR * 6, abs=2)   # ยาวถึง track B (4s+2s)

    # [0, 2s): มีแค่ A -- gain 0.5 * 0.2 = 0.1, pan centre = เท่ากันทั้งสองข้าง, B ยังไม่มา
    assert np.allclose(data[100 : SR * 2 - 100], 0.1, atol=1e-3)

    # [2s, 4s): เงียบสนิท -- A จบแล้ว, B ยังไม่เริ่ม, C ถูก mute ทิ้งทั้งช่วง
    assert np.allclose(data[SR * 2 + 100 : SR * 4 - 100], 0.0, atol=1e-4)

    # [4s, 5s): B กำลัง fade-in, hard left -- R ต้องเงียบตลอด, L ไล่ขึ้นจาก 0
    b_start = SR * 4
    assert np.allclose(data[b_start : SR * 6, 1], 0.0, atol=1e-4)                    # R เงียบทั้งช่วง B
    assert data[b_start, 0] == pytest.approx(0.0, abs=2e-3)                          # L เริ่มที่ 0 (หัว fade)
    assert data[b_start + SR // 2, 0] == pytest.approx(0.2, abs=1e-2)                # กลาง fade ~ครึ่งทาง

    # [5s, 6s): B fade เสร็จแล้ว -- L คงที่ที่ inL+inR (hard left รวมสองแชนแนล)
    assert np.allclose(data[SR * 5 + 100 : SR * 6 - 100, 0], 0.4, atol=1e-3)
