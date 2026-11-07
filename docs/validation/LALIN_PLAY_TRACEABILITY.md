---
version: "0.3.7b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-11-07T00:00:00+07:00,Claude"
status: "beta"
superseded_by: null
attributes:
  domain: "validation"
  doc_type: "traceability-matrix"
  scope: "All 50 PLAY-01..27, PLAY-V01..10 and PLAY-C01..13 criteria with bounded local evidence"
---

# Lalin Play — requirements, implementation and evidence

Historical rows retain evidence tied to source `f5a6681`; CR-006 rows below record
the current working-tree build and automated tests only, not a native/audio run. Requirement
owners: [PRD](../product/PRD.md), [CR-003](../product/CR-003--LALIN_PLAY_LOCAL_VIDEO.md),
[CR-004](../product/CR-004--LALIN_PLAY_MINIMAL_COMPACT_PREVIEW.md).
The legacy [Studio matrix](../appendices/D-traceability.md) links here; Studio
window/TV evidence is not proof of standalone IPC, devices or release.

Status meanings: **LOCAL PASS** = bounded fixture evidence; **PARTIAL** = code
or some checks exist, whole criterion not closed; **NOT_IMPLEMENTED** = required
behavior absent; **NOT_RUN** = no runtime qualification evidence. No row below
promotes the entire product to release-ready. An alias expands via the tables.

## Code and test map

Paths below are under `apps/play-desktop/` unless otherwise stated.

