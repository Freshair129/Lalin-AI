---
version: "0.1.1b"
created_at: "2026-07-23T00:00:00+07:00,LALIN,uncommitted"
last_update: "2026-07-23T00:00:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "release-engineering"
  doc_type: "rca"
  scope: "GitHub Actions release workflow after app folder migration"
---

# RCA: Release Workflow Still Uses Legacy Frontend Path

## Symptom

The repository source moved from `frontend/` to `apps/desktop/`, but `.github/workflows/release.yml` still builds from the legacy `frontend` path.

## Evidence

Current workflow references:

- `workspaces: frontend/src-tauri`
- `working-directory: frontend`
- `projectPath: frontend`

Current architecture truth references:

- `apps/desktop/` owns the Tauri shell, React UI, desktop packaging config.
- `frontend/` is legacy generated artifacts and no longer app source.
- Phase 6A root check validates from the repo root with `npm run check:all`.

## Root Cause

Release automation was intentionally left outside earlier migration phases:

- Phase 4 moved app source but kept updater/release config unchanged unless a dedicated release gate approved it.
- Phase 6A added root workspace orchestration but explicitly did not add or change CI/release workflow.

That protected release safety during structural migration, but it left `.github/workflows/release.yml` pointing at the old `frontend` path.

## Why It Escaped Detection

- Local validation used direct package commands and root checks, not the GitHub release workflow.
- The release workflow only runs on version tags (`v*`), so normal local build checks do not exercise it.
- Release automation is high-risk because it can publish artifacts; earlier phases correctly avoided touching it without a dedicated approval gate.

## Impact

If a version tag is pushed before this is fixed, the release workflow is expected to fail before building Tauri because the configured frontend path is no longer canonical.

No evidence indicates runtime code is broken by this issue.

## Proposed Prevention

- Add a release-workflow phase with explicit approval before editing `.github/workflows/release.yml`.
- Make the workflow call root workspace validation before the Tauri release action.
- Point release build paths at `apps/desktop`.
- Keep release publishing as draft-only unless a separate release approval changes that policy.
- Add a non-publishing workflow validation path or documented local dry run so future path migrations catch release workflow drift earlier.

## Resolution

Phase 7 implemented the proposed repair:

- release workflow path references now point to `apps/desktop`;
- root workspace validation runs before the Tauri release action;
- draft release mode and signing secret names are preserved.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-23 | beta | Recorded Phase 7 release workflow repair resolution. | uncommitted | LALIN |
| 0.1.0b | 2026-07-23 | candidate | Documented legacy frontend path root cause in release workflow after app folder migration. | uncommitted | LALIN |
