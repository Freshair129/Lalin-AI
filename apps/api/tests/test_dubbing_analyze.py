"""@req FR-03 — ASR-only transcript analysis and subtitle artifacts."""
from __future__ import annotations

from app.pipelines.asr import Segment, Transcript


def _finish_job(client, job_id: str) -> dict:
    with client.websocket_connect(f"/jobs/ws/{job_id}") as ws:
        while True:
            update = ws.receive_json()
            if update.get("status") in {"done", "error", "interrupted"}:
                return update


def test_analyze_returns_timestamped_transcript_and_subtitle_downloads(
    client, data_dir, monkeypatch
):
    import app.routers.dubbing as dubbing_router
    from app.config import get_settings

    (data_dir / "uploads" / "clip.wav").write_bytes(b"stub audio decoded by the mock")
    get_settings().asr_device = "cpu"
    monkeypatch.setattr(
        dubbing_router,
        "transcribe",
        lambda path, language: Transcript(
            language="th",
            duration=4.2,
            segments=[
                Segment(start=0.0, end=1.2, text=" สวัสดี "),
                Segment(start=1.2, end=2.0, text="  "),
                Segment(start=2.5, end=3.75, text="ทุกคน"),
            ],
        ),
    )

    accepted = client.post("/dubbing/analyze", json={"source_audio": "clip.wav"})
    assert accepted.status_code == 200
    job = _finish_job(client, accepted.json()["job_id"])

    assert job["kind"] == "dubbing-analyze"
    assert job["resource"] == "cpu"
    assert job["status"] == "done", job.get("error")
    result = job["result"]
    assert result["source_audio"] == "clip.wav"
    assert result["detected_language"] == "th"
    assert result["segment_count"] == 2
    assert result["duration_sec"] == 4.2
    assert result["transcript"]["segments"] == [
        {"id": "seg_000001", "start": 0.0, "end": 1.2, "text": "สวัสดี"},
        {"id": "seg_000002", "start": 2.5, "end": 3.75, "text": "ทุกคน"},
    ]

    srt = client.get(f"/files/download/{result['subtitle_srt']}")
    vtt = client.get(f"/files/download/{result['subtitle_vtt']}")
    assert srt.status_code == 200
    assert "00:00:00,000 --> 00:00:01,200" in srt.text
    assert "สวัสดี" in srt.text and "ทุกคน" in srt.text
    assert vtt.status_code == 200
    assert vtt.text.startswith("WEBVTT")
    assert "00:00:02.500 --> 00:00:03.750" in vtt.text


def test_analyze_marks_invalid_asr_timestamps_as_job_error(client, data_dir, monkeypatch):
    import app.routers.dubbing as dubbing_router
    from app.config import get_settings

    (data_dir / "uploads" / "bad.wav").write_bytes(b"stub audio decoded by the mock")
    get_settings().asr_device = "cpu"
    monkeypatch.setattr(
        dubbing_router,
        "transcribe",
        lambda path, language: Transcript(
            language="en", duration=2.0,
            segments=[Segment(start=1.5, end=1.0, text="invalid cue")],
        ),
    )

    accepted = client.post("/dubbing/analyze", json={"source_audio": "bad.wav"})
    job = _finish_job(client, accepted.json()["job_id"])

    assert job["status"] == "error"
    assert "timestamp" in job["error"]
    assert list((data_dir / "outputs").iterdir()) == []


def test_existing_single_speaker_dubbing_route_still_runs_as_a_job(
    client, data_dir, monkeypatch
):
    import app.routers.dubbing as dubbing_router
    from app.config import get_settings

    (data_dir / "uploads" / "source.wav").write_bytes(b"stub audio")
    settings = get_settings()
    settings.asr_device = "cpu"
    settings.tts_device = "cpu"
    monkeypatch.setattr(dubbing_router.voices, "resolve_ref", lambda _voice_id: ("voice.wav", "hello"))

    async def fake_run_dubbing(**kwargs):
        return {"output": "dubbed.wav", "subtitle_srt": None, "subtitle_vtt": None}

    monkeypatch.setattr(dubbing_router, "run_dubbing", fake_run_dubbing)
    accepted = client.post(
        "/dubbing",
        json={"source_audio": "source.wav", "voice_id": "voice-1", "target_lang": "English"},
    )
    assert accepted.status_code == 200
    job = _finish_job(client, accepted.json()["job_id"])

    assert job["kind"] == "dubbing"
    assert job["status"] == "done", job.get("error")
    assert job["result"]["output"] == "dubbed.wav"
