---
version: "0.1.2b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-09-26T05:25:06+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "validation"
  doc_type: "traceability-matrix"
  scope: "All PLAY-01..10, PLAY-V01..10 and PLAY-C01..13 requirements"
---

# Lalin Play — requirements, implementation and evidence

Manual audit anchored to source `f5a6681`; S3 handoff rows below add local code/test
evidence from 2026-09-25, not live native qualification. Requirement
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
| Native | `src-tauri/src/lib.rs`, `src-tauri/src/library.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json` | Rust module tests: bounds restoration, selection/dedup/read-only, missing selection, catalog replacement, video classification and old kind-less catalog |
| Handoff | Studio `apps/desktop/src-tauri/src/playback_handoff.rs`, `src/playback/playbackClient.ts`; API `app/routers/files.py`; Play `src-tauri/src/handoff.rs`, `src/handoffReceiver.ts`, `src/handoffContract.ts` | Current: Studio sender Vitest 3/3, Studio Rust 5/5, Play contract 1/1, Play Rust 14/14, API resolver 10/10; local tests only, live process pair not verified |
| EQ | `src/components/PlaybackEQPanel.tsx`, `src/playback/audioContext.ts` and Owner | `src/playback/playbackEQ.test.ts`: 10 bands, gain/preamp limits, bypass/presets, graph/volume and output fallback mocks |
| Preview | `src/components/CompactTransport.tsx`, `src/playback/framePreview.ts`, `src/styles.css` | `src/components/CompactTransport.test.tsx`, `src/playback/framePreview.test.ts`: drag/hover, disposal, latest work, cache limit, errors/timeouts, controls |
| Skip | `src/playback/relativeSeek.ts`, CompactTransport and Native | `src/playback/relativeSeek.test.ts`; CompactTransport live-clock/disabled tests; App native ACK/error tests |
| Video | `src/components/VideoStage.tsx`, Owner, UI and Native | App persistent-host/mixed-media tests; Rust kind/backward tests |
| State | `src/playlists.ts`, Owner, `src/components/PlaybackSettings.tsx`, UI | App versioned-playlist/opt-in tests; EQ mocks; not complete migration/disk-failure tests |
| TV | `src/playback/tvMode.ts`, `src/playback/mediaSessionAdapter.ts`, UI and Native | `src/playback/tvMode.test.ts` input cleanup/mapping; physical gamepad/SMTC not qualified |

| Evidence alias | Report | Recorded checks, not current blanket certification |
|---|---|---|
| F | [Foundation](LALIN_PLAY_STANDALONE_FOUNDATION.md) | 27 frontend/3 Rust, isolated source-copy build, audible user confirmation for that earlier WAV build |
| V | [Local video](LALIN_PLAY_LOCAL_VIDEO.md) | 30 frontend/6 Rust, MP4/WebM/silent-video captures; physical A/V limits |
| C | [Minimal Compact](LALIN_PLAY_MINIMAL_COMPACT.md) | 40 frontend/6 Rust, preview/auto-hide/minimum captures; touch/DPI limits |
| X | [Fullscreen/skip](LALIN_PLAY_FULLSCREEN_SKIP.md) | 48 frontend/7 Rust, native fullscreen/bounds/±10, WebM preview and muted WAV |

Earlier evidence remains tied to its own source/binary hash. The final 48/7 suite
was also rerun before commit; no newer native runtime claim is made by this audit.

## Product requirements (PRD)

| ID | Code/tests | Evidence and status | Remaining exit work |
|---|---|---|---|
| PLAY-01 | UI, Native, Owner | F: LOCAL PASS without backend, audible WAV confirmed | Repeat clean-machine/release qualification; later video audio not inferred |
| PLAY-02 | UI, State, Native | F + selection/catalog/playlist tests: PARTIAL | Full playlist/catalog native matrix and edge cases |
| PLAY-03 | UI, Owner, Video, EQ | F/V/C/X + App: PARTIAL | Native output-device continuity and full device matrix |
| PLAY-04 | Owner, Transport, EQ | F + EQ suite: PARTIAL | Exhaustive queue/order/repeat/shuffle and native controls acceptance |
| PLAY-05 | Native tray/close/Quit | F: PARTIAL (hide/restore/Quit observed) | Actively stop Studio/API during playback, full lifecycle matrix |
| PLAY-06 | Single-instance focus plus approved native handoff path | PARTIAL | Local protocol, same-logon pipe code, canonical local-drive validation, FIFO and ACK/STATE reconciliation implemented; live process pair, ACK-loss interruption, unauthorized/cross-session attempt and audible parity NOT_VERIFIED; CLI forwarding remains absent |
| PLAY-07 | State, Native | F + App opt-in/no autoplay: PARTIAL | Full restart/corruption/storage-failure coverage |
| PLAY-08 | Native resolve + UI error | F/V + App: PARTIAL | Relink preserving references NOT_IMPLEMENTED |
| PLAY-09 | No exporter/importer | NOT_IMPLEMENTED | Candidate integration/migration spec, transactional recovery tests |
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
| FR-16 | PLAY-01..09, V01..10, C01..13 | Existing Studio actions remain on the Studio playback owner; explicit standalone actions use S3 pipe code, but local checks do not prove live cross-app delivery |
| FR-16W | PLAY-03/05/06, Owner/TV/Native | Hardware media keys/output loss/SMTC need native standalone proof |
| FR-17 | PLAY-03/04/07, EQ | Automated graph/preset proof exists; mastering remains separate |
| FR-18 | TV, ADR-004 retained presentation | TV input unit tests do not certify native gamepad; Compact fullscreen is not TV parity |
| NFR-MP / NFR-TV | Bounded resource/ownership tests and X limitations | No fresh latency, long-play, CPU/GPU/memory benchmark; do not carry old Studio measurements across |

## Follow-up test backlog and acceptance ownership

| Priority | Work | Requirement / next evidence owner |
|---|---|---|
| Before native acceptance | Live Studio–Play FIFO delivery, ACK loss/restart, cross-session rejection and Studio/API exit during playback | PLAY-06; Windows QA + user audible confirmation |
| Before split | Relink and real old-state migration | PLAY-08/09; implementer + independent test reviewer |
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
| 0.1.2b | 2026-09-26 | beta | Add canonical-root validation evidence while retaining PLAY-06 native acceptance gates | uncommitted | Codex |
| 0.1.1b | 2026-09-25 | beta | Reconcile PLAY-06 traceability with local S3 handoff implementation and retain runtime acceptance gates | uncommitted | Codex |
| 0.1.0b | 2026-09-20 | beta | Map all 33 standalone criteria to code/tests, dated evidence and unresolved gates | based on f5a6681 | LALIN |
