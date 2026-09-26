---
version: "0.1.1b"
created_at: "2026-09-26T23:22:25+07:00,Codex,ed20af8"
last_update: "2026-09-27T00:56:22+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback-security"
  doc_type: "rca"
  scope: "Studio-to-Play named-pipe client authorization order"
---

# RCA: Play rejected named-pipe clients before reading HELLO

## Symptom

Change risk: **HIGH**, because the defect prevents every native handoff at the
same-logon authorization boundary.

On 2026-09-26, an isolated Windows G3 run launched the cold Play process, but
Studio's handoff returned `delivery_unknown`. A warm Add to Queue request and a
read-only playback-state query also returned `delivery_unknown`. Play remained
idle with an empty queue, and a listener on the Play window observed no
`play-handoff-command` event. No media was played.

## Evidence

| Evidence | Observation |
|---|---|
| `apps/play-desktop/src-tauri/src/handoff.rs`, `serve` | After `ConnectNamedPipe`, the server calls `same_logon_client` before entering `serve_connection`. |
| `same_logon_client` | Calls `ImpersonateNamedPipeClient` to read the connected client's logon SID. |
| `serve_connection` | The first pipe read, which consumes HELLO, occurs only after the authorization call. |
| Microsoft `ImpersonateNamedPipeClient` documentation | The impersonated security context is the context of the last message read from the pipe. |
| Existing Windows pipe test | Checks the DACL and remote-client flag, but does not connect, read a client frame, and exercise same-logon impersonation. |
| G3 runtime observation | Cold launch created a Play process and pipe; the client timed out before READY, no command event arrived, and the queue remained empty. Studio and Play process session IDs were both 1. |

## Root Cause

The server attempted client impersonation before reading any bytes from that
client. Windows binds `ImpersonateNamedPipeClient` to the security context of
the last message read, so the call had no client message to impersonate. The
server treated that failure as an unauthorized client and disconnected before
reading HELLO or sending READY. Studio consequently could not complete the
handshake, and no playback command reached Play.

## Why the issue escaped detection

The automated Windows test verified pipe ACL construction and the remote-client
rejection flag. It did not exercise a real client connection through the order
`ConnectNamedPipe` → read HELLO → impersonate → READY. The cold/warm unit tests
only cover launch decisions, so they could not expose this native sequencing
defect.

## Proposed prevention

Read one bounded, time-limited initial frame before impersonating the client.
Only after that read succeeds, compare Windows session IDs and the impersonated
logon SID; parse or process the frame only after authorization. Keep the existing
logon-SID DACL, remote-client rejection, frame-size bound, and timeout. Add a
Windows named-pipe regression test that connects a same-logon client, writes a
framed HELLO, reads it on the server, and verifies authorization succeeds.

## Resolution and validation

Play now reads the bounded initial frame before calling
`ImpersonateNamedPipeClient`, then checks the client's same-logon SID before it
parses or processes HELLO. A Windows regression test opens the actual local pipe,
writes a framed HELLO and verifies same-logon authorization. It passed as part of
the Play Rust suite (31/31); the isolated Studio-to-Play paired cold/warm test also
passed (1/1). Unauthorized and cross-session rejection and full playback parity
remain unverified, so Studio playback stays enabled.

## References

- [Microsoft: ImpersonateNamedPipeClient](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-impersonatenamedpipeclient)

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-09-27 | beta | Record read-before-impersonate fix and passing Windows pipe and paired-process tests | based on ed20af8 | Codex |
| 0.1.0b | 2026-09-26 | beta | Record the native named-pipe authorization ordering root cause and prevention | based on ed20af8 | Codex |
