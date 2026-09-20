---
version: "0.1.0b"
created_at: "2026-09-20T21:36:24+07:00,LALIN,8429010"
last_update: "2026-09-20T21:36:24+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "validation"
  doc_type: "verification-report"
  scope: "Local CR-004 Compact overlay and scrub-preview evidence"
---

# Lalin Play minimal Compact — local verification

## Outcome and provenance

**Implemented locally; PASS WITH LIMITATIONS.** CR-004 was explicitly approved
on 2026-09-20. No commit/push, installer, release or repository export occurred.
Worktree: `F:\lalin`, branch `codex/lalin-play-split`, base `8429010` with existing
uncommitted standalone work preserved. Original Studio/API/packages are unchanged.

Native debug executable: `apps/play-desktop/src-tauri/target/debug/lalin-play.exe`.
SHA256: `1B220D92D200FD345428CAD43786B71E71E34E6583B7963ADDBDFD0A0F595639`.
App version remains `0.1.0`; document versions are not release versions.

## Checks run

| Check | Result |
|---|---|
| `npm test` | PASS, 40/40 across 6 files, including 10 new preview/Compact tests |
| `npm run build` | PASS, TypeScript and Vite; 47 modules |
| `cargo test --offline --manifest-path src-tauri/Cargo.toml` | PASS, 6/6 Rust tests |
| `npm run tauri -- build --debug --no-bundle` | PASS; frontend embedded in native executable |
| `cargo fmt --check --manifest-path src-tauri/Cargo.toml` | PASS |
| `git diff --check` | PASS; line-ending notices only |
| React lifecycle/accessibility review | Stable main video host, isolated decoder, cleanup/timers, focused controls reveal, bounded cache/work |
| Ownership/security review | One playback owner/EQ graph; preview never calls play; native resolver reused, no capability/CSP/dependency expansion |

Initial test failures were fixture gaps: jsdom lacks pointer capture and mock
implementations needed resetting in `beforeEach`. Test fixtures were corrected;
native input behavior was then checked separately. No runtime workaround was
added to hide these test-environment failures.

## Native UI evidence

Existing local developer fixtures: H.264/AAC MP4, VP9/Opus WebM, WAV.
No external media downloaded. Native title bar, local-file access and Full layout
remain. Screenshots below are actual Windows captures, not rendered mockups.

| Evidence | Observed result |
|---|---|
| [MP4 hover](evidence/lalin-play-compact/mp4-hover.png) | Main frame/time stays paused at 0:13; preview shows a different frame at 0:41 |
| [MP4 seek](evidence/lalin-play-compact/mp4-seek.png) | Drag/release seeks to 0:47 and stays paused; image and timeline agree |
| [Full return](evidence/lalin-play-compact/full-return.png) | Same MP4 image/time 0:47 PAUSED; Full controls restored, queue retained |
| [WebM hover](evidence/lalin-play-compact/webm-hover.png) | Main frame 0:41; real preview at 0:21; no MP4 thumbnail carried over |
| [Controls hidden](evidence/lalin-play-compact/controls-hidden.png) | WebM continues at 0:54 with no overlay after pointer/focus inactivity; controls returned at end |
| [Minimum left edge](evidence/lalin-play-compact/minimum-left-edge.png) | 440x300 client (442x332 captured window); preview 0:01 remains inside window, main 0:23 |
| [Minimum right edge](evidence/lalin-play-compact/minimum-right-edge.png) | Same minimum size, preview 0:58 clamped inside right edge, main still 0:23 |
| [Audio minimum](evidence/lalin-play-compact/audio-minimum.png) | WAV runs with title, neutral icon and minimal transport; no stage/preview/queue/EQ tabs |

Default video Compact was also observed at 500x340 client (502x372 window).
Final app left paused on the WAV fixture; volume chosen by user during inspection
was preserved. No claim of physical audible output in this turn.

## Acceptance mapping and limits

- PLAY-C01: native visual PASS for video/audio and Full return.
- PLAY-C02: auto-hide/reveal/pause native PASS; focus/idle timing automated PASS.
  Physical touch not run; keyboard range behavior simulated in component tests.
- PLAY-C03: native MP4/WebM actual-frame PASS; rapid latest-pending behavior
  automated PASS. No promise of every frame/codec or zero decode latency.
- PLAY-C04: paused hover/drag native PASS; commit-once/cancel/Escape automated PASS.
  Main time/source/state continuity and play-call count covered by integration tests.
- PLAY-C05: bounded 24-entry cache, no preview play, stale/disposed request,
  authorization completion after unmount, timeout/canvas-error tests PASS.
- PLAY-C06: native video/audio/Full transitions PASS; queue/EQ/volume ownership
  integration tests PASS. Silent video native evidence is CR-003, not rerun here.
- PLAY-C07: default/minimum viewport and both tooltip edges native PASS at this
  host's current scale. **DPI 150% not run; no OS display settings changed.**
- PLAY-C08: tests/build/screenshots PASS; **CPU/GPU/memory profiling, long-file
  stress, output-device changes, physical audio/A-V sync and wider codec matrix
  not run.** Cache/decode bounds are code/test evidence, not profiling results.

Full acceptance across all device/DPI cases remains open. This report is local
development evidence, not release qualification or completion of the Play split.

## Known adjacent behavior — not changed

At natural end of queue, the existing store sets `state: idle, currentTime: 0`
while the media can still display its last decoded frame; this was visible during
inspection. `usePlaybackStore.ts`'s existing ended handler explains the reset.
Resizing that ended video also temporarily cleared the displayed frame until a
seek. These are recorded separately from CR-004 preview and are not fixed here.

## Implementation references

`CompactTransport.tsx` owns only display/draft interaction. `FramePreview` owns
one muted, paused auxiliary video and a 192x108 maximum canvas with 24-frame
cache. Decode is serial with one newest pending target; dispose drops results,
listeners and source. Main engine source, graph and stage were not changed.

Platform references consulted: [MDN seeked event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/seeked_event)
and [MDN drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage).
Native screenshots, not API availability alone, establish this host's asset-URL
decode/canvas behavior.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | beta | Record CR-004 local implementation, native frame evidence and remaining device/performance limits | based on 8429010 | LALIN |
