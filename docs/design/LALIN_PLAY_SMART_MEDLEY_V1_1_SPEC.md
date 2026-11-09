---
version: "0.2.0b"
created_at: "2026-11-09T10:00:00+07:00,Claude"
last_update: "2026-11-09T10:00:00+07:00,Claude"
status: "approved (owner, 2026-11-09)"
superseded_by: null
attributes:
  domain: "lalin-play"
  doc_type: "implementation-spec"
  scope: "PLAY-27 Smart Medley for Lalin Play v1.1: UI integration behind an Experimental setting and a reduced, owner-approved evidence contract"
---

# Lalin Play v1.1 — Smart Medley (PLAY-27)

## 1. Status and authority

- Owner decisions in the lead session on 2026-11-09: (a) wire the existing native analyzer into playback as an **Experimental** setting that is off by default; (b) replace the heavy W0-F v0.6.9 evidence protocol with a **reduced evidence contract** for v1.1 (Hyper-V minimum profile, synthetic + Creative Commons fixture, owner as sole listener) while keeping the owner-accepted performance and false-positive thresholds.
- Unchanged and still binding from W0-F v0.6.9 (`E:\lalin-cr008-contract-drafts\20261020-v1\W0-DEF-v0.6.9-draft.md`): inputs/exclusions, deterministic scoring formula, eligibility floors (BPM ≥0.80, key ≥0.75, cue ≥0.80, tempo ratio ≤1.03, score ≥0.70), fallback rules, H2 performance targets and the rule that the score is compatibility, not quality. PRD PLAY-27 stays as written: no beat-perfect, sample-accurate or gapless claims.
- Current code state (verified 2026-11-09 on `main` `ae52e4f`): `smart_medley.rs`, `smart_medley_store.rs` and the `analyze_smart_medley_pair` Tauri command exist; 15 unit + 3 integration Rust tests pass. The frontend never calls the command. The traceability note about two failing tests is stale.

## 2. Product behaviour

### 2.1 Experimental gate

- New persisted setting `experimental.smartMedley` (boolean, default `false`), stored with the other Play settings, shown in Settings under an "Experimental" heading with a one-line explanation.
- While `false`, the transition mode list does not offer Smart Medley. If a persisted transition mode is `smart` while the gate is `false` (downgrade or manual edit), load it as `smooth`.
- No other existing mode changes behaviour.

### 2.2 Transition mode `smart`

- Add `"smart"` to `PlaybackTransitionMode`. It reuses the Smooth crossfade duration setting and the same single-output equal-power crossfade path as `smooth`/`medley`.
- **Pair prefetch:** when the current item starts playing in `smart` mode (and when the queue, the next item, repeat/shuffle target or the user cues change), resolve the immediate next occurrence with the same rule as Smooth (`nextSmoothQueueIndex`) and call `analyze_smart_medley_pair(currentId, nextId, smoothEnabled=true, currentUserCues, nextUserCues)`. Only one analysis request may be in flight; a newer pair key supersedes an older one, and late results for a stale key are discarded. Key = `currentEntryId:nextEntryId:queueRevision:cueOverrides`.
- **At transition time:** if a fresh decision for the exact pair key exists and `eligible === true` and `mode === "smart-medley"`, start the crossfade so that the outgoing track fades out ending at the decision's `currentCueOutSeconds` (bounded to the duration) and the incoming track starts at `nextCueInSeconds` (bounded as Medley does today). Otherwise (no decision yet, analysis error, `smooth-fallback`, video item, non-library item) behave exactly as `smooth`.
- The analyzer result never reorders or skips the queue, never schedules gain and never advances the queue; the existing transition coordinator stays the only writer of the current item. User cue points set in Medley fields still win (they are passed as overrides).
- Analysis failure or timeout must never stop or interrupt current playback.

### 2.3 Status display

