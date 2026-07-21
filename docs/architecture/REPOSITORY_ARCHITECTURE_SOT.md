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

This document defines the target repository architecture. Phase 1 consolidated documentation folders. Phase 2 consolidated executable tooling under `tools/`; `scripts/` now contains compatibility shims only.

## Current Tree Truth

- `frontend/`: Tauri v2 desktop app using React, TypeScript, Vite, Zustand, and Tauri plugins.
- `backend/`: FastAPI app with brain providers, audio pipelines, routers, job manager, and sidecar entrypoints.
- `tools/`: canonical developer, build, and verification tooling.
- `scripts/`: compatibility shims that forward old commands to `tools/*`.
- `docs/`: product, design, architecture, operations, validation, RCA, and archive folders after Phase 1.
- `runtime/`: canonical local runtime state after Phase 3. `runtime/data` owns uploads, outputs, voices, projects, and workspace files.
- `backend/data/`: legacy runtime location; no longer canonical after Phase 3.
- `data/`, `output/`, `queue/`, `state/`: root placeholder or legacy local state folders; not canonical runtime architecture.
- `keys/`: updater signing key material and related secrets; must remain gitignored.
- `.brain/rca/`: RCA evidence currently outside `docs/`.

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
| `packages/contracts` | Shared API schemas and generated client types | not yet extracted |
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

Do not add Nx, Turborepo, Bazel, or Lerna in the first migration. The repo currently has two real applications and no extracted shared package. Native package scripts plus stable wrapper scripts are enough until `packages/contracts` becomes active or CI needs affected-build orchestration.

## Dependency Boundaries

- `apps/desktop` may call `apps/api` through HTTP/WebSocket contracts only.
- `apps/api` must not import frontend code.
- `packages/contracts` must not import app runtime code.
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

## Verification Gates

- Frontend build: `cd frontend && npm run build`
- Backend compile: `cd backend && .venv\Scripts\python.exe -m compileall -q app`
- Diff hygiene: `git diff --check`
- Runtime smoke gates live in `tools/verify`; `scripts/` wrappers remain valid for old commands.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.4b | 2026-07-22 | beta | Updated current tree truth after Phase 3 runtime migration. | uncommitted | LALIN |
| 0.1.3b | 2026-07-22 | beta | Recorded Phase 3 runtime audit truth: actual data is still under backend/data. | uncommitted | LALIN |
| 0.1.2b | 2026-07-22 | beta | Updated tooling truth after Phase 2 scripts-to-tools consolidation. | uncommitted | LALIN |
| 0.1.1b | 2026-07-22 | beta | Updated current tree truth after Phase 1 docs consolidation. | uncommitted | Codex |
| 0.1.0b | 2026-07-22 | beta | Created target repository architecture from current frontend/backend/docs layout. | uncommitted | Codex |
