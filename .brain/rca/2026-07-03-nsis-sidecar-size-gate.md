# RCA: NSIS installer fails after sidecar packaging

## Symptom

`powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1` reaches the Tauri release build but fails during NSIS bundling.

## Evidence

- Frontend `npm run build` succeeds inside the Tauri build.
- Rust release compile succeeds and creates `frontend\src-tauri\target\release\g-music.exe`.
- `makensis` then fails with `Internal compiler error #12345: error mmapping file (1847524022, 33554432) is out of range`.
- The generated `frontend\src-tauri\binaries` payload is about 4.77 GB.
- Largest files are ML/native dependencies under `_internal`, especially torch CUDA/cuDNN/cuBLAS libraries.

## Root Cause

The previous packaged sidecar imported the full backend app statically. That let PyInstaller discover `app`, but it also pulled in ML-heavy routers and pipeline dependencies. The resulting PyInstaller onedir payload was too large for the NSIS bundling path.

## Why The Issue Escaped Detection

The sidecar packaging path had been documented as scaffolding and had not previously been run through PyInstaller plus Tauri NSIS bundling. Earlier checks validated source-run backend behavior and frontend tests, not the installed-app artifact size boundary.

## Proposed Prevention

- Split packaging profiles instead of using one full static backend import for every release target.
- Define a minimal MVP sidecar profile and a full ML workstation profile.
- Add a packaging size gate before invoking NSIS.
- Run installer bundling in CI or a release-prep script after sidecar generation, not only frontend/Rust checks.

## Resolution

The local MVP installer path now uses a lite sidecar entrypoint:

- `backend/sidecar_entry.py` imports `app.sidecar_lite.app`.
- `backend/app/sidecar_lite.py` excludes ML-heavy routers.
- `backend/app/brain/factory.py` dynamically imports the cloud provider only when the cloud engine is selected.
- `scripts/build_sidecar.ps1` defaults `GMUSIC_BACKEND_PROFILE` to `lite`.

Validation evidence on 2026-07-03:

- Lite sidecar payload: `167,857,355` bytes / `160.08 MB`.
- Heavy ML exclusion check found no `torch`, `transformers`, `librosa`, `f5_tts`, `faster_whisper`, `demucs`, `matchering`, `bitsandbytes`, or `torchaudio` references in the PyInstaller warning/xref files.
- `scripts\build_installer.ps1` created `G-Music_0.1.0_x64-setup.exe` at `53,273,749` bytes / `50.81 MB`.

This resolves the local MVP NSIS size blocker. It does not resolve full ML workstation packaging, installed-app smoke, or updater artifact validation.
