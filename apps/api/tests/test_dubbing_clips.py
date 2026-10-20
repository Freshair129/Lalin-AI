"""@req FR-03 — selected transcript clips and short multi-speaker voice-over."""
from __future__ import annotations

import asyncio
from pathlib import Path

import numpy as np
import soundfile as sf


def _finish_job(client, job_id: str) -> dict:
    with client.websocket_connect(f"/jobs/ws/{job_id}") as ws:
        while True:
            update = ws.receive_json()
            if update.get("status") in {"done", "error", "interrupted"}:
                return update


def _create_analysis(client, monkeypatch):
    import app.routers.dubbing as dubbing_router
    from app.config import get_settings
    from app.pipelines.asr import Segment, Transcript

    settings = get_settings()
    settings.asr_device = "cpu"
    settings.tts_device = "cpu"
    (settings.uploads_dir / "selected.wav").write_bytes(b"mock audio")

    def fake_transcribe(path, language):
        return Transcript(
            language="th",
            duration=8.0,
            segments=[
                Segment(start=0.2, end=1.0, text="สวัสดี"),
                Segment(start=1.1, end=1.8, text="ทุกคน"),
                Segment(start=3.0, end=3.8, text="ยินดีต้อนรับ"),
                Segment(start=5.5, end=6.0, text="ครับ"),
            ],
        )

    monkeypatch.setattr(dubbing_router, "transcribe", fake_transcribe)
    response = client.post("/dubbing/analyze", json={"source_audio": "selected.wav"})
    assert response.status_code == 200
    result = _finish_job(client, response.json()["job_id"])
    assert result["status"] == "done", result.get("error")
    ids = [segment["id"] for segment in result["result"]["transcript"]["segments"]]
    return result, ids, settings


def test_clip_export_groups_selected_adjacent_segments(client, monkeypatch):
    import app.routers.dubbing as dubbing_router

    analysis, ids, _ = _create_analysis(client, monkeypatch)
    calls = []

    async def fake_export(**kwargs):
        calls.append(kwargs)
        return {"clips": [], "clip_count": 0}

    monkeypatch.setattr(dubbing_router, "run_clip_export", fake_export)
    response = client.post("/dubbing/clips", json={
        "analysis_job_id": analysis["id"],
        "segment_ids": [ids[3], ids[1], ids[0]],
    })
    assert response.status_code == 200
    result = _finish_job(client, response.json()["job_id"])

    assert result["status"] == "done", result.get("error")
    assert result["kind"] == "dubbing-clips"
    assert result["resource"] == "cpu"
    assert calls[0]["source_audio"].endswith("selected.wav")
    assert [[segment["id"] for segment in group] for group in calls[0]["groups"]] == [
        ids[:2], [ids[3]],
    ]
    assert result["result"]["analysis_job_id"] == analysis["id"]
    assert result["result"]["source_audio"] == "selected.wav"


def test_clip_export_rejects_duplicate_or_unknown_segment_ids(client, monkeypatch):
    analysis, ids, _ = _create_analysis(client, monkeypatch)

    duplicate = client.post("/dubbing/clips", json={
        "analysis_job_id": analysis["id"],
        "segment_ids": [ids[0], ids[0]],
    })
    assert duplicate.status_code == 422
    unknown = client.post("/dubbing/clips", json={
        "analysis_job_id": analysis["id"],
        "segment_ids": ["not-in-transcript"],
    })
    assert unknown.status_code == 422


