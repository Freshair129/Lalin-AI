---
version: "0.1.1b"
created_at: "2026-09-20T19:22:09+07:00,LALIN,8429010"
last_update: "2026-09-20T19:35:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "playback"
  doc_type: "root-cause-analysis"
  scope: "ADR-004 new standalone local-file resolver"
---

# Pending native file resolution can outlive Stop

## Symptom

The new standalone store can start audio after the user presses Stop while the
native file-access check is pending. This is in the uncommitted split candidate,
not a claim about the current Studio release.

## Evidence

`apps/play-desktop/src/App.test.tsx`: hold the mocked `resolve_media` promise,
call `play`, call `stop`, then resolve the file. The test run at 19:22 ICT on
2026-09-20 failed: `HTMLMediaElement.play` was called once, expected zero.
The other eight tests in that file passed.

## Root Cause

The extraction adds `await resolveMedia(item)` ahead of `engine.loadAndPlay`.
Stop only stops the existing audio element; it does not invalidate the awaited
request. Its eventual completion therefore starts playback after the stop intent.

## Why the issue escaped detection

The inherited engine/EQ tests have no asynchronous native path resolver. Initial
manual playback had already resolved before transport actions were used.

## Proposed prevention

Within the approved ADR-004 single-owner/lifecycle scope, assign a generation to
each local-file load. Stop, pause, queue clear and replacement invalidate prior
generations. Ignore stale resolutions/errors and retain current state. Keep the
controlled-promise regression test; do not hide the race with waits/timeouts.

## Resolution and validation

Implemented generation invalidation in the standalone store only. A replacement
also stops the prior engine before resolving the next file. The deterministic
Stop-during-resolution regression now passes; all 27 frontend tests passed both
in the candidate and in the isolated source copy on 2026-09-20. This is mocked
native-resolution evidence, not a claim of complete cross-process IPC validation.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-09-20 | beta | Record generation guard and passing controlled-promise regression | based on 8429010 | LALIN |
| 0.1.0b | 2026-09-20 | beta | Reproduced pending native resolution after Stop; scoped prevention under approved ADR-004 | based on 8429010 | LALIN |
