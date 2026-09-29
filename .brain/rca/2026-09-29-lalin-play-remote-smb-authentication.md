# RCA — Lalin Play cross-host probe rejected at SMB authentication

## Symptom

The client reached the server's TCP/445 endpoint but the remote control-pipe
open failed with “The user name or password is incorrect.” The client produced
no `control=connected` result. The server-side test received no result frame and
was interrupted after the client failure.

## Evidence

- Server: `DESKTOP-VETATMQ`, address `192.168.1.100`; the scoped inbound TCP/445
  rule was enabled and enforced for client `192.168.1.135` on the Private
  profile.
- Client: `DESKTOP-8UR61U8`, address `192.168.1.135`; route and ARP neighbor for
  the server were present, and `Test-NetConnection` reported
  `TcpTestSucceeded: True`.
- The corrected probe version was present:
  `$genericReadWrite = [uint32]3221225472`.
- The client failed in `Open-ProbePipe` before the positive-control connection;
  there was no target Win32 error 5 and no server result frame.
- A fresh paired attempt on 2026-09-30 used PC-1 `192.168.1.34` and PC-2
  `192.168.1.33`. TCP/445 succeeded, but the client again received “The user
  name or password is incorrect” before `control=connected`. Server nonce
  `51460.1790712491037627000` expired after the test's 180.01-second wait with
  no result frame.

## Root Cause

The current client process credentials were rejected by SMB authentication
before the named pipe could be opened. This explains the observed failure
boundary. The specific account or server policy responsible for the rejection
is unknown. The user has approved a temporary standard local test account, but
it has not been provisioned; the active server shell is not elevated.

## Why the issue escaped detection

Previous local and loopback checks did not require a second machine to
authenticate to the server over SMB. Earlier cross-host runs stopped before
TCP/445 was reachable, so this authentication boundary was only exposed after
the transport path was opened.

## Proposed prevention

Provision the approved standard local test account from an administrator shell
on the server, entering its password through a secure local prompt. Launch the
client probe with `runas /netonly` so the password is not placed in the script,
repository, or chat. Keep the G3 gate open unless the control pipe connects,
the target returns Win32 error 5, the server accepts the matching result, and
the server-side test passes. Remove the temporary account and scoped firewall
rule after the attempt.
