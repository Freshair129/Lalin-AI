"""@req FR-03 — manual speaker mapping and transcript-backed multi-speaker render."""
from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.pipelines.dubbing import SpeakerSegment


def _finish_job(client, job_id: str) -> dict:
    with client.websocket_connect(f"/jobs/ws/{job_id}") as ws:
        while True:
            update = ws.receive_json()
            if update.get("status") in {"done", "error", "interrupted"}:
                return update


def test_render_reuses_analysis_and_validates_speaker_voice_mapping(
    client, monkeypatch
):
    import app.routers.dubbing as dubbing_router
    from app.config import get_settings

    settings = get_settings()
    settings.asr_device = "cpu"
    settings.tts_device = "cpu"
    (settings.uploads_dir / "multi.wav").write_bytes(b"mock audio")
    voice_paths = {}
    for voice_id in ("voice_a", "voice_b"):
        path = settings.voices_dir / f"{voice_id}.wav"
        path.write_bytes(b"mock voice")
        voice_paths[voice_id] = path
    monkeypatch.setattr(
        dubbing_router.voices,
        "resolve_ref",
        lambda voice_id: (str(voice_paths[voice_id]), f"text for {voice_id}"),
    )

    transcribe_calls = []

    def fake_transcribe(path, language):
        transcribe_calls.append((path, language))
        from app.pipelines.asr import Segment, Transcript

        return Transcript(
            language="th",
            duration=3.25,
            segments=[
                Segment(start=0.2, end=1.1, text="สวัสดี"),
                Segment(start=1.5, end=2.8, text="ทุกคน"),
            ],
        )

    monkeypatch.setattr(dubbing_router, "transcribe", fake_transcribe)
    analyzed = client.post("/dubbing/analyze", json={"source_audio": "multi.wav"})
    assert analyzed.status_code == 200
    analysis_job = _finish_job(client, analyzed.json()["job_id"])
    assert analysis_job["status"] == "done", analysis_job.get("error")
    segment_ids = [
        segment["id"] for segment in analysis_job["result"]["transcript"]["segments"]
    ]

    run_calls = []

    async def fake_render(**kwargs):
        run_calls.append(kwargs)
        return {
            "output": str(settings.outputs_dir / "render.wav"),
            "segments": len(kwargs["segments"]),
            "speaker_count": len(kwargs["speaker_voices"]),
            "subtitle_srt": None,
            "subtitle_vtt": None,
        }

    monkeypatch.setattr(dubbing_router, "run_multispeaker_dubbing", fake_render)
    request = {
        "analysis_job_id": analysis_job["id"],
        "segment_speakers": [
            {"segment_id": segment_ids[0], "speaker_id": "spk_a"},
            {"segment_id": segment_ids[1], "speaker_id": "spk_b"},
        ],
        "speaker_voices": [
            {"speaker_id": "spk_a", "voice_id": "voice_a"},
            {"speaker_id": "spk_b", "voice_id": "voice_b"},
        ],
        "target_lang": "English",
        "translate": True,
    }

    incomplete = {**request, "segment_speakers": request["segment_speakers"][:1]}
    assert client.post("/dubbing/render", json=incomplete).status_code == 422
    missing_voice = {**request, "speaker_voices": request["speaker_voices"][:1]}
    assert client.post("/dubbing/render", json=missing_voice).status_code == 422
    assert not run_calls

    accepted = client.post("/dubbing/render", json=request)
    assert accepted.status_code == 200
    render_job = _finish_job(client, accepted.json()["job_id"])
    assert render_job["kind"] == "dubbing-render"
    assert render_job["resource"] == "cpu"
    assert render_job["status"] == "done", render_job.get("error")
    assert transcribe_calls == [(str(settings.uploads_dir / "multi.wav"), None)]

    kwargs = run_calls[0]
    assert kwargs["segments"] == [
        SpeakerSegment(segment_ids[0], 0.2, 1.1, "สวัสดี", "spk_a"),
        SpeakerSegment(segment_ids[1], 1.5, 2.8, "ทุกคน", "spk_b"),
    ]
    assert kwargs["speaker_voices"] == {
        "spk_a": (str(voice_paths["voice_a"]), "text for voice_a"),
        "spk_b": (str(voice_paths["voice_b"]), "text for voice_b"),
    }
    assert kwargs["detected_language"] == "th"
    assert kwargs["duration"] == 3.25
    assert kwargs["tts_language"] == "en"
    assert render_job["result"]["source_audio"] == "multi.wav"
    assert render_job["result"]["analysis_job_id"] == analysis_job["id"]
    assert render_job["result"]["speaker_voice_map"] == {
        "spk_a": "voice_a",
        "spk_b": "voice_b",
    }


def test_multispeaker_pipeline_uses_voice_for_each_segment(monkeypatch, tmp_path):
    import app.pipelines.dubbing as dubbing

    outputs_dir = tmp_path / "outputs"
    outputs_dir.mkdir()
    settings = SimpleNamespace(outputs_dir=outputs_dir)
    monkeypatch.setattr(dubbing, "get_settings", lambda: settings)
    monkeypatch.setattr(dubbing, "get_brain", lambda: object())

    synthesized = []
    fitted = []
    mixed = []

    def fake_synthesize(text, out_path, *, ref_audio, ref_text, language):
        synthesized.append((text, ref_audio, ref_text, language))
        Path(out_path).write_bytes(b"raw")

    def fake_fit(raw_path, target_sec, out_path):
        fitted.append((Path(raw_path).name, target_sec))
        Path(out_path).write_bytes(b"fitted")

    def fake_overlay(clips, total_ms, out_path):
        mixed.append(([(start, Path(path).name) for start, path in clips], total_ms))
        Path(out_path).write_bytes(b"mixed")

    monkeypatch.setattr(dubbing.tts, "synthesize", fake_synthesize)
    monkeypatch.setattr(dubbing, "fit_duration", fake_fit)
    monkeypatch.setattr(dubbing, "overlay_on_timeline", fake_overlay)

    result = asyncio.run(dubbing.run_multispeaker_dubbing(
        source_audio="source.wav",
        segments=[
            SpeakerSegment("seg_1", 0.25, 0.95, "สวัสดี", "spk_a"),
            SpeakerSegment("seg_2", 1.2, 2.0, "ทุกคน", "spk_b"),
        ],
        duration=2.0,
        detected_language="th",
        speaker_voices={
            "spk_a": ("voice-a.wav", "ref a"),
            "spk_b": ("voice-b.wav", "ref b"),
        },
        translate=False,
        tts_language="th",
    ))

    assert synthesized == [
        ("สวัสดี", "voice-a.wav", "ref a", "th"),
        ("ทุกคน", "voice-b.wav", "ref b", "th"),
    ]
    assert fitted == [("seg_0000_raw.wav", 0.7), ("seg_0001_raw.wav", 0.8)]
    assert mixed == [
        ([(0.25, "seg_0000.wav"), (1.2, "seg_0001.wav")], 2500)
    ]
    assert result["segments"] == 2
    assert result["speaker_count"] == 2
    assert len(result["rendered_segments"]) == 2
    assert Path(result["output"]).read_bytes() == b"mixed"
    assert Path(result["subtitle_srt"]).name.startswith("dubbed_")
    assert (outputs_dir / result["subtitle_srt"]).is_file()
