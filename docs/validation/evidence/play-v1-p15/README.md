# P1.5 qualification — blocked before native execution

2026-11-08, source `9c983a88c03543e22ae57afa9630f75ab4ae53b5`,
branch `codex/lalin-play-p15-updater`. This is a partial handoff, not updater
qualification. No A, B, or B-prime artifacts, signatures, screenshots, keys,
server, installer or test driver were created. No Cargo command was run.

## Checks

From `apps/play-desktop`:

- `npm.cmd test`: exit 0, 19 files and 135 tests passed. IPC in UI tests is
  mocked; this is not installed-updater evidence.
- `npx.cmd tsc --noEmit`: exit 0.

All R2 native cases, including A to B, state retention, same/older version,
invalid signature/wrong key, offline/500/retry, interrupted download, installer
interruption/locked file, uninstall/reinstall, and key/channel mismatch are
NOT_RUN. The no-override R1 guard smoke is also NOT_RUN in this round. Clean-VM
and real-identifier install remain owner qualification. No defect was established.

## Lane admission

At approximately 06:53 ICT, C: had 117,190,455,296 bytes free, E:
132,348,534,784, and F: 2,002,496,221,184. The lane records floors of
53,687,091,200 bytes for C:/E: and 107,374,182,400 for F:, and P1.5 workload
bounds of C: 2,147,483,648, E: 10,485,760 and F: 21,474,836,480 bytes.
These snapshots are not admission: an independent active Cargo release job
was writing to `F:\cargo-lanes\gm-d1-enemy-missing\target` (Cargo PIDs 40156
and 32884, rustc PID 20564), and its remaining concurrent growth and coordination
were not established. Do not stop or alter that job. The Play lock was not
acquired; no lock acquisition or release time exists. No build deltas exist.

Resume when that job finishes or its owner coordinates an evidence-backed
remaining growth bound. Re-inventory all effective physical paths and writers,
acquire the Play lane lock, then repeat the complete preflight immediately
before each build. Implement and validate the requested QA-only driver and run
the handoff cases; retain the exact identifier, override, cleanup and evidence
constraints in the handoff and `F:\cargo-lanes\lalin-play\LANE.md`.

## Cleanup and owner data observations

Before and after this partial round the top-level listings and UTC mtimes were:

| Path under user profile | Entry | LastWriteTimeUtc |
|---|---|---|
| `AppData\Roaming\ai.lalin.play` | directory | 2026-11-07 20:31:52 |
| same | `genesis-play` | 2026-11-07 20:31:53 |
| `AppData\Local\ai.lalin.play` | directory | 2026-11-07 20:31:52 |
| same | `EBWebView` | 2026-11-07 21:04:14 |

The top-level snapshots match; they do not establish recursive content equality.
The QA roaming/local data and `AppData\Local\Lalin Play QA` install paths,
`tmp\p15-keys`, `tmp\p15-server`, and the Play lane lock were absent on final
inspection. No QA app was installed, no server started, and no cleanup deletion
was necessary. These observations do not establish uninstaller behavior.
