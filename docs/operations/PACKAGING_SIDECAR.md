# Packaging: Backend as Tauri Sidecar (WP 5.2)

## Status

Status as of 2026-07-03: lite-profile sidecar build, runtime smoke, local NSIS installer artifact generation, installed-app smoke, installed PyInstaller resource layout, full-profile readiness, and workstation TTS/dubbing/mastering/remix feature smoke are validated on this Windows workspace.

Validated:
- `powershell -ExecutionPolicy Bypass -File tools\build\build_sidecar.ps1`
- `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml`
- Direct sidecar runtime smoke: launch `apps\desktop\src-tauri\binaries\g-music-backend-x86_64-pc-windows-msvc.exe`, then `GET http://127.0.0.1:8756/health`
- `powershell -ExecutionPolicy Bypass -File tools\build\build_installer.ps1`
- Local NSIS artifact: `apps\desktop\src-tauri\target\release\bundle\nsis\G-Music_0.1.0_x64-setup.exe`
- `powershell -ExecutionPolicy Bypass -File tools\verify\smoke_installed_app.ps1`
- Installed-app layout: `G-Music.exe`, `g-music-backend.exe`, and adjacent `_internal` under `apps\desktop\src-tauri\target\installed-smoke`
- `powershell -ExecutionPolicy Bypass -File tools\verify\smoke_full_profile_readiness.ps1`
- Full-profile readiness: ML workstation modules are installed and TTS/dubbing/mastering/remix routes mount under `create_app("full")`
- `powershell -ExecutionPolicy Bypass -File tools\verify\smoke_workstation_features.ps1`
- Workstation feature smoke: F5 Thai TTS, dubbing, auto mastering, and remix write real outputs and pass subtitles/loudness/peak gates where applicable
- `cd apps\api; ..\..\backend\.venv\Scripts\python.exe runtime_device_report.py`
- CPU/GPU strategy: this workstation has CUDA-capable Torch/CTranslate2 on RTX 3060, while ASR/TTS speech smokes use CPU fallback when CUDA speech libraries are unstable

Still not fully production-complete:
- Full ML workstation distribution artifact. The validated installer uses the lite backend profile and does not bundle ML-heavy routers.
- First-run model download UX/progress.

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

- `apps/api/sidecar_entry.py`: versioned PyInstaller entrypoint. It imports `app.sidecar_lite.app` so local packaging does not collect ML-heavy router dependencies.
- `apps/api/app/sidecar_lite.py`: lite FastAPI app for packaged MVP shell endpoints.
- `apps/api/app/main.py`: source/development FastAPI app factory. The default profile remains `full`; `GMUSIC_BACKEND_PROFILE=lite` can create a lighter app shape when needed.
- `tools/build/build_sidecar.ps1`: builds the backend sidecar with PyInstaller, defaults `GMUSIC_BACKEND_PROFILE` to `lite`, and copies the onedir output into `apps/desktop/src-tauri/binaries/`.
- `tools/build/build_installer.ps1`: builds the Tauri NSIS installer from the generated sidecar. Default local validation mode gates on a stable setup executable because this Windows Tauri wrapper may not reliably exit after artifact generation.
- `apps/desktop/src-tauri/tauri.conf.json`: declares `bundle.externalBin` as `binaries/g-music-backend` and maps `binaries/_internal/` to installed `_internal/` so PyInstaller resources sit beside the installed sidecar executable.
- `apps/desktop/src-tauri/src/lib.rs`: spawns `g-music-backend` during Tauri setup and stores the child process in Tauri state.

## Build Flow

