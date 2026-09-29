---
version: "0.1.2b"
created_at: "2026-09-30T04:04:24+07:00,Codex"
last_update: "2026-09-30T04:43:13+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback-reliability"
  doc_type: "rca"
  scope: "G3 separate-logon-session named-pipe ACL acceptance gap"
---

# RCA: separate-logon-session pipe ACL evidence gap

## Symptom

The Lalin Play G3 record does not yet prove that a client in a different
Windows logon session is denied by the production named-pipe ACL.

## Evidence

- The approved S3 contract restricts the pipe DACL to the current logon SID and
  requires the client to belong to the owner's logon session.
- `pipe_acl_and_same_logon_first_frame_are_enforced` verifies that a restricted
  token without the logon SID is denied, then verifies a normal same-logon HELLO.
- That test does not start a process under a distinct Windows logon SID.
- `same_logon_client` checks Windows session IDs and impersonated logon SIDs, so
  a separate-logon-session probe can verify the real boundary independently.
- On 2026-09-30, the server-side ignored test waited 180 seconds for nonce
  `56404.1790716718225412900`. `runas` rejected the supplied credentials for
  `DESKTOP-VETATMQ\pc` with Win32 1326 before the PowerShell client started;
  the server received no result frame and timed out. A read-only host check
  found the intended temporary account `LalinPipeProbe0930` absent.
- Source review found the probe client closed its control pipe immediately
  after sending the marker. The server then inspects the client session and
  logon SIDs through that connection, creating a disconnect race separate from
  the observed credential failure.
- A later temporary-account creation attempt was rejected by
  `New-LocalUser` because its description exceeded the 48-character limit; a
  subsequent read-only check confirmed no probe account was created.

## Root Cause

This is an acceptance-evidence gap, not a confirmed ACL defect. The existing
negative client is a restricted token created from the test process token; it
does not model a new Windows logon session. Therefore the current test cannot
establish the complete same-logon DACL boundary against a real `runas` client.

## Why the issue escaped detection

The ACL unit test covered a token missing the allowed SID and the normal local
client, while the paired process tests exercise the expected same-user route.
Neither created an independent logon session on the same Windows desktop.

## Proposed prevention

Add an opt-in local Windows probe with authenticated control/result pipes and a
target pipe restricted to the server's current logon SID. Launch the client via
`runas` under a verified temporary standard local account in the same Windows
desktop session; enter its password only in the local Windows prompt. Have the
server verify that the client logon SID differs while the Windows desktop
session matches. Require control-pipe success, target
`ERROR_ACCESS_DENIED` (5), and a same-logon target positive control. Keep the
client control connection open until the result is sent, so the server can
inspect the client identity before disconnect. Keep the existing production
ACL unchanged. G3 remains open until that paired probe passes.

## Latest attempt

Win32 1326 occurred during `runas` authentication, before pipe contact. The
server timeout is consequently a coordination/credential setup failure, not an
ACL result. Recreate and verify the temporary standard account before retrying;
do not reuse the rejected `pc` credential or claim that ACL denial passed. The
probe now retains its control connection through result delivery; that corrected
flow still needs its paired Windows runtime test.
