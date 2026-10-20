from __future__ import annotations

import time
from pathlib import Path

import numpy as np


def _finished_job(client, job_id: str):
    for _ in range(300):
        response = client.get(f"/jobs/{job_id}")
        assert response.status_code == 200
        job = response.json()
        if job["status"] in {"done", "error", "interrupted"}:
            return job
        time.sleep(0.01)
    raise AssertionError("preview job did not finish")


def test_preview_revision_is_rendered_byte_for_byte_and_stale_inputs_are_rejected(client, data_dir, monkeypatch):
    from app.routers import music as music_router

    source = data_dir / "uploads" / "vocal.wav"
    beat = data_dir / "uploads" / "beat.wav"
    source.write_bytes(b"source fixture")
    beat.write_bytes(b"beat fixture")
    calls = []

    def fake_run_remix(*, output_path=None, analysis_out=None, warp_anchors=None, **_kwargs):
        is_warp = bool(warp_anchors)
        if output_path is None:
            from app.config import get_settings
            output_path = str(get_settings().outputs_dir / "legacy-global.wav")
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(b"WARP PREVIEW" if is_warp else b"GLOBAL PREVIEW")
        calls.append(is_warp)
        if analysis_out is not None:
            beats = (np.arange(48, dtype=float) * 0.5).tolist()
            analysis_out.update({
                "source_beats_sec": beats,
                "destination_beats_sec": [value * 1.005 for value in beats],
                "source_confidence": 0.95,
                "destination_confidence": 0.94,
                "alignment_confidence": 0.94,
                "phase_offset_sec": 0.0,
                "phrase_offset_sec": 0.0,
                "source_bpm": 120.0,
                "target_bpm": 120.0,
                "global_stretch_rate": 1.0,
                "beats_per_bar": 4,
                "duration_sec": 24.0,
            })
        return {
            "output": output_path,
            "bpm": {"beat": 120.0, "vocal": 120.0, "stretch": 1.0},
            "key": {"beat": "C maj", "target": "C maj", "override": None},
            "offset_ms": 0.0,
            "phrase_bars": 0,
            "beats_per_bar": 4,
            "phase_offset_ms": 0.0,
            "phrase_offset_sec": 0.0,
            "lufs": -14.0,
            "warp_applied": is_warp,
        }

    monkeypatch.setattr(music_router, "run_remix", fake_run_remix)
    monkeypatch.setattr(music_router, "automatic_torch_resource", lambda: "cpu")
    preview_response = client.post("/music/remix/preview", json={
        "source_audio": source.name,
        "beat_audio": beat.name,
        "phrase_bars": 0,
        "beats_per_bar": 4,
        "offset_mode": "auto",
        "offset_ms": None,
        "warp_mode": "suggest",
        "window_bars": 4,
        "hop_bars": 2,
        "render_settings": {
            "target_lufs": -14.0,
            "do_autotune": True,
            "autotune_strength": 1.0,
            "key_override": None,
            "do_fx": True,
            "reverb": 0.16,
            "delay": 0.12,
            "stem_gains": None,
        },
    })
    assert preview_response.status_code == 200, preview_response.text
    started = preview_response.json()
    preview_job = _finished_job(client, started["job_id"])
    assert preview_job["status"] == "done", preview_job.get("error")
    preview = preview_job["result"]
    assert preview["drift"]["status"] == "drift_detected"
    assert preview["warp_candidate"]["available"] is True
    assert calls == [False, True]

    first_candidate_url = preview["audio_preview"]["warp_candidate_url"]
    first_audio = client.get(first_candidate_url)
    assert first_audio.status_code == 200
    assert first_audio.content == b"WARP PREVIEW"

    commit = {
        "source_audio": source.name,
        "beat_audio": beat.name,
        "target_lufs": -14.0,
        "do_autotune": True,
        "autotune_strength": 1.0,
        "key_override": None,
        "do_fx": True,
        "phrase_bars": 0,
        "beats_per_bar": 4,
        "offset_ms": None,
        "reverb": 0.16,
        "delay": 0.12,
        "stem_gains": None,
        "preview_id": preview["preview_id"],
        "preview_revision": preview["revision"],
        "map_digest": preview["render_map_digests"]["warp_candidate"],
        "accept_warp": True,
        "window_bars": 4,
        "hop_bars": 2,
    }
    stale = dict(commit, target_lufs=-12.0)
    assert client.post("/music/remix", json=stale).status_code == 409
    global_commit = dict(
        commit,
        accept_warp=False,
        map_digest=preview["render_map_digests"]["global_only"],
    )
    global_response = client.post("/music/remix", json=global_commit)
    assert global_response.status_code == 200, global_response.text
    global_job = _finished_job(client, global_response.json()["job_id"])
    assert global_job["status"] == "done", global_job.get("error")
    assert Path(global_job["result"]["output"]).read_bytes() == b"GLOBAL PREVIEW"

    manual_response = client.post("/music/remix/preview", json={
        "source_audio": source.name,
        "beat_audio": beat.name,
        "phrase_bars": 0,
        "beats_per_bar": 4,
        "offset_mode": "auto",
        "offset_ms": None,
        "warp_mode": "manual",
        "window_bars": 4,
        "hop_bars": 2,
        "preview_id": preview["preview_id"],
        "base_revision": preview["revision"],
        "anchors": preview["anchors"],
        "render_settings": {
            "target_lufs": -14.0,
            "do_autotune": True,
            "autotune_strength": 1.0,
            "key_override": None,
            "do_fx": True,
            "reverb": 0.16,
            "delay": 0.12,
            "stem_gains": None,
        },
    })
    assert manual_response.status_code == 200, manual_response.text
    manual_job = _finished_job(client, manual_response.json()["job_id"])
    assert manual_job["status"] == "done", manual_job.get("error")
    preview = manual_job["result"]
    assert preview["revision"] == 2
    assert preview["warp_candidate"]["origin"] == "manual"
    assert calls == [False, True, False, True]
    assert client.get(first_candidate_url).status_code == 409  # older revisions cannot be rendered/played

    commit.update({
        "preview_id": preview["preview_id"],
        "preview_revision": preview["revision"],
        "map_digest": preview["render_map_digests"]["warp_candidate"],
    })
    assert client.post("/music/remix", json=dict(commit, preview_revision=1)).status_code == 409

    final_response = client.post("/music/remix", json=commit)
    assert final_response.status_code == 200, final_response.text
    final_job = _finished_job(client, final_response.json()["job_id"])
    assert final_job["status"] == "done", final_job.get("error")
    final_audio = client.get(preview["audio_preview"]["warp_candidate_url"])
    assert final_audio.status_code == 200
    assert Path(final_job["result"]["output"]).read_bytes() == final_audio.content
    assert final_job["result"]["preview_revision"] == preview["revision"]
    assert final_job["result"]["map_digest"] == preview["render_map_digests"]["warp_candidate"]

    source.write_bytes(b"source changed after preview")
    assert client.post("/music/remix", json=commit).status_code == 409

    legacy = client.post("/music/remix", json={
        "source_audio": source.name,
        "beat_audio": beat.name,
        "offset_ms": 0.0,
        "beats_per_bar": 4,
    })
    assert legacy.status_code == 200, legacy.text
    legacy_job = _finished_job(client, legacy.json()["job_id"])
    assert legacy_job["status"] == "done", legacy_job.get("error")
    assert legacy_job["result"]["warp_applied"] is False
    assert calls[-1] is False
