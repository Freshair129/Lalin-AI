# Music Phase C — Slice B2: Piecewise Beat-Warp Design

| Field | Value |
|---|---|
| Document version | 0.1.0 |
| Status | Implemented in Slice B2 branch; PR review/hosted CI and audio/runtime acceptance remain pending |
| Scope | Piecewise beat-warp, drift detection, and timeline preview contract |
| Depends on | Slice B1 evaluation merged in PR #31; this design merged in PR #32 |

## 1. Decision and scope

This slice defines a guarded, reviewable design for correcting local tempo drift
between a source vocal and a destination beat. It does not change the current
remix pipeline or claim that automatic beat-warp is production-ready.

The proposed behavior keeps global BPM matching and phase/offset as the baseline.
It detects whether the residual timing error changes over the song, proposes a
piecewise correction only when evidence is strong enough, and shows the exact
candidate on the timeline before the user accepts it.

The initial implementation must keep warp opt-in. “Suggest” may analyze and
prepare a candidate, but rendering with that candidate requires explicit user
acceptance. Low-confidence analysis must leave the existing global-sync path
available without silently applying a warp.

Out of scope: arbitrary tempo editing, automatic musical arrangement, changing
pitch, changing the current default remix path, persistent warp editing for every
timeline clip, and implementing the algorithm in this design slice.

## 2. Current behavior and constraints

- `apps/api/app/pipelines/music.py::run_remix` estimates one BPM per input,
  globally time-stretches the vocal, then applies one global offset and phrase
  start. It does not estimate a tempo map or local drift.
- Phrase offset in the backend is computed as
  `phrase_bars * beats_per_bar * 60 / target_bpm` with four beats per bar today.
- `apps/desktop/src/components/RemixPanel.tsx` currently previews phrase offset
  as `phraseBars * 2` seconds, which assumes 4/4 at exactly 120 BPM; auto-sync
  preview also uses zero offset before the job returns. This is not guaranteed
  to match the render. Slice B2 must remove that independent timing estimate and
  display the backend analysis result as the canonical preview.
- The timeline `Clip` model stores asset, start, duration, source offset, gain,
  mute, color, and fades. It has no warp map. The preview therefore needs a
  transient overlay and must not pretend that a plain clip currently supports
  piecewise playback.
- The default global-only remix path and the existing `offset_ms` meaning remain
  available for regression safety.

## 3. Time coordinates and warp model

Use seconds as floating-point values in JSON, with sample-accurate conversion at
render time. All timeline times are relative to the start of the destination
beat. Phrase offset uses the destination BPM and beats-per-bar value. V1 treats
a beat as a quarter-note beat; it does not infer meter. `beats_per_bar` defaults
to four to preserve current behavior and may be supplied from an explicit
project/user setting.

Definitions:

- `input_time_sec`: time in the vocal after global BPM stretch and leading-silence
  trim, before local beat-warp.
- `timeline_time_sec`: destination timeline time for that input point.
- `phase_offset_ms`: chosen global phase. In auto mode it is the robust global
  alignment estimate; in manual mode it is the user's current offset.
- `phrase_offset_sec`: `phrase_bars * beats_per_bar * 60 / target_bpm`.
- `local_correction_sec`: zero-centred local correction inferred from drift.

The v1 candidate map is a monotone, piecewise-linear mapping:

```text
T(input_time) = input_time + phase_offset + phrase_offset
                + interpolate(local_correction, input_time)
```

The destination beat is the fixed timing reference; only the vocal is warped.
Each anchor is `(input_time_sec, timeline_time_sec)`. Between adjacent anchors,
the duration ratio is `delta_timeline / delta_input`. Both anchor coordinates
must increase strictly. The local correction is zero-centred so a constant phase
error is handled by the global offset and is not mislabeled as tempo drift.
Residual sign is `target_time - baseline_time`: positive moves that anchor later;
negative moves it earlier. Preserve the estimated phrase/beat-index pairing when
advancing through anchors. Do not insert or remove beats to force a match; an
ambiguous index pairing lowers confidence and blocks automatic warp.

Warping must be continuous at anchors. The renderer must use one continuous
time-map/time-stretch operation or overlap adjacent processing windows; it must
not cut the vocal at each marker and splice hard boundaries.

## 4. Drift analysis and decision rules

### 4.1 Analysis outline

1. Decode both inputs and estimate beat-time sequences and confidence for the
   source and destination. Keep a source-time mapping through vocal separation,
   global stretch, and leading-silence trim.
2. Apply the existing global tempo ratio and selected phrase/phase start to get
   the baseline map. Use the source and destination beat indices to compare local
   beat timing; do not compare singer consonants as if every syllable were a
   beat.
