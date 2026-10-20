---
version: "0.1.3b"
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

**Status:** Slice A is implemented and Slice B manual-only is approved and implemented in draft PR #29 on branch `codex/dubbing-pro-slice-a-20261020`. Check results and remaining live/native gates are recorded in the validation reports.
**Parent shell:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md)  
**Approved visual:** `docs/design/reference/lalin/LALIN_DUBBING_V1_APPROVED.png`.

## Purpose

This specification describes the Dubbing workflow. Slice A adds ASR-only
transcript review. Slice B adds manual speaker assignment and per-speaker voice
mapping, then renders from the completed analyze job. Automatic diarization,
timing edits, transcript text edits, clips, and short voice-over remain future
work.

## Stage map

The stage map describes the broader design target. Current Transcript UI
supports source analysis, manual speaker assignment, voice mapping, and render;
synchronized timeline editing and the remaining content tools are future work.

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

## Implemented Slice B (manual-only)

- Each transcript segment receives `Speaker A` by default; users can add slots, rename them, and assign segments to a slot.
- Each used speaker slot maps to an existing voice profile. Mapping and labels are saved locally by analyze job ID.
- `POST /dubbing/render` accepts the analyze job ID, segment-to-speaker assignments, speaker-to-voice mappings, target language, and translate toggle. The backend validates that the completed job exists, all segments are assigned, and each used speaker has a resolvable voice.
- Render reads text, times, detected language, source name, and duration from the persisted analyze result. It does not run ASR again; each segment uses its assigned voice before fit/mix/subtitle output.
- The existing `POST /dubbing` single-speaker quick flow remains available. A transcript marked stale cannot be edited or rendered.
- Automatic diarization, transcript text editing, clip export, and short voice-over are not part of Slice B.

## Interaction rules

- Import validates source media and displays the selected file before
  transcription begins.
- Speaker labels and voice mapping are manual; transcript text and timestamps
  remain read-only.
- Every segment must have an assigned speaker and every used speaker must map
  to an existing voice profile before render starts.
- Render reuses the completed analyze job and reports progress through the
  existing job/WebSocket surface.

## Acceptance checks

- W0 shell dimensions and rail order are unchanged.
- Segment time, text, speaker assignment, and speaker voice map are visible in
  the Transcript workspace.
- Render stays unavailable when the source is stale, a segment assignment is
  missing, or a used speaker has no valid voice profile.
- The one-step single-speaker Dub action remains available independently.
- `F1` remains the one-line cross-app activity surface, not a duplicate
  per-tab render status bar.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.3b | 2026-10-20 | beta | Add approved manual speaker assignment, voice mapping, and transcript-backed render behavior | 65df361 (PR #29, draft) | Codex |
| 0.1.2b | 2026-10-20 | beta | Record Slice A implementation and distinguish it from the future multi-stage target | 1ef64f0 (PR #29, draft) | Codex |
| 0.1.1b | 2026-07-21 | beta | Dubbing v1 visual baseline approved; implementation pending. | uncommitted | ATHER |
| 0.1.0b | 2026-07-21 | superseded | First Dubbing design spec under approved W0 shell, pending visual approval. | uncommitted | ATHER |
