---
version: "0.1.0b"
created_at: "2026-09-20T19:55:00+07:00,LALIN,8429010"
last_update: "2026-09-20T19:55:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "playback"
  doc_type: "root-cause-analysis"
  scope: "CR-003 Compact video sizing"
---

# Compact video inherits audio-only height

## Symptom

Video plays continuously in Compact but the picture is too small for viewing.

## Evidence

Native `mp4-compact-initial.png` in `docs/validation/evidence/lalin-play-video`
shows a 500x340 client with an approximately 85px-high letterboxed video area.
`Presentation.small` defaults to 500x340 and `set_surface` uses the same minimum
440x300 for audio and video. The test verifies element continuity but not pixels.

## Root Cause

The new video stage shares the remaining flex space after header, tabs, heading
and transport. Reusing the old audio-only native size leaves too little height.

## Why the issue escaped detection

jsdom has no layout engine and the initial Full view has sufficient height.
Only native Compact capture exposed the actual remaining video area.

## Proposed prevention

Within approved PLAY-V03, supply video presentation state to the existing narrow
native surface command. Enforce a video-only 440x520 logical minimum and grow a
running Compact window when audio changes to video. Keep audio minimum unchanged,
preserve media state, and add native sizing unit checks plus a native screenshot.

## Resolution evidence

Implemented a video-aware minimum through the existing `set_surface` command.
Rust test `video_has_space_without_changing_audio_compact_minimum` passes.
Native `webm-compact.png` shows the corrected 500x520 client with a readable
picture and visible transport, advancing from Full 0:09 to Compact 0:19.
See `docs/validation/LALIN_PLAY_LOCAL_VIDEO.md` for binary provenance and limits.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | beta | Record observed Compact video geometry and scoped sizing correction | based on 8429010 | LALIN |
