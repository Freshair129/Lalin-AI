---
version: "0.1.0b"
created_at: "2026-10-20T00:00:00+07:00,Codex"
last_update: "2026-10-20T00:00:00+07:00,Codex"
status: "candidate; API runtime verification pending"
superseded_by: null
attributes:
  doc_type: "validation-report"
  domain: "dubbing"
  scope: "Dubbing Pro Slice B manual speaker mapping and multi-speaker render"
---

# Dubbing Pro Slice B — Validation

## Approved Scope

The user approved the manual-only slice on 2026-10-20: speaker assignment for
each transcript segment, mapping used speakers to existing voice profiles, and
rendering from the completed analyze job. Automatic diarization, text editing,
clip export, and short voice-over remain out of scope.

## Implementation

- Added `POST /dubbing/render`, which accepts an analyze job ID plus segment to
  speaker and speaker to voice mappings. It reads transcript text and timing
  from the persisted analyze result and does not call ASR again.
- The route validates job kind/status, source availability, timestamped
  segments, complete unique assignments, exact used-speaker mappings, and
  existing voice files before starting a `dubbing-render` job.
- The render pipeline synthesizes each segment with its assigned voice,
  time-fits and mixes the clips, writes SRT/VTT, and attempts video mux using
  the existing helper.
- Transcript UI defaults all segments to Speaker A, supports additional and
  renamed speakers, per-segment assignment, per-speaker voice mapping, and
  local mapping persistence by analyze job ID. Render is disabled for stale
  transcripts or incomplete mappings.
- The existing single-speaker `POST /dubbing` path is unchanged.

## Verification Results

| Check | Result | Evidence / limit |
|---|---|---|
| TypeScript | PASS | `node node_modules/typescript/bin/tsc --noEmit` |
| Desktop production build | PASS | Vite 6.4.3; 275 modules transformed |
| Desktop tests | PASS | Vitest: 25 files, 197 tests passed, including speaker assignment/render UI coverage |
| Python syntax | PASS | `py_compile` for changed API modules and new API test source, using Python 3.14.7 |
| API pytest | NOT RUN | This checkout has no Python 3.11 environment or `pytest`; Python 3.11 is the repository runtime target |
| Live ASR/TTS and GPU render | NOT RUN | Requires local speech runtime, usable audio, and voice profiles |
| Native Tauri UI/UAT | NOT RUN | Build evidence does not establish visible desktop behavior or audio playback |

The npm `build` script could not locate `tsc` through `.bin` in this worktree;
the TypeScript and Vite entrypoints were run directly and both passed.

## Review Notes

- `apps/api/tests/test_dubbing_render.py` covers mapping validation, analyze
  reuse, output traceability, and per-segment voice selection. Its runtime
  assertions remain pending the Python 3.11 test environment.
- No real audio quality, diarization, GPU, or native desktop claim is made.
