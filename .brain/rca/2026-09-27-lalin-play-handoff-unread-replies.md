---
version: "0.1.0b"
created_at: "2026-09-27T00:56:22+07:00,Codex,ed20af8"
last_update: "2026-09-27T00:56:22+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback-reliability"
  doc_type: "rca"
  scope: "ACK and STATE delivery on Studio-to-Play named pipes"
---

# RCA: Play disconnected before Studio read ACK and STATE

## Symptom

The Play receiver recorded a committed playback request and wrote its ACK and
STATE frames, but Studio sometimes returned `delivery_unknown` or failed to
refresh playback state. The command could be committed even though the caller
did not receive its response pair.

## Evidence

| Evidence | Observation |
|---|---|
| Paired Windows runtime test | Play wrote the applied ACK and STATE, then Studio's response read returned `pipe_disconnected`. |
| Play named-pipe server | It wrote response frames and immediately called `DisconnectNamedPipe`. |
| Microsoft `DisconnectNamedPipe` documentation | Disconnecting discards unread data from the pipe instance. |
| Isolated paired test after the fix | The client read ACK, deliberately closed before STATE, and recovered the stored ACK and matching owner state via QUERY_RESULT. |

## Root Cause

The server disconnected the pipe immediately after writing the response frames.
Windows may discard pipe data that the client has not read when the server calls
`DisconnectNamedPipe`. The client therefore could miss the trailing STATE even
though Play had applied the command and written both frames.

## Why the issue escaped detection

Protocol unit tests verified ACK and STATE values but did not make a real Windows
named-pipe client close between the two reads. The original paired run first
exposed the disconnect; tracing then confirmed the response order and the server
disconnect behavior.

## Proposed prevention

Flush the server pipe after writing its response and before disconnecting, so a
connected client can consume buffered response data. Keep command identity,
owner session and revision in ACK/STATE so the client can query the recorded
result if a disconnect still occurs during interruption or shutdown.

## Resolution and validation

The receiver now calls `FlushFileBuffers` before `DisconnectNamedPipe`. A fresh
paired Windows test passed: cold and warm delivery returned matching ACK/STATE;
the deliberate ACK-then-disconnect case recovered the original ACK and state
through QUERY_RESULT; duplicate replay did not advance the queue or revision.
Play Rust tests passed 31/31. A flush can still fail when a test or caller has
already closed the client pipe; that case is handled by querying the saved
request result. Full playback parity and process-restart recovery remain open.

## References

- [Microsoft: DisconnectNamedPipe](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-disconnectnamedpipe)
- [Microsoft: FlushFileBuffers](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers)

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-27 | beta | Record unread ACK/STATE disconnect root cause, flush fix and reconciliation evidence | based on ed20af8 | Codex |
