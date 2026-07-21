---
version: "0.1.2b"
created_at: "2026-07-21T00:00:00+07:00,ATHER,uncommitted"
last_update: "2026-07-21T00:00:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "product-ui"
  doc_type: "tab-layout-spec"
  scope: "Lalin Studio Workspace desktop"
---

# Lalin Studio Workspace Tab Specification

**Status:** approved design baseline; initial implementation in progress.  
**Parent shell:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md)  
**Approved visual:** `docs/design/reference/lalin/LALIN_WORKSPACE_V1_APPROVED.png`.

## Purpose

Workspace is the return point for active work: continue a recent project,
start one task, or recover an active job. It is not a marketing dashboard and
does not duplicate the detailed Library or Jobs views.

## Stage map

```
M0/H1/R1/F1  inherited unchanged from W0
S1            W1 Recent projects | W2 Continue work | W3 Create | W4 Active jobs
```

| ID | Region | Desktop rule |
|---|---|---|
| `W1` | Recent projects | searchable list of recent work with project type, last-opened time, and resume action. |
| `W2` | Continue work | one featured current/recent project with direct Continue action; no duplicate project detail. |
| `W3` | Create | five task launchers: Voice Studio, Dubbing, Arrange, Mastering, Import. Each starts a clear task flow. |
| `W4` | Active jobs | compact current/queued jobs with status, progress, and link to Jobs. It does not replace job history/recovery. |

## Interaction rules

- `Continue` restores the project state described by the sitemap; it never
  starts an empty copy.
- Create cards are task launchers, not top-level navigation variants.
- Selecting a running job opens its job detail or the F1 activity log; failures
  disclose retry/recovery rather than disappearing.
- Workspace has no persistent device dock. Its stage is a task-launching and
  continuity surface, not an editor canvas.

## Acceptance checks

- W0 dimensions and rail order are unchanged.
- One current project is visually dominant; recent items and jobs remain
  secondary.
- The F1 activity row stays available while Workspace content changes.
- Jobs section links to Jobs for history and recovery.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.2b | 2026-07-22 | beta | Added current-project, task launcher, and runtime-backed active-job surface. | uncommitted | ATHER |
| 0.1.1b | 2026-07-21 | beta | Workspace v1 visual baseline approved; implementation pending. | uncommitted | ATHER |
| 0.1.0b | 2026-07-21 | superseded | First Workspace design spec under approved W0 shell, pending visual approval. | uncommitted | ATHER |
