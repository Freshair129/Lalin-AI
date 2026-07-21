# Sprint 5 Validation: Release Updater Artifact Gate

Date: 2026-07-03

## Scope

Sprint 5 closes the stale updater artifact gap left by Sprint 3:

- Align the Tauri updater endpoint with the actual GitHub remote.
- Delete stale updater signatures before release validation.
- Require fresh, non-empty setup and updater signature artifacts for the NSIS target.
- Keep the known Windows wrapper anomaly contained with an NSIS success sentinel and explicit signer exit-code gate.

## Acceptance Criteria

| Gate | Evidence | Result |
|---|---|---|
| Updater endpoint | `frontend/src-tauri/tauri.conf.json` points to `Freshair129/G-Music` release metadata | PASS |
| Release artifact freshness | `scripts/build_installer.ps1 -WithUpdaterArtifacts` removes stale `.sig` and checks `LastWriteTime` after build start | PASS |
| Release artifact generation | Fresh setup exe and `.sig` are created for the NSIS updater output | PASS |
| Script parser check | PowerShell parser accepts `scripts/build_installer.ps1` | PASS |

## Evidence

Command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1 -WithUpdaterArtifacts
```

Result:

```text
Installer build completed.
G-Music_0.1.0_x64-setup.exe     53,282,201 bytes, LastWriteTime 2026-07-03 17:16:22
G-Music_0.1.0_x64-setup.exe.sig        416 bytes, LastWriteTime 2026-07-03 17:16:25
```

Tauri NSIS evidence:

```text
Finished 1 bundle at:
frontend\src-tauri\target\release\bundle\nsis\G-Music_0.1.0_x64-setup.exe
```

## Fixes Made

- Updated the updater endpoint from `piyawatproject/G-Music` to `Freshair129/G-Music`.
- Regenerated the local gitignored Tauri signing key with `@tauri-apps/cli` 2.11.3 after the old empty-password key failed to decode.
- Updated `scripts\build_installer.ps1` to run `tauri build --ci`.
- Hardened release artifact validation so stale signatures are removed and fresh setup/signature timestamps are required.
- Split release signing into an explicit `tauri signer sign --password=` step so the signer has its own exit-code gate.
- Constrained the known Windows wrapper exit-code anomaly to the case where a fresh setup exists, the build log contains `Finished 1 bundle`, and build logs contain no `Error` or `failed` markers.

## Remaining Production Gates

- Installed-app smoke from the generated NSIS setup executable.
- Full ML workstation distribution and packaged feature smoke.
