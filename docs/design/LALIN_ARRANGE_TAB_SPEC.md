---
version: "0.1.2b"
created_at: "2026-07-21T00:00:00+07:00,ATHER,uncommitted"
last_update: "2026-07-21T00:00:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "product-ui"
  doc_type: "tab-layout-spec"
  scope: "Lalin Studio Arrange desktop"
---

# Lalin Studio Arrange Tab Specification

**Status:** approved design baseline; W0 Arrange migration in progress.  
**Parent shell:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md)
**Approved visual:** `docs/design/reference/lalin/LALIN_ARRANGE_V1_APPROVED.png`.

## Purpose

Arrange is the timeline-first finishing workspace. It inherits W0 unchanged and
uses its stage for project commands, edit controls, timeline, and an optional
device rack.

## Stage map

```
M0  Application command bar: File / Edit / View / Help | Open | Save | Settings
H1  Shared global headbar
R1  Shared navigation rail
S1  B1 Asset browser | A1 Arrange controls | T1 Timeline canvas
                         D1 Device dock (below T1; collapsible)
F1  Shared 22px telemetry + live activity footer
```

| ID | Region | Desktop rule |
|---|---|---|
| `M0` | application command bar | `File` exposes New, Open, Save, Save As, Close; `Edit` exposes Undo/Redo and edit actions; `View` exposes layout/panel visibility; `Help` opens guidance. Open, Save, and Settings stay reachable without opening a panel. |
| `B1` | asset browser | 260px default, collapsible to icon/drawer state. It owns media, stems, search, and filters. |
| `A1` | Arrange project controls | project name, source/beat, transport, snap/grid, and Render. It does not repeat global Open/Save/Settings. |
| `T1` | timeline canvas | largest flexible region; retains edit focus and visible playhead. |
| `D1` | device dock | below `T1`; 220px expanded, 48px collapsed tray. It contains FX, sync, stem mix, and master target. |
| `F1` | shared footer | 22px. Shows one-line activity such as `Rendering 01.mp4 · 55%`; no timeline transport. |

## Priority and collapse order

1. Preserve `T1` width and editability.
2. Collapse `D1` to its 48px tray.
3. Collapse `B1` to its drawer/icon state.
4. Reduce non-essential labels in `A1`.
5. Never remove the active-job status from `F1`; it may truncate secondary
   telemetry first.

## Interaction rules

- `Open` restores a project/session; `Save` saves the current project; `Save
  As` creates a new project snapshot. Unsaved changes must be indicated before
  close/open replacement.
- `Settings` opens the global Settings destination or a settings overlay; it
  never becomes an Arrange-only panel.
- The activity log opens from `F1` as an upward overlay and supports opening a
  job, cancelling a cancellable job, and viewing failure/retry details.
- Patch remains an advanced view reached from Arrange; it is not a separate
  top-level rail destination.

## Acceptance checks

- `M0` is visible before entering the stage and exposes Open, Save, and
  Settings paths.
- `F1` is exactly 22px in the desktop layout and its current activity remains
  readable at 1280px.
- `T1` is wider than `B1` and is not reduced to preserve an idle `D1`.
- `D1` is below, never beside, the timeline.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.2b | 2026-07-22 | beta | M0 project command bridge added; duplicate Arrange Open/Save controls removed; T1/D1 layout retained. | uncommitted | ATHER |
| 0.1.1b | 2026-07-21 | beta | Arrange v1 visual baseline approved; implementation pending. | uncommitted | ATHER |
| 0.1.0b | 2026-07-21 | superseded | First Arrange design spec under W0 shell, pending visual approval. | uncommitted | ATHER |
