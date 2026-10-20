---
version: "0.1.2b"
created_at: "2026-07-21T00:00:00+07:00,ATHER,uncommitted"
last_update: "2026-10-20T00:00:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "product-ui"
  doc_type: "tab-layout-spec"
  scope: "Lalin Studio Dubbing desktop"
---

# Lalin Studio Dubbing Tab Specification

**Status:** full multi-stage design remains the approved target; Slice A is implemented in branch `codex/dubbing-pro-slice-a-20261020` and its automated checks pass. Live ASR/audio quality and native desktop verification are pending.
**Parent shell:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md)  
**Approved visual:** `docs/design/reference/lalin/LALIN_DUBBING_V1_APPROVED.png`.

## Purpose

This specification describes the approved full Dubbing target: transcript,
optional translation, speaker assignment, timing review, and render. Current
Slice A adds ASR-only transcript review before the existing single-speaker
render path. Speaker assignment and synchronized timing review remain target
design, not current implementation.

## Stage map

The stage map below describes the full approved design target. Slice A currently implements only source analysis and read-only transcript review; speaker assignment, synchronized timeline editing, review, and multi-speaker render remain future work.

```
M0/H1/R1/F1 inherited unchanged from W0
S1           D2 stepper | D3 segment editor | D4 selected-segment inspector
```

| ID | Region | Desktop rule |
|---|---|---|
| `D2` | workflow stepper | Import → Transcript → Assign voices → Review & render. Current step is explicit; completed steps remain revisitable. |
| `D3` | segment editor | table plus synchronized timeline. Displays time, speaker, source text, target text, assigned voice, and state. |
| `D4` | selected-segment inspector | speaker/voice assignment, voice controls, timing/preview, and localized validation/error state. |

## Implemented Slice A

- `DubbingPanel` keeps the existing `Dub` flow and adds a `Transcript` tab.
- `POST /dubbing/analyze` starts a separate ASR-only job; it does not translate or synthesize speech.
- A completed job stores source filename, detected language, duration, stable segment IDs, timestamps, and SRT/VTT artifact names in its durable result.
- The transcript view shows language, segment count, total duration, and a read-only timestamped list; SRT/VTT are downloadable while the selected source matches the analyzed source.
- The last successful analyze job is restored by job ID. If the selected source changes, the old transcript is labeled stale and its subtitle downloads are hidden until reanalysis succeeds.
- The existing one-step `Run Dubbing` action remains available and continues to run its existing pipeline independently; it does not yet reuse the Slice A transcript.
- Multi-speaker mapping, diarization, transcript editing, clip export, and short voice-over are outside Slice A.

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
| 0.1.2b | 2026-10-20 | beta | Record Slice A implementation and distinguish it from the future multi-stage target | 1ef64f0 (PR #29, draft) | Codex |
| 0.1.1b | 2026-07-21 | beta | Dubbing v1 visual baseline approved; implementation pending. | uncommitted | ATHER |
| 0.1.0b | 2026-07-21 | superseded | First Dubbing design spec under approved W0 shell, pending visual approval. | uncommitted | ATHER |