| Alias | Implementation | Automated tests / evidence scope |
|---|---|---|
| UI | `src/App.tsx`, `src/native.ts`, `src/i18n.tsx`, `src/styles.css`, `src/components/Transport.tsx` | `src/App.test.tsx`: one element, surface failure, queue/errors, no-autoplay restore, playlists, video/layout/metadata/error, fullscreen IPC, locale and Mixer mocks; CR-007 Dashboard interactions NOT_RUN |
| Owner | `src/playback/audioEngine.ts`, `src/playback/usePlaybackStore.ts`, `src/contracts.ts` | `src/playback/audioEngineState.test.ts` readiness; App Stop-during-resolution test; EQ tests; CR-007 listen threshold checks NOT_RUN |
| Native | `src-tauri/src/lib.rs`, `src-tauri/src/library.rs`, `src-tauri/src/library_store.rs`, `src-tauri/src/local_media_store.rs`, `src-tauri/src/migration.rs`, `src-tauri/src/handoff.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json` | Rust tests: library/catalog, S2 journal/import and drive validation, S3 pipe ACL/FIFO/ACK/STATE and lifecycle decisions; CR-007 Genesis migration tests NOT_RUN |
| Storage / Smart Medley | `src-tauri/src/local_media_store.rs`, `src-tauri/src/smart_medley.rs`, `src-tauri/src/smart_medley_store.rs`, `src-tauri/tests/smart_medley.rs` | Local object store and medley implementation/tests are present; RustFS S3 adapter and authenticated Range streaming are absent; latest 2026-11-07 local Rust result reported 71 passed / 2 failed in Smart Medley, so Rust is not a PASS |
| EQ | `src/components/PlaybackEQPanel.tsx`, `src/playback/audioContext.ts` and Owner | `src/playback/playbackEQ.test.ts`: 10 bands, gain/preamp limits, bypass/presets, graph/volume and output fallback mocks |
| Preview | `src/components/CompactTransport.tsx`, `src/playback/framePreview.ts`, `src/styles.css` | `src/components/CompactTransport.test.tsx`, `src/playback/framePreview.test.ts`: drag/hover, disposal, latest work, cache limit, errors/timeouts, controls |
| Skip | `src/playback/relativeSeek.ts`, CompactTransport and Native | `src/playback/relativeSeek.test.ts`; CompactTransport live-clock/disabled tests; App native ACK/error tests |
| Video | `src/components/VideoStage.tsx`, Owner, UI and Native | App persistent-host/mixed-media tests; Rust kind/backward tests |
| State | `src/playlists.ts`, Owner, `src/components/PlaybackSettings.tsx`, UI | App versioned-playlist/opt-in tests; S2 phase recovery, five child-process termination checkpoints, initial journal, undo-snapshot and retryable history-write failures; power-loss and other storage failures open |
| Migration | Studio `src/playback/playMigrationExport.ts`; standalone `src/playMigration.ts`, `src/playMigrationImport.ts`, `src-tauri/src/migration.rs` | Studio envelope test; standalone schema, preview, cancel, import/rollback, four journal phases, five child-process termination checkpoints, initial journal, undo-snapshot and retryable history-write failures; see [S2 evidence](LALIN_PLAY_S2_MIGRATION.md) |
| Handoff | Studio `apps/desktop/src-tauri/src/playback_handoff.rs`, `apps/desktop/src/playback/playbackClient.ts`; Play `src-tauri/src/handoff.rs`, `src/handoffReceiver.ts` | Isolated Windows paired process passed cold/warm commands, ACK/STATE recovery after a dropped command ACK, same-ID duplicate handling, sequential four-file queue, four independent concurrent senders ordered by ACK revision, busy-pipe wait without cold launch, owner restart after a lost ACK with no blind replay, and live URL/UNC-shaped invalid-path rejection with unchanged STATE; local restricted-token pipe client without the allowed logon SID is denied with `ERROR_ACCESS_DENIED`; loopback and cross-host pipe denial pass; cross-host pipe denial and different-logon-session ACL denial each passed 1/1 in PR #25 (`78ed550`); mapped/reparse runtime tests compile but are NOT_RUN; Studio/API exit during playback and audible parity NOT_VERIFIED |
| TV | `src/playback/tvMode.ts`, `src/playback/mediaSessionAdapter.ts`, UI and Native | `src/playback/tvMode.test.ts` input cleanup/mapping; physical gamepad/SMTC not qualified |
| Mixer | `src/components/PlaybackMixerPanel.tsx`, `src/playback/usePlaybackStore.ts`, `src/contracts.ts` | `src/App.test.tsx` checks real MEDIA/MASTER lanes, fader/mute persistence and EQ shortcut; `src/playback/playbackMixer.test.ts` validates defaults, malformed state and master-volume independence |
| Spatial | `src/playback/audioEngine.ts`, shared EQ/limiter/output graph | `src/playback/audioEngineSpatial.test.ts` checks eight HRTF feeds, direct/spatial ramps, saved-mode activation and Stereo fallback with a fake AudioContext; real Windows headphone output remains NOT_RUN |
| Locale | `src/i18n.tsx`, App and all Play-owned UI components | `src/i18n.test.tsx` and App locale test cover ENG default, TH persistence, language attribute and Full/Compact continuity; native OS text and user metadata stay outside translation |

| Evidence alias | Report | Recorded checks, not current blanket certification |
|---|---|---|
| F | [Foundation](LALIN_PLAY_STANDALONE_FOUNDATION.md) | 27 frontend/3 Rust, isolated source-copy build, audible user confirmation for that earlier WAV build |
| V | [Local video](LALIN_PLAY_LOCAL_VIDEO.md) | 30 frontend/6 Rust, MP4/WebM/silent-video captures; physical A/V limits |
| C | [Minimal Compact](LALIN_PLAY_MINIMAL_COMPACT.md) | 40 frontend/6 Rust, preview/auto-hide/minimum captures; touch/DPI limits |
| X | [Fullscreen/skip](LALIN_PLAY_FULLSCREEN_SKIP.md) | 48 frontend/7 Rust, native fullscreen/bounds/±10, WebM preview and muted WAV |
| I | [Integrated foundation](LALIN_PLAY_STANDALONE_FOUNDATION.md) | Historical integrated snapshot: Studio 6/6 + Play 23/23 frontend, Play Rust 35 passed/5 ignored with G3 test feature, Studio handoff Rust 6/6, API 10/10; paired lifecycle, loopback SMB denial, cross-host pipe denial 1/1 and different-logon-session ACL denial 1/1 are recorded; mapped/reparse runtime tests compile but are NOT_RUN; full playback parity NOT_VERIFIED. These historical counts are not the current branch Rust result |

