---
version: "0.1.3b"
created_at: "2026-09-27T09:11:00+07:00,Codex,1084d5e"
last_update: "2026-09-27T09:49:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback-reliability"
  doc_type: "rca"
  scope: "Concurrent Studio clients connecting to a single-instance Play named pipe"
---

# RCA: Concurrent handoff can request a cold Play launch while the owner is busy

## Symptom

Two independent Studio clients can send handoff requests while the one-instance
Play named pipe is serving another connection. The waiting client can take the
same cold-launch path used when no Play owner is running, even though it just
observed the pipe as busy.

## Evidence

| Evidence | Observation |
|---|---|
| `apps/desktop/src-tauri/src/playback_handoff.rs::windows_pipe::open_client` | On `ERROR_PIPE_BUSY`, it calls `WaitNamedPipeW` for 250 ms and then returns `Ok(None)` without retrying `CreateFileW`, including when the wait succeeds. |
| `connect_with_launch_checked` in the same file | Any initial `Ok(None)` invokes the launch callback before retrying the pipe. |
| `apps/play-desktop/src-tauri/src/handoff.rs::serve` | After each client, the loop drops its pipe handle and creates a new instance. A caller between disconnect and recreation can observe `ERROR_FILE_NOT_FOUND`, which is also returned as `Ok(None)`. |
| `apps/play-desktop/src-tauri/src/handoff.rs::create_server_pipe` | The server creates one pipe instance at a time; the first owner pipe uses `FILE_FLAG_FIRST_PIPE_INSTANCE`. |
| Existing paired G3 test | Exercises one Studio sender at a time; the normal warm-path tests therefore do not cover `ERROR_PIPE_BUSY` from a second independent client. |
| Approved integration spec §2 | Requires serialized owner mutations and FIFO delivery; the server loop processes one pipe connection at a time. |
| Reproducing paired G3 test | Holding the live pipe while a second sender connected triggered the cold-launch guard. Releasing the held client and immediately opening another sender also reproduced the absent-instance window after disconnect. |

## Root Cause

The client result type `Option<File>` conflates two different states: no pipe
instance exists and an existing instance is temporarily occupied. The busy path
also discards the result of `WaitNamedPipeW`. The generic cold-start helper
interprets either state as a missing owner and calls its launch callback. The
server compounds this by dropping and recreating its single pipe instance after
every connection, making a live owner briefly appear absent. A concurrent or
immediately-following sender can therefore spawn another Play executable while
the registered owner is serving or has just completed a client. The owner
mutation loop itself remains serialized; endpoint lifetime and client
classification are the root causes.

## Why the issue escaped detection

The existing native sender mutex serializes commands within one Studio process,
and all paired G3 commands so far came from one `StudioHandoffClient`. Focused
tests covered the cold path and warm path separately but never held the sole
pipe instance while a second independent sender connected.

## Prevention applied

Reuse the disconnected server pipe instance instead of dropping and recreating
it after every client. Keep a busy endpoint distinct from an absent endpoint and
retry after `WaitNamedPipeW` signals availability; if a busy owner remains
unavailable past a bounded deadline, return a busy/unavailable error without
invoking the cold-launch callback. Only a genuinely absent initial endpoint may
enter cold startup. Add a real Windows paired test that holds one connection,
releases separate Studio client states concurrently, and requires one applied
ACK per request, unique increasing revisions, final queue order matching those
ACK revisions, and zero launch callback invocations.

## Resolution and validation

Studio now waits for the current pipe after `ERROR_PIPE_BUSY`, retries while a
previously observed owner is reconnecting, and returns an error rather than
cold-launching after the bounded wait. Play retains the single pipe instance
after each disconnect and calls `ConnectNamedPipe` again on that handle.

The ignored Windows paired test passed **1/1** after the change. It held one live
Play connection, released four independent Studio client states together, and
verified that no sender completed or invoked the cold-launch callback until the
held connection closed. Each command then received one applied ACK; ACK
revisions were unique and strictly increasing, and the final queue suffix
matched ACK revision order. The run also passed existing cold/warm delivery,
ACK/STATE reconciliation, duplicate suppression, owner restart without blind
replay and invalid URL-shaped receiver rejection.

The test initially required contiguous ACK revision numbers. Evidence in
`HandoffService::set_snapshot` and `handoffReceiver.ts` shows playback snapshots
can advance revision between command ACKs, so the assertion now requires strict
increase rather than contiguous numbering. Play native tests passed **31/31**
with `g3-test-app-data-dir`; Studio handoff tests passed **6/6** with the paired
test ignored in the normal suite. The isolated Tauri CLI release build and both
Rust format checks passed. G3 remains partial; keep Studio playback enabled
until the remaining parity gates pass.

The final source also releases a failed pipe instance before attempting to
create its replacement. The Tauri CLI test-feature release executable was
rebuilt after that correction, and the isolated paired Windows lifecycle test
passed again **1/1** against the rebuilt executable.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.3b | 2026-09-27 | beta | Rebuild final Play source and rerun concurrent paired lifecycle; retain remaining parity gates | based on 1084d5e | Codex |
| 0.1.2b | 2026-09-27 | beta | Fix busy-pipe cold launch and pipe recreation gap; verify concurrent paired FIFO ordering | based on 1084d5e | Codex |
| 0.1.1b | 2026-09-27 | beta | Confirm the owner pipe recreation window in paired run and refine revision-order validation | based on 1084d5e | Codex |
| 0.1.0b | 2026-09-27 | beta | Record source-confirmed busy-pipe cold-launch classification gap and prevention plan | based on 1084d5e | Codex |