- In the transition settings panel, while mode is `smart`, show one status line for the current→next pair: analysing… / "Smart Medley match (score 0.82)" / "Using smooth crossfade: <reason>". Map the native reason codes (`bpm-confidence-below-0.80`, `key-confidence-below-0.75`, `cue-confidence-below-0.80`, tempo/key/score/unsupported/unreadable/stale) to short ENG/TH strings; unknown codes show a generic fallback string.
- Help text must say the result is an estimate from local BPM/key/cue analysis and may not match the beat. No "beat-perfect", "seamless" or equivalent wording in either language.

### 2.4 Localisation

All new strings exist in English and Thai in `src/i18n.tsx`; ENG remains the default.

## 3. Automated acceptance (code PR)

1. Vitest: gate off hides the option and coerces persisted `smart` to `smooth`; gate on shows it and persists.
2. Vitest (mocked IPC): eligible decision → crossfade uses decision cue-out/cue-in; fallback decision, rejected promise, missing decision and video item → identical behaviour to `smooth`; stale result for an old pair key is ignored; only one request in flight.
3. Vitest: status line renders match/fallback/analysing states in EN and TH; unknown reason uses the generic string.
4. Existing Rust Smart Medley tests and full suites stay green; `npm test`, `npm run build`, `cargo fmt --check`, `cargo test --locked` pass.
5. `docs/validation/LALIN_PLAY_TRACEABILITY.md` PLAY-27 row updated (code + automated evidence; native/evidence NOT_RUN), and the user guide gains a short Experimental section.

## 4. Reduced v1.1 evidence contract (owner-approved 2026-11-09)

Thresholds below are the owner-accepted W0-F values; only the host, fixture size/source and listening panel are reduced.

| Area | v1.1 method | Pass threshold (unchanged) |
|---|---|---|
| Host | Hyper-V VM on the owner PC: Windows 11 (current GA build), 4 vCPU, 8 GiB RAM, no GPU passthrough; record host CPU and that results are VM-measured | — |
| Cold analysis | 30 sequential cold trials on a pinned 180 s 44.1 kHz stereo PCM16 WAV (existing harness, profile check updated for the VM) | p95 ≤15 s, no failed trial |
| Cached lookup | 100 persistent-cache reads after the cold trials | p95 ≤100 ms, every read a hit |
| Memory | Process-tree working set during the 130-call workload vs 60 s idle baseline | incremental peak ≤256 MiB |
| Dropouts | Owner listens through one 15-minute concurrent analysis + playback session on the VM's default endpoint and logs any audible dropout (simplified from WASAPI loopback scoring) | zero analysis-attributable dropouts |
| Fixture | 40 pairs: 20 synthetic pairs generated with known BPM/key/cues (10 expected eligible, 10 expected ineligible by construction) + 20 Creative Commons music pairs labelled by the owner with tool assistance (10 expected eligible, 10 expected ineligible incl. 4 non-music). Manifest with clip hashes, licences and labels frozen before running the analyzer | clear coverage ≥80% of expected-eligible; pair false-positive ≤5% of expected-ineligible (floor rounding); BPM/key/cue false-confidence ≤10/15/10% with ≥20 accepted estimates each, else INSUFFICIENT_SAMPLE |
| Listening | Owner alone, blinded by a script that randomises 8 eligible Smart Medley transitions + 4 Smooth controls and hides their labels; rate 1–5 | ≥6 of 8 eligible rated ≥4; no hard cut, unintended silence, clipping or dropout in any of the 12 |

Evidence lives under `docs/validation/evidence/play-v1.1-smart-medley/` as JSONL plus a README; no user paths or personal data. PLAY-27 may be marked PASS and the Experimental label removed only after every row passes; a failed row keeps the feature Experimental.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.0b | 2026-11-09 | approved | Owner approved the §4 reduced evidence numbers ("อนุมัติตามนี้"); code integration implemented | working tree | Claude |
| 0.1.0b | 2026-11-09 | approved direction; §4 candidate | Smart Medley v1.1 UI integration behind an Experimental gate and a reduced evidence contract | working tree | Claude |
