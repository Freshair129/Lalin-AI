# Sprint 9 Validation: Dubbing End-To-End Workstation Smoke

Date: 2026-07-03

## Scope

Sprint 9 closes the workstation dubbing feature-smoke gap without claiming packaged full-distribution readiness.

- Run a short end-to-end dubbing pipeline from the workstation backend runtime.
- Exercise ASR, TTS segment generation, timeline mixing, and subtitle output.
- Disable translation for this smoke to avoid LLM/network flake while preserving the core dubbing media path.
- Force ASR/TTS to CPU inside the dubbing smoke process only to avoid local CUDA speech-runtime mismatch.

## Acceptance Criteria

| Gate | Evidence | Result |
|---|---|---|
| Source availability | `backend\smoke_dubbing.py` uses `data\outputs\smoke_thai.wav`, generating it if missing | PASS |
| ASR to segment | Smoke produced `segments: 1`, `detected_language: th` | PASS |
| TTS and timeline mix | Smoke wrote `data\outputs\dubbed_3cecc661316e.wav`, duration `5.38s` | PASS |
| Subtitle artifacts | Smoke wrote `.srt` and `.vtt` subtitle artifacts | PASS |
| Deterministic runtime | Dubbing smoke sets `ASR_DEVICE=cpu`, `ASR_COMPUTE_TYPE=int8`, and `TTS_DEVICE=cpu` | PASS |

## Validation Evidence

Command:

```powershell
cd backend
backend\.venv\Scripts\python.exe smoke_dubbing.py
cd ..
powershell -ExecutionPolicy Bypass -File scripts\smoke_workstation_features.ps1
```

Summary:

```text
elapsed_sec: 147.9
output_exists: true
output_duration_sec: 5.38
segments: 1
detected_language: th
translated: false
subtitle_srt_exists: true
subtitle_vtt_exists: true
PASS: dubbing output, segments, and subtitles were written
PASS: mastering output meets LUFS and peak gates
  measured_lufs: -14.0
  peak_dbfs: -1.09
PASS: remix output meets LUFS and peak gates
  measured_lufs: -14.0
  peak_dbfs: -2.51
Workstation feature smoke passed.
```

## RCA

The first GPU-backed attempts failed with:

```text
Could not load symbol cudnnGetLibConfig. Error code 127
```

Root-cause details are recorded in `.brain\rca\2026-07-03-dubbing-smoke-asr-cuda.md`.

## Remaining Production Gates

- Run packaged/full-workstation feature smoke from an installable or launchable workstation artifact.
- Finalize first-run model download UX/progress.
- Confirm CPU/GPU strategy for end-user machines, including whether ASR/TTS should default to CUDA, CPU fallback, or explicit user choice.
