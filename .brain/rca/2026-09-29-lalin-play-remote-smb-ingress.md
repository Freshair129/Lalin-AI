# RCA — Lalin Play cross-host probe cannot reach SMB ingress

## Symptom

The corrected client on `D:\lalin` failed opening the remote control pipe with
“The specified network name is no longer available.” It produced no
`control=connected` result, and the server-side probe timed out after
180.02 seconds.

## Evidence

- The client resolved `DESKTOP-VETATMQ` to `192.168.1.100`; its source address
  was `192.168.1.135`. `Test-NetConnection` to TCP/445 failed and ping timed out.
- On the server, `LanmanServer` was running, TCP/445 was listening, and the
  loopback TCP/445 check succeeded.
- The server network profile was Private with inbound default action Block.
  The `FPS-SMB-In-TCP` rule for TCP/445 was disabled, and no enabled inbound
  TCP/445 allow rule was found in ActiveStore.

## Root Cause

The server's effective Private firewall policy had no enabled inbound allow for
SMB TCP/445 while its default inbound action was Block and its built-in SMB-In
rule was disabled. This is a configured blocker for the remote SMB ingress
required by the probe. No firewall drop log was collected, so external routing
or client isolation has not been excluded as an additional blocker. The remote
client could not reach the control pipe, and the probe never tested
`PIPE_REJECT_REMOTE_CLIENTS` on the target pipe.

## Why the issue escaped detection

The earlier named-pipe regression exercised local and loopback SMB paths. Those
checks do not traverse the server's inbound firewall from a second host. The
remote probe was the first check to cover that network boundary.

## Proposed prevention

For the paired probe only, after verifying the addresses are still current, add
a temporary inbound TCP/445 rule scoped to local address `192.168.1.100`, remote
address `192.168.1.135`, and the Private profile. Remove the rule immediately
after the probe. Keep G3 open unless the client control connection succeeds,
the target returns Win32 error 5, the server accepts the result, and the
server-side test passes.
