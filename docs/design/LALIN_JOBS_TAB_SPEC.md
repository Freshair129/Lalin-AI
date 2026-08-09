---
version: "0.1.1b"
created_at: "2026-07-21T00:00:00+07:00,ATHER,uncommitted"
last_update: "2026-07-21T00:00:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "product-ui"
  doc_type: "tab-layout-spec"
  scope: "Lalin Studio Jobs desktop"
---

# Lalin Studio Jobs Tab Specification

**Status:** approved design baseline; implementation pending.  
**Parent shell:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md)  
**Approved visual:** `docs/design/reference/lalin/LALIN_JOBS_V1_APPROVED.png`.

## Purpose

Jobs is the durable recovery surface for all background work. It complements
the compact F1 status row with queue, detail, logs, output, retry, and cancel
paths.

## Stage map

```
M0/H1/R1/F1 inherited unchanged from W0
S1           J1 queue groups | J2 selected-job detail | J3 logs/output/actions
```

| ID | Region | Desktop rule |
|---|---|---|
| `J1` | queue groups | Running, Queued, Completed, Failed. Each row shows work type, input, progress/state, and timing. |
| `J2` | selected-job detail | source, output target, profile/runtime context, progress, and error/recovery state. |
| `J3` | logs/output/actions | readable progress log, open output, retry/recover, and cancel only when the job permits it. |

## Interaction rules

- F1 activity opens the matching job detail in Jobs without losing the current
  queue filter/scroll state.
- Failed jobs include a specific reason and recovery action; Retry preserves
  its input configuration unless the user edits it.
- Completed jobs expose output and originating project where known.
- Cancel requires confirmation only for work that produces partial/discardable
  output; non-cancellable work explains why.

## Acceptance checks

- W0 shell dimensions and rail order are unchanged.
- Active job progress in F1 is traceable to a detailed Jobs record.
- Failed state, reason, and recovery action are visible together.
- Completed and failed groups do not hide running work above the fold.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-21 | beta | Jobs v1 visual baseline approved; implementation pending. | uncommitted | ATHER |
| 0.1.0b | 2026-07-21 | superseded | First Jobs design spec under approved W0 shell, pending visual approval. | uncommitted | ATHER |
