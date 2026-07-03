# Packaging: Backend as Tauri Sidecar (WP 5.2)

## Status

Status as of 2026-07-03: lite-profile sidecar build, runtime smoke, local NSIS installer artifact generation, installed-app smoke, and installed PyInstaller resource layout are validated on this Windows workspace.

Validated:
- `powershell -ExecutionPolicy Bypass -File scripts\build_sidecar.ps1`
- `cargo check --manifest-path frontend\src-tauri\Cargo.toml`
- Direct sidecar runtime smoke: launch `frontend\src-tauri\binaries\g-music-backend-x86_64-pc-windows-msvc.exe`, then `GET http://127.0.0.1:8756/health`
- `powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1`
- Local NSIS artifact: `frontend\src-tauri\target\release\bundle\nsis\G-Music_0.1.0_x64-setup.exe`
- `powershell -ExecutionPolicy Bypass -File scripts\smoke_installed_app.ps1`
- Installed-app layout: `G-Music.exe`, `g-music-backend.exe`, and adjacent `_internal` under `frontend\src-tauri\target\installed-smoke`

Still not fully production-complete:
- Full ML workstation sidecar/installer profile. The validated installer uses the lite backend profile and does not bundle ML-heavy routers.
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

The default packaged sidecar uses the lite backend profile. It serves shell/MVP endpoints without importing ML-heavy routers, so model weights and large ML runtime dependencies are not embedded in the local installer artifact. A future full ML workstation profile must be validated separately.

## Source Files

- `backend/sidecar_entry.py`: versioned PyInstaller entrypoint. It imports `app.sidecar_lite.app` so local packaging does not collect ML-heavy router dependencies.
- `backend/app/sidecar_lite.py`: lite FastAPI app for packaged MVP shell endpoints.
- `backend/app/main.py`: source/development FastAPI app factory. The default profile remains `full`; `GMUSIC_BACKEND_PROFILE=lite` can create a lighter app shape when needed.
- `scripts/build_sidecar.ps1`: builds the backend sidecar with PyInstaller, defaults `GMUSIC_BACKEND_PROFILE` to `lite`, and copies the onedir output into `frontend/src-tauri/binaries/`.
- `scripts/build_installer.ps1`: builds the Tauri NSIS installer from the generated sidecar. Default local validation mode gates on a stable setup executable because this Windows Tauri wrapper may not reliably exit after artifact generation.
- `frontend/src-tauri/tauri.conf.json`: declares `bundle.externalBin` as `binaries/g-music-backend` and maps `binaries/_internal/` to installed `_internal/` so PyInstaller resources sit beside the installed sidecar executable.
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

Current lite-profile payload evidence:

```text
frontend\src-tauri\binaries total: 167,857,355 bytes (160.08 MB)
```

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

Profile smoke:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8756/"
```

Expected response includes:

```json
{
  "profile": "lite"
}
```

Installer validation:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1
```

Expected local artifact:

```text
frontend\src-tauri\target\release\bundle\nsis\G-Music_0.1.0_x64-setup.exe
```

Current artifact evidence:

```text
G-Music_0.1.0_x64-setup.exe: 53,273,749 bytes (50.81 MB), LastWriteTime 2026-07-03 15:56:24
```

## Known Limits

- Full-backend PyInstaller builds are slow and too large because static import of the full app pulls in ML-heavy dependencies such as torch, transformers, librosa, scipy, and related native libraries.
- The previous full-backend sidecar payload was approximately 4.77 GB in this workspace, which exceeded the practical NSIS bundling path. The local installer gate now uses the lite sidecar profile instead.
- Feature-level smoke for TTS/remix/dubbing from a packaged full ML distribution is still required; the lite installer intentionally excludes those routers.
- Tauri `cargo check` validates local sidecar resolution, but it does not prove an installed NSIS app places `_internal` beside the sidecar executable correctly.
- The installer signing key under `keys/` is intentionally gitignored and must be provisioned outside source control before release builds.
- Default `scripts\build_installer.ps1` local validation mode confirms the setup executable. Use `-WithUpdaterArtifacts` for a stricter release gate that requires a fresh setup executable and updater signature.
