"""Beat-grid drift analysis and guarded, transient vocal warp maps."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Iterable

import numpy as np


MIN_CONFIDENCE = 0.70
MIN_ANCHORS = 3
MIN_SPAN_BARS = 8.0
MIN_SEGMENT_BARS = 2.0
MIN_SEGMENT_TIME_TOLERANCE_SEC = 1e-6
MIN_RATIO = 0.97
MAX_RATIO = 1.03


@dataclass(frozen=True)
class WarpAnchor:
    id: str
    input_time_sec: float
    timeline_time_sec: float
    drift_ms: float
    confidence: float
    origin: str = "auto"


@dataclass(frozen=True)
class DriftMetrics:
    status: str
    confidence: float
    anchor_count: int
    span_bars: float
    residual_p95_ms: float
    end_drift_ms: float
    max_abs_drift_ms: float
    max_local_stretch_pct: float
    anchors: tuple[WarpAnchor, ...]
    reason: str | None = None
    phase_correction_ms: float = 0.0

    def as_dict(self) -> dict:
        value = asdict(self)
        value["anchors"] = [asdict(anchor) for anchor in self.anchors]
        return value


def analyze_drift(
    source_beats_sec: Iterable[float],
    destination_beats_sec: Iterable[float],
    *,
    target_bpm: float,
    beats_per_bar: int = 4,
    phase_offset_sec: float = 0.0,
    phrase_offset_sec: float = 0.0,
    source_confidence: float = 1.0,
    destination_confidence: float = 1.0,
    alignment_confidence: float = 1.0,
    window_bars: int = 4,
    hop_bars: int = 2,
) -> DriftMetrics:
    """Compare beat indices after global sync and summarize robust local drift.

    The input grids must be in seconds after global source stretching and vocal
    head trim. Pairing is deliberately index-preserving: when a beat is missing,
    following beats are not silently shifted to a new index.
    """
    src = _finite_sorted(source_beats_sec)
    dst = _finite_sorted(destination_beats_sec)
    if target_bpm <= 0 or beats_per_bar <= 0 or window_bars <= 0 or hop_bars <= 0 or hop_bars >= window_bars:
        raise ValueError("invalid beat-warp analysis settings")

    source_confidence = _unit(source_confidence)
    destination_confidence = _unit(destination_confidence)
    alignment_confidence = _unit(alignment_confidence)
    evidence_confidence = min(source_confidence, destination_confidence, alignment_confidence)
    beat_sec = 60.0 / target_bpm
    bar_sec = beat_sec * beats_per_bar
    empty = DriftMetrics("insufficient_evidence", evidence_confidence, 0, 0.0, 0.0, 0.0, 0.0, 0.0, (), "not_enough_beats")
    if len(src) < beats_per_bar * window_bars or len(dst) < beats_per_bar * window_bars:
        return empty

    baseline_first = src[0] + phase_offset_sec + phrase_offset_sec
    start_index = int(np.argmin(np.abs(dst - baseline_first)))
    count = min(len(src), len(dst) - start_index)
    if count < beats_per_bar * window_bars:
        return empty

    paired_src = src[:count]
    paired_dst = dst[start_index:start_index + count]
    baseline = paired_src + phase_offset_sec + phrase_offset_sec
    raw_residual = paired_dst - baseline
    global_phase = float(np.median(raw_residual))

    # A near-whole-beat residual is evidence that indices have become ambiguous
    # (usually a dropped beat or a different arrangement), not local tempo drift.
    ambiguous = np.zeros(count, dtype=bool)
    interval_src = np.diff(paired_src)
    interval_dst = np.diff(paired_dst)
    bad_intervals = (interval_src <= 0) | (interval_dst <= 0)
    bad_intervals |= np.abs(interval_src - interval_dst) > beat_sec * 0.40
    residual_steps = np.abs(np.diff(raw_residual)) > beat_sec * 0.40
    ambiguous[:-1] |= residual_steps
    ambiguous[1:] |= residual_steps
    ambiguous[:-1] |= bad_intervals
    ambiguous[1:] |= bad_intervals
    if np.any(ambiguous):
        alignment_confidence = min(alignment_confidence, 0.45)
        evidence_confidence = min(source_confidence, destination_confidence, alignment_confidence)
        return DriftMetrics(
            "insufficient_evidence", evidence_confidence, 0, 0.0,
            _p95(raw_residual - global_phase), 0.0,
            _max_abs(raw_residual - global_phase), 0.0, (),
            "ambiguous_beat_pairing", round(global_phase * 1000.0, 3),
        )

    residual = raw_residual - global_phase
    reliable = np.full(count, min(source_confidence, destination_confidence) >= MIN_CONFIDENCE, dtype=bool)
    if int(reliable.sum()) < beats_per_bar * window_bars:
        return DriftMetrics("insufficient_evidence", evidence_confidence, 0, 0.0, _p95(residual[reliable]), 0.0, _max_abs(residual[reliable]), 0.0, (), "ambiguous_beat_pairing")

    duration = window_bars * bar_sec
    hop = hop_bars * bar_sec
    first = float(paired_src[0])
    last = float(paired_src[-1])
    starts = np.arange(first, last - duration + beat_sec + 1e-9, hop, dtype=float)
    centers: list[float] = []
    window_residuals: list[float] = []
    window_confidence: list[float] = []
    for start in starts:
        end = start + duration
        mask = (paired_src >= start) & (paired_src < end) & reliable
        if int(mask.sum()) < 8:
            continue
        centers.append(float(start + duration / 2.0))
        window_residuals.append(float(np.median(residual[mask])))
        window_confidence.append(evidence_confidence)

    if not centers:
        return DriftMetrics("insufficient_evidence", evidence_confidence, 0, 0.0, _p95(residual[reliable]), 0.0, _max_abs(residual[reliable]), 0.0, (), "no_reliable_windows")

    window_values = np.asarray(window_residuals, dtype=float)
    # Remove any remaining constant component introduced by window sampling.
    window_values -= float(np.median(window_values))
    span_bars = max(0.0, (centers[-1] - centers[0]) / bar_sec)
    p95_ms = _p95(residual[reliable]) * 1000.0
    end_drift_ms = (float(window_values[-1] - window_values[0]) * 1000.0) if len(window_values) > 1 else 0.0
    max_abs_ms = _max_abs(window_values) * 1000.0
    drifted_adjacent = any(abs(window_values[i] * 1000.0) + 1e-6 >= 20 and abs(window_values[i + 1] * 1000.0) + 1e-6 >= 20 for i in range(len(window_values) - 1))
    enough = len(centers) >= MIN_ANCHORS and span_bars >= MIN_SPAN_BARS and evidence_confidence >= MIN_CONFIDENCE

    if not enough:
        status = "insufficient_evidence"
        reason = "low_confidence_or_span"
    elif p95_ms <= 20.0 and abs(end_drift_ms) <= 30.0:
        status, reason = "in_sync", None
    elif (p95_ms >= 30.0 or abs(end_drift_ms) >= 50.0) and drifted_adjacent:
        status, reason = "drift_detected", None
    else:
        status, reason = "watch", None

    anchors: list[WarpAnchor] = []
    if len(centers) >= 2:
        for i, (time_sec, local_drift, confidence) in enumerate(zip(centers, window_values, window_confidence)):
            timeline = time_sec + phase_offset_sec + phrase_offset_sec + float(local_drift)
            anchors.append(WarpAnchor(f"a{i + 1}", time_sec, timeline, float(local_drift * 1000.0), confidence))

    max_stretch = 0.0
    ratios: list[float] = []
    for left, right in zip(anchors, anchors[1:]):
        delta_input = right.input_time_sec - left.input_time_sec
        delta_output = right.timeline_time_sec - left.timeline_time_sec
        if delta_input <= 0 or delta_output <= 0:
            ratios.append(float("inf"))
            continue
        ratios.append(delta_output / delta_input)
        max_stretch = max(max_stretch, abs((delta_output / delta_input) - 1.0) * 100.0)

    if status == "drift_detected":
        minimum_span = MIN_SEGMENT_BARS * bar_sec
        if any(ratio < MIN_RATIO or ratio > MAX_RATIO for ratio in ratios) or any(
            right.input_time_sec - left.input_time_sec < minimum_span - MIN_SEGMENT_TIME_TOLERANCE_SEC
            for left, right in zip(anchors, anchors[1:])
        ) or any(right.timeline_time_sec <= left.timeline_time_sec for left, right in zip(anchors, anchors[1:])):
            status, reason = "warp_limited", "local_stretch_or_segment_guardrail"

    return DriftMetrics(
        status=status,
        confidence=evidence_confidence,
        anchor_count=len(anchors),
        span_bars=round(span_bars, 3),
        residual_p95_ms=round(p95_ms, 3),
        end_drift_ms=round(end_drift_ms, 3),
        max_abs_drift_ms=round(max_abs_ms, 3),
        max_local_stretch_pct=round(max_stretch, 4),
        anchors=tuple(anchors),
        reason=reason,
        phase_correction_ms=round(global_phase * 1000.0, 3),
    )


def grid_aligned_onset_confidence(
    source_onset: np.ndarray, destination_onset: np.ndarray,
    source_beats: np.ndarray, destination_beats: np.ndarray, *,
    hop_seconds: float, target_bpm: float, beats_per_bar: int,
) -> float:
    """Compare onset envelopes after a bounded, index-preserving beat alignment."""
    src, dst = _finite_sorted(source_beats), _finite_sorted(destination_beats)
    if hop_seconds <= 0 or target_bpm <= 0 or beats_per_bar <= 0 or len(src) == 0 or len(dst) == 0:
        return 0.0
    start = int(np.argmin(np.abs(dst - src[0])))
    count = min(len(src), len(dst) - start)
    if count < beats_per_bar * 8:
        return 0.0
    src, dst = src[:count], dst[start:start + count]
    beat_sec = 60.0 / target_bpm
    src_intervals, dst_intervals = np.diff(src), np.diff(dst)
    if (np.any(src_intervals <= 0) or np.any(dst_intervals <= 0)
            or np.any(np.abs(src_intervals - dst_intervals) > beat_sec * 0.4)):
        return 0.0
    source = np.asarray(source_onset, dtype=float)
    destination = np.asarray(destination_onset, dtype=float)
    if not np.all(np.isfinite(source)) or not np.all(np.isfinite(destination)):
        return 0.0
    first = max(0, int(np.ceil(src[0] / hop_seconds)))
    last = min(len(source), int(np.floor(src[-1] / hop_seconds)))
    times = np.arange(first, last, dtype=float) * hop_seconds
    if not len(times):
        return 0.0
    mapped = np.interp(times, src, dst) / hop_seconds
    phase = np.interp(times, src, np.arange(len(src), dtype=float)) % 1.0
    phase_bins = np.minimum((phase * 16).astype(int), 15)
    destination_frames = np.arange(len(destination), dtype=float)
    valid = (mapped >= 0) & (mapped < len(destination) - 1)
    window = max(2, int(round(4 * beats_per_bar * beat_sec / hop_seconds)))
    scores = []
    for begin in range(0, len(times) - window + 1, max(1, window // 2)):
        if not np.all(valid[begin:begin + window]):
            continue
        x = source[first + begin:first + begin + window].copy()
        y = np.interp(mapped[begin:begin + window], destination_frames, destination)
        bins = phase_bins[begin:begin + window]
        # Ignore the average within-beat pattern: a shared kick pulse alone is
        # not evidence that two tracks contain the same musical material.
        for bin_index in range(16):
            mask = bins == bin_index
            if np.any(mask):
                x[mask] -= np.mean(x[mask])
                y[mask] -= np.mean(y[mask])
        denom = float(np.linalg.norm(x) * np.linalg.norm(y))
        scores.append(float(np.dot(x, y) / denom) if denom > 1e-9 else 0.0)
    if len(scores) < 3:
        return 0.0
    return float(np.clip(np.percentile(scores, 25), 0.0, 1.0))


def estimate_beat_grid(path: str, *, sample_rate: int = 44100) -> tuple[np.ndarray, float]:
    """Estimate beat times and a conservative onset-strength confidence score."""
    import librosa

    y, sr = librosa.load(path, sr=sample_rate, mono=True)
    if len(y) < sample_rate * 2:
        return np.asarray([], dtype=float), 0.0
    hop = 512
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    _, frames = librosa.beat.beat_track(
        y=y, sr=sr, hop_length=hop, units="frames", trim=False
    )
    frames = np.asarray(frames, dtype=int)
    if len(frames) < 2 or not len(onset) or float(np.max(onset)) <= 1e-9:
        return np.asarray([], dtype=float), 0.0
    times = np.asarray(librosa.frames_to_time(frames, sr=sr, hop_length=hop), dtype=float)
    strengths = np.asarray([
        np.max(onset[max(0, frame - 1):min(len(onset), frame + 2)])
        for frame in frames
    ], dtype=float)
    scale = float(np.percentile(onset, 95))
    confidence = float(np.clip(np.median(strengths) / max(scale, 1e-9), 0.0, 1.0))
    return times, confidence


def validate_manual_anchors(anchors: list[dict], *, duration_sec: float, beats_per_bar: int, target_bpm: float) -> list[dict]:
    """Validate a user-edited map against monotonicity and ±3% limits."""
    if len(anchors) < 2 or duration_sec <= 0 or target_bpm <= 0 or beats_per_bar <= 0:
        raise ValueError("invalid_warp_map")
    minimum_segment = MIN_SEGMENT_BARS * beats_per_bar * 60.0 / target_bpm
    result: list[dict] = []
    previous: dict | None = None
    for index, raw in enumerate(anchors):
        try:
            input_time = float(raw["input_time_sec"])
            timeline_time = float(raw["timeline_time_sec"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("invalid_warp_map") from exc
        if not np.isfinite(input_time) or not np.isfinite(timeline_time) or input_time < 0 or input_time > duration_sec or timeline_time < 0:
            raise ValueError("invalid_warp_map")
        point = {**raw, "id": str(raw.get("id") or f"m{index + 1}"), "input_time_sec": input_time, "timeline_time_sec": timeline_time, "origin": "manual"}
        if previous is not None:
            delta_input = input_time - previous["input_time_sec"]
            delta_output = timeline_time - previous["timeline_time_sec"]
            ratio = delta_output / delta_input if delta_input > 0 else float("inf")
            if delta_input < minimum_segment - MIN_SEGMENT_TIME_TOLERANCE_SEC or delta_output <= 0 or ratio < MIN_RATIO or ratio > MAX_RATIO:
                raise ValueError("invalid_warp_map")
        result.append(point)
        previous = point
    if (result[0]["input_time_sec"] < minimum_segment - MIN_SEGMENT_TIME_TOLERANCE_SEC
            or duration_sec - result[-1]["input_time_sec"] < minimum_segment - MIN_SEGMENT_TIME_TOLERANCE_SEC):
        raise ValueError("invalid_warp_map")
    return result


def warp_audio_piecewise(audio: np.ndarray, anchors: list[dict], *, sample_rate: int, window_sec: float = 0.12) -> np.ndarray:
    """Pitch-preserving local time-stretch with overlapped processing windows.

    `audio` is channel-first. `anchors` contain input time and *local correction*
    output time (global phase/phrase offset is applied later by the mixer).
    """
    if audio.ndim == 1:
        audio = audio[np.newaxis, :]
    if audio.ndim != 2 or sample_rate <= 0:
        raise ValueError("invalid audio shape or sample rate")
    points = sorted((float(a["input_time_sec"]), float(a["timeline_time_sec"])) for a in anchors)
    if len(points) < 2:
        raise ValueError("invalid_warp_map")
    duration = audio.shape[1] / sample_rate
    if points[0][0] <= 0 or points[-1][0] >= duration:
        raise ValueError("warp anchors must leave two guarded edge segments")

    # Add edge points by extending the nearest segment slope. This preserves the
    # map continuously through the whole vocal while keeping its phase separate.
    first_slope = (points[1][1] - points[0][1]) / (points[1][0] - points[0][0])
    last_slope = (points[-1][1] - points[-2][1]) / (points[-1][0] - points[-2][0])
    mapped = [(0.0, points[0][1] - points[0][0] * first_slope), *points, (duration, points[-1][1] + (duration - points[-1][0]) * last_slope)]
    for (x0, y0), (x1, y1) in zip(mapped, mapped[1:]):
        ratio = (y1 - y0) / (x1 - x0) if x1 > x0 else float("inf")
        if x1 - x0 < 0.001 or ratio < MIN_RATIO or ratio > MAX_RATIO:
            raise ValueError("invalid_warp_map")

    import librosa

    output_duration = mapped[-1][1]
    output_len = max(1, int(round(output_duration * sample_rate)))
    accum = np.zeros((audio.shape[0], output_len), dtype=np.float32)
    weights = np.zeros(output_len, dtype=np.float32)
    for index, ((x0, y0), (x1, y1)) in enumerate(zip(mapped, mapped[1:])):
        slope = (y1 - y0) / (x1 - x0)
        context = min(window_sec, (x1 - x0) * 0.20)
        in_start = max(0.0, x0 - context)
        in_end = min(duration, x1 + context)
        start_sample = int(round(in_start * sample_rate))
        end_sample = max(start_sample + 1, int(round(in_end * sample_rate)))
        chunk_in = audio[:, start_sample:end_sample].astype(np.float32, copy=False)
        chunk_start_time = y0 + (in_start - x0) * slope
        chunk_out_len = max(1, int(round(chunk_in.shape[1] * slope)))
        stretched = np.empty((audio.shape[0], chunk_out_len), dtype=np.float32)
        for channel in range(audio.shape[0]):
            candidate = librosa.effects.time_stretch(chunk_in[channel], rate=1.0 / slope)
            if len(candidate) < chunk_out_len:
                candidate = np.pad(candidate, (0, chunk_out_len - len(candidate)))
            stretched[channel] = candidate[:chunk_out_len]

        out_start = int(round(chunk_start_time * sample_rate))
        out_end = out_start + chunk_out_len
        clip_start, clip_end = max(0, out_start), min(output_len, out_end)
        if clip_end <= clip_start:
            continue
        src_start, src_end = clip_start - out_start, clip_end - out_start
        weight = np.ones(chunk_out_len, dtype=np.float32)
        fade_samples = min(int(round(2 * context * slope * sample_rate)), chunk_out_len // 3)
        if index > 0 and fade_samples > 0:
            weight[:fade_samples] = np.linspace(0.0, 1.0, fade_samples, dtype=np.float32)
        if index < len(mapped) - 2 and fade_samples > 0:
            weight[-fade_samples:] = np.minimum(weight[-fade_samples:], np.linspace(1.0, 0.0, fade_samples, dtype=np.float32))
        accum[:, clip_start:clip_end] += stretched[:, src_start:src_end] * weight[src_start:src_end]
        weights[clip_start:clip_end] += weight[src_start:src_end]

    np.maximum(weights, 1e-6, out=weights)
    return accum / weights[np.newaxis, :]


def _finite_sorted(values: Iterable[float]) -> np.ndarray:
    result = np.asarray(list(values), dtype=float)
    if result.ndim != 1 or not np.all(np.isfinite(result)):
        raise ValueError("beat times must be a finite sequence")
    if len(result) > 1 and np.any(np.diff(result) <= 0):
        raise ValueError("beat times must be strictly increasing")
    return result


def _unit(value: float) -> float:
    value = float(value)
    if not np.isfinite(value):
        return 0.0
    return float(np.clip(value, 0.0, 1.0))


def _p95(values: np.ndarray) -> float:
    return float(np.percentile(np.abs(values), 95)) if len(values) else 0.0


def _max_abs(values: np.ndarray) -> float:
    return float(np.max(np.abs(values))) if len(values) else 0.0
