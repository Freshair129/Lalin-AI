---
version: "0.1.0b"
created_at: "2026-09-26T20:50:38+07:00,Codex,1d30d44"
last_update: "2026-09-26T20:50:38+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback"
  doc_type: "root-cause-analysis"
  scope: "S2 native migration local-file validation"
---

# Mapped network drives passed S2 local-path validation

## Symptom

An absolute path such as `X:\Music\track.wav` can refer to an SMB share mapped
to a drive letter. The S2 validator treated its Windows drive syntax as local
and could accept it for migration, although the S2 contract excludes network
paths.

## Evidence

Before this fix, `migration.rs::is_local_import_path` rejected UNC/device and
relative paths, then `is_local_absolute` accepted Windows `Disk` and
`VerbatimDisk` path prefixes without checking the drive's storage type. That
path-shape check cannot distinguish a local volume from a mapped network drive.
The S2 migration contract §3 requires native revalidation and excludes
UNC/network paths. Existing tests covered relative/device paths and an absolute
local-drive example, but did not classify mapped, unknown or unavailable drive
types.

## Root Cause

The validator equated an absolute drive-letter path with local storage. Windows
can expose a remote SMB share through the same `X:\...` syntax, so path syntax
alone was insufficient for the local-only boundary.

## Why the issue escaped detection

The original regression cases tested path form, not the Win32 drive type behind
that form. There was no deterministic classifier test for `DRIVE_REMOTE`,
`DRIVE_UNKNOWN` or `DRIVE_NO_ROOT_DIR`, and canonicalized paths repeated the
same syntax-only check.

## Proposed Prevention

On Windows, extract the drive root and classify it with `GetDriveTypeW` both
before import and after canonicalization. Accept only fixed, removable, CD-ROM
and RAM-disk types; reject remote, unknown, no-root and every unrecognized
value. Keep deterministic tests for accepted/rejected classifications and
drive-root parsing so the policy does not depend on a mapped share being
available on the test machine.

## Resolution and validation

Implemented this check in the S2 migration validator using a Windows-only
`windows-sys` dependency. The Play Rust suite passes 23/23 tests, including
deterministic local/remote/unknown/no-root classification and path-root cases;
`cargo fmt --check` passes. No live SMB mapping was created, so the tests verify
the classifier and its code path rather than an end-to-end mapped-share import.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-26 | beta | Record mapped network-drive validation gap, cause, and prevention | based on 1d30d44 | Codex |
