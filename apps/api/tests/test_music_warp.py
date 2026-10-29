from __future__ import annotations

import numpy as np
import pytest

from app.pipelines.music_warp import analyze_drift, validate_manual_anchors


def _grids(drift_rate: float = 0.0, *, phase: float = 0.0, bars: int = 12):
    beats_per_bar = 4
    bpm = 120.0
    beat = 60.0 / bpm
    source = np.arange(bars * beats_per_bar, dtype=float) * beat
    destination = source * (1.0 + drift_rate) + phase
    return source, destination, bpm


def test_constant_phase_is_removed_and_end_drift_uses_absolute_value():
    source, destination, bpm = _grids(phase=-0.12)
    result = analyze_drift(source, destination, target_bpm=bpm, phase_offset_sec=0.0)

    assert result.status == "in_sync"
    assert result.residual_p95_ms < 1.0
    assert abs(result.end_drift_ms) < 1.0
    assert result.phase_correction_ms == pytest.approx(-120.0)
    refined = analyze_drift(
        source, destination, target_bpm=bpm,
        phase_offset_sec=result.phase_correction_ms / 1000.0,
    )
    assert refined.status == "in_sync"
    assert abs(refined.phase_correction_ms) < 1.0
    assert not result.anchors or all(abs(anchor.drift_ms) < 1.0 for anchor in result.anchors)


@pytest.mark.parametrize("rate", [0.005, -0.005, 0.02, -0.02])
def test_gradual_drift_is_detected_with_bounded_monotone_candidate(rate: float):
    source, destination, bpm = _grids(rate)
    result = analyze_drift(source, destination, target_bpm=bpm)

    assert result.status == "drift_detected"
    assert result.anchor_count >= 3
    assert result.span_bars >= 8
    assert result.confidence >= 0.70
    assert all(b.timeline_time_sec > a.timeline_time_sec for a, b in zip(result.anchors, result.anchors[1:]))
    for left, right in zip(result.anchors, result.anchors[1:]):
        ratio = ((right.timeline_time_sec - left.timeline_time_sec) /
                 (right.input_time_sec - left.input_time_sec))
        assert 0.97 <= ratio <= 1.03
        assert right.input_time_sec - left.input_time_sec >= 2.0


@pytest.mark.parametrize("rate", [0.005, -0.005, 0.02, -0.02])
def test_candidate_anchor_map_reduces_synthetic_beat_residual(rate: float):
    source, destination, bpm = _grids(rate)
    coarse = analyze_drift(source, destination, target_bpm=bpm)
    phase = coarse.phase_correction_ms / 1000.0
    result = analyze_drift(
        source, destination, target_bpm=bpm, phase_offset_sec=phase,
    )
    assert result.status == "drift_detected"

    anchor_times = np.asarray([anchor.input_time_sec for anchor in result.anchors])
    local_corrections = np.asarray([
        anchor.timeline_time_sec - anchor.input_time_sec - phase
        for anchor in result.anchors
    ])
    correction = np.interp(source, anchor_times, local_corrections)
    first_slope = (local_corrections[1] - local_corrections[0]) / (anchor_times[1] - anchor_times[0])
    last_slope = (local_corrections[-1] - local_corrections[-2]) / (anchor_times[-1] - anchor_times[-2])
    before_first = source < anchor_times[0]
    after_last = source > anchor_times[-1]
    correction[before_first] = local_corrections[0] + (source[before_first] - anchor_times[0]) * first_slope
    correction[after_last] = local_corrections[-1] + (source[after_last] - anchor_times[-1]) * last_slope

    baseline_error_ms = np.abs(destination - (source + phase)) * 1000.0
    warped_error_ms = np.abs(destination - (source + phase + correction)) * 1000.0
    assert float(np.percentile(warped_error_ms, 95)) <= 25.0
    assert float(np.percentile(warped_error_ms, 95)) < float(np.percentile(baseline_error_ms, 95))


def test_low_confidence_and_dropped_beat_never_propose_automatic_warp():
    source, destination, bpm = _grids(0.02)
    weak = analyze_drift(source, destination, target_bpm=bpm, source_confidence=0.45)
    dropped = analyze_drift(source, np.delete(destination, 20), target_bpm=bpm)

    assert weak.status == "insufficient_evidence"
    assert not weak.anchors
    assert dropped.status == "insufficient_evidence"
    assert not dropped.anchors


def test_guardrail_blocks_drift_above_three_percent():
    source, destination, bpm = _grids(0.04)
    result = analyze_drift(source, destination, target_bpm=bpm)

    assert result.status == "warp_limited"
    assert result.reason == "local_stretch_or_segment_guardrail"


