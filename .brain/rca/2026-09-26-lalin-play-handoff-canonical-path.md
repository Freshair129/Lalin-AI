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

Source review found that a path could pass the initial local-path prefix checks,
then resolve through a Windows reparse point to a UNC/network target. The Play
receiver applies the resolved path to its Tauri asset protocol scope, so it must
reject a remote canonical target before granting it.

No remote path was opened in a runtime test; this finding is based on the
validation order in the two native implementations.

## Evidence

| Evidence | Observation |
|---|---|
| `apps/desktop/src-tauri/src/playback_handoff.rs` `validate_media_file` | Rejects URL/UNC/device prefixes in the supplied string, then canonicalizes without validating the resulting Windows root. |
| `apps/play-desktop/src-tauri/src/handoff.rs` `validate_media_file` | Performs the same pre-canonicalization check, then passes the canonical path to `asset_protocol_scope().allow_file`. |
| S3 review | Identified that a local reparse point can resolve to an extended UNC target such as `\\?\UNC\server\share\...`. |
| New unit cases | Accept drive-rooted canonical paths, including `\\?\C:\...`; reject UNC, extended UNC, device and GLOBALROOT forms. |

## Root Cause

The security check treated the user-supplied path spelling as the final filesystem
identity. `canonicalize` can change that identity by following symlinks or other
reparse points, but neither sender nor receiver re-checked the canonical root.

## Why the issue escaped detection

Existing path tests rejected direct URLs and UNC strings. They did not test the
canonical form after resolution, so they could not detect a local-looking input
that resolves to a network or device namespace.

## Proposed prevention

After canonicalization and before file checks or asset-scope grants, accept only
drive-rooted Windows paths. Permit the `\\?\C:\...` extended spelling used for
local drive paths; reject UNC, device, GLOBALROOT, and other non-drive roots.
Keep this check in both Studio and Play. Test the path classifier with local,
UNC, extended UNC and device forms. Treat the tests as code-level evidence, not
as proof of cross-session ACL rejection.

## Resolution and validation

Both native validators now re-check the canonical path before continuing. The
Play receiver rejects a remote target before calling `allow_file`. Focused
Windows Rust tests pass: Studio handoff 5/5 and Play crate 14/14. These unit
tests do not exercise an actual reparse-to-network path, paired applications,
or an unauthorized client connection; those runtime checks remain open.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-26 | beta | Re-check resolved Studio and Play paths before the native handoff grant | uncommitted | Codex |
