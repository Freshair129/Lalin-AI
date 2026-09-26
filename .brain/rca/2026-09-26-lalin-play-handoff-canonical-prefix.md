---
version: "0.1.1b"
created_at: "2026-09-26T23:47:38+07:00,Codex,ed20af8"
last_update: "2026-09-27T00:56:22+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback-security"
  doc_type: "rca"
  scope: "Canonical local media paths sent from Studio to Play"
---

# RCA: Play rejected Studio's canonical local-drive path

## Symptom

Change risk: **HIGH**, because the receiver rejected a valid local-media
command at its filesystem validation boundary.

After the named-pipe HELLO/READY exchange succeeded, a cold Studio `Add to
Queue` command reached Play but received `invalid_file_path`. Play did not add
the valid WAV fixture to its queue and no ACK/STATE result was produced.

## Evidence

| Evidence | Observation |
|---|---|
| Studio `validate_media_file` and `send_playback` in `apps/desktop/src-tauri/src/playback_handoff.rs` | Studio canonicalizes the selected local file, then sends `canonical.to_string_lossy()` in the command frame. |
| Play `validate_media_file` in `apps/play-desktop/src-tauri/src/handoff.rs` | The initial input filter rejects every string starting with `\\?\` before canonicalization and local-drive checks. |
| Isolated Windows pipe trace | Play read and authorized HELLO, parsed READY, received COMMAND, and reported the incoming path shape as `extended=true`, `unc=true`, `device=false`, `absolute=true`; the command then failed `invalid_file_path`. |
| Existing Windows path tests | Tested drive-root classification and explicit remote/device roots, but did not pass the real canonical result of a temporary local file back through the receiver validator. |

## Root Cause

The sender and receiver disagreed about the valid spelling of the same local
file. Studio sends the path after `std::fs::canonicalize`; on this Windows run
that path used the `\\?\F:\...` extended-drive form. Play's pre-canonicalization
filter rejected the `\\?\` prefix unconditionally, before its existing
canonical-root and `GetDriveTypeW` checks could establish that the target was a
local drive.

## Why the issue escaped detection

The prior path tests checked the Windows drive-root classifier and direct
network/device inputs independently. They did not exercise the exact sender
contract: canonicalize a real local file in Studio, serialize that canonical
path, then validate it in Play.

## Proposed prevention

Permit an extended path through the initial spelling filter only when it has a
local drive root such as `\\?\F:\`. Continue to canonicalize it and require a
regular media file on a known local drive before granting asset access. Keep
UNC, `GLOBALROOT`, device namespaces, remote drive types, and unsupported media
rejected. Add a regression test that canonicalizes a temporary local file and
passes that result to the Play receiver validator.

## Resolution and validation

Play now permits the extended prefix only when it identifies a local Windows
drive root, then canonicalizes the path and checks that the target is a regular
media file on a local drive. UNC, GLOBALROOT, device namespaces and remote drive+types remain rejected. A Windows test canonicalizes a real temporary file and+validates the exact canonical path; the full Play Rust suite passed 31/31. The+paired Studio-to-Play cold/warm test also passed 1/1 with a local WAV fixture.
Mapped-drive/reparse runtime cases and playback parity remain unverified; Studio
playback stays available.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-09-27 | beta | Record acceptance of canonical local drive paths and passing Windows regression checks | based on ed20af8 | Codex |
| 0.1.0b | 2026-09-26 | beta | Record the sender/receiver canonical path mismatch and prevention | based on ed20af8 | Codex |
