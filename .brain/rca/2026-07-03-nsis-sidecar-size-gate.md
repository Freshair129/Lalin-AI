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

The packaged sidecar currently imports the full backend app statically. That lets PyInstaller discover `app`, but it also pulls in ML-heavy routers and pipeline dependencies. The resulting PyInstaller onedir payload is too large for the current NSIS bundling path.

## Why The Issue Escaped Detection

The sidecar packaging path had been documented as scaffolding and had not previously been run through PyInstaller plus Tauri NSIS bundling. Earlier checks validated source-run backend behavior and frontend tests, not the installed-app artifact size boundary.

## Proposed Prevention

- Split packaging profiles instead of using one full static backend import for every release target.
- Define a minimal MVP sidecar profile and a full ML workstation profile.
- Add a packaging size gate before invoking NSIS.
- Run installer bundling in CI or a release-prep script after sidecar generation, not only frontend/Rust checks.
