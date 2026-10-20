---
version: "0.1.0b"
created_at: "2026-09-27T10:22:00+07:00,Codex,17a5c96"
last_update: "2026-09-27T10:30:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback-reliability"
  doc_type: "rca"
  scope: "Paired G3 test assertion for an applied command whose ACK is lost before Play owner restart"
---

# RCA: Restart handoff test assumes the requested title survives media resolution

## Symptom

The new paired test attempt reports that Play did not apply the restart-check
command before simulated owner interruption. The failure condition combines
owner-session equality with a queue-title match, so the message does not identify
which condition failed.

## Evidence

| Evidence | Observation |
|---|---|
| apps/desktop/src-tauri/src/playback_handoff.rs restart scenario | The test supplies title G3 restart uncertain delivery and later searches STATE for that exact queue title. |
| apps/play-desktop/src/handoffReceiver.ts apply | The receiver first creates an item from the command title, then replaces it with mediaItem(track) after grant_handoff_media. |
| apps/play-desktop/src-tauri/src/handoff.rs grant_handoff_media | The native grant imports the canonical file and returns the catalog Track. |
| apps/play-desktop/src-tauri/src/library.rs track | A catalog track title comes from embedded metadata or, when absent, the file stem. The handoff command's display title is not passed into this catalog lookup. |
| Handoff snapshot contract | Queue STATE exposes catalog item identity and title; it does not promise to echo the incoming command title. |

## Root Cause

The new test uses a command-only display title as proof of queue application.
The receiver replaces that provisional item with the native catalog item
returned by media grant, so the published STATE title is derived from media
metadata or the filename. The assertion can fail after successful queue
application. This is a test-oracle mismatch; evidence does not indicate a
product handoff failure.

## Why the issue escaped detection

Earlier paired checks validated application through ACK/STATE revision and
queue behavior without asserting that a caller-supplied title is retained.
The new process-interruption attempt introduced the title-based assertion as a
convenient marker without checking the media-resolution contract.

## Proposed prevention

Capture the owner STATE returned by the pre-command HELLO. After closing the
command sender without reading ACK, verify that the same owner publishes exactly
one appended queue entry relative to that baseline. Use queue identity and
position/count as the proof, not the request's display title. Then interrupt
the owner and require Studio to retain the uncertain request and block replay
against the new owner session.

## Resolution and validation

The test now uses the prior owner's HELLO STATE as its queue baseline. After
closing the command sender without reading ACK, it requires the same owner to
publish exactly one appended queue entry. The paired Windows test passed 1/1
with a silent WAV and fresh disposable profile/app-data paths. It then restarted
Play and verified the request stays uncertain and is not replayed against the
new owner session.

Studio native handoff tests passed 6/6 with the paired test ignored in the
default run; Play native tests passed 31/31 with g3-test-app-data-dir. Both Rust
format checks and git diff --check passed. No product behavior changed; G3
remains partial.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-27 | beta | Diagnose and correct the process-interruption test oracle; record paired no-replay validation | based on 17a5c96 | Codex |