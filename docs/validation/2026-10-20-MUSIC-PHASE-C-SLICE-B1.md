---
version: "0.1.0b"
created_at: "2026-10-20T20:34:00+07:00,Codex"
last_update: "2026-10-20T20:34:00+07:00,Codex"
status: "PR #31 open; offline evaluation complete; real-vocal listening gate remains open"
attributes:
  domain: "validation"
  doc_type: "benchmark-evidence"
  scope: "Music Phase C Slice B1 pyworld vs psola pitch-shift evaluation"
---

# Music Phase C — Slice B1 Benchmark

## Decision

**Conditional go for a real-vocal listening evaluation; do not integrate pyworld into the production remix pipeline yet.** Keep the current psola path unchanged. On the controlled synthetic input, pyworld passes the provisional objective gates at all tested shifts. At +8 semitones, psola exceeds the formant-drift p95 gate while pyworld remains within it. The generated samples are not real singing, so this result is not enough to make a production-quality claim.

The next product decision should follow a blinded A/B review using licensed singing vocals at ±4 and ±8 semitones. If that review confirms the measured timbre difference, consider pyworld as an optional path for large upward shifts; do not replace psola globally based on this synthetic run.

## Method

- Reproducible script: [`apps/api/scripts/benchmark_music_b1.py`](../../apps/api/scripts/benchmark_music_b1.py).
- Input: deterministic 3.2-second, 44.1 kHz synthetic vowel-like vocal with four known spectral-envelope profiles (`ah`, `eh`, `ee`, `oo`) and a vibrato F0 contour. No user recording or third-party audio was used.
- Shifts: −8, −4, +4, and +8 semitones.
- Both processors received the same F0 contour extracted by WORLD Harvest and refined by StoneMask. This holds pitch tracking constant while comparing the synthesis paths.
- Pitch error was measured with WORLD Harvest/StoneMask on both outputs. Spectral-envelope error and formant peak drift used a separate cepstral-lifter measurement, not either processor's synthesis envelope.
- WAVs were peak-normalized to 0.89 and written as PCM 24-bit. Timing is the mono processor-call time: pyworld includes CheapTrick/D4C and synthesis; `psola.vocode` includes Praat manipulation analysis. Both share the source F0 track extracted before timing. WAV writes and metric calculation are excluded. This is not a full stereo app-latency comparison.
- Environment: Windows 10, CPython 3.11.17, NumPy 2.2.1, SoundFile 0.13.0, pyworld 0.3.5, psola 0.0.1, praat-parselmouth 0.4.7.

PyWORLD exposes F0, harmonic spectral-envelope, and aperiodicity analysis followed by synthesis; the benchmark uses those upstream APIs to preserve the source spectral envelope while shifting F0 ([PyWORLD API](https://github.com/JeremyCCHsu/Python-Wrapper-for-World-Vocoder#pyworld---a-python-wrapper-of-world-vocoder)).

## Provisional Acceptance Gates

These are local engineering gates for this evaluation, not externally validated perceptual thresholds.

| Measure | Gate |
|---|---:|
| Absolute pitch error, 95th percentile | ≤ 50 cents |
| Voiced-frame recall | ≥ 98% |
| Mean measured formant drift | ≤ 5% |
| Formant drift, 95th percentile | ≤ 10% |
| Cepstral spectral-envelope RMS difference | ≤ 6 dB |
| Duration drift | ≤ 1% |

## Results

| Shift | Processor | Pitch error p95 | Mean / p95 formant drift | Envelope RMS | Duration drift | Objective gates |
|---:|---|---:|---:|---:|---:|:---:|
| −8 st | pyworld | 3.3 cents | 1.19% / 3.05% | 1.17 dB | 0.156% | Pass |
| −8 st | psola | 5.1 cents | 0.87% / 2.87% | 1.65 dB | 0.000% | Pass |
| −4 st | pyworld | 4.3 cents | 1.02% / 2.61% | 0.91 dB | 0.156% | Pass |
| −4 st | psola | 6.6 cents | 0.70% / 2.48% | 1.55 dB | 0.000% | Pass |
| +4 st | pyworld | 7.3 cents | 1.63% / 6.29% | 1.49 dB | 0.156% | Pass |
| +4 st | psola | 9.0 cents | 3.02% / 9.47% | 2.14 dB | 0.000% | Pass |
| +8 st | pyworld | 6.5 cents | 3.10% / 8.49% | 2.03 dB | 0.156% | Pass |
| +8 st | psola | 10.4 cents | 7.15% / 26.95% | 2.72 dB | 0.000% | **Fail: formant p95** |

The JSON and CSV include one processor-call timing per case for rough profiling. These are not repeated timing measurements and are not used to make a performance comparison or acceptance decision.

## Audio and Machine-Readable Evidence

All files are generated from the script's deterministic synthetic source:

- Source: [`music-b1-formant-vocal-source.wav`](assets/music-phase-c-slice-b1/music-b1-formant-vocal-source.wav)
- +8 semitones: [pyworld](assets/music-phase-c-slice-b1/music-b1-pyworld-shift-+8st.wav), [psola](assets/music-phase-c-slice-b1/music-b1-psola-shift-+8st.wav)
- −8 semitones: [pyworld](assets/music-phase-c-slice-b1/music-b1-pyworld-shift--8st.wav), [psola](assets/music-phase-c-slice-b1/music-b1-psola-shift--8st.wav)
- All generated renders: [`assets/music-phase-c-slice-b1/`](assets/music-phase-c-slice-b1/)
- Full results: [`music-b1-results.csv`](assets/music-phase-c-slice-b1/music-b1-results.csv), [`music-b1-report.json`](assets/music-phase-c-slice-b1/music-b1-report.json)

## Licensing Note

The upstream pyworld wrapper declares MIT in its [license file](https://github.com/JeremyCCHsu/Python-Wrapper-for-World-Vocoder/blob/master/LICENSE). The upstream `psola==0.0.1` package metadata declares GPLv3 and depends on `praat-parselmouth` ([psola setup.py](https://github.com/maxrmorrison/psola/blob/main/setup.py)). This benchmark installs those packages only in a temporary environment; it adds no runtime dependency to Lalin AI. Review the complete transitive license set before any product integration.

## Verification and Limits

- Offline benchmark script: PASS; all eight pitch-shift renders completed.
- Objective gates: pyworld 8/8 pass; psola 7/8 pass, with the +8-semitone formant p95 gate failing.
- Audio A/B files and checksums: recorded in the JSON report.
- Real licensed singing-vocal A/B and human listening: NOT RUN.
- Remix pipeline integration or dependency changes: NOT MADE.
- Native desktop playback: NOT RUN; this slice is an offline algorithm evaluation.

The synthetic source has stable periodic excitation and controlled broad formants. It does not represent consonants, breathiness, vibrato variability, vocal registers, mic coloration, or a complete song mix. The measured difference is a reason to continue evaluation, not proof that users will prefer one output.
