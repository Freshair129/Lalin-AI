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
- A second `runas /netonly` attempt used
  `DESKTOP-VETATMQ\LalinPipeProbe0930` and nonce
  `70924.1790713462556106500`, but SMB returned the same authentication error
  before pipe contact and the server timed out after 180.01 seconds. A
  read-only `Get-LocalUser` check on `DESKTOP-VETATMQ` returned
  `ACCOUNT_NOT_FOUND_ON_THIS_HOST` for that account.

## Root Cause

The second retry submitted an account name that did not exist on the SMB server
`DESKTOP-VETATMQ`, as confirmed by the server-side `Get-LocalUser` check. SMB
therefore rejected the login before the named pipe could be opened. Where that
account was created, if anywhere, is unknown. The server shell is not elevated,
so the approved temporary standard account must be created locally on the
server by an administrator.

## Why the issue escaped detection

Previous local and loopback checks did not require a second machine to
authenticate to the server over SMB. The retry also launched `runas /netonly`
before confirming that the named account existed on the server; a TCP/445
success check does not validate SMB credentials.

## Proposed prevention

Verify with `Get-LocalUser` that the approved standard local test account exists
and is enabled on the server before launching the server probe. Create it from
an administrator shell on the server, entering its password through a secure
local prompt. Launch the client with `runas /netonly` so the password is not
placed in the script, repository, or chat. Keep G3 open unless the control pipe
connects, the target returns Win32 error 5, the server accepts the matching
result, and the server-side test passes. Remove the temporary account and
scoped firewall rule after the attempt.
