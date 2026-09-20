---
version: "0.1.0b"
created_at: "2026-09-20T22:04:00+07:00,LALIN,8429010"
last_update: "2026-09-20T22:04:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "validation"
  doc_type: "verification-report"
  scope: "CR-004 Addendum A native fullscreen and relative seek"
---

# Lalin Play fullscreen and ten-second controls

## Outcome and provenance

**Implemented locally; PASS WITH LIMITATIONS.** User approved CR-004 Addendum A
on 2026-09-20 before implementation. C-3 / MEDIUM risk. This is not release,
installer or complete device-matrix qualification. No commit/push/export occurred.

Workspace `F:\lalin`, branch `codex/lalin-play-split`, base
`84290102b84fd76dec069bf6d61ffdd2fc8466ab`, existing uncommitted work preserved.
Changes are confined to standalone Play and its documentation; no Studio/API
source changes were made by this task. Concurrent headless-voice work is excluded.

Native debug binary: `apps/play-desktop/src-tauri/target/debug/lalin-play.exe`.
SHA256: `EC515A51AB63D0D653EB1812D64D899673117122B28873C50244FDC708911288`.
Application version remains **0.1.0**, separate from document versions.

## Checks

| Check | Result |
|---|---|
| `npm test` | PASS: 48 tests across 7 files; final rerun at 22:00 ICT |
| `npm run build` | PASS: TypeScript/Vite, 48 modules |
| `cargo test --offline --manifest-path src-tauri/Cargo.toml` | PASS: 7 Rust tests |
| `cargo fmt --check --manifest-path src-tauri/Cargo.toml` | PASS |
| `npm run tauri -- build --debug --no-bundle` | PASS: embedded native debug binary above |
| `git diff --check` | PASS for tracked changes; CRLF notices only |
| React review | Stable main media host, effect cleanup, native-acknowledged UI, serialized presentation actions; no duplicate owner |
| Native boundary review | Two scoped fullscreen commands; no generic window capability, asset scope, decoder or TV-mode expansion |

Automated checks cover live media position rather than stale store/hover time,
playing/paused preservation, queue/EQ preservation, discontinuous seekable ranges,
start/end/very-short/unknown media, disabled states, Escape propagation during
scrubbing, native acknowledgment/error reconciliation and remembered bounds.
Mock IPC failure coverage does not prove actual Windows failure recovery.

## Native evidence

Windows screenshots captured through the Computer Use workflow from the built
application, not mocks. Existing local generated fixtures only: silent H.264
MP4 (60 s), VP9/Opus WebM (60 s), WAV (120 s). Playback was silent or muted;
screenshots do not prove speaker output or A/V synchronization.

| Requirement / scenario | Observed result and evidence |
|---|---|
| C09: native fullscreen | [1920×1080](evidence/lalin-play-fullscreen/native-fullscreen.png), no native title bar/taskbar, same paused MP4 at 0:18 |
| C09: Escape restore | [Before](evidence/lalin-play-fullscreen/paused-before.png) and [after](evidence/lalin-play-fullscreen/escape-restored.png): outer 502×372 at screen origin 241,234, same time; client 500×340 |
| C10: fullscreen → Full → Compact | [Full](evidence/lalin-play-fullscreen/full-return.png) restores library and queue, paused 0:59; [Compact](evidence/lalin-play-fullscreen/compact-restored.png) restores original 500×340 client, not fullscreen dimensions |
| C10: maximized restore | [Before](evidence/lalin-play-fullscreen/maximized-before.png) / [after Escape](evidence/lalin-play-fullscreen/maximized-restored.png): same 1920×1032 maximized capture with title bar and paused 0:49 |
| C11: paused MP4 ±10 | [0:18](evidence/lalin-play-fullscreen/paused-before.png) → [0:28](evidence/lalin-play-fullscreen/paused-plus-ten.png) → [0:18](evidence/lalin-play-fullscreen/paused-minus-ten.png); paused throughout, burn-in timestamps agree |
| C11: endpoint | Seek near 0:58 then +10 → [0:59 / decoded frame 59.917](evidence/lalin-play-fullscreen/skip-end-clamped.png), still paused, no automatic next track |
| C11/C13: playing WebM | [+10 keeps playing](evidence/lalin-play-fullscreen/webm-playing-skip.png), followed by [fullscreen continuing at 0:34](evidence/lalin-play-fullscreen/webm-fullscreen-playing.png), not restarted at zero |
| C12: isolated fullscreen preview | [Main paused 0:41.500; thumbnail 0:20](evidence/lalin-play-fullscreen/fullscreen-preview.png); main image/time unchanged across observations |
| C12: minimum bounds | [440×300 client](evidence/lalin-play-fullscreen/minimum-controls.png): ±10, Play/Pause, time, volume, Fullscreen and Full fit without queue/EQ buttons |
| C13: audio-only | Muted WAV [paused 1:18](evidence/lalin-play-fullscreen/audio-before.png) → [+10 gives 1:28](evidence/lalin-play-fullscreen/audio-plus-ten.png); [fullscreen](evidence/lalin-play-fullscreen/audio-fullscreen.png) retains 1:28 and the audio-only cover |

Last confirmed playback state was paused and muted in audio fullscreen. The
final exit-button check was interrupted by detected user interaction; the next
capture did not show the app contents, so native input stopped. No audio exit
screenshot or final window-state claim is made. Escape and Full-route restoration
were already verified separately above. Native failure, rapid-click arbitration
and Escape-during-drag are automated evidence, not forced Windows failures.

## Remaining limits and adjacent observations

- Single-host/monitor evidence only. DPI 150%, multi-monitor placement, physical
  touch, all keyboard/screen-reader paths, output-device loss and codec matrix
  were not exercised in this turn.
- CPU/GPU/memory profiling, physical audible output and A/V sync were not checked.
- The prior paused-video resize compositor artifact remains: during manual
  resize, the paused frame can temporarily draw small until a new decoded frame
  (for example after seek). It was observed again; not introduced or fixed here.
- Existing natural-end UI can show 0:00 while retaining the final frame; not
  changed by this feature. Endpoint-clamped ±10 stayed paused as recorded above.
- Complete C12 device/keyboard matrix and C13 broader device checks remain open.
  This report does not claim every CR-004 acceptance condition is fully closed.
- Studio handoff, old-state migration, independent repository publication,
  installer, updater signing and release qualification remain separate gates.

## Document version diff

| Document | Before → after |
|---|---|
| CR-004 | 0.2.0b → 0.2.1b: approval and evidence |
| PRD | 1.4.0b → 1.4.1b: approved implementation status |
| ADR-004 | 0.3.1b → 0.4.0b: native restore/seek contract |
| Sitemap | 0.2.1b → 0.3.0b: fullscreen navigation |
| Play README | 0.3.0b → 0.4.0b: controls and behavior |
| AGENTS | 0.2.0b → 0.2.1b: evidence pointer |
| Docs index | 0.7.1b → 0.8.0b: new verification report |
| This report | new 0.1.0b |

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | beta | Record Addendum A implementation, tests, native captures and explicit limits | based on 8429010 | LALIN |
