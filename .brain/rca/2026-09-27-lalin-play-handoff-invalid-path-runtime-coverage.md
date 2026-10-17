---
version: "0.1.0b"
created_at: "2026-09-27T08:47:00+07:00,Codex,b90ffaed"
last_update: "2026-09-27T09:01:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback-reliability"
  doc_type: "rca"
  scope: "G3 native receiver rejection of invalid local-file commands"
---

# RCA: missing paired-process evidence for invalid handoff paths

## Symptom

The Windows paired Studio–Play test had passed valid cold/warm commands, but G3
still had no runtime evidence that Play rejects an invalid path received over
the native named pipe without changing playback state.

## Evidence

- The approved S3 wire contract requires a local canonical absolute path and
  says validation happens before enqueueing or granting the file.
- `apps/play-desktop/src-tauri/src/handoff.rs` validates the media path before
  asset-scope grant and before owner-state mutation. Existing Rust tests reject
  URL, UNC, device and non-file paths at the validator boundary.
- Studio has a separate test that rejects URL and non-media paths before send.
- Before this follow-up, the ignored paired test sent only valid media paths;
  neither side's unit test crossed the live pipe and observed receiver behavior.
- The first post-restart attempt stopped at a test guard before sending the bad
  path. `open_client` maps `ERROR_PIPE_BUSY` to `Ok(None)`, and
  `connect_with_launch` reports `cold=true` when its first open returns no pipe.
  In this check the supplied launch closure was a no-op, so that flag did not
  prove the owner had exited.

## Root Cause

The original issue was an acceptance-coverage gap, not a confirmed receiver
defect. The paired G3 case covered delivery and reconciliation for valid
commands, while invalid-path behavior was only tested at independent unit
boundaries. That left the server's wire-level error response and state
immutability unproven. The first attempt to close the gap also had a test
assumption: after an established owner restart, it used the helper's `cold` hint
to infer owner loss even though a transient busy pipe can make the initial open
return no pipe without the owner changing.

## Why the issue escaped detection

The paired-process test is ignored in the ordinary Studio test suite and was
focused on cold/warm startup, FIFO, ACK/STATE recovery and owner restart. Passing
validator unit tests did not demonstrate that a raw invalid `COMMAND` was
rejected by the running Play receiver. The connection helper's cold hint tracks
whether the first open succeeded; it is not an owner-liveness check after a
session has already started.

## Proposed prevention

Keep a live paired invalid-path case that sends a URL-shaped path which is not
an absolute Windows path, asserts `ERROR/invalid_file_path`, then queries STATE
and compares owner, revision and the complete snapshot with the pre-command
state. Use a path rejected before filesystem lookup so the test cannot touch a
network share.

## Resolution and validation

The ignored paired Windows test now performs that check over the current
same-logon named pipe after owner restart. It ignores the helper's cold hint and
uses the HELLO/READY owner session to verify the expected owner. It passed
**1/1**; Play returned `invalid_file_path`, and the follow-up STATE preserved the
owner session, revision and complete snapshot. The test used an isolated Tauri
CLI-built Play executable with `g3-test-app-data-dir`, an empty disposable
WebView2 profile, separate test-only app-data and a 120-second silent WAV under
system temp.

Studio native regression tests passed **6/6**, with the paired test ignored in
that ordinary run. Play native tests with `g3-test-app-data-dir` passed **31/31**;
Rust formatting checks and `git diff --check` passed.

This does not prove UNC/mapped-drive or reparse runtime rejection, cross-session
or remote-client rejection, concurrent-client ordering, process-interrupted ACK
loss, Studio/API shutdown during playback or audible parity. Keep ordinary
Studio playback enabled.
