# RCA — Lalin Play remote pipe probe UInt32 cast failure

## Symptom

The remote PowerShell client exited with code 1 before printing
`control=connected`. PowerShell reported that `-1073741824` could not be
converted to `System.UInt32`. The server-side probe later timed out after
180.02 seconds.

## Evidence

- The client uses `[uint32]0xC0000000` as the desired-access argument to
  `CreateFileW`, first for the control pipe and again for the target pipe.
- The reported failing value is `-1073741824`, the signed 32-bit interpretation
  of the `0xC0000000` bit pattern.
- No `control=connected` result was produced, so the client did not report a
  successful control-pipe connection or a target-pipe access result.
- The server-side test ended with its 180.02-second timeout. No firewall or
  credential changes were made.

## Root Cause

PowerShell evaluates the hexadecimal literal `0xC0000000` as a signed `Int32`
value. Casting that negative value directly to `UInt32` throws before the
`CreateFileW` call begins. The probe therefore failed in client-side argument
conversion; it did not test whether the remote target pipe rejects the client.

## Why the issue escaped detection

The earlier validation parsed the PowerShell source and compiled the embedded
P/Invoke declaration, but did not execute the runtime cast of the desired-access
mask. The real client invocation was the first check to evaluate that value.

## Proposed prevention

Represent `GENERIC_READ | GENERIC_WRITE` with an unsigned-safe value,
`[uint32]3221225472`, and reuse it for both pipe opens. Before the next paired
run, verify the conversion in PowerShell, then require the client control
connection, target Win32 error 5, server result acceptance and a passing
server-side test before recording remote rejection.
