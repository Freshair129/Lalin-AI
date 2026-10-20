"""Offline comparison of pyworld and the existing psola pitch-shift path.

The input is a deterministic, formant-controlled synthetic vocal. It is meant
to make pitch and spectral-envelope changes measurable; it is not a substitute
for listening to real sung vocals before productizing another processor.

Example:
    python apps/api/scripts/benchmark_music_b1.py

Dependencies are intentionally optional and are not part of the Studio install:
    numpy, soundfile, pyworld, psola (which pulls praat-parselmouth)
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import platform
import sys
import time
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

import numpy as np
import psola
import pyworld as pw
import soundfile as sf


REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLE_RATE = 44_100
FRAME_PERIOD_MS = 5.0
F0_FLOOR_HZ = 70.0
F0_CEIL_HZ = 550.0
OUTPUT_F0_CEIL_HZ = 900.0
SEGMENT_SECONDS = 0.8
VOWELS = (
    # label, base F0, formant centers (Hz), bandwidths (Hz)
    ("ah", 180.0, (730.0, 1090.0, 2440.0, 3500.0), (100.0, 130.0, 200.0, 280.0)),
    ("eh", 195.0, (530.0, 1840.0, 2480.0, 3500.0), (90.0, 140.0, 190.0, 280.0)),
    ("ee", 210.0, (270.0, 2290.0, 3010.0, 3700.0), (70.0, 180.0, 220.0, 300.0)),
    ("oo", 175.0, (300.0, 870.0, 2240.0, 3300.0), (75.0, 110.0, 180.0, 280.0)),
)
SEMITONE_SHIFTS = (-8, -4, 4, 8)

THRESHOLDS = {
    "pitch_error_p95_cents_max": 50.0,
    "voiced_frame_recall_min_pct": 98.0,
    "mean_formant_drift_pct_max": 5.0,
    "p95_formant_drift_pct_max": 10.0,
    "formant_envelope_rms_db_max": 6.0,
    "duration_drift_pct_max": 1.0,
}


def _package_version(name: str) -> str:
    try:
        return version(name)
    except PackageNotFoundError:
        return "unknown"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _make_formant_controlled_vocal() -> tuple[np.ndarray, list[dict[str, object]]]:
    """Generate four vowel-like sections with a known F0 and spectral envelope."""
    total_samples = round(len(VOWELS) * SEGMENT_SECONDS * SAMPLE_RATE)
    time_s = np.arange(total_samples, dtype=np.float64) / SAMPLE_RATE
    segment_index = np.minimum((time_s / SEGMENT_SECONDS).astype(np.int64), len(VOWELS) - 1)

    # Blend each vowel envelope over 35 ms at the boundaries so the fixture has
    # no hard spectral jumps, while keeping long stable measurement windows.
    vowel_weights = np.zeros((len(VOWELS), total_samples), dtype=np.float64)
    for index in range(len(VOWELS)):
        vowel_weights[index, segment_index == index] = 1.0
    transition_samples = round(0.035 * SAMPLE_RATE)
    half_transition = transition_samples // 2
    for boundary_index in range(1, len(VOWELS)):
        boundary = round(boundary_index * SEGMENT_SECONDS * SAMPLE_RATE)
        left = max(0, boundary - half_transition)
        right = min(total_samples, boundary + half_transition)
        ramp = np.linspace(0.0, 1.0, right - left, endpoint=True)
        vowel_weights[:, left:right] = 0.0
        vowel_weights[boundary_index - 1, left:right] = 1.0 - ramp
        vowel_weights[boundary_index, left:right] = ramp

    base_f0 = np.array([entry[1] for entry in VOWELS], dtype=np.float64)
    f0 = base_f0[segment_index] + 3.0 * np.sin(2.0 * np.pi * 4.3 * time_s)
    phase = 2.0 * np.pi * np.cumsum(f0, dtype=np.float64) / SAMPLE_RATE
    signal = np.zeros(total_samples, dtype=np.float64)

    max_harmonic = int(8_000.0 / float(np.min(f0)))
    for harmonic in range(1, max_harmonic + 1):
        instantaneous_frequency = harmonic * f0
        envelope = np.full(total_samples, 0.45, dtype=np.float64)
        for index, entry in enumerate(VOWELS):
            centers = entry[2]
            bandwidths = entry[3]
            for center, bandwidth in zip(centers, bandwidths):
                envelope += vowel_weights[index] * 2.8 * np.exp(
                    -0.5 * ((instantaneous_frequency - center) / bandwidth) ** 2
                )
        signal += np.sin(harmonic * phase) * envelope / (harmonic**1.15)

    peak = float(np.max(np.abs(signal)))
    if peak <= 0.0:
        raise RuntimeError("Synthetic vocal generator produced silence")
    signal = (signal / peak * 0.72).astype(np.float64)
    references = [
        {
            "label": label,
            "start_s": index * SEGMENT_SECONDS,
            "end_s": (index + 1) * SEGMENT_SECONDS,
            "formants_hz": list(formants),
        }
        for index, (label, _base_f0, formants, _bandwidths) in enumerate(VOWELS)
    ]
    return signal, references


def _analyze_f0(signal: np.ndarray, *, f0_ceil: float) -> tuple[np.ndarray, np.ndarray]:
    samples = np.ascontiguousarray(signal, dtype=np.float64)
    f0, times = pw.harvest(
        samples,
        SAMPLE_RATE,
        f0_floor=F0_FLOOR_HZ,
        f0_ceil=f0_ceil,
        frame_period=FRAME_PERIOD_MS,
    )
    if np.count_nonzero(f0) > 0:
        f0 = pw.stonemask(samples, f0, times, SAMPLE_RATE)
    return f0, times


def _shift_with_world(
    source_f0: np.ndarray,
    frame_times: np.ndarray,
    source: np.ndarray,
    semitones: int,
) -> np.ndarray:
    samples = np.ascontiguousarray(source, dtype=np.float64)
    spectral_envelope = pw.cheaptrick(samples, source_f0, frame_times, SAMPLE_RATE)
    aperiodicity = pw.d4c(samples, source_f0, frame_times, SAMPLE_RATE)
    ratio = 2.0 ** (semitones / 12.0)
    shifted_f0 = np.where(source_f0 > 0.0, source_f0 * ratio, 0.0)
    return pw.synthesize(
        np.ascontiguousarray(shifted_f0, dtype=np.float64),
        np.ascontiguousarray(spectral_envelope, dtype=np.float64),
        np.ascontiguousarray(aperiodicity, dtype=np.float64),
        SAMPLE_RATE,
        frame_period=FRAME_PERIOD_MS,
    )


def _shift_with_psola(
    source_f0: np.ndarray,
    source: np.ndarray,
    semitones: int,
) -> np.ndarray:
    ratio = 2.0 ** (semitones / 12.0)
    target_f0 = np.where(source_f0 > 0.0, source_f0 * ratio, np.nan)
    return psola.vocode(
        np.ascontiguousarray(source, dtype=np.float64),
        SAMPLE_RATE,
        target_pitch=np.ascontiguousarray(target_f0, dtype=np.float64),
        fmin=F0_FLOOR_HZ,
        fmax=F0_CEIL_HZ,
    )


def _cepstral_log_envelope(frame: np.ndarray) -> np.ndarray:
    frame_length = len(frame)
    fft_size = 16_384
    window = np.hanning(frame_length)
    log_magnitude = np.log(np.maximum(np.abs(np.fft.rfft(frame * window, n=fft_size)), 1e-8))
    cepstrum = np.fft.irfft(log_magnitude, n=fft_size)
    # Remove pitch-period detail but retain broad vowel resonances. This metric
    # is computed independently of either tested vocoder.
    quefrency_cutoff = round(SAMPLE_RATE / 350.0)
    lifter = np.zeros(fft_size, dtype=np.float64)
    lifter[: quefrency_cutoff + 1] = 1.0
    lifter[-quefrency_cutoff:] = 1.0
    return np.fft.rfft(cepstrum * lifter).real


def _measure_envelopes(
    source: np.ndarray,
    output: np.ndarray,
    references: list[dict[str, object]],
) -> dict[str, float]:
    frame_length = round(0.08 * SAMPLE_RATE)
    half_frame = frame_length // 2
    hop = round(0.04 * SAMPLE_RATE)
    frequencies = np.fft.rfftfreq(16_384, 1.0 / SAMPLE_RATE)
    drifts_pct: list[float] = []
    envelope_rms_db: list[float] = []

    for reference in references:
        start = float(reference["start_s"]) + 0.20
        end = float(reference["end_s"]) - 0.20
        frame_centers = np.arange(start, end, hop / SAMPLE_RATE)
        source_frames: list[np.ndarray] = []
        output_frames: list[np.ndarray] = []
        for center_s in frame_centers:
            center = round(center_s * SAMPLE_RATE)
            start_index = center - half_frame
            end_index = start_index + frame_length
            if start_index < 0 or end_index > min(len(source), len(output)):
                continue
            source_frames.append(_cepstral_log_envelope(source[start_index:end_index]))
            output_frames.append(_cepstral_log_envelope(output[start_index:end_index]))
        if not source_frames or not output_frames:
            raise RuntimeError(f"No stable frames available for vowel {reference['label']}")

        source_envelope = np.mean(source_frames, axis=0)
        output_envelope = np.mean(output_frames, axis=0)
        band = (frequencies >= 200.0) & (frequencies <= 5_000.0)
        source_db = source_envelope[band] * (20.0 / math.log(10.0))
        output_db = output_envelope[band] * (20.0 / math.log(10.0))
        source_db -= float(np.mean(source_db))
        output_db -= float(np.mean(output_db))
        envelope_rms_db.append(float(np.sqrt(np.mean((output_db - source_db) ** 2))))

        for formant_hz in reference["formants_hz"]:
            half_width_hz = max(150.0, float(formant_hz) * 0.18)
            peak_window = (frequencies >= formant_hz - half_width_hz) & (
                frequencies <= formant_hz + half_width_hz
            )
            indices = np.flatnonzero(peak_window)
            source_peak = float(frequencies[indices[np.argmax(source_envelope[peak_window])]])
            output_peak = float(frequencies[indices[np.argmax(output_envelope[peak_window])]])
            if source_peak > 0.0:
                drifts_pct.append(abs(output_peak - source_peak) / source_peak * 100.0)

    return {
        "mean_formant_drift_pct": float(np.mean(drifts_pct)),
        "p95_formant_drift_pct": float(np.percentile(drifts_pct, 95)),
        "formant_envelope_rms_db": float(np.mean(envelope_rms_db)),
    }


def _evaluate(
    output: np.ndarray,
    source: np.ndarray,
    source_duration_s: float,
    source_f0: np.ndarray,
    source_times: np.ndarray,
    target_shift_semitones: int,
    references: list[dict[str, object]],
) -> dict[str, float | bool]:
    output = np.ascontiguousarray(output, dtype=np.float64)
    output_f0, output_times = _analyze_f0(output, f0_ceil=OUTPUT_F0_CEIL_HZ)
    target_f0 = np.where(source_f0 > 0.0, source_f0 * 2.0 ** (target_shift_semitones / 12.0), 0.0)
    expected_f0 = np.interp(output_times, source_times, target_f0, left=0.0, right=0.0)
    target_voiced = expected_f0 > 0.0
    output_voiced = output_f0 > 0.0
    matched = target_voiced & output_voiced
    if not np.any(matched):
        pitch_p95 = float("inf")
        recall_pct = 0.0
    else:
        cents = 1200.0 * np.log2(output_f0[matched] / expected_f0[matched])
        pitch_p95 = float(np.percentile(np.abs(cents), 95))
        recall_pct = float(np.count_nonzero(matched) / max(1, np.count_nonzero(target_voiced)) * 100.0)

    formants = _measure_envelopes(source, output, references)
    duration_s = len(output) / SAMPLE_RATE
    duration_drift_pct = abs(duration_s - source_duration_s) / source_duration_s * 100.0
    result: dict[str, float | bool] = {
        "pitch_error_p95_cents": pitch_p95,
        "voiced_frame_recall_pct": recall_pct,
        "duration_drift_pct": duration_drift_pct,
        "output_duration_s": duration_s,
        **formants,
    }
    result["objective_thresholds_pass"] = bool(
        pitch_p95 <= THRESHOLDS["pitch_error_p95_cents_max"]
        and recall_pct >= THRESHOLDS["voiced_frame_recall_min_pct"]
        and formants["mean_formant_drift_pct"] <= THRESHOLDS["mean_formant_drift_pct_max"]
        and formants["p95_formant_drift_pct"] <= THRESHOLDS["p95_formant_drift_pct_max"]
        and formants["formant_envelope_rms_db"] <= THRESHOLDS["formant_envelope_rms_db_max"]
        and duration_drift_pct <= THRESHOLDS["duration_drift_pct_max"]
    )
    return result


def _write_audio(path: Path, signal: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    peak = float(np.max(np.abs(signal)))
    if peak <= 0.0:
        raise RuntimeError(f"Refusing to write silent audio: {path}")
    normalized = np.asarray(signal, dtype=np.float64) * (0.89 / peak)
    sf.write(path, normalized, SAMPLE_RATE, subtype="PCM_24")


def run(output_dir: Path) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    source, references = _make_formant_controlled_vocal()
    source_duration_s = len(source) / SAMPLE_RATE
    source_path = output_dir / "music-b1-formant-vocal-source.wav"
    _write_audio(source_path, source)

    source_f0, source_times = _analyze_f0(source, f0_ceil=F0_CEIL_HZ)
    if np.count_nonzero(source_f0) < len(source_f0) * 0.95:
        raise RuntimeError("WORLD did not track enough voiced source frames for a controlled comparison")

    rows: list[dict[str, object]] = []
    method_metrics: dict[str, dict[str, dict[str, object]]] = {"pyworld": {}, "psola": {}}
    for semitones in SEMITONE_SHIFTS:
        for method, processor in (
            ("pyworld", lambda: _shift_with_world(source_f0, source_times, source, semitones)),
            ("psola", lambda: _shift_with_psola(source_f0, source, semitones)),
        ):
            started = time.perf_counter()
            shifted = np.asarray(processor(), dtype=np.float64)
            processing_seconds = time.perf_counter() - started
            path = output_dir / f"music-b1-{method}-shift-{semitones:+d}st.wav"
            _write_audio(path, shifted)
            metrics = _evaluate(
                shifted,
                source,
                source_duration_s,
                source_f0,
                source_times,
                semitones,
                references,
            )
            row: dict[str, object] = {
                "method": method,
                "shift_semitones": semitones,
                "processing_seconds": processing_seconds,
                "real_time_factor": processing_seconds / source_duration_s,
                "audio_file": path.name,
                "audio_sha256": _sha256(path),
                **metrics,
            }
            rows.append(row)
            method_metrics[method][f"{semitones:+d}"] = row

    csv_path = output_dir / "music-b1-results.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    report: dict[str, object] = {
        "benchmark": "music-phase-c-slice-b1",
        "created_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "runtime": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "numpy": _package_version("numpy"),
            "soundfile": _package_version("soundfile"),
            "pyworld": _package_version("pyworld"),
            "psola": _package_version("psola"),
            "praat_parselmouth": _package_version("praat-parselmouth"),
        },
        "input": {
            "type": "deterministic synthetic vowel-like vocal; no user or third-party recording",
            "sample_rate_hz": SAMPLE_RATE,
            "duration_s": source_duration_s,
            "sha256": _sha256(source_path),
            "source_f0_median_hz": float(np.median(source_f0[source_f0 > 0.0])),
            "source_voiced_frame_recall_pct": float(np.count_nonzero(source_f0) / len(source_f0) * 100.0),
            "sections": references,
        },
        "configuration": {
            "frame_period_ms": FRAME_PERIOD_MS,
            "f0_floor_hz": F0_FLOOR_HZ,
            "f0_ceil_hz": F0_CEIL_HZ,
            "semitone_shifts": list(SEMITONE_SHIFTS),
            "thresholds": THRESHOLDS,
            "spectral_envelope_metric": "independent cepstral lifter; 80ms frames; quefrency cutoff 1/350s",
            "timing_note": "Mono processor-call RTF only. The shared source F0 contour is extracted once outside the timer; pyworld calls include CheapTrick/D4C plus synthesis, while psola.vocode includes Praat manipulation analysis. Not an end-to-end stereo app latency comparison.",
        },
        "methods": method_metrics,
        "caveat": "Objective measures and generated A/B renders do not establish perceptual preference on real singing vocals; listen to real licensed vocal sources before production adoption.",
    }
    json_path = output_dir / "music-b1-report.json"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=REPO_ROOT / "data" / "music-phase-c-slice-b1",
        help="Output folder for JSON/CSV metrics and WAV A/B artifacts (default: ignored data/)",
    )
    args = parser.parse_args()
    report = run(args.output_dir.resolve())
    print(f"Wrote benchmark outputs to {args.output_dir.resolve()}")
    for method, shifts in report["methods"].items():
        for shift, row in shifts.items():
            print(
                f"{method:7s} {int(shift):+3d} st | "
                f"pitch p95={row['pitch_error_p95_cents']:.1f} cents | "
                f"formant mean/p95={row['mean_formant_drift_pct']:.2f}/{row['p95_formant_drift_pct']:.2f}% | "
                f"envelope RMS={row['formant_envelope_rms_db']:.2f} dB | "
                f"duration drift={row['duration_drift_pct']:.3f}% | "
                f"RTF={row['real_time_factor']:.3f} | "
                f"objective={'PASS' if row['objective_thresholds_pass'] else 'FAIL'}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
