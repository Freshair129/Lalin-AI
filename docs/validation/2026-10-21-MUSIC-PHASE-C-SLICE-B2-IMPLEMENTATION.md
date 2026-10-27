# Music Phase C — Slice B2 Implementation Evidence

**Implementation merged:** 2026-10-27, PR #35 (`eed358ef2addac99e7faa8b39f27a9f12935024a`)
**Status:** Synthetic native desktop UAT passed; licensed-vocal A/B remains pending

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

## Post-merge native desktop UAT (2026-10-27)

The native Tauri window was exercised against the local API harness using
72-second synthetic source and beat fixtures. Stem separation was replaced by
a deterministic fixture adapter, so this verifies the timeline/preview/render
interaction and warp path without claiming live Demucs or real-vocal quality.

- Drift preview reported `insufficient_evidence` at confidence 0.6874 with 7
  anchors and 12 bars; p95 beat residual was 23.22 ms, end drift was about
  0 ms, and maximum local stretch was 0.2907%.
- Moving anchor `a4` by 30 ms created manual revision 2 and an available warp
  candidate.
- Global-only and candidate previews were auditioned in the desktop window.
  Accept/render job `4e1e538f10f` completed with `warp_applied=true`.
- The stereo 44.1 kHz, 72-second output matched the selected preview exactly
  (SHA-256 `8E5B0A17B4B62AC3CBEF04484EE61987D40C87106F4F6FC50F36E590596EFB3C`).

This closes the synthetic native interaction gate only. Licensed-vocal A/B
listening and rights verification remain open.

## Acceptance gates

| Gate | Status | Evidence / remaining work |
|---|---|---|
| Synthetic zero drift, ±0.5%/±2% gradual drift, local tempo step, dropped beat, low confidence, and >3% guardrail | **Passed locally** | `test_music_warp.py` |
| Thresholds and status behavior | **Passed locally** | Drift is gated by confidence, anchor count, span, residual/end drift, and adjacent windows |
| Candidate anchor map reduces synthetic p95 beat residual to ≤25 ms | **Passed locally** | Parameterized ±0.5%/±2% fixtures |
| Preview audio / map revision / final output identity, stale rejection, expiry | **Passed at API contract level** | Fake-render API tests assert final output bytes equal the selected preview bytes |
| Existing global-only/manual-offset behavior | **Partial: code and route contract only** | Legacy request path test passes; no real matched-audio render/listen run |
| Licensed-vocal A/B listening | **Pending** | Need an identified, rights-cleared vocal and matching instrumental beat |
| Native desktop timeline, audition, and accepted-render UAT | **Passed with synthetic fixtures** | Native Tauri window; local API harness with mocked stem separation; see post-merge UAT above |
| Exact-head hosted CI | **Passed** | PR #35 check run `40421277513`; merged at `eed358ef2addac99e7faa8b39f27a9f12935024a` |
| Independent PR review | **No review submission recorded** | PR #35 merged; no submitted review or inline review thread was recorded |

## Limits

Local tests, hosted CI, and synthetic desktop interaction do not prove
licensed-vocal musical quality or commercial rights. Keep licensed-vocal A/B
open until a rights-cleared, matched vocal and instrumental beat are available
for listening.
