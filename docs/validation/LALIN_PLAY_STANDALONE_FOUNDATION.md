---
version: "0.1.0b"
created_at: "2026-09-20T19:35:00+07:00,LALIN,8429010"
last_update: "2026-09-20T19:35:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "validation"
  doc_type: "verification-report"
  scope: "ADR-004 S1 and partial S2; Windows local evidence only"
---

# Lalin Play standalone foundation — local evidence

## Outcome and boundary

**S1 LOCAL PASS; S2 PARTIAL. Overall repository split is NOT complete.**

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
| Native Studio named pipe, same-session ACL, FIFO/ACK/reconciliation | NOT IMPLEMENTED |
| Command-line file forwarding, cold/warm Studio handoff and Studio exit | NOT VERIFIED; repeated launch currently focuses only |
| Device removal/recovery, native output selection, TV/gamepad and codec coverage | NOT RUN on this candidate |
| Standalone remote checkout, export SHA, license/notices audit | NOT RUN |
| Removing original Studio Play, native Arrange/Cast regression smoke | NOT RUN; original implementation and shared consumers preserved |
| NSIS install/uninstall, signed updater, GitHub release | NOT RUN; updater stays unavailable |

Next approved implementation work is S2 completion and S3 delivery/security
integration. S4–S7 remain gated by ADR-004. Recovery currently requires only
stopping the additive candidate; the prior Studio sources and user state remain
intact. Temporary isolated build files and fixture are ignored under `runtime/`
and `.smoke/`; they were retained, not committed or deleted.

## Version changes in this slice

AGENTS `0.1.0b → 0.1.1b`; PRD `1.1.0b → 1.1.1b`; PRODUCT `0.2.0b → 0.2.1b`;
repository SOT `0.4.0b → 0.4.1b`; docs index `0.5.0b → 0.5.1b`;
sitemap `0.1.0b → 0.1.1b`; ADR-004 `0.1.0b → 0.1.2b`.
Documentation approval/status changes do not bump Studio/Cast application versions.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | beta | Record standalone foundation, native evidence and user-confirmed audio; preserve incomplete split gates | based on 8429010 | LALIN |
