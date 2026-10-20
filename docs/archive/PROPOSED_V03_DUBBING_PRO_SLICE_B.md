---
version: "0.1.0b"
created_at: "2026-10-20T00:00:00+07:00,Codex"
last_update: "2026-10-20T00:00:00+07:00,Codex"
status: "approved; implementation in branch"
superseded_by: null
attributes:
  doc_type: "feature-spec"
  domain: "dubbing"
  scope: "Dubbing Pro Slice B — manual speaker mapping and multi-speaker render"
---

# Dubbing Pro Slice B — Manual Speaker Mapping

## Approval

The user approved this scope on 2026-10-20 as **manual-only**. The approval
covers speaker assignment per transcript segment, voice mapping per speaker,
and multi-speaker rendering from the existing transcript analysis result.

## Goal

Let a user review an analyzed transcript, assign each segment to a speaker,
select an existing voice profile for each used speaker, and render the complete
transcript in one job without running ASR again.

## In Scope

- Default every new transcript segment to `Speaker A`.
- Add and rename speaker slots; assign a slot to each segment.
- Map each speaker used by the transcript to an existing voice profile.
- Persist the local assignment/map by analyze job ID.
- Add `POST /dubbing/render`, backed by the completed analyze job result.
- Translate when requested, synthesize each segment with its speaker's voice,
  fit the audio to its original timestamps, mix on the source timeline, and
  return downloadable WAV/SRT/VTT (plus video mux where supported).
- Preserve the existing single-speaker `POST /dubbing` quick flow.

## Out of Scope

- Automatic speaker detection or diarization dependencies.
- Transcript text edits, segment split/merge, or timing edits.
- Clip export and short voice-over.
- New voice profiles or changes to voice rights/consent flows.

## API Contract

`POST /dubbing/render` request:

```json
{
  "analysis_job_id": "job_xxx",
  "segment_speakers": [
    { "segment_id": "seg_000001", "speaker_id": "spk_a" }
  ],
  "speaker_voices": [
    { "speaker_id": "spk_a", "voice_id": "voice_xxx" }
  ],
  "target_lang": "ไทย",
  "translate": true
}
```

Response is `{ "job_id": "..." }`; the render result is stored on the
`dubbing-render` job with source/analyze-job IDs, speaker-to-voice map, rendered
segment IDs, and output artifact names. The backend reads source, language,
timestamps, and text from the completed `dubbing-analyze` job. The client does
not submit transcript text or times. Missing/duplicate segment assignments and
missing/unresolvable voice mappings are rejected before the job starts.

## Acceptance Criteria

- Every non-empty segment can be assigned to one manually-created speaker slot.
- Every used speaker must have an existing voice profile before render starts.
- A completed analyze transcript renders without a second ASR run.
- Each rendered segment uses the voice mapped to its assigned speaker.
- Existing single-speaker dubbing remains available and unchanged.
- Stale transcript results cannot be mapped or rendered for a different source.
- Render progress and artifacts use the existing job/WebSocket and output flows.

## Verification

- Validate the API contract and failure cases for wrong job kind/status,
  incomplete assignments, duplicate IDs, and unavailable voices.
- Build the desktop application and compile the API modules.
- Keep live ASR/TTS quality, GPU behavior, and native desktop UAT separate from
  compile/build evidence.
