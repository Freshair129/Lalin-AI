---
version: "0.1.1b"
created_at: "2026-09-27T13:20:47+07:00,Codex,3bb4414"
last_update: "2026-09-27T13:49:47+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback-reliability"
  doc_type: "rca"
  scope: "G3 mapped-drive and reparse-point runtime validation gap"
---

# RCA: mapped-drive and reparse-point handoff evidence gap

## Symptom

PR #25 still lacks Windows runtime evidence that the Play receiver rejects a
real mapped network-drive path and a local reparse path resolving to that remote
target before granting or applying media.

## Evidence

- The approved S3 contract requires canonicalizing the source and receiver paths
  and rejecting remote drive types and reparse targets resolving to UNC.
- `apps/play-desktop/src-tauri/src/handoff.rs` calls
  `validate_media_file` before granting or applying a received path.
- Existing tests cover raw UNC/device prefixes and call the drive classifier
  with fixed constants; they do not create an SMB mapped drive or a reparse
  target and pass either through `validate_media_file`.
- Current host has one active Windows logon session and an accessible local
  administrative share. The temporary mapped-drive/reparse fixture command was
  rejected before execution by the automatic command policy; no mapping or
  fixture was created.

## Root Cause

This is an acceptance-evidence gap, not a confirmed validator defect. Unit tests
prove that `DRIVE_REMOTE` is rejected when supplied to the classifier, but do
not prove what Windows returns after canonicalizing an actual mapped path or a
reparse path. Runtime path resolution can differ from the classifier fixture.

## Why the issue escaped detection

The earlier tests validated path syntax and drive-type decision logic without a
Windows SMB mapping. The paired Studio–Play test sent raw invalid URLs/UNC paths,
which are rejected before path resolution by design. Neither route exercised a
local-looking path whose resolved target is remote.

## Proposed prevention

Add opt-in Windows tests that call the production validator on a real mapped
media file and a local reparse path resolving through that mapping. Use a
temporary fixture and positive control on a local file; require the validator
to return its local-drive denial, then unmap the test drive and remove only the
temporary fixtures. Keep separate-session, different-host, active-playback
shutdown and audible-parity claims open until independently tested.

## Resolution and validation

The two opt-in tests now compile and assert the production validator against a
local positive-control file plus mapped and reparse paths. They remain NOT_RUN:
the attempt to create their temporary mapping and fixtures was rejected before
execution by automatic command review, and no alternate mutation path was used.
The independent second-host named-pipe probe is prepared in
`tools/verify/lalin-play-remote-pipe-client.ps1`, but it does not close these
filesystem gates. Do not claim the mapped-drive or reparse-point gate passes
until both runtime cases pass on Windows.
