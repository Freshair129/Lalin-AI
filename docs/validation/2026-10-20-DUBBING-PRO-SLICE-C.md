---
version: "0.1.0b"
created_at: "2026-10-20T00:00:00+07:00,Codex"
last_update: "2026-10-20T00:00:00+07:00,Codex"
status: "Draft PR #30; automated verification passed; live TTS and native UAT pending"
superseded_by: null
attributes:
  domain: "validation"
  doc_type: "implementation-evidence"
  scope: "Dubbing Pro selected clip export and short voice-over Slice C"
---

# Dubbing Pro Slice C — Validation

## Approved Scope

On 2026-10-20 the user approved selected transcript clip export with subtitle
snippets and short voice-over from selected transcript using the existing manual
speaker and voice mapping. Results must support preview, download, and adding
audio to the Dubbing timeline. Transcript editing, automatic diarization, and
social publishing are excluded.

## Implementation

- `POST /dubbing/clips` validates the completed analyze job and selected segment
  IDs, groups only adjacent selected transcript segments, and starts a CPU job.
- Each group is extracted from the original audio/video source as WAV. Its SRT
  and VTT use the original transcript text with timestamps rebased to the clip
  start. Partial files are removed if a group export fails.
- `POST /dubbing/voiceover` accepts selected IDs and the manual Slice B
  speaker/voice mappings. The backend reads text from the stored analyze job,
  validates profile files, and starts a TTS job. It caps selected speech at
  120 seconds, compacts synthesized utterances with short pauses, and writes
  SRT/VTT against the generated audio timing.
- The Transcript panel now supports selecting ranges, exporting clips,
  generating mapped voice-over, previewing and downloading WAV/SRT/VTT, and
  adding each audio output to the shared vocal timeline track.
- Clip jobs are limited to 100 output groups; voice-over input is limited to
  120 seconds of selected transcript speech.
- The legacy single-speaker Dubbing route and controls remain available.

## Verification Results

| Check | Result | Evidence / limit |
|---|---|---|
| Dubbing API tests | PASS — 10 tests | Python 3.11.9; analyze, single/multi-speaker render, clip grouping/validation, voice mapping, subtitle rebasing, and compact voice-over pipeline. ASR/TTS route behavior is mocked. |
| Transcript UI tests | PASS — 6 tests | Selection, export, mapped voice-over, preview/download and timeline actions in `DubbingTranscriptPanel.test.tsx`. |
| Desktop test suite | PASS — 25 files, 199 tests | `npm test`; includes existing unrelated jsdom media-element warnings, with all tests passing. |
| TypeScript and Vite production build | PASS | `npm run build`; Vite transformed 275 modules. |
| FFmpeg clip extraction smoke | PASS | Extracted a 0.75-second range from a generated 2-second WAV using bundled imageio-ffmpeg. |
| Live ASR/TTS and GPU render | NOT RUN | Requires local speech models, a real source recording, and voice profiles. |
| Native Tauri preview / timeline interaction | NOT RUN | Automated component tests and web build do not prove visible desktop playback or native timeline behavior. |

`npm ci` reported 17 dependency audit findings (7 moderate, 7 high, 3 critical)
from the locked dependency set. This Slice C change does not modify the npm lockfile;
the findings were not separately triaged here.
