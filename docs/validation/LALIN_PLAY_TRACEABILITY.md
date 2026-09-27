---
version: "0.2.16b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-09-27T14:03:11+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "validation"
  doc_type: "traceability-matrix"
  scope: "All PLAY-01..10, PLAY-V01..10 and PLAY-C01..13 requirements with S2 migration and S3 handoff evidence"
---

# Lalin Play — requirements, implementation and evidence

Manual audit of source `f5a6681`, not a new automated/native test run. Requirement
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
| UI | `src/App.tsx`, `src/native.ts`, `src/components/Transport.tsx` | `src/App.test.tsx`: one element, surface failure, queue/errors, no-autoplay restore, playlists, video/layout/metadata/error and fullscreen IPC mocks |
| Owner | `src/playback/audioEngine.ts`, `src/playback/usePlaybackStore.ts`, `src/contracts.ts` | `src/playback/audioEngineState.test.ts` readiness; App Stop-during-resolution test; EQ tests |
| Native | `src-tauri/src/lib.rs`, `src-tauri/src/library.rs`, `src-tauri/src/migration.rs`, `src-tauri/src/handoff.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json` | Rust tests: library/catalog, S2 journal/import and drive validation, S3 pipe ACL/FIFO/ACK/STATE and lifecycle decisions |
| EQ | `src/components/PlaybackEQPanel.tsx`, `src/playback/audioContext.ts` and Owner | `src/playback/playbackEQ.test.ts`: 10 bands, gain/preamp limits, bypass/presets, graph/volume and output fallback mocks |
| Preview | `src/components/CompactTransport.tsx`, `src/playback/framePreview.ts`, `src/styles.css` | `src/components/CompactTransport.test.tsx`, `src/playback/framePreview.test.ts`: drag/hover, disposal, latest work, cache limit, errors/timeouts, controls |
| Skip | `src/playback/relativeSeek.ts`, CompactTransport and Native | `src/playback/relativeSeek.test.ts`; CompactTransport live-clock/disabled tests; App native ACK/error tests |
| Video | `src/components/VideoStage.tsx`, Owner, UI and Native | App persistent-host/mixed-media tests; Rust kind/backward tests |
| State | `src/playlists.ts`, Owner, `src/components/PlaybackSettings.tsx`, UI | App versioned-playlist/opt-in tests; S2 phase recovery, five child-process termination checkpoints, initial journal, undo-snapshot and retryable history-write failures; power-loss and other storage failures open |
| Migration | Studio `src/playback/playMigrationExport.ts`; standalone `src/playMigration.ts`, `src/playMigrationImport.ts`, `src-tauri/src/migration.rs` | Studio envelope test; standalone schema, preview, cancel, import/rollback, four journal phases, five child-process termination checkpoints, initial journal, undo-snapshot and retryable history-write failures; see [S2 evidence](LALIN_PLAY_S2_MIGRATION.md) |
| Handoff | Studio `apps/desktop/src-tauri/src/playback_handoff.rs`, `apps/desktop/src/playback/playbackClient.ts`; Play `src-tauri/src/handoff.rs`, `src/handoffReceiver.ts` | Isolated Windows paired process passed cold/warm commands, ACK/STATE recovery after a dropped command ACK, same-ID duplicate handling, sequential four-file queue, four independent concurrent senders ordered by ACK revision, busy-pipe wait without cold launch, owner restart after a lost ACK with no blind replay, and live URL/UNC-shaped invalid-path rejection with unchanged STATE; local restricted-token pipe client without the allowed logon SID is denied with `ERROR_ACCESS_DENIED`; opt-in SMB loopback positive control succeeds and the same-DACL pipe with remote rejection denies the UNC path; cross-host listener timed out before a client result; mapped/reparse runtime tests compile but are NOT_RUN; separate interactive logon session, Studio/API exit during playback and audible parity NOT_VERIFIED |
| TV | `src/playback/tvMode.ts`, `src/playback/mediaSessionAdapter.ts`, UI and Native | `src/playback/tvMode.test.ts` input cleanup/mapping; physical gamepad/SMTC not qualified |

| Evidence alias | Report | Recorded checks, not current blanket certification |
|---|---|---|
| F | [Foundation](LALIN_PLAY_STANDALONE_FOUNDATION.md) | 27 frontend/3 Rust, isolated source-copy build, audible user confirmation for that earlier WAV build |
| V | [Local video](LALIN_PLAY_LOCAL_VIDEO.md) | 30 frontend/6 Rust, MP4/WebM/silent-video captures; physical A/V limits |
| C | [Minimal Compact](LALIN_PLAY_MINIMAL_COMPACT.md) | 40 frontend/6 Rust, preview/auto-hide/minimum captures; touch/DPI limits |
| X | [Fullscreen/skip](LALIN_PLAY_FULLSCREEN_SKIP.md) | 48 frontend/7 Rust, native fullscreen/bounds/±10, WebM preview and muted WAV |
| I | [Integrated foundation](LALIN_PLAY_STANDALONE_FOUNDATION.md) | Studio 6/6 + Play 23/23 frontend, Play Rust 35 passed/5 ignored with G3 test feature, Studio handoff Rust 6/6, API 10/10; both builds and Rust format checks pass; paired lifecycle and opt-in loopback SMB denial pass; cross-host listener timed out before a client result; mapped/reparse runtime tests compile but are NOT_RUN; full playback parity NOT_VERIFIED |

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
| PLAY-06 | Single-instance plus native handoff | Isolated paired process passed cold/warm delivery, lost-ACK QUERY/STATE recovery while the owner is live, same-ID duplicate suppression, sequential four-file ordering, four independent concurrent clients with queue order matching unique increasing ACK revisions, no cold launch while the pipe is occupied, owner restart after lost ACK with no blind replay, and live URL/UNC-shaped invalid-path rejection with unchanged STATE; local restricted-token pipe client without the allowed logon SID is denied with `ERROR_ACCESS_DENIED`; opt-in SMB loopback positive control succeeds and the protected pipe denies that same UNC path | Cross-host listener timed out before a client result; mapped-drive/reparse runtime tests compile but are NOT_RUN; separate interactive logon session, Studio/API exit during playback and audible parity NOT_VERIFIED; CLI forwarding remains absent |
| PLAY-07 | State, Native | F + S2 journal-phase and five child-process termination checkpoints, initial journal, undo-snapshot and retryable history-write fixtures, and S3 owner/session STATE reconciliation: PARTIAL | Corruption, power-loss durability and other untested storage failures |
| PLAY-08 | Native resolve + UI error | F/V + App: PARTIAL | Relink preserving references NOT_IMPLEMENTED |
| PLAY-09 | Studio exporter + standalone import | S2 LOCAL AUTOMATED PASS; no live data transfer | Power-loss/app-level restart recovery, remaining native write failures, and actual Studio-to-Play transfer NOT_RUN |
| PLAY-10 | Packaging disabled, updater unavailable | NOT_IMPLEMENTED / NOT_RUN | Independent installer/signed A→B update and release runbook |

## Video requirements (CR-003)

| ID | Code/tests | Evidence and status | Remaining exit work |
|---|---|---|---|
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
the generated Studio doc graph is not proof of these 33 criteria.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
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
