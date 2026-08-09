---
version: "0.1.0b"
created_at: "2026-07-22T00:00:00+07:00,LALIN"
last_update: "2026-07-22T00:00:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "migration-plan"
  scope: "App folder migration"
---

# Phase 4 App Folder Migration Plan

## Status

Executed. App source moved to `apps/api` and `apps/desktop`. See
`docs/architecture/PHASE4_APP_MOVE_MAP.md`.

## Complexity and risk

- Complexity: C-3 — Architecture-driven implementation.
- Risk: HIGH — moves both app roots and changes build, sidecar, Tauri, and
  runtime path contracts.

## Target layout

```text
apps/
├─ desktop/   # current frontend/
└─ api/       # current backend/
```

Keep root compatibility wrappers until all validation gates pass.

## Current path dependencies found

| Area | Current path assumption | Required change |
|---|---|---|
| `tools/build/build_sidecar.ps1` | `$root/backend`, `$root/frontend/src-tauri/binaries` | Point to `apps/api` and `apps/desktop/src-tauri/binaries`. |
| `tools/build/build_installer.ps1` | `$root/frontend`, `$root/frontend/src-tauri/target/...` | Point to `apps/desktop`. |
| `frontend/src-tauri/tauri.conf.json` | `frontendDist: ../dist`, `externalBin: binaries/g-music-backend`, resources under `binaries/_internal/` | Revalidate after move under `apps/desktop/src-tauri`. |
| `frontend/package.json` | package name `g-music-frontend`, local scripts | May remain during compatibility release; path moves only. |
| `backend/app/config.py` | `_repo_root() = Path(__file__).resolve().parents[2]` | Replace with marker-based repo-root resolver before moving. |
| README/AGENTS/docs | commands use `cd D:\G-Music\backend` and `cd D:\G-Music\frontend` | Update to canonical `apps/api` and `apps/desktop`; optionally document compatibility wrappers. |
| `.gitignore` | ignores `backend/.venv`, `backend/build`, `backend/dist`, `frontend/node_modules`, `frontend/dist`, `frontend/src-tauri/target` | Add `apps/api/*` and `apps/desktop/*` equivalents before move. |

## Move policy

Move source and project files only. Do not move generated dependency/build
folders unless explicitly required.

### Move to `apps/api`

Move:

- `backend/app/`
- `backend/requirements.txt`
- `backend/.env.example`
- `backend/sidecar_entry.py`
- `backend/runtime_device_report.py`
- `backend/smoke_*.py`

Do not move:

- `backend/.venv/`
- `backend/build/`
- `backend/dist/`
- `backend/__pycache__/`
- `backend/*.log`
- `backend/*.err`
- generated `backend/*.spec`

### Move to `apps/desktop`

Move:

- `frontend/src/`
- `frontend/src-tauri/`
- `frontend/index.html`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/tsconfig.json`
- `frontend/vite.config.ts`
- `frontend/vitest.config.ts`

Do not move:

- `frontend/node_modules/`
- `frontend/dist/`
- `frontend/src-tauri/target/`
- `frontend/.playwright-cli/`

## Compatibility policy

After moving, create root compatibility launchers or docs-only aliases as needed:

- `backend/` should not be recreated with source files. If needed, provide a
  README shim only after validation.
- `frontend/` should not be recreated with source files. If needed, provide a
  README shim only after validation.
- Root batch files (`app.bat`, `dev.bat`, `test.bat`) must be updated to new
  app paths.

## Required implementation order after approval

1. Add a marker-based repo-root resolver in backend config. Done.
2. Update `.gitignore` for `apps/api` and `apps/desktop` generated folders. Done.
3. Create `apps/api` and `apps/desktop`. Done.
4. Move app source files according to the move policy. Done.
5. Update tool scripts and root batch launchers. Done.
6. Update README, AGENTS, and architecture docs. Done.
7. Validate backend compile from `apps/api`. Done.
8. Validate frontend build from `apps/desktop`. Done.
9. Validate Tauri config with `npm run build` and a lightweight Tauri check if
   available. Done.

## Acceptance criteria

- `cd apps/api ; .venv/Scripts/python.exe -m compileall -q app` passes, or the
  documented venv path is updated and verified.
- `cd apps/desktop ; npm run build` passes.
- `tools/build/build_sidecar.ps1` resolves the API and desktop paths correctly.
- `tools/build/build_installer.ps1` resolves the desktop Tauri target paths
  correctly.
- Runtime data still resolves to `D:\G-Music\runtime\data`.
- No generated dependency folders are accidentally added to git.

## Rollback plan

- Move `apps/api/*` back to `backend/`.
- Move `apps/desktop/*` back to `frontend/`.
- Restore tool scripts and root batch files to the Phase 3 paths.
- Keep runtime data under `runtime/`; Phase 4 rollback does not roll back
  Phase 3 unless runtime validation fails separately.

## Changelog

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.1b | 2026-07-22 | beta | Executed Phase 4 app folder migration and recorded validation gates. | uncommitted | LALIN |
| 0.1.0b | 2026-07-22 | candidate | Documented Phase 4 app folder migration audit, blockers, move policy, order, and gates. | uncommitted | LALIN |
