---
version: "0.2.1b"
created_at: "2026-09-20T19:35:00+07:00,LALIN,8429010"
last_update: "2026-09-26T05:25:06+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "validation"
  doc_type: "verification-report"
  scope: "ADR-004 S1, partial S2 and partial S3; Windows local evidence only"
---

# Lalin Play standalone foundation — local evidence

## Outcome and boundary

**S1 LOCAL PASS; S2 PARTIAL; S3 LOCAL IMPLEMENTATION with paired-runtime acceptance open. Overall repository split is NOT complete.**

The user approved PRD/ADR-004 implementation on `codex/lalin-play-split`.
Source baseline is `84290102b84fd76dec069bf6d61ffdd2fc8466ab` in
`Freshair129/Lalin-AI`. Changes are uncommitted branch work. No push, remote
creation, source removal, main merge or release was performed in this slice.

An additive candidate exists at `apps/play-desktop`, with independent npm/Cargo
manifests and lockfiles, app ID `ai.lalin.play` and app version `0.1.0`.
Audio remains HTML media/Web Audio; Rust owns the native boundary, not decoding.

## Automated evidence (2026-09-20, ICT)

| Check | Result | Scope / caveat |
|---|---|---|
| Candidate `npm test` | 27/27 PASS | 4 files; native commands/audio mocked in frontend tests |
| Candidate `npm run build` | PASS | TypeScript + Vite, 44 modules |
| Candidate `cargo test --manifest-path src-tauri/Cargo.toml --offline` | 3/3 PASS | Selected-folder bounds/dedup, missing selection, catalog replacement preserves media |
| Candidate Tauri `build --debug --no-bundle` | PASS | Embedded frontend; debug executable, not an installer |
| Isolated source-copy `npm ci --offline --workspaces=false --no-audit --no-fund` | PASS after cache-access escalation | Own node_modules; first sandbox attempt failed EPERM reading npm cache |
| Isolated source-copy tests + build | 27/27 frontend, 3/3 Rust, frontend and native debug build PASS | 44 source files copied to `runtime/play-isolation-2ea1ad74`; no parent package links; shared system toolchains/package caches; not a remote clean checkout or clean machine |
| Retained Studio `npm --workspace apps/desktop test` | 187/187 PASS | 22 files; existing jsdom media pause warnings remain; not native audio proof |
| Root `npm run check:all` | PASS | Contracts/MCP/desktop builds, API Python compileall and Studio cargo check; not API integration tests |
| `cargo fmt --check`, `git diff --check` | PASS | Git emits line-ending normalization warnings |

Controlled-promise test reproduces and fixes the newly introduced Stop/native
resolution race. See [RCA](../../.brain/rca/2026-09-20-lalin-play-native-resolution-race.md).
React review kept engine lifetime outside layout changes and bounded listener
cleanup; unit tests assert the same audio element and no extra play on switching.

## S3 focused automated evidence (2026-09-26, ICT)

The S3 wire contract is approved and implemented locally. Studio's existing
Play/Play Next/Queue route remains the default; distinct native actions explicitly
send local media to standalone Play. These checks cover local code and fixtures,
not live cross-process playback:

| Check | Result | Scope / caveat |
|---|---|---|
| Studio native sender focused Vitest | 3/3 PASS | Local path routing and unknown-delivery reconciliation; native command mocked |
| Studio retained sender + bridge tests | 18/18 PASS (2026-09-25 record) | FIFO order/local path routing, exact-ID reconciliation request and the same-origin bridge; no live pipe |
| Studio Rust handoff tests | 6/6 PASS | Cold/warm launch decisions, one-launch timeout, input validation, canonical-root and drive-type classifier cases; launch/connect and type classification are unit seams; temporary sidecar junction was removed afterward |
| Play handoff contract frontend test | 1/1 PASS | Versioned snapshot shape, bounded size and path-redaction assertions |
| Play Rust crate | 15/15 PASS | Protocol, local-file validation, replay/history, snapshot cap, Windows DACL construction/pipe creation and remote-client-rejection flag; drive-type classifier is unit-tested, with no mapped-drive or unauthorized-connection attempt |
| API playback resolver | 10/10 PASS | Workspace/upload/output containment and extension checks with local fixtures |
| Studio and Play frontend builds | PASS | TypeScript/Vite build only; no playback acceptance |
| Canonical Windows-root and drive-type checks | PASS | Both native validators accept local drive syntax, reject UNC/device/GLOBALROOT roots and reject remote/unknown drive types; pure helper tests, no reparse or mapped-drive runtime fixture |
| Studio–Play live process pair, FIFO pipe burst and audible result | NOT RUN | No native runtime parity claim |
| ACK-loss interruption, unauthorized/cross-session client attempts, spoof attempts and Studio/API exit during active playback | NOT RUN | Requires paired-process lifecycle/security evidence |

The Studio and Play native adapters validate canonical local drive paths,
resolve Studio-owned references through the API, enforce a same-logon SID pipe
ACL, reject canonical UNC/device roots and non-local drive types before the Play
asset grant, serialize commands, and reconcile an uncertain delivery using the
same request ID and owner session. If reconciliation remains unknown, Studio
blocks later standalone sends instead of replaying the command. This work does
not remove or deactivate the existing Studio playback owner.

