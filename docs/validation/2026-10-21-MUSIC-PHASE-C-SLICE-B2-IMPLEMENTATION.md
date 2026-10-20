# Music Phase C — Slice B2 Implementation Evidence

**Date:** 2026-10-21
**Status:** Implementation candidate; PR review and exact-head hosted CI pending

## Scope delivered

- Drift analysis separates constant phase correction from local residuals and
  reports `in_sync`, `watch`, `drift_detected`, `insufficient_evidence`, or
  `warp_limited`.
- Local warp maps use overlapping windows, monotone anchors, a ±3% local-stretch
  limit, two-bar minimum segments, and pitch-preserving time stretch.
- The preview API stores immutable, fingerprinted revisions for 30 minutes.
  Manual anchor edits create a new revision; stale revisions and changed source,
  beat, or render settings are rejected.
- The desktop Remix panel shows a transient timeline overlay and lets the user
  compare global-only and candidate audio before explicitly rendering. The
  existing direct remix route remains global-only by default.

## Local verification

| Check | Result | What it establishes |
|---|---|---|
| `pytest apps/api/tests/test_music_warp.py apps/api/tests/test_music_preview_contract.py apps/api/tests/test_music_preview_store.py -q` | **17 passed** | Synthetic drift/status/guardrail/map-residual checks, preview revision and byte-parity contract, stale input/revision and expiry behavior |
| Full `pytest apps/api/tests -q` suite | **Passed** | Existing API tests and new preview/warp tests |
| `npm run build:node` | **Passed** | Contracts, MCP, TypeScript, and Vite desktop production builds |
| `npm test` in `apps/desktop` | **199 passed (25 files)** | Existing desktop unit/component suite |
| Python 3.11 `compileall` over `apps/api/app` | **Passed** | API module syntax compilation |
| `git diff --check` | **Passed** | No whitespace errors in the candidate diff |
| Piecewise audio smoke fixture | **Passed** | 2-channel 440/441 Hz, 6 s input produced finite continuous output at the expected 6.03 s duration; this is a signal-processing smoke check, not listening acceptance |
| `npm run check:tauri` | **Blocked by local setup** | The generated backend sidecar is absent in this checkout. The merged PR workflow builds the sidecar before running this check; exact-head hosted CI remains authoritative. |

## Audio A/B suitability check

The Downloads folder contains `B.mp3`, `sample.mp3`, and `test01.mp3`. Their
metadata names `freshair129` and describes Suno creation, but does not establish
the exact license or identify a vocal/instrumental pair. Estimated BPM values
were 172.27, 147.66, and 136.00. Normalized onset-phase correlations for the
checked adjacent pairs were 0.012 and 0.029, consistent with unrelated
arrangements. They are not suitable evidence for vocal-versus-beat listening.

**Licensed-vocal A/B remains pending.** No perceptual-quality or commercial
rights claim is made from these files or from the synthetic tests.

## Acceptance gates

| Gate | Status | Evidence / remaining work |
|---|---|---|
| Synthetic zero drift, ±0.5%/±2% gradual drift, local tempo step, dropped beat, low confidence, and >3% guardrail | **Passed locally** | `test_music_warp.py` |
| Thresholds and status behavior | **Passed locally** | Drift is gated by confidence, anchor count, span, residual/end drift, and adjacent windows |
| Candidate anchor map reduces synthetic p95 beat residual to ≤25 ms | **Passed locally** | Parameterized ±0.5%/±2% fixtures |
| Preview audio / map revision / final output identity, stale rejection, expiry | **Passed at API contract level** | Fake-render API tests assert final output bytes equal the selected preview bytes |
| Existing global-only/manual-offset behavior | **Partial: code and route contract only** | Legacy request path test passes; no real matched-audio render/listen run |
| Licensed-vocal A/B listening | **Pending** | Need an identified, rights-cleared vocal and matching instrumental beat |
| Native desktop timeline, audition, and accepted-render UAT | **Pending** | Production build passed; packaged UI interaction has not been exercised |
| Exact-head hosted CI and independent PR review | **Pending** | Run and inspect after PR creation |

## Limits

Local tests and a frontend build do not prove packaged desktop behavior, musical
quality, or a successful exact-head hosted validation. Keep these gates open
until their corresponding evidence is available.
