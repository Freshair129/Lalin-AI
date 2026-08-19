---
version: "0.1.0b"
created_at: "2026-07-22T00:00:00+07:00,LALIN"
last_update: "2026-07-22T00:00:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "migration-map"
  scope: "Runtime state consolidation"
---

# Phase 3 Runtime Move Map

This map records the approved Phase 3 runtime-state move.

## Pre-move audit

| Path | Files | Dirs | Size |
|---|---:|---:|---:|
| `backend/data/` | 133 | 86 | 4231.75 MB |
| `data/` | 0 | 3 | 0 MB |
| `output/` | 0 | 1 | 0 MB |
| `queue/` | 0 | 0 | 0 MB |
| `state/` | 2 | 0 | 0 MB |

## Executed move map

| Source | Target | Notes |
|---|---|---|
| `backend/data/` | `runtime/data/` | Primary runtime data: uploads, outputs, projects, voices, workspace. |
| `state/events.jsonl` | `runtime/state/events.jsonl` | Root state event log. |
| `state/PROJECT_STATE.json` | `runtime/state/PROJECT_STATE.json` | Root project state snapshot. |

## Compatibility decision

- `backend/app/config.py` now defaults to `<repo-root>/runtime/data`.
- `GMUSIC_DATA_DIR` remains a supported environment override.
- Root `data/`, `output/`, and `queue/` were empty or placeholder-only during
  audit and are not canonical runtime locations.
- `backend/data/` is no longer the canonical development data root after this
  phase.

## Rollback

If rollback is required:

1. Move `runtime/data/` back to `backend/data/`.
2. Move `runtime/state/events.jsonl` back to `state/events.jsonl`.
3. Move `runtime/state/PROJECT_STATE.json` back to `state/PROJECT_STATE.json`.
4. Restore `backend/app/config.py` default data dir to `Path("./data")`.

## Changelog

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-07-22 | beta | Recorded Phase 3 runtime-state move map and rollback plan. | uncommitted | LALIN |
