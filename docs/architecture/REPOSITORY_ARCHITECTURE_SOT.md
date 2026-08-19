---
version: "0.1.0b"
created_at: "2026-07-22T00:00:00+07:00,Codex,uncommitted"
last_update: "2026-07-22T00:00:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "source-of-truth"
  scope: "Repository structure and ownership"
---

# Repository Architecture Source of Truth

## Status

This document defines the target repository architecture. Phase 1 consolidated documentation folders. Phase 2 consolidated executable tooling under `tools/`; `scripts/` now contains compatibility shims only. Phase 5 added the first shared contracts package and local MCP app. Phase 6A added root workspace orchestration.

## Current Tree Truth

- `apps/desktop/`: Tauri v2 desktop app using React, TypeScript, Vite, Zustand, and Tauri plugins.
- `apps/api/`: FastAPI app with brain providers, audio pipelines, routers, job manager, and sidecar entrypoints.
- `apps/mcp/`: local stdio MCP server that exposes read/propose tools backed by the API.
- `packages/contracts/`: shared TypeScript contracts and JSON Schemas for desktop/API/MCP boundaries.
- `tools/`: canonical developer, build, and verification tooling.
- `scripts/`: compatibility shims that forward old commands to `tools/*`.
- `docs/`: product, design, architecture, operations, validation, RCA, and archive folders after Phase 1.
- `runtime/`: canonical local runtime state after Phase 3. `runtime/data` owns uploads, outputs, voices, projects, and workspace files.
- `backend/`: legacy generated artifacts and local venv fallback; no longer app source.
- `frontend/`: legacy generated artifacts; no longer app source.
- `backend/data/`: legacy runtime location; no longer canonical after Phase 3.
- `data/`, `output/`, `queue/`, `state/`: root placeholder or legacy local state folders; not canonical runtime architecture.
- `apps/`: canonical app root after Phase 4.
- `keys/`: updater signing key material and related secrets; must remain gitignored.
- `.brain/rca/`: RCA evidence currently outside `docs/`.
- GitHub repository: `Freshair129/Lalin-AI`.

## Target Tree

```text
.
├─ apps/
│  ├─ desktop/
│  └─ api/
├─ packages/
│  └─ contracts/
├─ tools/
│  ├─ dev/
│  ├─ build/
│  └─ verify/
├─ docs/
│  ├─ product/
│  ├─ design/
│  ├─ architecture/
│  ├─ operations/
│  ├─ validation/
│  ├─ rca/
│  └─ archive/
├─ runtime/
│  ├─ data/
│  ├─ output/
│  ├─ queue/
│  └─ state/
└─ README.md
```

## Ownership

| Target | Owns | Current source |
|---|---|---|
| `apps/desktop` | Tauri shell, React UI, desktop packaging config | `frontend/` |
| `apps/api` | FastAPI routes, ML pipelines, sidecar profiles | `backend/` |
| `packages/contracts` | Shared API, runtime, job, agent, and MCP schemas | extracted in Phase 5 |
| `tools/dev` | local launchers and developer workflows | moved setup/runtime scripts |
| `tools/build` | sidecar, installer, updater build steps | moved build scripts |
| `tools/verify` | smoke tests and release checks | moved smoke scripts, validation docs |
| `docs/product` | product intent, PRD/SRS/roadmap/naming | mixed `docs/` |
| `docs/design` | Lalin UI SOT, sitemap, layout, design system | `docs/design/LALIN_*`, `DESIGN.md` |
| `docs/architecture` | repo, runtime, packaging, ADRs | mixed `docs/` |
| `docs/operations` | workstation, packaging, runtime setup | mixed `docs/` |
| `docs/validation` | sprint and release evidence | `docs/SPRINT*_VALIDATION.md` |
| `docs/archive` | superseded GM6/G-Music planning docs | mixed `docs/` |
| `runtime` | local generated/user state | `data/`, `output/`, `queue/`, `state/` |