Run from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File tools\build\build_sidecar.ps1
```

The script:
- Requires `backend\.venv\Scripts\python.exe` legacy fallback or `apps\api\.venv\Scripts\python.exe`.
- Requires `apps\api\sidecar_entry.py`.
- Bootstraps `pip` with `ensurepip` if needed.
- Installs `pyinstaller` into the API venv if missing.
- Detects the Rust target triple with `rustc -vV`, falling back to `x86_64-pc-windows-msvc`.
- Removes stale `apps\api\dist`, `apps\api\build`, and `apps\api\g-music-backend.spec`.
- Runs PyInstaller in `--onedir --console` mode.
- Copies the onedir output into `apps\desktop\src-tauri\binaries\`.
- Renames the executable to `g-music-backend-<target-triple>.exe`, which Tauri expects for `externalBin`.

Current lite-profile payload evidence:

```text
apps\desktop\src-tauri\binaries total: 167,857,355 bytes (160.08 MB)
```

Expected local build output:

```text
apps/desktop/src-tauri/binaries/
  g-music-backend-x86_64-pc-windows-msvc.exe
  _internal/
```

These files are generated artifacts and are intentionally ignored by git.

## Validation

After building the sidecar, run:

```powershell
cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml
```

This validates that:
- Tauri can resolve the `externalBin` sidecar file.
- Rust startup code compiles.
- `tauri_plugin_shell::ShellExt` and `tauri::Manager` wiring is valid.

Runtime smoke:

```powershell
$exe = Resolve-Path apps\desktop\src-tauri\binaries\g-music-backend-x86_64-pc-windows-msvc.exe
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
powershell -ExecutionPolicy Bypass -File tools\build\build_installer.ps1
```

Expected local artifact:

```text
apps\desktop\src-tauri\target\release\bundle\nsis\G-Music_0.1.0_x64-setup.exe
```

Current artifact evidence:

```text
G-Music_0.1.0_x64-setup.exe: 53,273,749 bytes (50.81 MB), LastWriteTime 2026-07-03 15:56:24
```

## GitHub Release Signing Gate

The tag workflow requires the repository Actions secret
`TAURI_SIGNING_PRIVATE_KEY`. Its value must be the base64-encoded content of the
gitignored canonical key in `keys/g-music.key`; never print, commit, or upload
that key as an artifact. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is required only
when the private key is password-protected.

Before creating a release tag, verify only the secret name and update time:

```powershell
gh secret list --repo Freshair129/Lalin-AI --json name,updatedAt
```

`.github/workflows/release.yml` runs the following non-secret preflight
immediately after checkout and before dependency installation:

```powershell
tools\verify\check_tauri_signing_key.ps1
```

The preflight rejects an empty, malformed, or structurally invalid updater key
without echoing key material. A successful tagged build must still produce a
draft release containing a fresh NSIS `.exe`, its `.sig`, and `latest.json`;
preflight success alone is not release completion.

The `build-windows` job grants its generated `GITHUB_TOKEN` only
`contents: write`, which `tauri-action` requires to create the draft release and
upload assets. Keep the repository-wide default workflow permission at `read`;
do not replace the job-scoped grant with a permanent repository-wide write
default.

Current GitHub release evidence from run `32606363191`, attempt 3:

```text
build-windows: success (job 97189999691, 35m29s)
draft release: G-Music v0.1.0, target 672aa186479a03ac702566358de38751f388f87a
G-Music_0.1.0_x64-setup.exe: 68,636,358 bytes
G-Music_0.1.0_x64-setup.exe.sig: 416 bytes
latest.json: 1,365 bytes
repository default workflow permission after recovery: read
```

## Known Limits

- Full-backend PyInstaller builds are slow and too large because static import of the full app pulls in ML-heavy dependencies such as torch, transformers, librosa, scipy, and related native libraries.
- The previous full-backend sidecar payload was approximately 4.77 GB in this workspace, which exceeded the practical NSIS bundling path. The local installer gate now uses the lite sidecar profile instead.
- Packaged full ML distribution smoke is still required; the lite installer intentionally excludes ML-heavy routers.
- Installed-app smoke, not `cargo check`, is the packaging gate that proves NSIS places `_internal` beside the sidecar executable correctly.
- The installer signing key under `keys/` is intentionally gitignored and must be provisioned outside source control before release builds.
- Default `tools\build\build_installer.ps1` local validation mode confirms the setup executable. Use `-WithUpdaterArtifacts` for a stricter release gate that requires a fresh setup executable and updater signature.
