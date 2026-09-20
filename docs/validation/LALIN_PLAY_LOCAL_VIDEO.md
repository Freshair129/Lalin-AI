---
version: "0.1.0b"
created_at: "2026-09-20T20:01:00+07:00,LALIN,8429010"
last_update: "2026-09-20T20:01:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "validation"
  doc_type: "verification-report"
  scope: "CR-003 local video, Windows native debug and automated evidence"
---

# Lalin Play local video — implemented, locally verified with limitations

## Scope and provenance

User approved [CR-003](../product/CR-003--LALIN_PLAY_LOCAL_VIDEO.md) on 2026-09-20.
Work remains uncommitted on `codex/lalin-play-split`, baseline
`84290102b84fd76dec069bf6d61ffdd2fc8466ab`. Only standalone Play implementation
and directly related documents changed. Original Studio/API/contracts were not
edited. No remote export, commit, push, installer or update was performed.

App version remains `0.1.0` (unreleased development candidate); identity
`ai.lalin.play`. Latest native test binary:
`apps/play-desktop/src-tauri/target/debug/lalin-play.exe`.
SHA256: `D1889797C57824FFE345ADE6DDE49EA8CC5D172DB4716A1782B6DE2EE64CF029`.
Native startup loaded embedded `http://tauri.localhost/`, retained the old WAV
catalog and restored video entries without autoplay or a dev frontend server.

## Implementation

- Native picker/folder scan/drop and resolver accept audio plus MP4/WebM under
  the existing per-file scope. `kind` is backward-compatible and native-derived.
- A single persistent HTMLVideoElement replaces the audio-only element inside
  the standalone engine. It feeds the existing Web Audio EQ graph; no second
  player/decoder/audio process is added.
- Stable display host outside navigation branches; Full/Compact/expanded are
  layout changes. Audio-only hides the stage, not the playback owner.
- Video uses contain/letterbox. Loading, dimensions and duration follow real
  runtime metadata; missing/unsupported data is not represented as fake media.
- Expanded view fills the existing window with transport visible; Escape returns
  to the previous layout. This is not an OS fullscreen/TV or PiP implementation.
- Compact native minimum is 440x520 logical pixels for video, versus original
  440x300 for audio. Audio-to-video changes in an already Compact window also
  request the video minimum. Current window bounds still persist only in memory.

## Automated verification

| Check | Result | Evidence scope |
|---|---|---|
| `npm test` in `apps/play-desktop` | 30/30 PASS, 4 files | 27 inherited foundation checks plus 3 video integration cases |
| `npm run build` | PASS, 45 modules | TypeScript + bundled frontend |
| `cargo test --manifest-path src-tauri/Cargo.toml --offline` | 6/6 PASS | Audio/video filtering, selected-folder containment/dedup, old catalog, catalog replacement, sizing minimum |
| `npm run tauri -- build --debug --no-bundle` | PASS | Windows debug build, not signed distribution |
| `cargo fmt --check`, `git diff --check` | PASS | CRLF normalization notices are not test failures |
| Original `apps/desktop`, `apps/api`, `packages/contracts` diff | Empty | Earlier Studio 187-test/check:all results remain historical; not rerun as native video evidence |

Frontend integration tests assert one mounted element/unchanged parent, source,
position and play count through Full/Compact/EQ/expanded/Escape; actual metadata
events; mixed queue returning to audio hides video; decode failure keeps queue.
Inherited EQ and pending native-resolution Stop tests remain passing.
These use mocked native/media APIs and do not prove physical sound or GPU decoding.

Initial decode-error test failed because jsdom has no `MediaError` constructor.
The test fixture now supplies standard error constants; no production error
handling was weakened. A native build attempt was blocked by the test process
locking its executable; after scoped test-process teardown it built successfully.

## Native fixture and screenshot evidence