3. Collect local alignment residuals in overlapping four-bar windows, advancing
   two bars at a time. A full window requires eight reliable beat observations.
4. For reliable anchors, calculate `residual_i = target_time_i -
   baseline_time_i`. Subtract the median residual before calculating drift so a
   constant nudge remains a phase adjustment.
5. Fit the candidate map through robust window medians. Preserve bar/beat order,
   report confidence per anchor, and calculate the local duration ratio for every
   segment.

The window and hop values are starting defaults, not learned constants. The
implementation may tune them against licensed audio while keeping the result
visible in the report and contract.

### 4.2 Metrics and statuses

Return at least:

- `confidence`: minimum of source-grid, destination-grid, and alignment
  confidence over the anchors used (0–1; do not hide a weak component in an
  average).
- `anchor_count` and `span_bars`.
- `residual_p95_ms`: 95th percentile absolute zero-centred residual.
- `end_drift_ms`: final minus first zero-centred residual.
- `max_abs_drift_ms`.
- `max_local_stretch_pct`: largest absolute deviation of local duration ratio
  from 1.0.

Provisional classification thresholds, to be calibrated before release:

| Status | Rule | User action |
|---|---|---|
| `in_sync` | At least 3 reliable anchors over 8 bars, confidence ≥0.70, p95 ≤20 ms, and end drift ≤30 ms | Keep global sync; no warp suggested |
| `watch` | Same minimum evidence, with p95 >20 ms or absolute end drift >30 ms, but below the detection rule | Show the residual curve; leave warp off |
| `drift_detected` | Confidence ≥0.70, at least 3 anchors over 8 bars, and p95 ≥30 ms or absolute end drift ≥50 ms; additionally, two adjacent reliable window anchors each have absolute `drift_ms` ≥20 ms | Offer a candidate; require explicit acceptance |
| `insufficient_evidence` | Too few anchors, span <8 bars, confidence <0.70, or ambiguous beat-index pairing | Do not generate/apply automatic warp; offer global/manual offset |
| `warp_limited` | Drift is detected but a segment would exceed the local stretch guardrail | Show the candidate as blocked; require manual review or remain global-only |

A single isolated residual above 100 ms raises a local-alignment warning, not an
automatic warp decision. It may be a missed beat, a fill, or a source/target
arrangement mismatch.

### 4.3 Warp guardrails

- v1 local duration ratio must remain within `0.97..1.03` (±3%) for each segment.
- A segment shorter than two bars cannot be warped automatically.
- Non-monotone anchors, missing beat indices, insufficient confidence, or a
  guardrail violation block automatic application.
- Editing a blocked candidate is allowed only as a manual override that remains
  monotone and within the same ratio guardrail. The UI must show why it is
  blocked.
- These are provisional limits. A licensed-vocal evaluation must confirm them;
  the UI must not describe them as perceptual guarantees.

## 5. Timeline preview contract

The timeline shows a transient **preview overlay**, separate from the saved
`Project`/`Clip` model and its undo history:

- Beat lane remains the timing reference.
- Vocal lane displays the baseline waveform and proposed warped boundary/anchor
  markers, with a residual/drift trace. Markers expose input time, destination
  time, drift in milliseconds, confidence, and whether the anchor is automatic
  or manually moved.
- Global offset and phrase start are shown separately from local correction.
- The user can switch between `Global only` and `Warp candidate`, audition the
  same selected loop/region, and explicitly accept or reject the candidate.
- Dragging an anchor increments the preview revision. Old preview audio becomes
  stale and cannot be rendered until regenerated.
- Changing source, beat, BPM/phrase settings, global offset, or anchor values
  invalidates the current analysis and preview audio.
- A preview is not an applied project edit. Only a completed render added as an
  output asset/clip may enter the project and undo history. Until actual warped
  audio is ready, the UI labels the visualization “alignment only” and does not
  audition unwarped audio as if it were the candidate.

### 5.1 Implemented versioned payloads

The implemented submit route is `POST /music/remix/preview`. It is an asynchronous
analysis/render job using the existing job and WebSocket progress pattern. The
request and result schemas live in `apps/api/app/schemas.py` and
`apps/api/app/routers/music.py`.

Request:

```json
{
  "contract_version": 1,
  "source_audio": "uploaded-source.wav",
  "beat_audio": "uploaded-beat.wav",
  "phrase_bars": 0,
  "beats_per_bar": 4,
  "offset_mode": "auto",
  "offset_ms": null,
  "warp_mode": "suggest",
  "window_bars": 4,
  "hop_bars": 2,
  "render_settings": {
    "target_lufs": -14.0,
    "do_autotune": true,
    "autotune_strength": 1.0,
    "key_override": null,
    "do_fx": true,
    "reverb": 0.16,
    "delay": 0.12,
    "stem_gains": null
  },
  "preview_id": null,
  "base_revision": null,
  "anchors": []
}
```

