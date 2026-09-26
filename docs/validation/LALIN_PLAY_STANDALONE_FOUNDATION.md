---
version: "0.2.2b"
created_at: "2026-09-20T19:35:00+07:00,LALIN,8429010"
last_update: "2026-09-26T21:20:52+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "validation"
  doc_type: "verification-report"
  scope: "ADR-004 S1, approved S2 migration and S3 handoff; Windows local evidence only"
---

# Lalin Play standalone foundation — local evidence

## Outcome and boundary

**S1 LOCAL PASS. S2 migration and S3 handoff are implemented locally with focused automated evidence; S2 recovery and S3 paired-runtime parity remain NOT_VERIFIED, and the overall repository split remains PARTIAL.**

The user approved PRD/ADR-004 implementation on `codex/lalin-play-split`.
Source baseline is `84290102b84fd76dec069bf6d61ffdd2fc8466ab` in
`Freshair129/Lalin-AI`. That earlier evidence slice did not push, create a remote,
remove source, merge to main or release. Current recovered code remains local on
`codex/lalin-play-integration` pending runtime acceptance.

The 2026-09-25 S2 evidence was recorded from a then-uncommitted worktree based on
`411d2ed`. The recovered S2 source is now reviewed locally on `7c30ea1`; S3 handoff
is locally implemented on `235875b`. No user WebView profile files were accessed.
See [S2 migration evidence](LALIN_PLAY_S2_MIGRATION.md) for the remaining recovery
and actual-transfer limits.

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
| Opt-in Studio queue/EQ export/import and atomic rollback | Implemented locally; focused tests and selected synthetic native phase/write failures pass; process-crash recovery, remaining writes and live transfer NOT RUN |
| Missing-file relink, persisted per-mode window bounds | NOT IMPLEMENTED; bounds currently process-local |
| Native Studio named pipe, same-session ACL, FIFO/ACK/reconciliation | Implemented locally; focused checks pass; live process-pair and audible parity NOT_VERIFIED |
| Cold/warm Studio-to-Play lifecycle and Studio/API exit | Cold/warm decision tests pass; paired runtime, Studio/API exit and audible parity NOT_VERIFIED |
| Device removal/recovery, native output selection, TV/gamepad and codec coverage | NOT RUN on this candidate |
| Standalone remote checkout, export SHA, license/notices audit | NOT RUN |
| Removing original Studio Play, native Arrange/Cast regression smoke | NOT RUN; original implementation and shared consumers preserved |
| NSIS install/uninstall, signed updater, GitHub release | NOT RUN; updater stays unavailable |

Next work is actual S2 process-termination/restart verification and remaining
journal/history write failures, plus S3 paired-process, unauthorized/cross-session,
ACK-loss, mapped-drive/reparse runtime and audible parity checks. Studio playback
stays available until parity is proven. S4–S7 remain gated by ADR-004.
An interrupted import restores through the Play-owned journal on next launch; the
prior Studio sources and user state remain intact. Temporary isolated build files and fixture are ignored under `runtime/`
and `.smoke/`; they were retained, not committed or deleted.

## Version changes in this slice

AGENTS `0.1.0b → 0.1.1b`; PRD `1.1.0b → 1.1.1b`; PRODUCT `0.2.0b → 0.2.1b`;
repository SOT `0.4.0b → 0.4.1b`; docs index `0.5.0b → 0.5.1b`;
sitemap `0.1.0b → 0.1.1b`; ADR-004 `0.1.0b → 0.1.2b`.
Documentation approval/status changes do not bump Studio/Cast application versions.

## Integrated verification and version diff — 2026-09-26

Code refs: S2 `7c30ea1`, S3 `235875b`, S3 changelog correction `362bbd0`;
integration branch `codex/lalin-play-integration`, based on `43121cc`. The
independent review found no code blocker in either lane.

| Component / command | Result |
|---|---|
| Studio frontend, `apps/desktop`: `npm test -- src/playback/playMigrationExport.test.ts src/playback/playbackClient.native.test.ts` | 6/6 passed |
| Play frontend, `apps/play-desktop`: `npm test -- src/playMigration.test.ts src/playMigrationImport.test.ts src/components/PlayMigrationImport.test.tsx src/handoffContract.test.ts` | 23/23 passed |
| Play native Rust, `apps/play-desktop`: `cargo test --manifest-path src-tauri/Cargo.toml --offline` | 31/31 passed |
| Studio handoff Rust, `apps/desktop`: `cargo test --manifest-path src-tauri/Cargo.toml playback_handoff::tests --offline` | 6/6 passed, including cold/warm launch decisions |
| API files, `apps/api`: `.venv/Scripts/python.exe -m pytest tests/test_files_upload.py -q` | 10/10 passed |
| Studio and Play frontend builds | Both passed (`npm run build`) |
| Rust format checks in Studio and Play | Both passed (`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`) |
| Staged diff hygiene | `git diff --cached --check` passed on final integration changes |

The Studio native test used a temporary junction to the existing Studio backend
sidecar directory because the isolated worktree has no local `binaries` folder;
the junction was removed after testing. Frontend dependency junctions were also
removed. No generated schema or permission churn is retained. Cold/warm checks
are launch-decision unit tests, not a live Studio–Play process pair. Same-session
unauthorized connection attempts, interrupted ACK recovery, actual mapped-SMB
and reparse fixtures, Studio/API exit during playback, S2 process-crash/power-loss
recovery and audible parity remain NOT_RUN/NOT_VERIFIED. Keep ordinary Studio
playback available until parity is observed.

| Document | Before → after |
|---|---|
| Integration/migration spec | 0.2.4b → 0.2.5b |
| Play documentation register | 0.2.1b → 0.2.2b |
| Foundation evidence | 0.2.1b → 0.2.2b |
| Traceability matrix | 0.2.1b → 0.2.2b |
| Execution DAG | 0.1.0b → 0.2.0b |
| Play README | 0.4.1b → 0.4.2b |
| ADR-004 | 0.4.1b → 0.4.2b |
| Repository Architecture SOT | 0.4.2b → 0.4.3b |
| Play user guide | 0.1.0b → 0.1.1b |
| Docs index | 0.10.10b → 0.10.11b |
| S2 migration evidence and both RCA notes | New 0.1.0b documents |
| Studio and Play application versions | No change |
## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.2b | 2026-09-26 | beta | Reconcile S2 and S3 local implementation checks and preserve native lifecycle/parity gates | 7c30ea1 / 235875b | Codex |
| 0.2.1b | 2026-09-25 | beta | Add synthetic journal-phase recovery and selected native write-failure evidence | based on 411d2ed | LALIN |
| 0.2.0b | 2026-09-25 | beta | Add focused S2 migration implementation evidence without claiming runtime crash acceptance | based on 411d2ed | LALIN |
| 0.1.0b | 2026-09-20 | beta | Record standalone foundation, native evidence and user-confirmed audio; preserve incomplete split gates | based on 8429010 | LALIN |
