# Sprint 3 Validation: Lite Installer Packaging Gate

Date: 2026-07-03

## Scope

Sprint 3 narrows the packaging goal from a full ML workstation bundle to a production-shaped MVP installer gate:

- Build the backend sidecar with a lite FastAPI profile.
- Keep ML-heavy routers out of the packaged sidecar.
- Prove the sidecar starts and serves `/health`.
- Prove the Tauri NSIS setup executable can be generated locally.
- Preserve the full ML packaging work as a later distribution track.

## Results

| Gate | Command / Evidence | Result |
|---|---|---|
| Lite sidecar build | `powershell -ExecutionPolicy Bypass -File scripts\build_sidecar.ps1` | PASS |
| Sidecar payload size | `frontend\src-tauri\binaries` total `167,857,355` bytes / `160.08 MB` | PASS |
| Heavy ML exclusion check | `rg "torch|transformers|librosa|f5_tts|faster_whisper|demucs|matchering|bitsandbytes|torchaudio" backend\build\g-music-backend\warn-g-music-backend.txt backend\build\g-music-backend\xref-g-music-backend.html -S` returned no matches | PASS |
| Runtime smoke | Start `g-music-backend-x86_64-pc-windows-msvc.exe`, then `GET /health` | PASS |
| Lite profile response | Root endpoint returned `profile=lite` with shell/MVP features | PASS |
| Frontend build | `npm run build` | PASS |
| Frontend tests | `npm test -- --run` | PASS |
| Tauri compile/config | `cargo check --manifest-path frontend\src-tauri\Cargo.toml` | PASS |
| Installer artifact | `powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1` | PASS |
| Setup executable | `G-Music_0.1.0_x64-setup.exe`, `53,273,749` bytes / `50.81 MB`, LastWriteTime `2026-07-03 15:56:24` | PASS |

## Fixes Made

- Added a lite sidecar app in `backend/app/sidecar_lite.py`.
- Updated `backend/sidecar_entry.py` to package `app.sidecar_lite.app` instead of the full backend app.
- Added backend app factory profile support in `backend/app/main.py` while keeping source/development default behavior on the full profile.
- Changed cloud provider loading in `backend/app/brain/factory.py` to a dynamic import so the lite package does not pull OpenAI/Anthropic dependency chains into PyInstaller.
- Updated `scripts/build_sidecar.ps1` to default `GMUSIC_BACKEND_PROFILE` to `lite`.
- Updated `scripts/build_installer.ps1` to use the local Tauri CLI and treat a stable setup executable as the local validation gate.

## Remaining Gates

- Install `G-Music_0.1.0_x64-setup.exe` on a clean user path and verify the installed app spawns the sidecar with `_internal` resources beside it.
- Run `scripts\build_installer.ps1 -WithUpdaterArtifacts` and pass its stricter release artifact checks for fresh setup, `.sig`, and `.nsis.zip` artifacts.
- Add frontend readiness UX so API calls wait for backend health.
- Define and validate a separate full ML workstation distribution path for remix/TTS/dubbing packaged feature smoke.

## Production Readiness Decision

Approved for MVP installer progression, not full production release.

The lite installer gate removes the NSIS size blocker and proves a small packaged app shell can be built locally. Full production remains blocked until installed-app smoke, updater artifact validation, and full ML feature distribution strategy pass their own gates.
