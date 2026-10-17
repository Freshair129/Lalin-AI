---
version: "0.1.3b"
created_at: "2026-09-30T04:04:24+07:00,Codex"
last_update: "2026-09-30T06:33:36+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback-reliability"
  doc_type: "rca"
  scope: "G3 separate-logon-session named-pipe ACL acceptance gap"
---

# RCA: separate-logon-session pipe ACL evidence gap

## Symptom

G3 initially lacked runtime evidence that a client carrying a different Windows
logon SID could connect to the authenticated control pipe but not the owner-only
target pipe.

## Evidence

- The production pipe DACL remains restricted to the current logon SID.
  pipe_acl_and_same_logon_first_frame_are_enforced covers a restricted token
  missing that SID and the normal same-logon HELLO, but does not create a
  different logon SID.
- The first manual runas attempt used DESKTOP-VETATMQ\pc; Windows returned
  Win32 1326 before the client connected. That attempt produced no ACL result.
- A temporary standard account, DESKTOP-VETATMQ\LalinPipeProbe0930, was
  created locally and verified non-administrator. Start-Process -Credential
  changed the user SID but returned the owner Logon SID
  S-1-5-5-0-685957; this was not accepted as a cross-logon probe.
- A one-shot elevated probe obtained an interactive token with LogonUser,
  verified the owner Logon SID S-1-5-5-0-685957 differed from the probe SID
  S-1-5-5-0-1801444461, and impersonated it only
  while opening the test pipes. The owner server process was in Terminal Services session 1,
  and the alternate token TokenSessionId was 1. For nonce 31196.1790723880181644200,
  the
  pipe client connected to control, received Win32 5 (ERROR_ACCESS_DENIED)
  opening target, and sent control=0;target=5.
- Exact server command:
  cargo test --offline --manifest-path apps/play-desktop/src-tauri/Cargo.toml --lib different_logon_session_is_denied_by_the_pipe_acl -- --ignored --nocapture --test-threads=1
  passed 1/1 in 129.83 seconds. The test then confirmed the owner logon
  could still open the protected target pipe.

## Root Cause

The original gap was in the test setup, not a confirmed ACL defect. The first
runas attempt supplied credentials Windows rejected. The subsequent
Start-Process -Credential attempt changed the account SID but reused the
owner Logon SID, so it could not prove the separate-logon boundary. The
interactive token from LogonUser plus thread impersonation supplied the
distinct logon SID while keeping the pipe client process in the owner's
Terminal Services session.

## Why the issue escaped detection

The ignored Windows test requires a second logon SID in the same Terminal
Services session. Existing ACL tests used a restricted token or the owner token;
neither reproduced that combination. The first manual command also failed
before pipe contact, while the alternate-account process launcher appeared
usable until its Logon SID was compared with the owner's.

## Proposed prevention

Keep the production ACL unchanged. For this opt-in acceptance case, require
the server to verify all of the following in one run: the control pipe connects,
the client Logon SID differs from the owner, the client process has the same
Terminal Services session ID, the target open returns Win32 5, and the owner
can still open the target. Do not count a different user SID alone as proof of a
different logon session. Preserve the test transcript and nonce with the
traceability record.

## Latest result

The separate-logon ACL gate passed on DESKTOP-VETATMQ using the verified
interactive token. The temporary account and its unloaded Windows profile
were removed after the test. No password was written to the repository.
Cross-host denial remains a
separate passed gate. Mapped-drive/reparse runtime coverage, Studio/API exit
during active playback and audible playback parity remain open; keep Studio
playback enabled.
