# Sprint 2 Validation: Tauri Sidecar Packaging

Date: 2026-07-03

## Scope

Sprint 2 moves packaging from scaffolding toward a validated local sidecar path:

- Build the FastAPI backend as a PyInstaller sidecar.
- Make Tauri spawn the bundled sidecar during startup.
- Prove the sidecar executable starts and serves `/health`.
- Keep generated packaging artifacts out of source control.

## Results

| Gate | Command / Evidence | Result |
|---|---|---|
| Sidecar build | `powershell -ExecutionPolicy Bypass -File scripts\build_sidecar.ps1` | PASS |
| Tauri compile/config | `cargo check --manifest-path frontend\src-tauri\Cargo.toml` | PASS |
| Runtime smoke | Start `g-music-backend-x86_64-pc-windows-msvc.exe`, then `GET /health` | PASS |
| Health response | `status=ok`, `service=g-music` | PASS |
| NSIS installer | `powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1` | FAIL |

## Fixes Made

- `frontend/src-tauri/src/lib.rs` now spawns `g-music-backend` during Tauri setup and stores the child process in app state.
- `backend/sidecar_entry.py` is versioned and statically imports `app.main.app` so PyInstaller discovers the backend package.
- `scripts/build_sidecar.ps1` is parser-safe, bootstraps `pip` when needed, installs PyInstaller when missing, and generates the target-triple sidecar binary.
- `.gitignore` excludes generated sidecar/package artifacts.

## Remaining Gates

- Build the NSIS installer successfully. Current blocker: `makensis` fails with `Internal compiler error #12345: error mmapping file ... is out of range` after the generated sidecar folder reaches about 4.77 GB.
- Install the generated installer and verify the installed app can spawn the sidecar with `_internal` resources in the expected relative location.
- Add frontend readiness UX so API calls wait for backend health.
- Run packaged-sidecar feature smoke for remix/TTS/dubbing, not only `/health`.

## Installer Blocker Evidence

`scripts\build_installer.ps1` now parses and reaches the real Tauri build path. It passes frontend build and Rust release compile, then fails during NSIS bundling:

```text
Internal compiler error #12345: error mmapping file (1847524022, 33554432) is out of range.
failed to bundle project: `Failed to bundle app with makensis`
```

The generated `frontend\src-tauri\binaries` payload is approximately 4.77 GB because PyInstaller collects ML-heavy native dependencies into `_internal`.
