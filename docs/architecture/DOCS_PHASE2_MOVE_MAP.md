---
version: "0.1.0b"
created_at: "2026-07-22T00:00:00+07:00,LALIN"
last_update: "2026-07-22T00:00:00+07:00,LALIN"
status: "beta"
attributes:
  doc_type: "migration-map"
  scope: "repository-tooling-phase-2"
---

# Docs Phase 2 Move Map — Tooling

Phase 2 separates executable project tooling by intent while preserving the old
`scripts/` entrypoints as compatibility shims.

## Move map

| Source | Target | Class | Compatibility |
|---|---|---|---|
| `scripts/setup_windows.ps1` | `tools/dev/setup_windows.ps1` | Developer setup | Keep `scripts/setup_windows.ps1` shim |
| `scripts/prewarm_ollama.ps1` | `tools/dev/prewarm_ollama.ps1` | Developer runtime utility | Keep `scripts/prewarm_ollama.ps1` shim |
| `scripts/build_sidecar.ps1` | `tools/build/build_sidecar.ps1` | Build tooling | Keep `scripts/build_sidecar.ps1` shim |
| `scripts/build_installer.ps1` | `tools/build/build_installer.ps1` | Build tooling | Keep `scripts/build_installer.ps1` shim |
| `scripts/make_icons.py` | `tools/build/make_icons.py` | Build asset tooling | Keep `scripts/make_icons.py` shim |
| `scripts/smoke_full_profile_readiness.ps1` | `tools/verify/smoke_full_profile_readiness.ps1` | Verification tooling | Keep `scripts/smoke_full_profile_readiness.ps1` shim |
| `scripts/smoke_installed_app.ps1` | `tools/verify/smoke_installed_app.ps1` | Verification tooling | Keep `scripts/smoke_installed_app.ps1` shim |
| `scripts/smoke_workstation_features.ps1` | `tools/verify/smoke_workstation_features.ps1` | Verification tooling | Keep `scripts/smoke_workstation_features.ps1` shim |

## Required path fixes

- PowerShell scripts moved under `tools/*` must resolve the repository root from
  two parent directories above their new folder.
- `tools/verify/smoke_workstation_features.ps1` must call the canonical
  `tools/verify/smoke_full_profile_readiness.ps1` path.
- `tools/build/make_icons.py` must resolve the repository root from
  `Path(__file__).resolve().parents[2]`.

## Rollback map

If rollback is required, move each target back to its source path and delete the
shim that occupies the original source path.

## Changelog

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-07-22 | beta | Defined Phase 2 tooling move map and compatibility policy. | pending | LALIN |
