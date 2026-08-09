# Proposed: Whisper Size, Voice Cloning Profiles, and Agent Voice

## Status

Approved — implementation in progress. Runtime-dependent items remain gated by the full local backend profile.

## Objective

Add selectable Whisper capacity, guided voice cloning profiles, and opt-in spoken agent replies by evolving the existing Voice Library; do not copy the reference product's branding, assets, or exact UI.

## Current Evidence

- `frontend/src/components/VoicesPanel.tsx` can upload a voice reference and list/delete voices, but has no guided profile lifecycle or playback readiness state.
- `backend/app/routers/voices.py` exposes `GET/POST/DELETE /voices` only.
- `frontend/src/components/MicRecorder.tsx` records a microphone input for Timeline use only.
- `backend/app/config.py` fixes ASR to `asr_model=large-v3`; `pipelines/asr.py` caches that model, so safe live switching is not implemented.
- `POST /agent/act` returns the agent text reply and proposed mutations only; it never creates a TTS job.
- The lite sidecar deliberately omits TTS, so spoken replies require the full runtime.

## Proposed Scope

### Phase A — Voice cloning and profiles

- Keep the existing `/voices` upload/list/delete contract as the storage boundary.
- Add a guided creation flow for a file upload or microphone recording, including a visible consent acknowledgement before saving a clone reference.
- Represent a profile with display name, language, reference transcript, source type, duration, created time, and readiness/error status.
- Let the user preview the reference, edit profile metadata, choose a default profile for TTS, and delete a profile with confirmation.
- Reuse the existing F5-TTS zero-shot cloning pipeline; do not introduce a second cloning engine.

### Phase B — Whisper size selector

- Offer a machine-aware ASR profile selector: `Base`, `Small`, `Medium`, `Large-v3`, and `Turbo` when installed.
- Show the selected profile, expected quality/speed trade-off, device mode, and model loading state.
- Change models only between transcription jobs; dispose the cached model before loading a new profile to avoid competing VRAM allocations.
- Persist the selected profile in app configuration and retain `large-v3` as the current default until the owner chooses otherwise.

### Phase C — Agent voice

- Add an `Agent voice` preference that selects a voice profile from the existing Voice Library.
- Add a separate `Speak replies` toggle. It is off by default and no reply is synthesized without it.
- After `/agent/act` returns a reply, create a normal `/tts` job with the selected `voice_id`; show queue/error state and an in-context audio player in Mix Copilot.
- When the full TTS runtime or selected voice is unavailable, keep the agent text reply and show a clear unavailable state instead of falling back silently.

## UX Contract

- Dark G-Music visual system, with no imported product names, logos, screenshots, or exact layouts from the references.
- One clear primary action per state: `Create voice`, `Start recording`, or `Stop recording`.
- All capture controls keyboard accessible, labelled, and at least 44px high.
- Voice cards show a text status in addition to color.
- Recording state remains visible until stopped; errors name the source and recovery action.

## Acceptance Criteria

1. A user can create and manage a consented voice profile from an uploaded clip or microphone recording.
2. A selected profile works with the existing TTS voice cloning path.
3. Whisper profile selection reports model state and applies only before the next ASR job.
4. Agent speech uses the selected voice profile only after explicit opt-in and exposes TTS queue/error/player state.
5. Lite runtime explicitly reports that Agent voice is unavailable rather than failing at runtime.
6. Existing voice upload/list/delete, TTS, ASR, and agent mutation behavior continue to pass their tests.

## Risk and Decision Gate

Risk: **HIGH** because voice cloning stores biometric-like voice references, Whisper switching affects model lifecycle/VRAM, and Agent voice crosses the agent, job, TTS, and audio-playback boundaries.

Approval is required before implementation of Phases A/B/C.