def test_voiceover_reuses_selected_transcript_and_speaker_voice_mapping(client, monkeypatch):
    import app.routers.dubbing as dubbing_router

    analysis, ids, settings = _create_analysis(client, monkeypatch)
    paths = {}
    for voice_id in ("voice_a", "voice_b"):
        paths[voice_id] = settings.voices_dir / f"{voice_id}.wav"
        paths[voice_id].write_bytes(b"mock voice")
    monkeypatch.setattr(
        dubbing_router.voices,
        "resolve_ref",
        lambda voice_id: (str(paths[voice_id]), f"ref text for {voice_id}"),
    )
    calls = []

    async def fake_voiceover(**kwargs):
        calls.append(kwargs)
        return {"output": str(settings.outputs_dir / "voiceover.wav"), "segments": 2}

    monkeypatch.setattr(dubbing_router, "run_short_voiceover", fake_voiceover)
    request = {
        "analysis_job_id": analysis["id"],
        "segment_ids": [ids[1], ids[0]],
        "segment_speakers": [
            {"segment_id": ids[0], "speaker_id": "spk_a"},
            {"segment_id": ids[1], "speaker_id": "spk_b"},
        ],
        "speaker_voices": [
            {"speaker_id": "spk_a", "voice_id": "voice_a"},
            {"speaker_id": "spk_b", "voice_id": "voice_b"},
        ],
        "target_lang": "English",
        "translate": True,
    }
    missing_mapping = {**request, "segment_speakers": request["segment_speakers"][:1]}
    assert client.post("/dubbing/voiceover", json=missing_mapping).status_code == 422

    response = client.post("/dubbing/voiceover", json=request)
    assert response.status_code == 200
    result = _finish_job(client, response.json()["job_id"])
    assert result["status"] == "done", result.get("error")
    assert result["kind"] == "dubbing-voiceover"
    assert result["resource"] == "cpu"
    assert calls[0]["segments"][0].id == ids[0]
    assert calls[0]["segments"][0].text == "สวัสดี"
    assert calls[0]["segments"][0].speaker_id == "spk_a"
    assert calls[0]["segments"][1].id == ids[1]
    assert calls[0]["speaker_voices"] == {
        "spk_a": (str(paths["voice_a"]), "ref text for voice_a"),
        "spk_b": (str(paths["voice_b"]), "ref text for voice_b"),
    }
    assert calls[0]["detected_language"] == "th"
    assert calls[0]["tts_language"] == "en"
    assert result["result"]["analysis_job_id"] == analysis["id"]
    assert result["result"]["speaker_voice_map"] == {"spk_a": "voice_a", "spk_b": "voice_b"}


def test_clip_pipeline_writes_clip_and_rebased_subtitle_snippet(monkeypatch, tmp_path):
    import app.pipelines.dubbing as dubbing

    outputs = tmp_path / "outputs"
    outputs.mkdir()
    monkeypatch.setattr(dubbing, "get_settings", lambda: type("Settings", (), {"outputs_dir": outputs})())

    def fake_extract(source, start, end, output):
        Path(output).write_bytes(b"clip")
        return output

    monkeypatch.setattr(dubbing, "_extract_audio_clip", fake_extract)
    result = asyncio.run(dubbing.run_clip_export(
        source_audio="source.mp4",
        groups=[[
            {"id": "seg_1", "start": 2.5, "end": 3.2, "text": "สวัสดี"},
            {"id": "seg_2", "start": 3.3, "end": 4.0, "text": "ทุกคน"},
        ]],
    ))

    clip = result["clips"][0]
    assert result["clip_count"] == 1
    assert Path(clip["output"]).read_bytes() == b"clip"
    subtitle = (outputs / clip["subtitle_srt"]).read_text(encoding="utf-8")
    assert "00:00:00,000 --> 00:00:00,700" in subtitle
    assert "00:00:00,800 --> 00:00:01,500" in subtitle


def test_voiceover_pipeline_compacts_segments_and_writes_subtitles(monkeypatch, tmp_path):
    import app.pipelines.dubbing as dubbing

    outputs = tmp_path / "outputs"
    outputs.mkdir()
    monkeypatch.setattr(dubbing, "get_settings", lambda: type("Settings", (), {"outputs_dir": outputs})())

    class FakeBrain:
        async def translate(self, text, *, target_lang, source_lang):
            return f"แปล {text}"

    monkeypatch.setattr(dubbing, "get_brain", lambda: FakeBrain())
    synthesized = []

    def fake_synthesize(text, out_path, *, ref_audio, ref_text, language):
        synthesized.append((text, ref_audio, ref_text, language))
        sf.write(out_path, np.zeros(2400, dtype=np.float32), 24000)
        return out_path

    monkeypatch.setattr(dubbing.tts, "synthesize", fake_synthesize)
    result = asyncio.run(dubbing.run_short_voiceover(
        segments=[
            dubbing.SpeakerSegment("seg_1", 1.0, 2.0, "หนึ่ง", "spk_a"),
            dubbing.SpeakerSegment("seg_2", 4.0, 5.0, "สอง", "spk_b"),
        ],
        speaker_voices={
            "spk_a": ("voice-a.wav", "ref a"),
            "spk_b": ("voice-b.wav", "ref b"),
        },
        detected_language="th",
        target_lang="English",
        translate=True,
        tts_language="en",
    ))

    assert synthesized == [
        ("แปล หนึ่ง", "voice-a.wav", "ref a", "en"),
        ("แปล สอง", "voice-b.wav", "ref b", "en"),
    ]
    info = sf.info(result["output"])
    assert abs(info.duration - 0.32) < 0.02
    subtitle = (outputs / result["subtitle_srt"]).read_text(encoding="utf-8")
    assert "00:00:00,000 --> 00:00:00,100" in subtitle
    assert "00:00:00,220 --> 00:00:00,320" in subtitle
    assert "แปล สอง" in subtitle and "สอง" in subtitle
