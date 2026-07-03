# RCA: Sidecar build script fails before PyInstaller starts

## Symptom

`powershell -ExecutionPolicy Bypass -File scripts\build_sidecar.ps1` exits with a PowerShell `ParserError` before it can install or run PyInstaller. The installer script showed the same class of parser failure before it could reach the signing-key gate.

## Evidence

- PowerShell reports `Missing closing ')' in expression` at `scripts\build_sidecar.ps1:45`.
- PowerShell also reports malformed block errors later in the file because parsing never recovers.
- `scripts\build_installer.ps1` also failed at parse time before checking for `keys\g-music.key`.
- `cargo check` fails earlier at Tauri build-script validation because `frontend\src-tauri\binaries\g-music-backend-x86_64-pc-windows-msvc.exe` does not exist.
- After the parser fix, the script reached dependency setup and exposed a second packaging gap: the venv had `ensurepip`, but `python -m pip` was not installed yet.

## Root Cause

The sidecar and installer build scripts contained non-ASCII status/comment text that had become encoding-corrupted in a way that broke PowerShell string parsing. Because the scripts could not parse, they never reached the real packaging gates: PyInstaller for the sidecar and signing-key validation for the installer.

The dependency setup also assumed `pip` already existed in the backend venv. That assumption was false in this workspace, so PyInstaller installation needed an `ensurepip` bootstrap step.

## Why The Issue Escaped Detection

The sidecar path was documented as scaffolding and had not been run end-to-end. Previous validation covered frontend build/tests and backend smoke checks, but not the Windows packaging script parser or Tauri sidecar binary presence check.

## Proposed Prevention

- Keep PowerShell build scripts parser-safe and prefer ASCII for operational output.
- Version the sidecar entrypoint instead of generating it implicitly during packaging.
- Bootstrap `pip` with `ensurepip` before installing packaging-only dependencies when the venv lacks pip.
- Add `cargo check --manifest-path frontend/src-tauri/Cargo.toml` after sidecar creation as a packaging validation gate.
