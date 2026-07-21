---
version: "0.1.1b"
created_at: "2026-07-21T00:00:00+07:00,ATHER,uncommitted"
last_update: "2026-07-21T00:00:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "product-ui"
  doc_type: "tab-layout-spec"
  scope: "Lalin Studio Dubbing desktop"
---

# Lalin Studio Dubbing Tab Specification

**Status:** approved design baseline; implementation pending.  
**Parent shell:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md)  
**Approved visual:** `docs/design/reference/lalin/LALIN_DUBBING_V1_APPROVED.png`.

## Purpose

Dubbing takes source media through transcript, optional translation, speaker
assignment, timing review, and render. The user can always see the selected
segment and its assigned voice before starting a job.

## Stage map

```
M0/H1/R1/F1 inherited unchanged from W0
S1           D2 stepper | D3 segment editor | D4 selected-segment inspector
```

| ID | Region | Desktop rule |
|---|---|---|
| `D2` | workflow stepper | Import → Transcript → Assign voices → Review & render. Current step is explicit; completed steps remain revisitable. |
| `D3` | segment editor | table plus synchronized timeline. Displays time, speaker, source text, target text, assigned voice, and state. |
| `D4` | selected-segment inspector | speaker/voice assignment, voice controls, timing/preview, and localized validation/error state. |

## Interaction rules

- Import validates source media and displays the selected file before
  transcription begins.
- Transcript/translation edits are segment-scoped and preserve the original
  source text.
- A voice assignment must show profile readiness and consent state; unavailable
  voices cannot be selected silently.
- Review & render validates unassigned/failed segments, then starts a job. Its
  progress is shown in `F1` and links to Jobs/activity details.

## Acceptance checks

- W0 shell dimensions and rail order are unchanged.
- Current workflow step, selected segment, assigned voice, and validation state
  are visible together without opening a second workspace.
- The final render action is unavailable until blocking assignments/errors are
  resolved, with a visible reason.
- `F1` remains the one-line cross-app activity surface, not a duplicate
  per-tab render status bar.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-21 | beta | Dubbing v1 visual baseline approved; implementation pending. | uncommitted | ATHER |
| 0.1.0b | 2026-07-21 | superseded | First Dubbing design spec under approved W0 shell, pending visual approval. | uncommitted | ATHER |
