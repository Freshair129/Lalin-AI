---
version: "0.1.0b"
created_at: "2026-09-26T05:20:11+07:00,Codex,2432f66"
last_update: "2026-09-26T05:25:06+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback-security"
  doc_type: "rca"
  scope: "Studio-to-Play local media handoff path validation"
---

# RCA: Canonical handoff path could escape the local-drive boundary

## Symptom

Change risk: **HIGH**, because the bug crosses the local-file security boundary.

Source review found two paths around the initial local-path prefix checks: a
local reparse point can resolve to a UNC/network target, and a mapped network
drive can retain a drive-letter spelling. The Play receiver applies the resolved
path to its Tauri asset protocol scope, so it must reject remote targets before
granting them.

No remote path was opened in a runtime test; this finding is based on the
validation order in the two native implementations.

## Evidence

| Evidence | Observation |
|---|---|
| `apps/desktop/src-tauri/src/playback_handoff.rs` `validate_media_file` | Rejects URL/UNC/device prefixes in the supplied string, then canonicalizes without validating the resulting Windows root. |
| `apps/play-desktop/src-tauri/src/handoff.rs` `validate_media_file` | Performs the same pre-canonicalization check, then passes the canonical path to `asset_protocol_scope().allow_file`. |
| S3 review | Identified that a local reparse point can resolve to an extended UNC target such as `\\?\UNC\server\share\...`. |
| Win32 `GetDriveTypeW` | A drive-letter root can be classified as `DRIVE_REMOTE`; a drive-letter syntax check alone cannot distinguish a mapped network share. |
| New unit cases | Accept local drive-root syntax, including `\\?\C:\...`; reject UNC/device/GLOBALROOT roots and classify `DRIVE_REMOTE`, `DRIVE_UNKNOWN` and `DRIVE_NO_ROOT_DIR` as non-local. |

## Root Cause

The security check treated the user-supplied path spelling as the final filesystem
identity. `canonicalize` can change that identity by following symlinks or other
reparse points, but neither sender nor receiver re-checked the canonical root or
the volume type behind a drive letter. A mapped network share can still look like
`X:\...` after path normalization.

## Why the issue escaped detection

Existing path tests rejected direct URLs and UNC strings. They did not test the
canonical form after resolution, so they could not detect a local-looking input
that resolves to a network or device namespace.

## Proposed prevention

After canonicalization and before file checks or asset-scope grants, accept only
drive-rooted Windows paths. Permit the `\\?\C:\...` extended spelling used for
local drive paths; then call `GetDriveTypeW` on the canonical drive root and
accept only fixed, removable, CD-ROM or RAM-disk types. Reject remote, unknown
and invalid roots. Keep both checks in Studio and Play. Test path and drive-type
classification deterministically; treat that as code-level evidence, not as
proof of a mapped-drive runtime case or cross-session ACL rejection.

## Resolution and validation

Both native validators now re-check the canonical path and fail closed unless
`GetDriveTypeW` reports a known local drive type. The Play receiver rejects a
remote target before calling `allow_file`. Focused Windows Rust tests pass:
Studio handoff 6/6 and Play crate 15/15. These unit tests do not exercise an
actual reparse-to-network or mapped-drive case, paired applications, or an
unauthorized client connection; those runtime checks remain open.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-26 | beta | Re-check resolved Studio and Play paths before the native handoff grant | uncommitted | Codex |
