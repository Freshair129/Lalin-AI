# Sprint 8 Validation: Workstation Feature Smoke Harness

Date: 2026-07-03

## Scope

Sprint 8 adds a repeatable workstation feature smoke harness for the full ML runtime surface.

- Keep the lite NSIS installer separate from full ML distribution.
- Define the full workstation/BYOM distribution boundary.
- Run real workstation feature smoke for TTS, mastering, and remix.
- Preserve dubbing and packaged-distribution smoke as remaining gates instead of overclaiming production completion.

## Acceptance Criteria

| Gate | Evidence | Result |
|---|---|---|
| Distribution boundary | `docs\WORKSTATION_DISTRIBUTION.md` defines lite installer vs full ML workstation responsibilities | PASS |
| Full-profile readiness | `scripts\smoke_workstation_features.ps1` calls `scripts\smoke_full_profile_readiness.ps1` | PASS |
| TTS feature smoke | `backend\smoke_tts.py` generated `data\outputs\smoke_thai.wav` | PASS |
| Mastering feature smoke | `backend\smoke_mastering.py` generated a WAV at `-14.0 LUFS`, peak `-1.09 dBFS` | PASS |
| Remix feature smoke | `backend\smoke_remix.py` generated a WAV at `-14.0 LUFS`, peak `-2.48 dBFS` | PASS |

## Validation Evidence

Command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\smoke_workstation_features.ps1
```

Summary:

```text
PASS: full profile boots with ML routes and required workstation modules available
DONE in 220.9s | output=D:\G-Music\backend\data\outputs\smoke_thai.wav | 4.88s @ 24000Hz
PASS: mastering output meets LUFS and peak gates
  measured_lufs: -14.0
  peak_dbfs: -1.09
PASS: remix output meets LUFS and peak gates
  measured_lufs: -14.0
  peak_dbfs: -2.48
Workstation feature smoke passed.
```

Observed non-blocking runtime warnings:

- Hugging Face cache symlink optimization is disabled on this Windows machine, so cache may use more disk space.
- `pydub` warned that system `ffmpeg` was not found, but this smoke path still passed through the repo's configured audio utilities.

## Remaining Production Gates

- Run dubbing end-to-end feature smoke from the workstation surface. Follow-up: Sprint 9 closes this gate with `backend\smoke_dubbing.py`.
- Build or define the next installable/launchable workstation artifact outside ad hoc developer commands.
- Run packaged/full-workstation feature smoke from that artifact.
- Finalize first-run model download UX/progress.
- Confirm CPU/GPU strategy for end-user machines.
