# Sprint 7 Validation: Full ML Workstation Readiness Gate

Date: 2026-07-03

## Scope

Sprint 7 turns the remaining full-ML production gap into a measurable gate without attempting to force the full ML stack into the lite NSIS installer path.

- Verify the backend venv has the required workstation ML modules installed.
- Verify `create_app("full")` boots without loading model weights.
- Verify full-profile routes for TTS, dubbing, mastering, and remix are mounted.
- Keep the distribution decision explicit: the lite installer remains the MVP desktop shell; full ML features require a separate workstation/BYOM distribution path and feature smoke.

## Acceptance Criteria

| Gate | Evidence | Result |
|---|---|---|
| Full-profile dependency availability | `powershell -ExecutionPolicy Bypass -File scripts\smoke_full_profile_readiness.ps1` found all required modules | PASS |
| Full-profile boot | `create_app("full")` returned root profile `full` | PASS |
| Heavy route registration | `/tts`, `/dubbing`, `/dubbing/refine`, `/mastering`, `/music/remix`, and `/music/export` were mounted | PASS |
| No model-weight eager load | Gate booted app and inspected routes only; it did not run TTS, ASR, Demucs, or model downloads | PASS |

## Validation Evidence

```text
{
  "profile": "full",
  "features": [
    "voice-library",
    "files",
    "projects",
    "brain",
    "market",
    "jobs",
    "tts",
    "dubbing",
    "mastering",
    "music-remix"
  ],
  "missing_modules": [],
  "missing_routes": []
}
PASS: full profile boots with ML routes and required workstation modules available
```

## Production Decision

The full ML workstation runtime is ready enough to proceed to feature-level smoke, but it is not approved for the current lite NSIS installer payload.

The next production gate is a packaged/full-workstation feature smoke that runs real TTS, dubbing, mastering, and remix flows from the intended distribution surface. The current validated installer remains the lite MVP shell because prior full-backend PyInstaller output was approximately 4.77 GB and includes GPL/BYOM-sensitive optional components.

## Remaining Production Gates

- Define the full workstation/BYOM distribution artifact boundary.
- Run packaged feature smoke for TTS, dubbing, mastering, and remix from that distribution surface.
- Finalize first-run model download UX/progress.
- Confirm CPU/GPU strategy for end-user machines.