`offset_mode` is `auto` or `manual`; manual requires a finite `offset_ms`.
`beats_per_bar` defaults to 4 to match current behavior; v1 does not infer meter.
The UI may pass an explicitly selected project meter. `window_bars` and
`hop_bars` must be positive integers, with `hop_bars < window_bars`.
`render_settings` carries the existing remix recipe fields so the global-only
and candidate previews use the same processing as the final job. Its fingerprint
and all alignment fields must match when the preview is consumed by `/music/remix`.
`warp_mode` is `off`, `suggest`, or `manual`. `off` returns drift diagnostics but
never creates a candidate. `suggest` returns a candidate only when drift is
detected and all confidence/guardrails pass; otherwise the candidate URL is null
and diagnostics explain why.
`manual` requires `preview_id`, `base_revision`, and the edited `anchors` from
that preview; the server validates their fingerprints and bounds.

The submit response returns `{ "job_id": "...", "preview_id": "...", "revision": 1 }`.
The finished job returns:

```json
{
  "contract_version": 1,
  "preview_id": "...",
  "revision": 1,
  "state": "ready",
  "source_fingerprint": "sha256:...",
  "beat_fingerprint": "sha256:...",
  "settings_fingerprint": "sha256:...",
  "baseline": {
    "source_bpm": 100.0,
    "target_bpm": 120.0,
    "global_stretch_rate": 1.2,
    "beats_per_bar": 4,
    "phrase_bars": 0,
    "phase_offset_ms": 12.0,
    "phrase_offset_sec": 0.0
  },
  "drift": {
    "status": "drift_detected",
    "confidence": 0.78,
    "anchor_count": 5,
    "span_bars": 8,
    "residual_p95_ms": 55.0,
    "end_drift_ms": -51.0,
    "max_abs_drift_ms": 61.0,
    "max_local_stretch_pct": 0.5
  },
  "anchors": [
    {
      "id": "a1",
      "input_time_sec": 2.0,
      "timeline_time_sec": 2.002,
      "drift_ms": -10.0,
      "confidence": 0.91,
      "origin": "auto"
    },
    {
      "id": "a2",
      "input_time_sec": 6.0,
      "timeline_time_sec": 5.992,
      "drift_ms": -20.0,
      "confidence": 0.88,
      "origin": "auto"
    },
    {
      "id": "a3",
      "input_time_sec": 10.0,
      "timeline_time_sec": 9.972,
      "drift_ms": -40.0,
      "confidence": 0.84,
      "origin": "auto"
    },
    {
      "id": "a4",
      "input_time_sec": 14.0,
      "timeline_time_sec": 13.957,
      "drift_ms": -55.0,
      "confidence": 0.82,
      "origin": "auto"
    },
    {
      "id": "a5",
      "input_time_sec": 18.0,
      "timeline_time_sec": 17.951,
      "drift_ms": -61.0,
      "confidence": 0.78,
      "origin": "auto"
    }
  ],
  "warp_candidate": { "accepted": false, "map_version": 1 },
  "timeline_preview": {
    "time_base": "destination_seconds",
    "mode": "transient_overlay",
    "source_asset_id": "...",
    "beat_asset_id": "...",
    "anchor_ids": ["a1", "a2", "a3", "a4", "a5"],
    "drift_status": "drift_detected"
  },
  "audio_preview": {
    "global_only_url": "/files/preview/global/...",
    "warp_candidate_url": "/files/preview/warp/...",
    "temporary": true,
    "expires_at": "..."
  },
  "warnings": []
}
```

The example is illustrative; real responses include every anchor and the actual
fingerprints. `timeline_preview` contains IDs into the same response and is the
transient overlay contract; it does not create or mutate a saved `Clip`.
`audio_preview` provides A/B audition mixes for global-only and the exact returned
map. The candidate URL is null when no valid candidate exists. Expiry is explicit.
The preview endpoint must not add either temporary asset to the user's library or
saved project.

To render a candidate, `/music/remix` accepts `preview_id` and `revision` (or an
equivalent immutable map digest). The server verifies source/beat fingerprints
and the render-settings fingerprint. A mismatch returns `stale_warp_preview`; it never
silently recomputes a different map. Progress and final output continue to use
the existing job contract. The final job result includes the applied
`preview_id`, `revision`, and map digest so preview/render parity is auditable.

### 5.2 Errors and lifecycle