Earlier evidence remains tied to its own source/binary hash. The isolated paired
G3 run is a separate current runtime result; it does not update the older 48/7
suite's provenance or establish full Studio/Play playback parity.

## Product requirements (PRD)

| ID | Code/tests | Evidence and status | Remaining exit work |
|---|---|---|---|
| PLAY-01 | UI, Native, Owner | F: LOCAL PASS without backend, audible WAV confirmed | Repeat clean-machine/release qualification; later video audio not inferred |
| PLAY-02 | UI, State, Native | F + selection/catalog/playlist tests: PARTIAL | Full playlist/catalog native matrix and edge cases |
| PLAY-03 | UI, Owner, Video, EQ | F/V/C/X + App: PARTIAL | Native output-device continuity and full device matrix |
| PLAY-04 | Owner, Transport, EQ | F + EQ suite: PARTIAL | Exhaustive queue/order/repeat/shuffle and native controls acceptance |
| PLAY-05 | Native tray/close/Quit | F: PARTIAL (hide/restore/Quit observed) | Actively stop Studio/API during playback, full lifecycle matrix |
| PLAY-06 | Single-instance plus native handoff | Isolated paired process passed cold/warm delivery, lost-ACK QUERY/STATE recovery while the owner is live, same-ID duplicate suppression, sequential four-file ordering, four independent concurrent clients with queue order matching unique increasing ACK revisions, no cold launch while the pipe is occupied, owner restart after lost ACK with no blind replay, and live URL/UNC-shaped invalid-path rejection with unchanged STATE; local restricted-token pipe client without the allowed logon SID is denied with `ERROR_ACCESS_DENIED`; loopback and cross-host pipe denial pass; cross-host pipe denial and different-logon-session ACL denial each passed 1/1 in PR #25 (`78ed550`) | Mapped-drive/reparse runtime tests compile but are NOT_RUN; Studio/API exit during playback and audible parity NOT_VERIFIED; CLI forwarding remains absent |
| PLAY-07 | State, Native | F + S2 journal-phase and five child-process termination checkpoints, initial journal, undo-snapshot and retryable history-write fixtures, and S3 owner/session STATE reconciliation: PARTIAL | Corruption, power-loss durability and other untested storage failures |
| PLAY-08 | Native resolve, linked relink and managed-object recovery (`library.rs`, `library_store.rs`, `App.tsx`) | PLAY-08-M automated PASS: Rust 87 unit passed/6 ignored and 3 integration passed, Vitest 16 files/110 tests passed; `tsc` and `cargo fmt --check` passed (2026-11-07). See [managed recovery spec](../design/LALIN_PLAY_MANAGED_RECOVERY_SPEC.md); linked relink per [spec](../design/LALIN_PLAY_RELINK_SPEC.md) v0.3.1b | Native owner delete/restart/repair/play NOT_RUN; linked relink across drives and playback NOT_RUN. Automated PASS is not native or release acceptance. |
| PLAY-09 | Studio exporter + standalone import | S2 LOCAL AUTOMATED PASS; no live data transfer | Power-loss/app-level restart recovery, remaining native write failures, and actual Studio-to-Play transfer NOT_RUN |
| PLAY-10 | Packaging disabled, updater unavailable | NOT_IMPLEMENTED / NOT_RUN | Independent installer/signed A→B update and release runbook |
| PLAY-11 | Mixer, Owner, EQ | `npm run build` PASS; full `npm test -- --reporter=dot` PASS (14 files/81 tests); native channel audition NOT_RUN | Verify MEDIA/MASTER audibly and output-device selection/persistence in Windows runtime |
| PLAY-12 | Spatial, Owner | HRTF graph and ramp/fallback tests pass with fake AudioContext as part of the 14-file/81-test pass; audible/native behavior NOT_RUN | Compare Stereo and Virtual 7.1 on selected headphones; measure CPU/latency and listen for artifacts |
| PLAY-13 | Locale, UI | 14-file/81-test pass covers ENG default, TH switch/persistence, Full/Compact continuity and visible mixer mute labels; visible app-owned text is routed through typed catalog | Review every view/tooltip/error at runtime in both locales and verify restart persistence |

