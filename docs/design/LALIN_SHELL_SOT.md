---
version: "0.1.2b"
created_at: "2026-07-21T00:00:00+07:00,ATHER,uncommitted"
last_update: "2026-07-21T00:00:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "product-ui"
  doc_type: "shell-source-of-truth"
  scope: "Lalin Studio desktop"
---

# Lalin Studio W0 Shared Shell — Source of Truth

**Status:** approved visual baseline; implementation pending.  
**Source reference:** `docs/design/reference/lalin/LALIN_W0_SHARED_SHELL_MASTER_SOURCE.png` (44px F1; no M0).  
**Approved visual authority:** `docs/design/reference/lalin/LALIN_W0_SHARED_SHELL_MASTER_V2_APPROVED.png`.

W0 is the one desktop shell inherited by every top-level destination. A screen
may change its stage content; it may not create its own rail, header height, or
footer placement.

## Fixed regions

| ID | Region | Contract |
|---|---|---|
| `M0` | Application command bar | 28px. `File`, `Edit`, `View`, `Help`; File owns New/Open/Save/Save As. Visible Open, Save, and Settings affordances may appear here. |
| `H1` | Global headbar | 56px. Brand, location/breadcrumb, global search, and global utility controls. |
| `R1` | Navigation rail | 96px. Fixed order: Workspace, Voice Studio, Dubbing, Arrange, Mastering, Library, Jobs, Settings. Only the active indicator changes. |
| `S1` | Main stage | Flexible workspace for the current destination. |
| `F1` | Runtime/activity footer | 22px, fixed at the bottom. One line only; no transport controls. |

## Footer contract

`F1` has three zones: telemetry left, live activity centre, runtime identity
right. It uses compact labels and a thin progress indicator.

```
CPU · RAM · GPU · VRAM | Rendering 01.mp4 · 55% · progress | local · model · agent
```

- Values are live values or `N/A`; placeholders are never shipped as telemetry.
- The activity row is primary while work runs. Otherwise it shows the latest
  completed/failed activity in one line.
- Selecting activity opens the activity log as an overlay; the footer never
  grows to show history.
- At compact widths, hide telemetry labels before truncating activity; full
  values remain available through the activity/runtime overlay.

## Variable regions

| Region | May vary by destination |
|---|---|
| `S1` | primary workspace content |
| contextual inspector | selection-dependent side sheet or panel |
| contextual device dock | only where the active task needs it |

`Arrange` alone owns the persistent `D1` device dock below its timeline. Other
destinations may use inspectors but do not inherit an empty Arrange dock.

## Acceptance checks

- The exact `R1` order, labels, width, and icon positions are identical across
  all desktop destinations.
- `M0`, `H1`, and `F1` remain in the same location across navigation.
- `F1` remains 22px and exposes a readable activity state without obscuring
  `S1`.
- A destination-specific panel cannot displace or duplicate a shared shell
  region.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.2b | 2026-07-21 | beta | W0 v2 visual baseline approved; implementation remains pending. | uncommitted | ATHER |
| 0.1.1b | 2026-07-21 | superseded | Corrected visual-SOT mismatch; W0 v2 awaited visual approval. | uncommitted | ATHER |
| 0.1.0b | 2026-07-21 | superseded | Initial shell text incorrectly pointed at pre-change 44px/no-M0 image. | uncommitted | ATHER |
