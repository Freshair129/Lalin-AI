# Sprint 6 Validation: Installed-App Sidecar Smoke

Date: 2026-07-03

## Scope

Sprint 6 closes the installed-app packaging gate:

- Install the NSIS setup executable into a bounded smoke-test directory under `frontend\src-tauri\target`.
- Verify the installed `G-Music.exe` exists.
- Verify the installed backend sidecar executable and adjacent PyInstaller `_internal` directory exist.
- Launch the installed app and confirm the spawned sidecar serves `/health` and the lite root profile.

## Acceptance Criteria

| Gate | Evidence | Result |
|---|---|---|
| Silent install smoke path | `powershell -ExecutionPolicy Bypass -File scripts\smoke_installed_app.ps1` installed to `frontend\src-tauri\target\installed-smoke` | PASS |
| Installed resource layout | Installed app has `G-Music.exe`, `g-music-backend.exe`, and adjacent `_internal` under `frontend\src-tauri\target\installed-smoke` | PASS |
| Installed sidecar runtime | Installed app launch exposes `GET /health` with `status=ok`, `service=g-music` from an installed-root backend listener | PASS |
| Lite profile smoke | Installed app root endpoint returns `profile=lite` | PASS |

## Validation Evidence

```text
[*] Installing smoke copy to: D:\G-Music\frontend\src-tauri\target\installed-smoke
[*] Launching installed app.
[OK] Installed app smoke passed.
     App: D:\G-Music\frontend\src-tauri\target\installed-smoke\G-Music.exe
     Sidecar: D:\G-Music\frontend\src-tauri\target\installed-smoke\g-music-backend.exe
     Backend PID: 25412
     Health: status=ok, service=g-music, profile=lite
```

## Remaining Production Gates

- Full ML workstation distribution and packaged feature smoke.

## First Attempt Finding

The first installed-app smoke attempt found a real packaging layout bug:

```text
Installed PyInstaller _internal directory was not found beside sidecar:
frontend\src-tauri\target\installed-smoke\_internal
```

The NSIS install placed `g-music-backend.exe` at the install root while preserving resources under `binaries\_internal`. Tauri resources now use a map so `binaries/_internal/` is installed as `_internal/` beside the sidecar executable.