## Dashboard, GenesisBlockDB and object storage (CR-007)

| ID | Code/tests | Evidence and status | Remaining exit work |
|---|---|---|---|
| PLAY-14 | `App.tsx`, `usePlaybackStore.ts`, Genesis history rows | PARTIAL; Home dashboard, play-count threshold, recent/most-played lists and deterministic local recommendations are wired | Runtime threshold/seek/repeat behavior, restart persistence, recommendation quality and acceptance evidence NOT_RUN |
| PLAY-15 | Genesis relational catalog | PARTIAL; `library_store.rs` now opens GenesisBlockDB and uses its relational schema/query/batch APIs; `cargo check` PASS on the current working tree | Exercise migration/restart, atomic failure recovery, and query/write behavior; automated tests and native data migration NOT_RUN |
| PLAY-16 | `library_store.rs`, native commands, `App.tsx` | PARTIAL; official-host HTTPS validation, external open, add/list/remove UI are wired; build passes | Native URL-policy and persistence checks NOT_RUN; official YouTube playlist metadata import is tracked by CR-008 PLAY-24 |
| PLAY-17 | Authorized-source cache | PARTIAL | Settings exist in candidate code; provider capability model, cache storage and bounded LRU eviction remain open |
| PLAY-18 | `library_store.rs`, `native.ts`, `App.tsx`, `styles.css` | PARTIAL; persistent favorite command, Favorites filter, USER/OFFLINE badges and star control are wired | Restart persistence and native import/filter acceptance NOT_RUN; no YouTube track badge because links are not playable tracks |
| PLAY-19 | `local_media_store.rs` | PARTIAL; local content-addressed object-store implementation exists; RustFS S3 adapter and authenticated Range streaming are absent | Add RustFS S3 integration, resumable upload/publication and authenticated Range streaming; complete offline/native acceptance |
| PLAY-20 | Genesis hybrid search/recommendations | NOT_IMPLEMENTED | Deterministic metadata vectors, graph relations, hybrid retrieval, pending-index recovery and UX disclosure |

## Mobile remote, phone-hosted files and transitions (CR-008)