## Tooling Decision

Do not add Nx, Turborepo, Bazel, or Lerna in Phase 6. The repo now has a real shared package, so root orchestration is justified, but native npm workspaces are still the smallest adequate tool.

Phase 6A executed target:

- private root npm workspace;
- workspaces: `apps/desktop`, `apps/mcp`, `packages/contracts`;
- root scripts for Node builds, API compile, and Tauri check;
- no child lockfile deletion in the first workspace slice.

## Dependency Boundaries

- `apps/desktop` may call `apps/api` through HTTP/WebSocket contracts only.
- `apps/api` must not import frontend code.
- `packages/contracts` must not import app runtime code.
- `apps/mcp` may call `apps/api` through HTTP/WebSocket contracts only and must import shared schemas from `packages/contracts`.
- `tools/*` may orchestrate apps but must not become runtime dependencies.
- `runtime/*` is local generated state, not an import root.

## Compatibility Boundaries

The Lalin rename is product-facing first. The following identifiers stay in compatibility mode until a migration release is verified:

- Tauri `productName`
- Tauri `identifier`
- updater endpoint
- installer filename
- sidecar binary name
- existing data paths and project files

The repository name is no longer a compatibility identifier; it is now `Lalin-AI`.

## Verification Gates

- Contracts build: `cd packages\contracts && npm run build`
- Frontend build: `cd apps\desktop && npm run build`
- MCP build: `cd apps\mcp && npm run build`
- Backend compile: `cd apps\api && ..\..\backend\.venv\Scripts\python.exe -m compileall -q app`
- Diff hygiene: `git diff --check`
- Runtime smoke gates live in `tools/verify`; `scripts/` wrappers remain valid for old commands.
- Root full check: `npm run check:all`
- Release workflow path repair is executed in `docs/architecture/PHASE7_RELEASE_WORKFLOW_PLAN.md`.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.13b | 2026-07-24 | beta | Updated repository identity after GitHub rename to Lalin-AI. | uncommitted | LALIN |
| 0.1.12b | 2026-07-23 | beta | Marked Phase 7 release workflow repair executed. | uncommitted | LALIN |
| 0.1.11b | 2026-07-23 | candidate | Added Phase 7 release workflow repair pointer. | uncommitted | LALIN |
| 0.1.10b | 2026-07-22 | beta | Marked Phase 6A root workspace orchestration executed and added root check gate. | uncommitted | LALIN |
| 0.1.9b | 2026-07-22 | candidate | Added Phase 6 native npm workspace orchestration target after contracts became active. | uncommitted | LALIN |
| 0.1.8b | 2026-07-22 | beta | Updated tree truth and verification gates after Phase 5 contracts and MCP implementation. | uncommitted | LALIN |
| 0.1.7b | 2026-07-22 | beta | Added Phase 5 MCP dependency boundary and contract consumer rule. | uncommitted | LALIN |
| 0.1.6b | 2026-07-22 | beta | Updated current tree truth after Phase 4 app source migration. | uncommitted | LALIN |
| 0.1.5b | 2026-07-22 | beta | Added Phase 4 target app root note while preserving current frontend/backend truth. | uncommitted | LALIN |
| 0.1.4b | 2026-07-22 | beta | Updated current tree truth after Phase 3 runtime migration. | uncommitted | LALIN |
| 0.1.3b | 2026-07-22 | beta | Recorded Phase 3 runtime audit truth: actual data is still under backend/data. | uncommitted | LALIN |
| 0.1.2b | 2026-07-22 | beta | Updated tooling truth after Phase 2 scripts-to-tools consolidation. | uncommitted | LALIN |
| 0.1.1b | 2026-07-22 | beta | Updated current tree truth after Phase 1 docs consolidation. | uncommitted | Codex |
| 0.1.0b | 2026-07-22 | beta | Created target repository architecture from current frontend/backend/docs layout. | uncommitted | Codex |
