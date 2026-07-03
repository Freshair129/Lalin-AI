# Packaging: Backend as Tauri Sidecar (WP 5.2)

## Status

Status as of 2026-07-03: sidecar build and runtime smoke are validated on this Windows workspace.

Validated:
- `powershell -ExecutionPolicy Bypass -File scripts\build_sidecar.ps1`
- `cargo check --manifest-path frontend\src-tauri\Cargo.toml`
- Direct sidecar runtime smoke: launch `frontend\src-tauri\binaries\g-music-backend-x86_64-pc-windows-msvc.exe`, then `GET http://127.0.0.1:8756/health`

Still not fully production-complete:
- NSIS installer build and install-from-artifact smoke. Current evidence: `makensis` fails with `Internal compiler error #12345: error mmapping file ... is out of range` when bundling the generated sidecar payload.
- Installed-app resource path validation for PyInstaller `_internal`.
- First-run model download UX/progress.
- CPU/GPU distribution strategy for end-user machines.

## Goal

Ship G-Music as a one-click desktop app where Tauri starts the FastAPI backend as a bundled sidecar. End users should not need to open `uvicorn` manually or install Python themselves.

## Architecture

```text
G-Music.exe (Tauri/WebView2)
  -> startup setup() spawns sidecar via tauri-plugin-shell
  -> g-music-backend-<target-triple>.exe (PyInstaller --onedir)
  -> FastAPI app on 127.0.0.1:8756
```

The backend loads ML model weights lazily through the existing cache/download paths. Model weights are not embedded in the sidecar executable.

## Source Files

- `backend/sidecar_entry.py`: versioned PyInstaller entrypoint. It imports `app.main.app` statically so PyInstaller can discover the backend package.
- `scripts/build_sidecar.ps1`: builds the backend sidecar with PyInstaller and copies the onedir output into `frontend/src-tauri/binaries/`.
- `frontend/src-tauri/tauri.conf.json`: declares `bundle.externalBin` as `binaries/g-music-backend` and resources as `binaries/_internal/**/*`.
- `frontend/src-tauri/src/lib.rs`: spawns `g-music-backend` during Tauri setup and stores the child process in Tauri state.

## Build Flow

Run from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_sidecar.ps1
```

The script:
- Requires `backend\.venv\Scripts\python.exe`.
- Requires `backend\sidecar_entry.py`.
- Bootstraps `pip` with `ensurepip` if needed.
- Installs `pyinstaller` into the backend venv if missing.
- Detects the Rust target triple with `rustc -vV`, falling back to `x86_64-pc-windows-msvc`.
- Removes stale `backend\dist`, `backend\build`, and `backend\g-music-backend.spec`.
- Runs PyInstaller in `--onedir --console` mode.
- Copies the onedir output into `frontend\src-tauri\binaries\`.
- Renames the executable to `g-music-backend-<target-triple>.exe`, which Tauri expects for `externalBin`.

Expected local build output:

```text
frontend/src-tauri/binaries/
  g-music-backend-x86_64-pc-windows-msvc.exe
  _internal/
```

These files are generated artifacts and are intentionally ignored by git.

## Validation

After building the sidecar, run:

```powershell
cargo check --manifest-path frontend\src-tauri\Cargo.toml
```

This validates that:
- Tauri can resolve the `externalBin` sidecar file.
- Rust startup code compiles.
- `tauri_plugin_shell::ShellExt` and `tauri::Manager` wiring is valid.

Runtime smoke:

```powershell
$exe = Resolve-Path frontend\src-tauri\binaries\g-music-backend-x86_64-pc-windows-msvc.exe
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -WindowStyle Hidden -PassThru
Invoke-RestMethod -Uri "http://127.0.0.1:8756/health"
Stop-Process -Id $p.Id -Force
```

Expected response includes:

```json
{
  "status": "ok",
  "service": "g-music"
}
```

## Known Limits

- PyInstaller build is slow because static import of the backend pulls in ML-heavy dependencies such as torch, transformers, librosa, scipy, and related native libraries.
- The generated sidecar payload is approximately 4.77 GB in this workspace, which currently exceeds the practical NSIS bundling path.
- PyInstaller currently emits warnings about optional/missing native libraries such as some bitsandbytes CUDA/XPU DLLs and `tbb12.dll`. The `/health` smoke passes, but feature-level smoke for TTS/remix/dubbing from the packaged sidecar is still required.
- Tauri `cargo check` validates local sidecar resolution, but it does not prove an installed NSIS app places `_internal` beside the sidecar executable correctly.
- The frontend can still issue API requests before the sidecar is healthy. A later gate should add app-level readiness handling or health polling.
- The installer signing key under `keys/` is intentionally gitignored and must be provisioned outside source control before release builds.