| ID | Code/tests | Evidence and status | Remaining exit work |
|---|---|---|---|
| PLAY-21 | Remote pairing/gateway | NOT_IMPLEMENTED | Native companion, expiring single-use pairing, TLS fingerprint pinning, PC approval, roles/revoke and LAN-only listener |
| PLAY-22 | `contracts.ts`, `usePlaybackStore.ts` | PARTIAL; queue occurrences receive unique persisted IDs, duplicate tracks remain distinct, and local queue revisions advance on edits; `npm run build` PASS | Remote protocol, idempotent request/revision handling, stale-snapshot response, reconnect and security acceptance |
| PLAY-23 | Phone media transfer | NOT_IMPLEMENTED | Resumable verified copy, authenticated range stream, offline-after-copy and phone-disconnect behavior |
| PLAY-24 | YouTube playlist references | NOT_IMPLEMENTED; CR-007 has external YouTube links only | Official Data API pagination/auth/quota/expiry handling and explicit local-track mapping; no media playback/download/cache |
| PLAY-25 | `audioEngine.ts`, `usePlaybackStore.ts`, `PlaybackSettings.tsx`, `audioEngineTransition.test.ts`, `usePlaybackStoreTransition.test.ts` | PARTIAL; Off is default; Smooth/Medley expose 2–12 seconds; two audio decks share one EQ/spatial/limiter/master/output graph; equal-power gains use AudioContext time and commit one queue advance; transition tests exist and the 2026-11-07 handoff reports Vitest 16 files/102 tests PASS | Native audible/output acceptance NOT_RUN; buffer readiness, decoder failure, end-of-track and long-play behavior need runtime evidence |
| PLAY-26 | `audioEngine.ts`, `usePlaybackStore.ts`, `PlaybackSettings.tsx`, transition tests | PARTIAL; pause freezes the fade; seek/stop/queue edits/repeat/shuffle/output loss cancel it; Manual DJ prepares a selected queue occurrence in deck B and uses an equal-power A/B fader; Medley persists cue-in/out per queue occurrence; video does not overlap | Native cancellation checks and audible per-deck listen accounting NOT_RUN; Manual DJ/Medley failure and pause-resume behavior need runtime evidence |
| PLAY-27 | `smart_medley.rs`, `smart_medley_store.rs`, `tests/smart_medley.rs` | PARTIAL; Smart Medley code and tests are present; the 2026-11-07 handoff reports 71 Rust tests passed and 2 Smart Medley tests failed, so the Rust suite is not PASS | Resolve the 2 failures; confidence-bound BPM/key/cue benchmarks, representative fixtures and audible listening acceptance remain NOT_RUN |
| PLAY-V01 | Native, UI | V + Rust: PARTIAL | Complete picker/folder/drop/security native matrix beyond classification fixtures |
| PLAY-V02 | Video, UI | V + App: LOCAL PASS | New codec/device layouts not certified |
| PLAY-V03 | Video, Preview, Native | SUPERSEDED layout by C01/C07 | Stacked Compact/minimum no longer acceptance target; one owner still applies |
| PLAY-V04 | Owner, Video, UI | V/C/X + App: PARTIAL | Real output/EQ/audible continuity across full matrix |
| PLAY-V05 | Owner, EQ, Video | V silent-video + automated EQ: PARTIAL | Physical video audio/A-V sync, all transport/rate combinations |
| PLAY-V06 | Owner, Video | V + App mixed-media: PARTIAL | Complete native mixed queue/Stop/end-state matrix; known end-frame issue remains |
| PLAY-V07 | Native, Video, Owner | V + App metadata/decode-error: PARTIAL | Full native unsupported/corrupt/missing matrix |
| PLAY-V08 | Video, UI, Native | V expanded-in-window; X Compact native fullscreen: LOCAL PASS | Distinguish expand, fullscreen and TV; device limits remain |
| PLAY-V09 | Native, State | Rust old catalog + App restore: PARTIAL | End-to-end pre-video queue/catalog upgrade on native build |
| PLAY-V10 | Video, Owner tests | V/C/X: LOCAL PASS with declared limits | Not proof of physical A/V sync or all codec combinations |

## Compact/preview/fullscreen requirements (CR-004)

| ID | Code/tests | Evidence and status | Remaining exit work |
|---|---|---|---|
| PLAY-C01 | Preview, UI, styles | C/X: LOCAL PASS | Addendum A explicitly adds three controls; queue/EQ still Full-only |
| PLAY-C02 | Preview controls tests | C: PARTIAL | Physical touch and complete keyboard/focus/error matrix |
| PLAY-C03 | Preview latest-work tests | C MP4/WebM: PARTIAL | Native stress capture for rapid drag; bounded unit test is not hardware stress proof |
| PLAY-C04 | CompactTransport hover/drag/cancel tests | C/X paused main with separate thumbnail: LOCAL PASS | Full physical touch gesture matrix separate |
| PLAY-C05 | Preview disposal/cache/source tests | C + automated: PARTIAL | Native rapid source-switch stress/resource measurements |
| PLAY-C06 | UI, Owner, EQ, Preview | C/X + tests: PARTIAL | Real audio/output/decoder-error matrix |
| PLAY-C07 | Native minimum + CSS | C/X 440×300 captures: PARTIAL | DPI 150%, multi-monitor and paused-resize compositor issue |
| PLAY-C08 | Full test/build suite | C/X reports: LOCAL PASS for recorded checks | Profiling NOT_RUN explicitly recorded, not silently passed |
| PLAY-C09 | Native, UI acknowledgment | X native fullscreen/Escape/WebM: LOCAL PASS | Monitor/DPI matrix remains open |
| PLAY-C10 | Native restore + App error/repeat mocks | X Fullscreen→Full→Compact/maximized: PARTIAL | Actual native failure injection not performed |
| PLAY-C11 | Skip, Owner | X paused ±10/end/WAV, playing WebM + boundary tests: LOCAL PASS | Broad file/device coverage separate |
| PLAY-C12 | Preview Escape propagation + UI | X isolated preview/minimum: PARTIAL | Native Escape-during-drag, all keyboard/focus/touch paths |
| PLAY-C13 | Test/build suite and report X | PARTIAL | Interrupted final audio exit-button check; broader device matrix still open |

