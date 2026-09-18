---
version: "0.1.1b"
created_at: "2026-09-18T19:52:00+07:00,LALIN,04dbd23"
last_update: "2026-09-18T23:47:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "release-engineering"
  doc_type: "rca"
  scope: "Local NSIS installer sidecar freshness and profile contract"
---

# RCA: Installer bundled a stale sidecar payload

## Symptom

The freshly built `G-Music_0.1.1_x64-setup.exe` installed and launched, but
installed-app smoke received `version=0.1.0` and `profile=full` instead of the
expected `version=0.1.1` and `profile=lite`.

## Evidence

1. The Tauri configuration declares version `0.1.1`.
2. The installer artifact was created at the versioned `0.1.1` path.
3. The installed sidecar reported `version=0.1.0` and `profile=full`.
4. The source sidecar present before rebuild was an older binary from
   `2026-09-17` and `tools/build/build_sidecar.ps1` defaults to `lite`.
5. `tools/verify/smoke_installed_app.ps1` explicitly requires the installed
   root response profile to be `lite`.

## Root Cause

`tools/build/build_installer.ps1` packages the existing sidecar under
`apps/desktop/src-tauri/binaries/`; it does not rebuild or validate that
sidecar's version/profile before bundling. A stale full-profile 0.1.0 payload
was therefore copied into the new 0.1.1 installer.

## Why the issue escaped detection

The installer filename was derived from the current Tauri version, so the
artifact path check passed even though the embedded runtime payload was stale.
The previous packaging evidence was for an older installer and did not pair
the sidecar runtime identity with the installer version/profile. Rebuilding
the sidecar with `-Profile lite` alone did not correct the installed result:
the PyInstaller build-time environment is not the Tauri runtime environment,
and the Tauri launcher still injected `full`.

## Proposed prevention

- Build the sidecar with `tools/build/build_sidecar.ps1 -Profile lite` before
  each local lite installer build.
- Make the Tauri launcher pass the selected build profile at runtime and pass
  the Cargo package version as the backend runtime version. Keep the default
  full profile for release workflows that do not explicitly select lite.
- Make `build_installer.ps1` select and expose the local profile explicitly.
- Run installed-app smoke after NSIS creation and require the expected
  version/profile response.
- Record the sidecar payload and installer evidence together; do not treat an
  installer filename check as proof of runtime freshness.

## Status

Resolved locally. The rebuilt unsigned/no-updater NSIS artifact installed and
passed installed-app smoke with `version=0.1.1` and `profile=lite`. Signed
updater release evidence remains a separate gate because the local signing key
is intentionally absent.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-09-18 | resolved locally | Propagated the Tauri package version and selected backend profile into the installed sidecar; strengthened installer smoke assertions. | pending commit | LALIN |
| 0.1.0b | 2026-09-18 | beta | Documented stale sidecar version/profile evidence and the required rebuild order. | pending local commit | LALIN |
