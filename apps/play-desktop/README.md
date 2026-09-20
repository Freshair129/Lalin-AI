---
version: "0.4.0b"
created_at: "2026-09-20T19:35:00+07:00,LALIN,8429010"
last_update: "2026-09-20T22:01:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "developer-guide"
  scope: "Lalin Play standalone foundation"
---

# Lalin Play — standalone foundation

Local audio/video player with Full and Compact layouts sharing one playback store,
persistent HTMLVideoElement and Web Audio EQ graph. Rust + Tauri v2 provides the native
window, selected-file access, metadata catalog, tray and single-instance shell.
This does **not** replace the decoder with Rust or provide VLC codec coverage.

Application version: `0.1.0`; executable: `lalin-play.exe`; app identifier:
`ai.lalin.play`. This is an additive development candidate, not a published release.
There is no Python/API/Studio runtime dependency. Studio's original Play remains
untouched until integration, migration and export gates pass.

## Develop and verify

Run from this directory (own npm/Cargo lockfiles; not a root npm workspace):

```powershell
npm ci --workspaces=false
npm test
npm run build
npm run check:native
npm run tauri -- dev
# Native debug executable with embedded frontend, no installer:
npm run tauri -- build --debug --no-bundle
```

Prerequisites: Node/npm, Rust Windows MSVC toolchain and Windows WebView2.
`npm run dev` alone is only a frontend server; real file/native commands require
Tauri. `node tools/make-smoke-audio.mjs` generates an ignored local WAV fixture;
it never overwrites an existing fixture. Play it through the native file picker.

## Local video (CR-003)

MP4/WebM entries show a contain/letterboxed video stage in Full and Compact.
Switching layouts/navigation does not remount the media element. Expand fills
the current window; Escape restores the previous layout. This is not an OS
fullscreen or separate picture-in-picture window. Audio-only files hide the
stage while using the same engine/EQ. CR-004 replaces the original stacked
Compact controls with an overlay and a 440x300 client minimum for audio/video.

## Minimal Compact and scrub previews (CR-004)

Compact exposes Play/Pause, ±10 seconds, seek/time, volume/mute, native fullscreen
and return to Full (approved CR-004 Addendum A).
Queue/EQ and secondary transport controls remain in Full; their state persists.
Video controls auto-hide after 2.5 seconds playing idle, except during focus or
drag; audio controls remain visible. Empty Compact offers a file-open action.

Hover/drag shows a frame from the target time without seeking main playback.
Release commits once; Escape/pointer cancel discards the draft. Keyboard range
changes seek immediately. One auxiliary muted video decodes preview frames only:
it never plays or joins Web Audio/MediaSession. Native authorization is reused;
one in-flight plus one newest pending decode and 24 cached 192x108-max frames
bound work. Errors show preview unavailable without breaking playback.
See [local evidence and remaining limits](../../docs/validation/LALIN_PLAY_MINIMAL_COMPACT.md).

Fullscreen is separate from Full library and the existing video Expand action.
Escape or the exit button restores the previous size, position and maximized
state; returning to Full exits fullscreen without replacing remembered Compact
bounds with monitor dimensions. Escape during a scrub cancels that draft first.
The ±10 buttons read the main element's live time and clamp to seekable ranges,
slightly before the endpoint, preserving play/pause and queue state. They are
disabled during drag, loading/error or unknown duration. Native fullscreen
commands are scoped; there is no new generic window capability or TV behavior.
See [fullscreen/skip evidence](../../docs/validation/LALIN_PLAY_FULLSCREEN_SKIP.md).

Native fixtures verified H.264/AAC MP4, VP9/Opus WebM and silent H.264 MP4 on
this host. Other codec/platform combinations are not guaranteed. Unknown
duration stays unknown until real metadata is available; decode errors retain
the queue. `node tools/make-smoke-video.mjs <existing-ffmpeg-exe>` generates
ignored developer fixtures only (no FFmpeg dependency in the shipped runtime).

## Storage and permissions

- Native `library-v1.json` lives in this application's app-data directory.
- Playlists, queue, EQ and opt-in resume use `lalin-play:v1:*` WebView storage.
- Startup does not auto-play. Queue restoration requires the user's opt-in.
- Only deliberately selected/dropped media is cataloged. Native resolution
  accepts catalog IDs, rechecks canonical paths and scopes asset access per file.
- Removing a library entry does not delete the media file. No scanning unrelated
  disks or reading the old Studio WebView profile.
- Native commands are explicitly listed in `build.rs` and `capabilities/main.json`;
  no remote-page or unrestricted filesystem/shell capability is granted.
- Closing hides to the tray. Explicit Quit exits; repeated launch focuses the
  existing process. Command-line file forwarding is not implemented yet.

## Current limits and next gates

Full/Compact switching, local catalog, playlists, queue, EQ and opt-in queue
restoration exist. Native audible WAV playback and surface continuity were
verified locally, but complete acceptance remains open:

- Explicit old Studio queue/EQ export/import and rollback: not implemented.
- Studio named-pipe delivery, session ACL and ACK reconciliation: not implemented.
- Missing-file relink and persistent per-mode window bounds: not implemented
  (bounds are currently remembered only during this process).
- Output-device loss, native TV/gamepad coverage and complete codec matrix:
  not verified on this candidate.
- Remote repository export, installer, updater signing and release: not done.
  Updater UI stays unavailable; no placeholder key or Studio/Cast key is used.

See approved ADR-004 and the foundation report in the parent repository's
`docs/architecture` and `docs/validation`; package these documents appropriately
before an independent repository export.

## Source provenance

Source repository: `https://github.com/Freshair129/Lalin-AI`.
Pinned baseline: `84290102b84fd76dec069bf6d61ffdd2fc8466ab`.

| Candidate | Baseline source and adaptation |
|---|---|
| `src/contracts.ts` | `packages/contracts/src/playback.ts`; standalone DTO/EQ definitions |
| `src/playback/audioEngine.ts`, `audioContext.ts`, `mediaSessionAdapter.ts`, `tvMode.ts` | Corresponding `apps/desktop/src/playback` files; standalone imports |
| `src/playback/usePlaybackStore.ts` | Existing consumer store; own persistence keys, opt-in restore, native catalog resolver and cancellation-generation guard |
| `src/components/PlaybackEQPanel.tsx` | Existing desktop EQ panel; local contracts import and accessible control labels |
| `src/playback/*test.ts` | Corresponding existing engine/EQ/TV unit tests; standalone imports |
| Native shell/catalog, App, Transport, PlaybackSettings, playlists, native adapter, fixture generator and App tests | New candidate implementation under approved ADR-004 |

No Cast/VacuumTube, AI models, sidecars, updater keys or user runtime data are
included. Root source license was not established for publication in this slice;
license/provenance and third-party notices remain an explicit pre-export gate.
Do not invent a license grant from this README.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.4.0b | 2026-09-20 | beta | Add approved native fullscreen, bounded relative seek and local verification | based on 8429010 | LALIN |
| 0.3.0b | 2026-09-20 | beta | Document minimal Compact, isolated frame preview, reduced bounds and evidence limits | based on 8429010 | LALIN |
| 0.2.0b | 2026-09-20 | beta | Document local video stage, shared media element, fixtures and codec limits | based on 8429010 | LALIN |
| 0.1.0b | 2026-09-20 | beta | Document native foundation, commands, provenance and remaining split gates | based on 8429010 | LALIN |