## Native evidence and user confirmation

Test media: generated 120-second WAV at
`apps/play-desktop/.smoke/ทดสอบเพลง local.wav` (Thai name and space).
Only this fixture was selected; no user library or old WebView profile was migrated.

Initial native debug executable SHA256:
`1562870E02F8705FBE2C6F2A1C7911A029FE8B0FC8C298F7BB36E0E8B701578E`.

- Native file picker imported the WAV and displayed actual two-minute duration.
- Full → Compact → EQ → Full showed PLAYING and advancing time (0:10, 0:20,
  0:29, 1:08, 1:34), one queue entry and a nonzero EQ spectrum.
- Native X hid the window while PID 12760 survived. Launching the same executable
  restored that process with PLAYING at 1:48; explicit Quit later exited.
- **User confirmed “ได้ยินเสียง”** in response to the actual-output question.
  This confirms audible output for the earlier test, not every later binary/device.
- [Full EQ screenshot](evidence/lalin-play-split/full-native.png)
  and [Compact EQ screenshot](evidence/lalin-play-split/compact-native.png).

Latest rebuilt debug executable:
`apps/play-desktop/src-tauri/target/debug/lalin-play.exe`.
SHA256: `E216B9D20910DFFADA1305CFF4BFF41C58B0928FC55150DF81301942FDE08FCB`.
This includes the cancellation guard, explicit native-command manifest,
output settings and dark native controls.

- Fresh launch (PID 37840): retained library has one item, queue empty, IDLE;
  opt-in resume was off. No automatic playback.
- Playing the retained item succeeds after restart/native path revalidation.
- Full PLAYING at 0:26 → Compact at 0:49 → Compact at 1:05; queue remains one.
- Stop after verification returns IDLE at 0:00; the app was left open without
  the test tone playing.
- [Latest Full screenshot](evidence/lalin-play-split/full-native-latest.png)
  and [latest Compact screenshot](evidence/lalin-play-split/compact-native-latest.png).
- Read-only process/network check found Play without `g-music`/`g-music-backend`
  and no TCP listeners at 8756 or 5175. UI origin is `http://tauri.localhost/`.
  This is no-backend playback evidence, not a test of actively stopping Studio.

## Open gates — do not infer completion

| Gate | Status |
|---|---|
| Full library/playlist UI, queue, EQ, Full/Compact | Implemented; partial native/manual coverage, not full PLAY-01–09 acceptance |
| Opt-in old Studio queue/EQ export/import and atomic rollback | NOT IMPLEMENTED |
| Missing-file relink, persisted per-mode window bounds | NOT IMPLEMENTED; bounds currently process-local |
| Native Studio named pipe, same-session ACL, FIFO/ACK/reconciliation | Implemented locally; focused tests pass; live process-pair parity NOT VERIFIED |
| Cold/warm Studio-to-Play lifecycle and Studio/API exit during playback | Cold/warm decision tests pass; paired runtime and Studio/API exit NOT VERIFIED |
| Device removal/recovery, native output selection, TV/gamepad and codec coverage | NOT RUN on this candidate |
| Standalone remote checkout, export SHA, license/notices audit | NOT RUN |
| Removing original Studio Play, native Arrange/Cast regression smoke | NOT RUN; original implementation and shared consumers preserved |
| NSIS install/uninstall, signed updater, GitHub release | NOT RUN; updater stays unavailable |

Next work is S2 completion and live S3 process-pair, delivery/security and audio
parity acceptance. S4–S7 remain gated by ADR-004. The original Studio playback
owner and source remain intact. No migration, source removal or release action
was performed for this evidence update.

## Version changes in this slice

AGENTS `0.1.0b → 0.1.1b`; PRD `1.1.0b → 1.1.1b`; PRODUCT `0.2.0b → 0.2.1b`;
repository SOT `0.4.0b → 0.4.1b`; docs index `0.5.0b → 0.5.1b`;
sitemap `0.1.0b → 0.1.1b`; ADR-004 `0.1.0b → 0.1.2b`.
Documentation approval/status changes do not bump Studio/Cast application versions.

S3 follow-up versions: integration spec `0.1.1b → 0.1.2b`, traceability
`0.1.1b → 0.1.2b`, foundation `0.2.0b → 0.2.1b`, DOCS_INDEX
`0.10.10b → 0.10.11b`; canonical-path RCA added at `0.1.0b`.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.1b | 2026-09-26 | beta | Record canonical-root/drive-type checks, current focused evidence and unchanged native parity gates | uncommitted | Codex |
| 0.2.0b | 2026-09-25 | beta | Record approved S3 native handoff implementation and focused local evidence; retain live parity gate | uncommitted | Codex |
| 0.1.0b | 2026-09-20 | beta | Record standalone foundation, native evidence and user-confirmed audio; preserve incomplete split gates | based on 8429010 | LALIN |
