# RCA: Installed sidecar resources were not beside the sidecar executable

## Symptom

`scripts\smoke_installed_app.ps1` installed the NSIS setup executable into the bounded smoke directory, but failed because the installed PyInstaller `_internal` directory was not beside `g-music-backend.exe`.

## Evidence

- The smoke script reported that `frontend\src-tauri\target\installed-smoke\_internal` was missing.
- The installed app executable existed at `frontend\src-tauri\target\installed-smoke\G-Music.exe`.
- The installed backend sidecar existed at `frontend\src-tauri\target\installed-smoke\g-music-backend.exe`.
- The PyInstaller resources were installed under `frontend\src-tauri\target\installed-smoke\binaries\_internal`, not beside the sidecar executable.

## Root Cause

`frontend\src-tauri\tauri.conf.json` declared resources as the list entry `binaries/_internal/**/*`, which preserved the source `binaries\_internal` path in the installed app. Tauri installed `externalBin` at the install root as `g-music-backend.exe`, so the PyInstaller onedir resources were separated from the executable that needs them.

## Why The Issue Escaped Detection

Previous gates validated that the NSIS setup artifact was produced, but they did not install the artifact and inspect the runtime layout from a user install path. The source-tree sidecar layout and installed NSIS layout were not equivalent.

## Proposed Prevention

- Map `binaries/_internal/` to installed `_internal/` in `tauri.conf.json` so resources are placed beside the installed sidecar executable.
- Keep `scripts\smoke_installed_app.ps1` as a packaging gate that installs the NSIS artifact into `frontend\src-tauri\target\installed-smoke`.
- Require the smoke gate to verify the app executable, sidecar executable, adjacent `_internal` directory, `/health`, and the lite root profile before accepting installer layout changes.
