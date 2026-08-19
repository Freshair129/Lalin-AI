---
version: "0.1.0b"
created_at: "2026-07-22T00:00:00+07:00,LALIN"
last_update: "2026-07-22T00:00:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "migration-plan"
  scope: "Runtime state consolidation"
---

# Phase 3 Runtime State Plan

## Status

Executed. Runtime config now defaults to `<repo-root>/runtime/data`, and actual
runtime data moved from `backend/data/` to `runtime/data/`. See
`docs/architecture/PHASE3_RUNTIME_MOVE_MAP.md`.

## Complexity and risk

- Complexity: C-3 — Architecture-driven implementation.
- Risk: HIGH — moves user/generated audio, voice profiles, project files, and
  job outputs.

## Audit snapshot

| Path | Files | Dirs | Size | Finding |
|---|---:|---:|---:|---|
| `data/` | 0 | 3 | 0 MB | Root placeholder folders only. |
| `output/` | 0 | 1 | 0 MB | Root Playwright output placeholder. |
| `queue/` | 0 | 0 | 0 MB | Empty root queue folder. |
| `state/` | 2 | 0 | 0 MB | Root event/project state files. |
| `backend/data/` | 133 | 86 | 4231.75 MB | Actual runtime data: uploads, outputs, projects, voices, workspace. |

## Root cause of Phase 3 blocker

`backend/app/config.py` currently sets `data_dir: Path = Path("./data")`.
That path depends on the process current working directory:

- backend launched from `D:\G-Music\backend` uses `backend/data`.
- backend launched from `D:\G-Music` uses root `data`.

Therefore moving folders first would not create deterministic runtime behavior.
The config contract must be changed before moving data.

## Proposed runtime contract

Canonical runtime root:

```text
runtime/
├─ data/
│  ├─ uploads/
│  ├─ outputs/
│  ├─ voices/
│  ├─ projects/
│  └─ workspace/
├─ output/
│  └─ playwright/
├─ queue/
└─ state/
```

Backend canonical data dir:

```text
GMUSIC_DATA_DIR or LALIN_DATA_DIR if set
else <repo-root>/runtime/data during development
else platform app-data directory in packaged release
```

For this repo migration, keep the environment variable name `GMUSIC_DATA_DIR`
for compatibility. Add `LALIN_DATA_DIR` only as an alias after product rename
runtime compatibility is tested.

## Move map

| Source | Target | Action |
|---|---|---|
| `backend/data/uploads` | `runtime/data/uploads` | Move actual uploads. |
| `backend/data/outputs` | `runtime/data/outputs` | Move actual generated outputs and work folders. |
| `backend/data/voices` | `runtime/data/voices` | Move voice profiles and reference WAVs. |
| `backend/data/projects` | `runtime/data/projects` | Move saved project JSON. |
| `backend/data/workspace` | `runtime/data/workspace` | Move workspace files. |
| `data/uploads` | `runtime/data/uploads` | Merge only if non-empty. Current audit found empty. |
| `data/outputs` | `runtime/data/outputs` | Merge only if non-empty. Current audit found empty. |
| `data/voices` | `runtime/data/voices` | Merge only if non-empty. Current audit found empty. |
| `output/playwright` | `runtime/output/playwright` | Move if future files exist; current audit found empty. |
| `queue/` | `runtime/queue/` | Move if future files exist; current audit found empty. |
| `state/` | `runtime/state/` | Move root state files after confirming reader/writer owner. |

## Required implementation steps after approval

1. Add a repo-root resolver in backend configuration. Done.
2. Change default backend `data_dir` to `<repo-root>/runtime/data`. Done.
3. Preserve env override compatibility for `GMUSIC_DATA_DIR`. Done.
4. Update smoke scripts that hard-code `data/uploads` or `data/outputs` to use
   `get_settings()` or the configured runtime path. Done.
5. Update `.gitignore` to ignore `runtime/`, while preserving any intentional
   sample fixtures. Done.
6. Create a rollback map before moving any runtime files. Done.
7. Move runtime folders with collision checks. Done.
8. Validate backend compile and targeted path checks. Done.

## Acceptance criteria

- Existing uploads, outputs, voices, projects, and workspace files remain
  discoverable through the backend APIs.
- `backend/.venv/Scripts/python.exe -m compileall -q app` passes from
  `backend/`.
- A config path check confirms:
  - `get_settings().data_dir` resolves to `D:\G-Music\runtime\data` in dev.
  - `uploads_dir`, `outputs_dir`, and `voices_dir` resolve under that root.
- Old root placeholders are not required for runtime correctness.
- No source-controlled runtime audio/output files are introduced.

## Rollback plan

- Move `runtime/data/*` back to `backend/data/*`.
- Move `runtime/state/*` back to `state/*`.
- Restore previous `data_dir: Path = Path("./data")` only if path checks fail.
- Keep the move map with every source/target pair until validation passes.

## Changelog

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.1b | 2026-07-22 | beta | Executed Phase 3 runtime data migration after config contract implementation. | uncommitted | LALIN |
| 0.1.0b | 2026-07-22 | candidate | Documented Phase 3 runtime-state audit, blocker, target contract, move map, and acceptance gates. | uncommitted | LALIN |
