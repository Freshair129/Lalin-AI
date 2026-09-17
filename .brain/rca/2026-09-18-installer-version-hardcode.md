---
version: "0.1.0b"
created_at: "2026-09-18T02:04:31+07:00,LALIN,uncommitted"
last_update: "2026-09-18T02:04:31+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "release-engineering"
  doc_type: "rca"
  scope: "Local installer and installed-app smoke artifact naming for version 0.1.1"
---

# RCA: Local Installer Smoke Used a Stale Versioned Artifact Name

## Symptom

The project metadata is version `0.1.1`, but the local installer builder and the
default installed-app smoke path were still fixed to
`G-Music_0.1.0_x64-setup.exe`. A local `0.1.1` build would therefore create or
look for a different filename than the validation scripts expect.

## Evidence

1. `apps/desktop/src-tauri/tauri.conf.json` declares version `0.1.1`.
2. Before this local change, `tools/build/build_installer.ps1` assigned both
   installer paths with the literal `G-Music_0.1.0_x64-setup.exe`.
3. Before this local change, `tools/verify/smoke_installed_app.ps1` used the
   same literal when no `-InstallerPath` was supplied.
4. No other tracked PowerShell build or smoke script contains the stale literal
   after this local change.

## Root Cause

The version bump updated application metadata but the two local packaging
consumers kept a copied artifact filename. They had no shared read from the
canonical Tauri configuration.

## Why the Issue Escaped Detection

- The hosted release workflow invokes its own sidecar and Tauri action steps and
  does not call either local PowerShell default path.
- Prior local installer evidence was for version `0.1.0`, so the stale literal
  matched the artifact that was tested.
- No static check asserted that local packaging scripts derive their artifact
  names from the current Tauri version.

## Proposed Resolution

Read `version` from `apps/desktop/src-tauri/tauri.conf.json` in both scripts,
validate that it is present, and derive the default installer and signature
paths from that value. Preserve the explicit `-InstallerPath` override for
smoke tests.

## Proposed Prevention

- Keep one canonical version source for local packaging paths.
- Run a static drift check that rejects a stale fixed installer version.
- Run PowerShell parser and path-derivation checks after every release metadata
  update.

## Implementation Status

Implemented locally on branch `codex/local-installer-version-fix`; not pushed.
PowerShell parse and version/path derivation checks pass. Full installer smoke
remains blocked locally because the gitignored signing key is not present in
this checkout.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-18 | beta | Documented and locally fixed stale installer artifact naming after the 0.1.1 version bump. | pending local commit | LALIN |
