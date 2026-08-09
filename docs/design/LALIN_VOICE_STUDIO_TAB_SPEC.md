---
version: "0.1.2b"
created_at: "2026-07-21T00:00:00+07:00,ATHER,uncommitted"
last_update: "2026-07-21T00:00:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "product-ui"
  doc_type: "tab-layout-spec"
  scope: "Lalin Studio Voice Studio desktop"
---

# Lalin Studio Voice Studio Tab Specification

**Status:** approved design baseline; initial implementation in progress.  
**Parent shell:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md)  
**Approved visual:** `docs/design/reference/lalin/LALIN_VOICE_STUDIO_V1_APPROVED.png`.

## Purpose

Voice Studio is the single destination for voice profiles, text-to-speech, and
Agent Voice preferences. It makes consent and source provenance visible before
a voice can be used for synthesis or an agent.

## Stage map

```
M0/H1/R1/F1 inherited unchanged from W0
S1           V1 profile browser | V2 profile/work tabs | V3 context inspector
```

| ID | Region | Desktop rule |
|---|---|---|
| `V1` | Voice profile browser | searchable profile list with name, language, source, consent, and readiness. Create Profile is visible. |
| `V2` | Work surface | tabs: Profile, Text to speech, Agent Voice. The selected tab owns its editable task. |
| `V3` | Context inspector | profile settings and synthesis parameters; collapsible, never hides consent/readiness. |

## Tab rules

- **Profile:** preview, source/provenance, consent status, reference transcript,
  language, edit/delete actions.
- **Text to speech:** selected profile, text input, compact options, Generate
  audio as the one primary action, output/player state.
- **Agent Voice:** selected profile plus explicit Speak replies opt-in and
  runtime availability. Text replies remain available if speech is unavailable.

## Interaction rules

- Create Profile uses file or microphone source, then consent, reference text,
  validation, and save. A profile cannot be marked ready without consent.
- Delete is destructive and requires confirmation; editing profile metadata does
  not silently overwrite an audio reference.
- A running generation is visible in F1 and links to Jobs/activity details.

## Acceptance checks

- W0 shell dimensions and rail order are unchanged.
- Consent, source, language, and readiness are visible for the selected
  profile without opening an overflow menu.
- TTS has one visible primary Generate action.
- Agent Voice exposes opt-in and unavailable reasons, rather than silently
  falling back to speech.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.2b | 2026-07-22 | beta | Unified Profile, Text to Speech, and Agent Voice work tabs with explicit speak opt-in. | uncommitted | ATHER |
| 0.1.1b | 2026-07-21 | beta | Voice Studio v1 visual baseline approved; implementation pending. | uncommitted | ATHER |
| 0.1.0b | 2026-07-21 | superseded | First Voice Studio design spec under approved W0 shell, pending visual approval. | uncommitted | ATHER |
