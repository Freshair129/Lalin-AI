---
version: "0.1.1b"
created_at: "2026-07-22T00:00:00+07:00,LALIN,uncommitted"
last_update: "2026-07-22T00:00:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "implementation-plan"
  scope: "Phase 6 root workspace orchestration"
---

# Phase 6 Workspace Orchestration Plan

## Status

Executed. This document was approved and implemented as Phase 6A root workspace orchestration.

## Complexity and Risk

- Complexity: C-3 - repository-level build orchestration changes affect multiple packages and future CI.
- Risk: MEDIUM - no runtime behavior changes are intended, but incorrect workspace wiring can break dependency resolution, local builds, or packaging.

## Current Evidence

Phase 5 created the first real shared package and MCP app:

- `packages/contracts`
- `apps/mcp`
- `apps/desktop`
- `apps/api`

Current verification now has root orchestration through native npm workspaces.

## Problem

The repository is now a real multi-package workspace. Before Phase 6A, it still behaved like separate projects:

- each Node project was installed and built separately;
- root-level validation did not know the full dependency graph;
- MCP and desktop both depended on contracts, but root tooling did not express that order;
- future CI would need to duplicate the same command sequence by hand.

## Decision

Use native npm workspaces first.

Do not add Nx, Turborepo, Bazel, or Lerna in Phase 6. The repo has enough shared-package structure to need root orchestration, but not enough scale to justify a monorepo framework yet.

## Executed Scope

### Root Workspace Metadata

Added a private root `package.json` that declares:

- `apps/desktop`
- `apps/mcp`
- `packages/contracts`

The root package is orchestration-only. It is not runtime code.

Generated:

- `package-lock.json`

### Root Scripts

Added:

- `build:contracts`
- `build:mcp`
- `build:desktop`
- `build:node`
- `check:api`
- `check:tauri`
- `check:all`

`build:node` builds contracts before MCP and desktop.

### Preserved Existing Package Entrypoints

Existing commands still work:

- `cd packages\contracts && npm run build`
- `cd apps\mcp && npm run build`
- `cd apps\desktop && npm run build`
- `cd apps\api && ..\..\backend\.venv\Scripts\python.exe -m compileall -q app`
- `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml`

### Lockfile Policy

Phase 6A created a root `package-lock.json` and did not delete child package lockfiles.

Lockfile consolidation is a later explicit phase because deleting child lockfiles changes rollback and developer workflow behavior.

### CI Policy

Phase 6A did not add CI. The existing release workflow still points at legacy `frontend`; touching release automation is intentionally left for a separate release-workflow RCA/proposal.

No release, tag, updater publish, installer build, or GitHub Release upload belongs in Phase 6A.

## Out of Scope

- Nx, Turborepo, Bazel, or Lerna.
- deleting child `package-lock.json` files.
- changing Tauri packaging identifiers.
- renaming compatibility identifiers still carrying G-Music history.
- fixing README or AGENTS encoding/mojibake debt.
- adding mutating MCP tools.
- changing runtime behavior or API routes.

## Acceptance Criteria

- Root workspace metadata exists and is private. PASS.
- Root workspace includes only `apps/desktop`, `apps/mcp`, and `packages/contracts`. PASS.
- `npm run build:node` works from repo root. PASS.
- `npm run check:all` works from repo root. PASS.
- Existing per-package build commands still work. PASS.
- No Nx, Turborepo, Bazel, or Lerna dependency or config is introduced. PASS.
- No child lockfile is deleted in Phase 6A. PASS.
- No runtime behavior changes are included. PASS.

## Verification Evidence

- `npm install` from repo root - PASS; created root workspace lockfile.
- `npm run build:node` - PASS.
- `npm run check:all` - PASS.
- `cd packages\contracts && npm run build` - PASS.
- `cd apps\mcp && npm run build` - PASS.
- `cd apps\desktop && npm run build` - PASS.

Known npm audit state:

- root `npm install` reported 7 vulnerabilities. This phase did not run `npm audit fix --force` because that can introduce breaking dependency changes outside the approved orchestration scope.

## Rollback

Rollback removes only:

- root `package.json`;
- root `package-lock.json`;
- SOT updates that mark Phase 6A executed.

Child app/package files remain valid after rollback.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-22 | beta | Executed native npm workspace orchestration and recorded validation evidence. | uncommitted | LALIN |
| 0.1.0b | 2026-07-22 | candidate | Proposed native npm workspace orchestration after Phase 5 contracts and MCP. | uncommitted | LALIN |
