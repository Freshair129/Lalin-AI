---
version: "0.1.0b"
created_at: "2026-07-22T00:00:00+07:00,LALIN"
last_update: "2026-07-22T00:00:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "migration-map"
  scope: "App folder migration"
---

# Phase 4 App Move Map

This map records the approved Phase 4 app source migration.

## Executed move map

| Source | Target | Notes |
|---|---|---|
| `backend/app/` | `apps/api/app/` | FastAPI source package. |
| `backend/.env.example` | `apps/api/.env.example` | API environment template. |
| `backend/requirements.txt` | `apps/api/requirements.txt` | Python dependency manifest. |
| `backend/runtime_device_report.py` | `apps/api/runtime_device_report.py` | Workstation runtime report utility. |
| `backend/sidecar_entry.py` | `apps/api/sidecar_entry.py` | PyInstaller sidecar entrypoint. |
| `backend/smoke_*.py` | `apps/api/smoke_*.py` | API smoke checks. |
| `frontend/src/` | `apps/desktop/src/` | React source. |
| `frontend/src-tauri/` | `apps/desktop/src-tauri/` | Tauri project. |
| `frontend/index.html` | `apps/desktop/index.html` | Vite entry document. |
| `frontend/package.json` | `apps/desktop/package.json` | Desktop package manifest. |
| `frontend/package-lock.json` | `apps/desktop/package-lock.json` | Desktop lockfile. |
| `frontend/tsconfig.json` | `apps/desktop/tsconfig.json` | TypeScript config. |
| `frontend/vite.config.ts` | `apps/desktop/vite.config.ts` | Vite config. |
| `frontend/vitest.config.ts` | `apps/desktop/vitest.config.ts` | Vitest config. |

## Generated folders intentionally not moved

- `backend/.venv/` remains as a legacy local venv fallback.
- `backend/build/`, `backend/dist/`, `backend/*.spec`, logs, and caches remain
  generated legacy artifacts.
- `frontend/node_modules/`, `frontend/dist/`, and `frontend/.playwright-cli/`
  remain generated legacy artifacts.
- `apps/desktop/node_modules/` may be regenerated with `npm install`.

## Compatibility updates

- Root launchers now run API from `apps/api` and desktop from `apps/desktop`.
- Build and verification scripts now resolve canonical app paths under `apps/*`.
- Backend config uses marker-based repo-root discovery so runtime data still
  resolves to `runtime/data` after the source move.

## Rollback

If rollback is required:

1. Move `apps/api/*` back to `backend/`.
2. Move `apps/desktop/*` back to `frontend/`.
3. Restore tool scripts and batch launchers to Phase 3 paths.
4. Keep `runtime/` untouched unless a separate Phase 3 rollback is required.

## Changelog

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-07-22 | beta | Recorded Phase 4 app source move map and compatibility updates. | uncommitted | LALIN |
