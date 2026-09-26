---
version: "0.1.0b"
created_at: "2026-09-27T02:44:46+07:00,Codex,daa2867"
last_update: "2026-09-27T02:44:46+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback-reliability"
  doc_type: "rca"
  scope: "Cold Play owner registration before Studio-to-Play pipe readiness"
---

# RCA: Play owner registration does not become ready in the cold paired run

## Symptom

The expanded Windows paired-process test starts `lalin-play.exe` but times out
before the Studio client can complete HELLO/STATE. The process remains
responsive with a `Lalin Play` window, while the sender cannot connect to the
expected owner pipe.

## Evidence

| Evidence | Observation |
|---|---|
| Expanded paired test with release executable | Timed out before the cold owner pipe became connectable; the added FIFO and restart assertions were not reached. |
| Expanded paired test with debug executable | Also timed out when no Vite server was running; this launch is an invalid debug setup and is not acceptance evidence. |
| Manual release launch with a dedicated WebView2 profile | The Play process remained alive and responsive, but the paired client still could not observe an owner pipe. |
| `apps/play-desktop/src/App.tsx` | `bindHandoffReceiver` is started in the Tauri-only effect and its errors are passed to UI state. |
| `apps/play-desktop/src-tauri/src/handoff.rs` | `register_handoff_owner` marks the owner ready and creates the Windows pipe server; this command is the server startup path. |

## Root Cause

At the confirmed boundary, native owner registration did not become reachable
to the paired sender. The server is created only after the frontend calls
`register_handoff_owner`; process creation alone does not establish pipe
readiness. Available evidence does not distinguish a frontend mount/guard
failure, event/API bridge failure, command authorization failure, or a native
server creation error. The lower-level cause remains unconfirmed; no runtime
code change is justified by this evidence alone.

## Why the issue escaped detection

The normal Studio Rust library suite ignores the paired-process test. Earlier
G2 evidence covered unit/protocol behavior and builds, and the previous paired
run covered cold/warm command and ACK/STATE behavior before the new disposable
profile, FIFO sequence and restart requirements were added. Those checks did not
assert the current cold registration path under the isolated profile.

## Proposed prevention

Keep the paired gate open until the first owner-registration boundary reports
an observable success or failure and the Studio sender receives HELLO/STATE.
On the next diagnostic run, distinguish frontend effect entry, listener
resolution, `register_handoff_owner` result, and named-pipe creation without
weakening the same-session boundary or reusing user WebView data. Keep Studio
playback enabled until native and audible parity are proven.

## Resolution and validation

Unresolved. The sender-side FIFO test passed 3/3; the paired FIFO burst and
owner-restart checks were not reached. Studio native library tests passed 6/6
with the paired test ignored, and Play frontend/release builds passed. G3 stays
PARTIAL; no PR merge or parity acceptance is claimed.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-27 | beta | Record the unconfirmed cold owner-registration readiness boundary and remaining diagnosis | based on daa2867 | Codex |
