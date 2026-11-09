---
version: "0.1.0b"
created_at: "2026-11-09T14:00:00+07:00,Claude,15776b7"
last_update: "2026-11-09T14:00:00+07:00,Claude"
status: "beta"
superseded_by: null
attributes:
  domain: "playback"
  doc_type: "root-cause-analysis"
  scope: "Smart Medley v1.1 analyzer key/BPM confidence (PLAY-27, spec §4)"
---

# Smart Medley analyzer rejects every clear synthetic pair (0/10 coverage)

## Symptom

The first synthetic §4 run (PR #65, analyzer `smart-medley-0.1.0`) recommended
Smart Medley for 0 of the 10 expected-eligible pairs. Every gate rejection fell into one of two groups:

- **`key-confidence-below-0.75`** (SYN-01..06): every C-major clip scored 0.68.
  A minor, G major and D major clips scored 0.97–0.99.
- **`bpm-confidence-below-0.80`** (SYN-07..10): the 120, 124, 128 and 132 BPM
  clips scored 0.75–0.77. The 120 BPM clip was read as **60.1** and the 132 BPM
  clip as **66.1**, both half-tempo errors.

The earlier summary called these "60/66 BPM clips". That was wrong: the
generator wrote 120 and 132 BPM, and 60.1/66.1 are the analyzer's estimates.

## Evidence

The diagnostic tests are in
`apps/play-desktop/src-tauri/src/smart_medley_rca_probe.rs`, `#[ignore]`. They
feed tones built the same way as the evidence generator through the production
`FeatureAccumulator`, `estimate_key` and `estimate_bpm`.

**Key: the generator's 7-note scale, pitched by `440·2^((tonic+i−9)/12)`
(C4–B5).**

| Case | Key confidence | Estimate |
|---|---:|---|
| C major (generator register) | 0.683 | C major |
| C♯ major | 0.128 | **F minor** (wrong) |
| D major | 0.990 | D major |
| D♯ major | 0.006 | **B♭ major** (wrong) |
| C minor / C♯ minor | 0.200 / 0.267 | correct tonic |
| Most other tonics | 0.85–0.99 | correct |
| C major, **one octave up** | 0.894 | C major |
| C major, **one octave down** | 0.124 | C major |
| C major, no tonic emphasis / 5 ms fades | 0.434 / 0.703 | C major |
| Ideal pitch-class vector (no FFT), 7 notes | best−second 0.265 → separation 1.0 | C major |

Confidence follows absolute frequency, not pitch class, and is not monotonic
across tonics. Two measurements show this:

- The same scale gains confidence one octave up and loses it one octave down.
- With the FFT removed, the input is ideal, the separation saturates, and
  confidence depends only on the analyzer's tonal-strength term.

In the measured chroma for C♯ major, `chroma[C] = 0.194 > chroma[C♯] = 0.135`.
The tonic's energy lands in the neighbouring pitch class.

**BPM: the same pulse train at 21 tempos.**

| Tempo range | BPM confidence | Estimate |
|---|---:|---|
| 60–110 BPM | 0.876–0.941 | correct |
| 118 BPM | 0.827 | correct |
| 120, 126, 140 BPM | 0.769–0.771 | **60.1, 63.0, 70.0** (half tempo) |
| 123, 124, 128, 130, 150, 160, 174 BPM | 0.746–0.762 | correct value, below the floor |

## Root Cause

Both are analyzer defects. The generator did not cause them, and the
thresholds are not wrong. The confidence functions are miscalibrated.

1. **Key, chroma leakage at low frequency.** `process_frame` maps each FFT bin
   to its nearest pitch class:
   - The FFT has 2048 points at 22.05 kHz, so bins are 10.77 Hz apart.
   - The Hann main lobe spans ±2 bins (±21.5 Hz).
   - Below about 370 Hz, adjacent semitones are less than 21.5 Hz apart, so a
     pure tone's energy is split across two pitch classes.
   - Chroma accumulates from 55 Hz, so the bass register is affected even more.

   How much leaks depends on where each note falls relative to the bin grid.
   That explains why the effect varies by tonic and octave rather than by key.

2. **BPM, the tempo octave counted as a rival.** `estimate_bpm` measures
   separation against the strongest autocorrelation peak more than 2 lags from
   the best one:
   - The lag search is 14–43 frames.
   - At tempos of about 120 BPM and above, the beat lag `L` is 21.5 frames or
     less, so `2L` is still inside the window.
   - A strictly periodic beat correlates almost equally at `L` and `2L`. The
     separation then falls to about 0, and confidence is capped at
     `(0.55+0.45c)·0.75 ≤ 0.75`, plus quantization.
   - The argmax can also land on `2L`, which gives the half-tempo estimate.
   - Below about 120 BPM, `2L` falls outside the window, which is why slower
     clips pass.

   The 120–130 BPM band is the most common pop/dance tempo, so this defect would
   reject most real tracks too.

## Contributing factors

- **The generator puts tonic 0 on side A of every pair.** Every pair contains
  the worst-case C4-register clip, which concentrates defect 1. The synthetic
  set also covers only 4 tonics.
- **The analyzer's unit tests use well-separated synthetic cases.** No test
  sweeps the 12 tonics, the octaves, or tempos at and above 120 BPM.

## Why the issue escaped detection

The feature shipped behind a default-off Experimental gate, and spec §4 made
this evidence run the first quantitative check. The gate's fail-closed design
worked:
- Every wrong key (C♯→F minor, D♯→B♭ major) and every half-tempo estimate came
  with below-floor confidence.
- The BPM, key and cue false-confidence rows stayed at 0.

The cost was coverage, not safety.

## Corrective actions (proposed — owner decision required)

| # | Action | Owner gate |
|---|---|---|
| 1 | **Key:** compute chroma from a log-frequency or semitone-weighted mapping. Options are a triangular kernel around each semitone centre, a larger FFT for chroma (e.g. 8192 points, 2.7 Hz bins), or a minimum chroma frequency of about 130 Hz. Accept only when the 12-tonic × 3-octave sweep gives ≥ 0.75 for every correct key and keeps wrong keys below the floor. | Analyzer behaviour change → bump `analysisVersion` (cache invalidation) |
| 2 | **BPM:** treat integer-multiple lags (`2L`, `L/2`) as harmonic support, not as rivals. Resolve the tempo octave with an explicit prior inside 60–180 BPM (prefer the faster reading when `L` and `2L` are within a tolerance). Accept only when the 60–180 BPM sweep has no octave errors and gives ≥ 0.80 on clean pulse trains. | Same version bump |
| 3 | Make the probe's sweeps permanent, non-ignored regression tests with explicit pass bands. | — |
| 4 | Generator: spread tonics across both sides and all 12 pitch classes. Changing it changes the fixture hashes, so regenerate and re-freeze. | — |
| 5 | Rerun the §4 synthetic evidence. Start the Creative Commons set only after it passes. | §4 contract unchanged |

None of these touches the gate thresholds (0.75 / 0.80 / 0.80 / 0.70). The
Experimental label stays on.