- `insufficient_evidence`: diagnostics are available, no candidate is applied.
- `warp_limited`: candidate exceeds a guardrail and is blocked.
- `stale_warp_preview`: input or setting fingerprint no longer matches.
- `preview_expired`: temporary preview audio has expired and must be regenerated.
- `invalid_warp_map`: manual anchors are non-monotone, out of range, or outside
  the guardrail.

Changing any source, beat, offset/phrase value, BPM/time signature, or anchor
revision invalidates both audio preview and render eligibility. Completed render
files remain ordinary output assets under the current project lifecycle.

## 6. Implementation acceptance gates

Gate status for the Slice B2 implementation is recorded in
[`2026-10-21-MUSIC-PHASE-C-SLICE-B2-IMPLEMENTATION.md`](../validation/2026-10-21-MUSIC-PHASE-C-SLICE-B2-IMPLEMENTATION.md).

1. **Synthetic algorithm coverage:** deterministic synthetic beat grids with zero drift, gradual ±0.5% drift,
   gradual ±2% drift, local tempo steps, dropped/ambiguous beats, and weak onset
   confidence exercise every status and guardrail.
2. **Status and threshold behavior:** zero-drift fixtures do not produce an automatic warp. Drift above the
   provisional threshold over at least eight bars is detected when confidence
   meets the threshold; low-confidence fixtures never auto-warp.
3. **Map quality on synthetic fixtures:** accepted maps are monotone, stay within the local stretch guardrail, and
   reduce p95 anchor residual to ≤25 ms on the synthetic fixtures.
4. **Preview/render identity:** preview audio, the timeline marker map, and the final render use the same
   immutable map digest. Stale plans and expired preview audio are rejected.
5. **Real-vocal A/B (pending):** audio A/B uses licensed vocals and includes listen review at representative
   phrase boundaries. Synthetic tests alone do not establish musical quality.
6. **Legacy route (code-level only):** existing global-only and manual-offset remixes retain their previous behavior
   when `warp_mode` is off or no plan is supplied.

7. **Native desktop UAT (pending):** verify the transient timeline overlay, A/B audition, stale-preview invalidation, and accepted-render result in the packaged desktop app.

## 7. Next-step boundary

Slice B2 implementation is in progress for code review. Synthetic checks and
preview byte-parity tests are implemented; licensed-vocal A/B and native desktop
UAT remain open. These are product-quality gates and must not be inferred from
CI or synthetic fixtures. Once those gates are reviewed, select the next slice
from the execution backlog rather than expanding this implementation's scope.

## References in this repository

- `apps/api/app/pipelines/music.py` — global BPM stretch, phase offset, and
  phrase offset behavior.
- `apps/desktop/src/components/RemixPanel.tsx` — current offset preview and
  Remix UI state.
- `apps/desktop/src/timeline/clipModel.ts` — persisted clip fields; no warp map
  is currently defined.
- `docs/validation/2026-10-20-MUSIC-PHASE-C-SLICE-B1.md` — prior pitch-shift
  benchmark; it is separate from beat-warp quality evidence.

### Drift-aware alignment confidence remediation (2026-10-29)

A single whole-track onset correlation assumes a constant lag and can reject a
matching pair precisely when its lag varies over time. Keep that existing score
and add a conservative fallback: compare source and destination onset envelopes
following the paired beat grids, using a lower-quartile score over multiple
windows after removing the average beat-phase pattern, so a shared regular
pulse alone does not establish correspondence. This fallback applies only when
the global BPM ratio differs by at most 1%; other ratios retain the existing
confidence path. Require sufficient beat span, reject missing or ambiguous beat
pairs, and preserve the existing beat-strength, stretch, and duration guardrails.
The fallback assesses correspondence; it does not accept or render a map by
itself. Validate matching drifted and in-sync signals, unrelated or silent
signals, missing beats, and the rights-cleared audio pair. Human listening remains
separate from automated detection and candidate generation.

Local validation on 2026-10-29 used the CC BY 3.0 “One Cute Leash”
source mix and matching instrumental by Geoff Peters. The instrumental was
modified with a sinusoidal timing offset of up to 120 ms over a 60-second
period; it is a controlled drift fixture, not naturally recorded drift. The
real Demucs/API job returned `drift_detected`, confidence 0.71818, residual
p95 127.71 ms, and an automatic candidate with 33 anchors and maximum local
stretch 1.25%. Both preview mixes were saved locally for listening. This does
not establish perceptual quality, performance on other songs, or native desktop
acceptance. Synthetic tests also reject unrelated same-tempo onset patterns,
silence, and a missing beat. Source and attribution:
https://ccmixter.org/files/geoffpeters/58766 (CC BY 3.0).