def test_local_tempo_step_is_detected_without_reindexing_beats():
    source, destination, bpm = _grids(bars=16)
    step_at_sec = 16.0
    after_step = source >= step_at_sec
    destination[after_step] = step_at_sec + (source[after_step] - step_at_sec) * 1.02
    result = analyze_drift(source, destination, target_bpm=bpm)

    assert result.status == "drift_detected"
    assert result.anchor_count >= 3
    assert result.max_local_stretch_pct <= 3.0


def test_manual_map_enforces_two_bar_segments_and_stretch_limits():
    anchors = [
        {"input_time_sec": 4.0, "timeline_time_sec": 4.02},
        {"input_time_sec": 8.0, "timeline_time_sec": 8.04},
    ]
    validated = validate_manual_anchors(anchors, duration_sec=20.0, beats_per_bar=4, target_bpm=120.0)
    assert [item["origin"] for item in validated] == ["manual", "manual"]

    with pytest.raises(ValueError, match="invalid_warp_map"):
        validate_manual_anchors(
            [{"input_time_sec": 4.0, "timeline_time_sec": 4.0},
             {"input_time_sec": 5.0, "timeline_time_sec": 5.1}],
            duration_sec=20.0,
            beats_per_bar=4,
            target_bpm=120.0,
        )


def test_piecewise_renderer_keeps_continuous_audio_and_expected_duration():
    pytest.importorskip("librosa")
    from app.pipelines.music_warp import warp_audio_piecewise

    sample_rate = 22050
    time_axis = np.arange(sample_rate * 6, dtype=np.float32) / sample_rate
    audio = np.stack([
        np.sin(2 * np.pi * 440 * time_axis),
        np.sin(2 * np.pi * 441 * time_axis),
    ]).astype(np.float32)
    warped = warp_audio_piecewise(
        audio,
        [
            {"input_time_sec": 2.0, "timeline_time_sec": 2.01},
            {"input_time_sec": 4.0, "timeline_time_sec": 4.02},
        ],
        sample_rate=sample_rate,
    )

    assert warped.shape[0] == 2
    assert warped.shape[1] == round(6.03 * sample_rate)
    assert np.isfinite(warped).all()
    for boundary in (2.01, 4.02):
        start = int((boundary - 0.05) * sample_rate)
        end = int((boundary + 0.05) * sample_rate)
        assert float(np.sqrt(np.mean(warped[:, start:end] ** 2))) > 0.2


def test_manual_map_accepts_two_bar_boundary_after_float_rounding():
    anchors = [
        {"input_time_sec": 11.491519274376417, "timeline_time_sec": 11.491519274376417},
        {"input_time_sec": 19.479183673469386, "timeline_time_sec": 19.479183673469386},
    ]

    validated = validate_manual_anchors(
        anchors,
        duration_sec=72.0,
        beats_per_bar=4,
        target_bpm=60.09265988372093,
    )

    assert len(validated) == 2
    assert [item["origin"] for item in validated] == ["manual", "manual"]


def test_grid_aligned_onset_confidence_accepts_smooth_drift_but_rejects_unrelated_or_missing_beats():
    from app.pipelines.music_warp import grid_aligned_onset_confidence

    rng = np.random.default_rng(23)
    hop_seconds = 0.01
    t = np.arange(6000) * hop_seconds
    source_beats = np.arange(1.0, 59.0, 0.5)
    destination_beats = source_beats + 0.12 * np.sin(2 * np.pi * source_beats / 30)
    source_onset = np.zeros_like(t)
    amplitudes = rng.uniform(0.2, 1.0, len(source_beats))
    for beat, amplitude in zip(source_beats, amplitudes):
        source_onset += amplitude * np.exp(-0.5 * ((t - beat) / 0.025) ** 2)
    destination_onset = np.interp(t, destination_beats, source_beats, left=-1, right=60)
    destination_onset = np.interp(destination_onset, t, source_onset, left=0, right=0)
    args = dict(hop_seconds=hop_seconds, target_bpm=120.0, beats_per_bar=4)

    confidence = grid_aligned_onset_confidence(source_onset, destination_onset, source_beats, destination_beats, **args)
    unrelated = grid_aligned_onset_confidence(source_onset, rng.random(len(t)), source_beats, destination_beats, **args)
    unrelated_same_tempo = np.zeros_like(t)
    for beat, amplitude in zip(destination_beats, rng.uniform(0.2, 1.0, len(destination_beats))):
        unrelated_same_tempo += amplitude * np.exp(-0.5 * ((t - beat) / 0.025) ** 2)
    same_tempo_confidence = grid_aligned_onset_confidence(source_onset, unrelated_same_tempo, source_beats, destination_beats, **args)
    missing = grid_aligned_onset_confidence(source_onset, destination_onset, source_beats, np.delete(destination_beats, 30), **args)
    silence = grid_aligned_onset_confidence(np.zeros_like(t), destination_onset, source_beats, destination_beats, **args)

    assert confidence >= 0.7
    assert unrelated < 0.7
    assert same_tempo_confidence < 0.7
    assert missing < 0.7
    assert silence < 0.7
