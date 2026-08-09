---
version: "0.1.1b"
created_at: "2026-07-23T00:00:00+07:00,LALIN,uncommitted"
last_update: "2026-07-23T00:00:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "release-engineering"
  doc_type: "implementation-plan"
  scope: "Phase 7 GitHub Actions release workflow repair"
---

# Phase 7 Release Workflow Plan

## Status

Executed. This document was approved and implemented as Phase 7 release workflow repair.

## Complexity and Risk

- Complexity: C-3 - release workflow changes affect installer/updater publishing.
- Risk: HIGH - an incorrect workflow can fail releases or publish the wrong artifact.

## RCA

See `.brain/rca/2026-07-23-release-workflow-legacy-path.md`.

## Current Evidence

Before Phase 7, `.github/workflows/release.yml` still used legacy paths:

- `workspaces: frontend/src-tauri`
- `working-directory: frontend`
- `projectPath: frontend`

Current repo truth after Phase 4 and Phase 6A:

- desktop app source lives at `apps/desktop`;
- root workspace validation exists through `npm run check:all`;
- release workflow was intentionally not touched in Phase 6A.

## Decision

Repair release workflow paths and add root validation before release packaging.

Do not publish non-draft releases in Phase 7.

## Executed Workflow Changes

Updated `.github/workflows/release.yml`:

- keep trigger on version tags (`v*`);
- keep Windows runner;
- keep Node 20;
- keep Rust stable;
- changed Rust cache workspace from `frontend/src-tauri` to `apps/desktop/src-tauri`;
- installs dependencies from root with `npm ci`;
- runs `npm run check:all` before packaging;
- changed Tauri action `projectPath` from `frontend` to `apps/desktop`;
- keep `releaseDraft: true`;
- keep `includeUpdaterJson: true`;
- keep signing secrets unchanged;
- avoid changing Tauri product name, bundle identifier, updater endpoint, installer filename policy, or sidecar name.

## Out of Scope

- pushing tags;
- creating GitHub Releases;
- publishing non-draft releases;
- changing updater signing keys;
- renaming public packaging identifiers from G-Music to Lalin;
- changing app runtime code;
- fixing unrelated README/AGENTS encoding debt;
- adding new release channels.

## Implementation Steps After Approval

1. Update release workflow paths from `frontend` to `apps/desktop`.
   - Verify: no remaining `frontend` path in `.github/workflows/release.yml`.
2. Add root dependency install and `npm run check:all` gate before the Tauri release action.
   - Verify: local `npm run check:all` passes before commit.
3. Preserve draft release behavior and signing secret names.
   - Verify: workflow still has `releaseDraft: true`, `includeUpdaterJson: true`, and existing signing env names.
4. Update docs with executed status and validation evidence.
   - Verify: `git diff --check`.

## Acceptance Criteria

- `.github/workflows/release.yml` points to `apps/desktop`, not `frontend`. PASS.
- Workflow runs root validation before the Tauri release action. PASS.
- Workflow keeps draft release mode. PASS.
- Workflow does not rename public packaging identifiers. PASS.
- Workflow does not push tags or create releases during implementation. PASS.
- `npm run check:all` passes locally. PASS.
- `git diff --check` passes. PASS.

## Verification Evidence

- `rg -n "frontend" .github\workflows\release.yml` - PASS; no remaining legacy frontend path.
- `rg -n "apps/desktop|releaseDraft|includeUpdaterJson|projectPath|workspaces|npm run check:all|npm ci" .github\workflows\release.yml` - PASS; expected workflow fields present.
- `npm ci` in a temporary manifest-only workspace - PASS; root workspace lockfile can install cleanly.
- `npm run check:all` from repo root - PASS.
- `git diff --check` - PASS.

Local validation caveat:

- `npm ci` in the live repo hit `EBUSY` on `apps\desktop\node_modules\esbuild` because a local process had the dependency directory locked. This is a workstation file-lock condition, not a workflow path/config failure. `npm install` restored local dependencies, and the root check passed afterward.

## Rollback

Rollback only the workflow path/check changes and SOT status updates from Phase 7. Phase 6A root workspace files remain unchanged.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-23 | beta | Executed release workflow path repair and recorded validation evidence. | uncommitted | LALIN |
| 0.1.0b | 2026-07-23 | candidate | Proposed safe repair for stale GitHub Actions release workflow paths after app migration. | uncommitted | LALIN |