`tools/make-smoke-video.mjs` generated three 60-second 640x360/24fps test clips
with moving patterns and an embedded frame clock. Audio clips have short 880Hz
pulses aligned with a white visual cue once per second. Generated files are
ignored under `.smoke/video`; no user videos were read or modified.
FFmpeg was used as a developer fixture generator only, not a player dependency.

| Fixture / action | Observed native result | Screenshot |
|---|---|---|
| MP4 H.264 + AAC, latest binary | Decoded frame, 640x360, PLAYING at 0:34; Compact at 0:45 and EQ at 0:56; same four-entry mixed queue | [Full](evidence/lalin-play-video/mp4-full-latest.png), [Compact + EQ](evidence/lalin-play-video/mp4-compact-eq.png) |
| WebM VP9 + Opus | Full 0:09 → Compact 0:19; different decoded frames, one queue entry, correct 1:00 duration | [Full](evidence/lalin-play-video/webm-full.png), [Compact](evidence/lalin-play-video/webm-compact.png) |
| WebM Pause | Repeated observation retains PAUSED at 0:28 with identical frame clock 28.417 | [Paused](evidence/lalin-play-video/webm-paused.png) |
| WebM Seek while paused | Time and frame jump to 0:50/50.167; remains paused | [Seek](evidence/lalin-play-video/webm-seek.png) |
| WebM expanded / Escape / Full | Same paused position and frame across expanded, Compact return, and Full return | [Expanded](evidence/lalin-play-video/webm-expanded.png) |
| Video → WAV audio | Video stage disappears, WAV PLAYING at 0:10 with real 2:00 duration, two queue entries retained | [Audio after video](evidence/lalin-play-video/audio-after-video.png) |
| WAV → silent H.264 MP4 | Decoded moving frame and PLAYING 0:09/1:00, no audio-track requirement; three queue entries retained | [Silent video](evidence/lalin-play-video/silent-mp4.png) |
| Final Stop | IDLE 0:00 and video seeks to first frame; queue/EQ retained | Observed in native UI; player left stopped |

Earlier screenshots `mp4-full.png` and `mp4-compact-initial.png` came from
pre-sizing binary `C743A1E72F5507A799F44FC1D0061A3EEE866CFDD659440709509727F80D50B4`.
They exposed an 85px-high Compact picture caused by the inherited 340px native
window height. See [RCA](../../.brain/rca/2026-09-20-lalin-play-compact-video-height.md).
The latest Compact capture proves corrected image space; initial captures are
retained as diagnostics, not claimed as the final UI.

## Evidence limitations and remaining gates

- Native decoded frames, pause, seek, mixed media and surface continuity are
  proven on this host. MP4/WebM extensions alone do not guarantee every codec.
- An asynchronous question asked the user to confirm physical beep output and
  moving video. At report time no reply was received for this video build.
  Earlier user-confirmed WAV sound belongs to the prior audio foundation build;
  it is not promoted to current video audio/A-V sync proof. A/V drift was not
  instrumented or measured.
- Output-device switching/loss, audible EQ effect, gamepad/TV, GPU acceleration,
  malformed-file native smoke, large catalogs and full codec/device matrix are
  NOT RUN in this slice. Error behavior has automated mocked coverage.
- Native folder import and restored-catalog access were exercised; drag/drop
  uses the same native importer but was not driven manually in this slice.
- Expanded current-window presentation was verified, not OS fullscreen.
- The standalone repository split remains incomplete: old-state migration,
  Studio IPC, export/removal and installer/updater gates stay open in ADR-004.

## Documentation version diff

CR-003 `0.1.0b → 0.1.1b`; PRD `1.2.0b → 1.2.1b`;
ADR-004 `0.2.0b → 0.2.1b`; AGENTS `0.1.1b → 0.1.2b`;
PRODUCT `0.2.1b → 0.2.2b`; sitemap `0.1.1b → 0.1.2b`;
docs index `0.6.0b → 0.6.1b`; standalone README `0.1.0b → 0.2.0b`.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | beta | Record approved local video implementation, native fixtures/screenshots and explicit evidence limits | based on 8429010 | LALIN |
