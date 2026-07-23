---
version: "0.1.0b"
created_at: "2026-07-22T00:00:00+07:00,Codex,uncommitted"
last_update: "2026-07-22T00:00:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "migration-plan"
  scope: "Repository restructure"
---

# Repository Migration Plan

## Status

Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6A, and Phase 7 are executed.

## Goals

- Make the repository easier to navigate.
- Preserve every current runtime behavior.
- Keep Lalin product docs separate from G-Music compatibility identifiers.
- Avoid tool churn until the repo has a real shared package or CI scaling problem.

## Phase 0: Inventory and Freeze

- Capture `git status --short`.
- Capture all current top-level files and directories.
- Record build commands that must pass after every phase.
- Mark unrelated dirty files as out-of-scope instead of cleaning them opportunistically.

## Phase 1: Documentation Consolidation

Executed. Moved docs only:

- `PRODUCT.md` remains at root.
- `DESIGN.md` remains at root.
- `docs/LALIN_*` moved to `docs/design/`.
- `docs/PRD.md`, `docs/SRS.md`, `docs/ROADMAP_MUSIC.md`, and naming docs moved to `docs/product/`.
- `docs/SPEC.md`, packaging/runtime architecture docs moved to `docs/architecture/` or `docs/operations/`.
- `docs/SPRINT*_VALIDATION.md` moves to `docs/validation/`.
- superseded `GM6_*` and proposal packs move to `docs/archive/`.

Acceptance: docs index paths resolve and no source code moves.

## Phase 2: Tooling Consolidation

Executed. Moved scripts only:

- root launchers stay unchanged.
- setup/dev scripts moved to `tools/dev/`.
- build and sidecar scripts moved to `tools/build/`.
- smoke and validation scripts moved to `tools/verify/`.
- old `scripts/` paths now forward to canonical `tools/*` paths.

Acceptance: root wrappers still run old commands or forward to the new paths.

## Phase 3: Runtime State Consolidation

Executed. Audit found the actual runtime data under `backend/data/`, while root
`data/`, `output/`, and `queue/` were mostly placeholders. Backend config now
uses deterministic runtime paths, and actual runtime data moved to
`runtime/data/`. See `docs/architecture/PHASE3_RUNTIME_STATE_PLAN.md` and
`docs/architecture/PHASE3_RUNTIME_MOVE_MAP.md`.

- `data/` to `runtime/data/`
- `output/` to `runtime/output/`
- `queue/` to `runtime/queue/`
- `state/` to `runtime/state/`

Acceptance: existing projects, voices, uploads, and outputs remain discoverable.

## Phase 4: App Folder Migration

Executed. See `docs/architecture/PHASE4_APP_FOLDER_MIGRATION_PLAN.md` and
`docs/architecture/PHASE4_APP_MOVE_MAP.md`.

Move app source:

- `frontend/` to `apps/desktop/`
- `backend/` to `apps/api/`

Acceptance:

- Tauri dev/build still works.
- FastAPI still starts in full and lite profiles.
- sidecar packaging still finds its binary and resources.
- updater config is unchanged unless a rename release gate approves it.

## Phase 5: Contracts Package + MCP

Executed. See `docs/architecture/PHASE5_CONTRACTS_MCP_PLAN.md`.

Create `packages/contracts/` only when at least one shared contract is generated or hand-maintained:

- OpenAPI schema snapshot.
- TypeScript client or shared API types.
- job/runtime status schemas.
- MCP tool input/output schemas.

Acceptance: desktop and MCP import contracts from `packages/contracts`, not from API internals.

## Phase 6: Root Workspace Orchestration

Executed. See `docs/architecture/PHASE6_WORKSPACE_ORCHESTRATION_PLAN.md`.

Add root-level orchestration after the repo gained a real shared package and MCP app:

- private native npm workspace metadata;
- root build/check scripts for contracts, MCP, desktop, API compile, and Tauri check;
- optional minimal CI that calls the root scripts.

Acceptance: root validation runs from the repo root while existing per-package commands continue to work.

## Phase 7: Release Workflow Repair

Executed. See `docs/architecture/PHASE7_RELEASE_WORKFLOW_PLAN.md`.

Repair GitHub Actions release automation after the app source moved from `frontend/` to `apps/desktop/`.

Acceptance: release workflow points at canonical app paths, runs root validation before packaging, and remains draft-only.

## Rollback Rules

- Every move phase must produce a move map.
- Do not delete old wrappers until replacement commands pass.
- Do not rename public packaging identifiers in the repo-structure migration.
- If a phase fails, revert only that phase's moves; preserve unrelated user changes.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.12b | 2026-07-23 | beta | Phase 7 release workflow repair executed. | uncommitted | LALIN |
| 0.1.11b | 2026-07-23 | candidate | Added Phase 7 release workflow repair proposal. | uncommitted | LALIN |
| 0.1.10b | 2026-07-22 | beta | Phase 6A native workspace orchestration executed. | uncommitted | LALIN |
| 0.1.9b | 2026-07-22 | candidate | Added Phase 6 native workspace orchestration proposal. | uncommitted | LALIN |
| 0.1.8b | 2026-07-22 | beta | Phase 5 contracts package and safe MCP server executed. | uncommitted | LALIN |
| 0.1.7b | 2026-07-22 | beta | Added Phase 5 contracts and MCP candidate plan pointer. | uncommitted | LALIN |
| 0.1.6b | 2026-07-22 | beta | Phase 4 app folder migration executed. | uncommitted | LALIN |
| 0.1.5b | 2026-07-22 | beta | Added Phase 4 app folder migration plan pointer and kept phase candidate-gated. | uncommitted | LALIN |
| 0.1.4b | 2026-07-22 | beta | Phase 3 runtime config and data migration executed. | uncommitted | LALIN |
| 0.1.3b | 2026-07-22 | beta | Added Phase 3 runtime audit result and gated implementation plan pointer. | uncommitted | LALIN |
| 0.1.2b | 2026-07-22 | beta | Phase 2 tooling consolidation executed with compatibility shims. | uncommitted | LALIN |
| 0.1.1b | 2026-07-22 | beta | Phase 1 documentation consolidation executed; later phases remain candidate. | uncommitted | Codex |
| 0.1.0b | 2026-07-22 | candidate | Created phased migration plan for docs, tools, runtime state, apps, and contracts. | uncommitted | Codex |