## Legacy SRS relationship

| SRS family | Standalone mapping | Evidence boundary |
|---|---|---|
| FR-16 | PLAY-01..09, V01..10, C01..13 | Normal Studio playback remains on the Studio owner; explicit standalone actions use S3 handoff. Selected paired delivery cases pass; full playback parity remains unverified |
| FR-16W | PLAY-03/05/06, Owner/TV/Native | Hardware media keys/output loss/SMTC need native standalone proof |
| FR-17 | PLAY-03/04/07, EQ | Automated graph/preset proof exists; mastering remains separate |
| FR-18 | TV, ADR-004 retained presentation | TV input unit tests do not certify native gamepad; Compact fullscreen is not TV parity |
| NFR-MP / NFR-TV | Bounded resource/ownership tests and X limitations | No fresh latency, long-play, CPU/GPU/memory benchmark; do not carry old Studio measurements across |

## PR #25 evidence integrated into main — 2026-10-20

The merge commit `78ed550` integrates PR #25 (head `d241a74`) into `main`.
The results below are integrated evidence; they do not close the remaining
mapped/reparse, active-playback shutdown, durability, storage-failure, live
transfer or audible-parity gates.

| Subgate | Recorded result | Still open |
|---|---|---|
| S2 process termination | Integrated migration tests passed recovery at five child-process termination checkpoints, plus journal creation, undo-snapshot and retryable history-write failures | Power-loss durability, remaining storage failures and live Studio-to-Play transfer |
| G3 cross-host pipe denial | Focused Windows probe passed 1/1: positive control connected, protected target returned Win32 5, and local access passed ([evidence commit](https://github.com/Freshair129/Lalin-AI/commit/20516d0)) | Mapped-drive/reparse runtime and playback parity |
| G3 different-logon-session ACL | Focused Windows probe passed 1/1: alternate logon SID was denied with Win32 5 while owner-token positive control passed ([evidence commit](https://github.com/Freshair129/Lalin-AI/commit/d241a74)) | Mapped-drive/reparse runtime, Studio/API exit during active playback and audible parity |
| G3 overall | **PARTIAL**; the two security subgates above pass | End-to-end audible parity and the remaining native/runtime cases |

Keep Studio playback enabled. These results do not close PLAY-06 or authorize
removing the original Studio implementation.

## Follow-up test backlog and acceptance ownership

| Priority | Work | Requirement / next evidence owner |
|---|---|---|
| Before split | Relink, actual S2 import/undo and crash recovery, remaining S3 security/playback parity | PLAY-06/08/09; implementer + independent test reviewer |
| Before native acceptance | Paused-resize/end-frame issues, device loss, A/V sync, DPI/multimonitor/touch/gamepad | V05/06, C02/07/12/13; Windows QA with user audible confirmation |
| Before export | Independent clean checkout and license/notices | ADR S4/S5; source owner + export reviewer |
| Before release | Installer/uninstaller, signed update A→B, security and state recovery | PLAY-10; release operator + product approval |

Each completion must name exact test command/case, source SHA/binary hash,
environment and outcome; attach native evidence when required. Adding a row or
test name alone does not close a gate. This matrix is manually maintained;
the generated Studio doc graph is not proof of these 50 criteria.

## Separate-logon-session ACL acceptance — 2026-09-30

The ignored Windows test different_logon_session_is_denied_by_the_pipe_acl
ran on DESKTOP-VETATMQ with nonce 31196.1790723880181644200. The temporary
standard account DESKTOP-VETATMQ\LalinPipeProbe0930 supplied an interactive
token with Logon SID S-1-5-5-0-1801444461, different from the owner
S-1-5-5-0-685957;
its SessionId was 1, matching the server process. The client opened the authenticated control pipe, then its
target-pipe open returned Win32 5 (ERROR_ACCESS_DENIED), sending
control=0;target=5. The server also confirmed the owner logon could still open
the protected target pipe.

The exact command
cargo test --offline --manifest-path apps/play-desktop/src-tauri/Cargo.toml --lib different_logon_session_is_denied_by_the_pipe_acl -- --ignored --nocapture --test-threads=1
passed 1/1 in 129.83 seconds. The client pipe opens ran under the alternate
interactive token via thread impersonation; a different user SID alone was
not treated as proof. This closes the separate-logon-session ACL gate for the
tested local Windows host. Cross-host denial is separately PASS.

Mapped-drive/reparse runtime cases and Studio/API exit during active playback
remain NOT_RUN; audible playback parity remains NOT_VERIFIED. G3 remains
PARTIAL, and Studio playback stays enabled.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.3.7b | 2026-11-07 | beta | Record complete PLAY-08-M automated test evidence while retaining native acceptance gates | working tree | Codex |
| 0.3.6b | 2026-11-07 | beta | Record PLAY-08-M implementation and partial automated evidence with outstanding test and native gates | working tree | Codex |
| 0.3.5b | 2026-11-07 | beta | Link PLAY-08-M managed recovery spec | working tree | Claude |
| 0.3.4b | 2026-11-07 | beta | PLAY-08 linked relink implemented with automated evidence; native acceptance and PLAY-08-M remain open | working tree | Claude |
| 0.3.3b | 2026-11-07 | beta | Link the PLAY-08 relink implementation spec; implementation still open | working tree | Claude |
| 0.3.2b | 2026-11-07 | beta | Reconcile traceability rows with PR #25 integration, local object-store/Smart Medley code and existing transition tests; preserve current failure and runtime boundaries | working tree | Codex |
| 0.3.1b | 2026-11-07 | beta | Rebase the CR-006/007/008 Play work onto main (a6325d0): keep merged S2/G3 evidence from main and retain CR-006..008 and local-first entries | rebased onto a6325d0 | Claude |
| 0.3.0b | 2026-10-20 | beta | Record Smooth, Manual DJ and cue-based Medley UI/build; preserve missing mobile, analysis and native acceptance gates | working tree | Codex |
| 0.2.9b | 2026-10-20 | beta | Record local queue IDs and Smooth audio crossfade build; preserve missing mobile, manual-medley and native acceptance gates | working tree | Codex |
| 0.2.8b | 2026-10-20 | beta | Register approved CR-008 PLAY-21..27 and retain mobile/security/audio/native acceptance gaps | working tree | Codex |
| 0.2.7b | 2026-10-20 | beta | Record CR-007 Dashboard/history/favorites/link UI and Genesis build status; keep RustFS/cache/hybrid/native gates open | working tree | Codex |
| 0.2.6b | 2026-10-20 | beta | Amend CR-007 traceability for GenesisBlockDB single-database and RustFS-ready object storage; preserve open evidence gates | working tree | Codex |
| 0.2.5b | 2026-10-20 | beta | Record exact 14-file/81-test and build results for approved CR-006 while retaining native-audio gates | working tree | Codex |
| 0.2.4b | 2026-10-20 | beta | Add approved CR-006 mixer, virtual-surround and locale mapping with local checks and native-audio gates | working tree | Codex |
| 0.2.3b | 2026-10-19 | beta | Reconcile traceability with unmerged S2 termination and G3 ACL follow-up evidence while retaining open parity gates | working tree | Codex |
| 0.2.18b | 2026-09-30 | beta | Pass same-session distinct-Logon-SID named-pipe ACL probe with denied target and owner positive control; preserve playback parity gates | based on c669602 | Codex |
| 0.2.17b | 2026-09-30 | beta | Record the separate-logon runas credential failure without claiming pipe ACL evidence | based on 20516d0 | Codex |
| 0.2.16b | 2026-09-27 | beta | Record the timed-out second-host listener attempt without claiming remote rejection | based on ef5f87b | Codex |
| 0.2.15b | 2026-09-27 | beta | Trace compiled cross-host and mapped/reparse probes as NOT_RUN; update integrated test count | based on 3bb4414 | Codex |
| 0.2.14b | 2026-09-27 | beta | Trace loopback SMB/UNC remote-client denial with remote-route and local-access positive controls; retain separate-session/parity gates | based on a75c540 | Codex |
| 0.2.13b | 2026-09-27 | beta | Trace retryable undo-snapshot write failure alongside initial journal/history and process-recovery cases | based on e843e1c | Codex |
| 0.2.12b | 2026-09-27 | beta | Trace initial journal-creation and retryable import-history failure tests; retain power-loss and live-transfer gaps | based on 75c2001 | Codex |
| 0.2.11b | 2026-09-27 | beta | Trace S2 recovery after child-process termination at five checkpoints; retain power-loss and live-transfer gaps | based on e2bd20a | Codex |
| 0.2.10b | 2026-09-27 | beta | Trace local Windows ACL denial for a restricted logon token; retain cross-session and audible-parity gates | based on 988a3e4 | Codex |
| 0.2.9b | 2026-09-27 | beta | Trace paired process-interrupted lost-ACK handling and no replay after owner restart; retain security and audible parity gaps | based on 17a5c96 | Codex |
| 0.2.8b | 2026-09-27 | beta | Trace paired dropped-ACK reconciliation for a live owner and retain process-interruption/parity gaps | based on cee5e93 | Codex |
| 0.2.7b | 2026-09-27 | beta | Trace live URL/UNC-shaped receiver rejection with unchanged STATE; preserve session-security and playback parity gaps | based on cee5e93 | Codex |
| 0.2.6b | 2026-09-27 | beta | Record successful paired G3 rerun against rebuilt final pipe-recovery source; preserve security and parity gaps | based on 1084d5e | Codex |
| 0.2.5b | 2026-09-27 | beta | Trace the busy-pipe lifecycle fix and concurrent paired-client ACK/queue ordering while retaining remaining G3 gates | based on 1084d5e | Codex |
| 0.2.4b | 2026-09-27 | beta | Trace live invalid-path receiver rejection as paired G3 evidence and preserve remaining gates | based on b90ffaed | Codex |
| 0.2.3b | 2026-09-27 | beta | Trace passing isolated paired G3 lifecycle cases separately from remaining security and playback parity gates | based on 9e0cb06 | Codex |
| 0.2.2b | 2026-09-26 | beta | Reconcile S2 migration and S3 handoff traceability while preserving live parity gates | 7c30ea1 / 235875b | Codex |
| 0.2.1b | 2026-09-25 | beta | Trace native journal-phase recovery, selected write-failure evidence and open runtime gates | based on 411d2ed | LALIN |
| 0.2.0b | 2026-09-25 | beta | Trace approved S2 exporter/importer, rollback tests and remaining runtime gates | based on 411d2ed | LALIN |
| 0.1.0b | 2026-09-20 | beta | Map all 33 standalone criteria to code/tests, dated evidence and unresolved gates | based on f5a6681 | LALIN |
