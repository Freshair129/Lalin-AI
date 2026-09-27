---
version: "0.2.10b"
created_at: "2026-09-20T19:35:00+07:00,LALIN,8429010"
last_update: "2026-09-27T11:12:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "validation"
  doc_type: "verification-report"
  scope: "ADR-004 S1, approved S2 migration and S3 handoff; Windows local evidence only"
---

# Lalin Play standalone foundation — local evidence

## Outcome and boundary

**S1 LOCAL PASS. S2 migration and S3 handoff are implemented locally with focused automated evidence; S2 recovery and full S3 playback parity remain NOT_VERIFIED. Isolated paired control-plane lifecycle, receiver rejection and concurrent-client FIFO checks passed for their listed cases; the overall repository split remains PARTIAL.**

The user approved PRD/ADR-004 implementation on `codex/lalin-play-split`.
Source baseline is `84290102b84fd76dec069bf6d61ffdd2fc8466ab` in
`Freshair129/Lalin-AI`. That earlier evidence slice did not push, create a remote,
remove source, merge to main or release. Current recovered code remains local on
`codex/lalin-play-integration` pending runtime acceptance.

The 2026-09-25 S2 evidence was recorded from a then-uncommitted worktree based on
`411d2ed`. The recovered S2 source is now reviewed locally on `7c30ea1`; S3 handoff
is locally implemented on `235875b`. No user WebView profile files were accessed.
See [S2 migration evidence](LALIN_PLAY_S2_MIGRATION.md) for the remaining recovery
and actual-transfer limits.

An additive candidate exists at `apps/play-desktop`, with independent npm/Cargo
manifests and lockfiles, app ID `ai.lalin.play` and app version `0.1.0`.
Audio remains HTML media/Web Audio; Rust owns the native boundary, not decoding.

## Automated evidence (2026-09-20, ICT)

| Check | Result | Scope / caveat |
|---|---|---|
| Candidate `npm test` | 27/27 PASS | 4 files; native commands/audio mocked in frontend tests |
| Candidate `npm run build` | PASS | TypeScript + Vite, 44 modules |
| Candidate `cargo test --manifest-path src-tauri/Cargo.toml --offline` | 3/3 PASS | Selected-folder bounds/dedup, missing selection, catalog replacement preserves media |
| Candidate Tauri `build --debug --no-bundle` | PASS | Embedded frontend; debug executable, not an installer |
| Isolated source-copy `npm ci --offline --workspaces=false --no-audit --no-fund` | PASS after cache-access escalation | Own node_modules; first sandbox attempt failed EPERM reading npm cache |
| Isolated source-copy tests + build | 27/27 frontend, 3/3 Rust, frontend and native debug build PASS | 44 source files copied to `runtime/play-isolation-2ea1ad74`; no parent package links; shared system toolchains/package caches; not a remote clean checkout or clean machine |
| Retained Studio `npm --workspace apps/desktop test` | 187/187 PASS | 22 files; existing jsdom media pause warnings remain; not native audio proof |
| Root `npm run check:all` | PASS | Contracts/MCP/desktop builds, API Python compileall and Studio cargo check; not API integration tests |
| `cargo fmt --check`, `git diff --check` | PASS | Git emits line-ending normalization warnings |

Controlled-promise test reproduces and fixes the newly introduced Stop/native
resolution race. See [RCA](../../.brain/rca/2026-09-20-lalin-play-native-resolution-race.md).
React review kept engine lifetime outside layout changes and bounded listener
cleanup; unit tests assert the same audio element and no extra play on switching.

## Native evidence and user confirmation

Test media: generated 120-second WAV at
`apps/play-desktop/.smoke/ทดสอบเพลง local.wav` (Thai name and space).
Only this fixture was selected; no user library or old WebView profile was migrated.

Initial native debug executable SHA256:
`1562870E02F8705FBE2C6F2A1C7911A029FE8B0FC8C298F7BB36E0E8B701578E`.

- Native file picker imported the WAV and displayed actual two-minute duration.
- Full → Compact → EQ → Full showed PLAYING and advancing time (0:10, 0:20,
  0:29, 1:08, 1:34), one queue entry and a nonzero EQ spectrum.
- Native X hid the window while PID 12760 survived. Launching the same executable
  restored that process with PLAYING at 1:48; explicit Quit later exited.
- **User confirmed “ได้ยินเสียง”** in response to the actual-output question.
  This confirms audible output for the earlier test, not every later binary/device.
- [Full EQ screenshot](evidence/lalin-play-split/full-native.png)
  and [Compact EQ screenshot](evidence/lalin-play-split/compact-native.png).

Latest rebuilt debug executable:
`apps/play-desktop/src-tauri/target/debug/lalin-play.exe`.
SHA256: `E216B9D20910DFFADA1305CFF4BFF41C58B0928FC55150DF81301942FDE08FCB`.
This includes the cancellation guard, explicit native-command manifest,
output settings and dark native controls.

- Fresh launch (PID 37840): retained library has one item, queue empty, IDLE;
  opt-in resume was off. No automatic playback.
- Playing the retained item succeeds after restart/native path revalidation.
- Full PLAYING at 0:26 → Compact at 0:49 → Compact at 1:05; queue remains one.
- Stop after verification returns IDLE at 0:00; the app was left open without
  the test tone playing.
- [Latest Full screenshot](evidence/lalin-play-split/full-native-latest.png)
  and [latest Compact screenshot](evidence/lalin-play-split/compact-native-latest.png).
- Read-only process/network check found Play without `g-music`/`g-music-backend`
  and no TCP listeners at 8756 or 5175. UI origin is `http://tauri.localhost/`.
  This is no-backend playback evidence, not a test of actively stopping Studio.

## Open gates — do not infer completion

| Gate | Status |
|---|---|
| Full library/playlist UI, queue, EQ, Full/Compact | Implemented; partial native/manual coverage, not full PLAY-01–09 acceptance |
| Opt-in Studio queue/EQ export/import and atomic rollback | Implemented locally; focused tests and selected synthetic native phase/write failures pass; process-crash recovery, remaining writes and live transfer NOT RUN |
| Missing-file relink, persisted per-mode window bounds | NOT IMPLEMENTED; bounds currently process-local |
| Native Studio named pipe, same-session ACL, FIFO/ACK/reconciliation | Isolated paired process passed cold/warm delivery, ACK/STATE recovery after dropping a command ACK, same-ID duplicate handling, sequential and four-client concurrent queue order by ACK revision, applied command followed by process restart with no blind replay, busy-pipe no-relaunch behavior, and live URL/UNC-shaped path rejection with unchanged STATE; local restricted-token client without the allowed logon SID receives `ERROR_ACCESS_DENIED`; different-logon-session, remote-client, mapped-drive/reparse runtime behavior and audible parity NOT_VERIFIED |
| Cold/warm Studio-to-Play lifecycle and Studio/API exit | Isolated cold/warm paired control-plane test passed; Studio/API exit during active playback and audible parity NOT_VERIFIED |
| Device removal/recovery, native output selection, TV/gamepad and codec coverage | NOT RUN on this candidate |
| Standalone remote checkout, export SHA, license/notices audit | NOT RUN |
| Removing original Studio Play, native Arrange/Cast regression smoke | NOT RUN; original implementation and shared consumers preserved |
| NSIS install/uninstall, signed updater, GitHub release | NOT RUN; updater stays unavailable |

Remaining work includes actual S2 process-termination/restart verification and
journal/history write failures, plus S3 different-logon-session and
remote pipe-client rejection, UNC/mapped-drive/reparse runtime cases,
Studio/API exit during
active playback and audible parity. The paired URL-shaped invalid-path case now
passes but does not close those filesystem/runtime gates. Studio playback stays
available until parity is proven. S4–S7 remain gated by ADR-004.
An interrupted import restores through the Play-owned journal on next launch; the
prior Studio sources and user state remain intact. Temporary isolated build files and fixture are ignored under `runtime/`
and `.smoke/`; they were retained, not committed or deleted.

## Version changes in this slice

AGENTS `0.1.0b → 0.1.1b`; PRD `1.1.0b → 1.1.1b`; PRODUCT `0.2.0b → 0.2.1b`;
repository SOT `0.4.0b → 0.4.1b`; docs index `0.5.0b → 0.5.1b`;
sitemap `0.1.0b → 0.1.1b`; ADR-004 `0.1.0b → 0.1.2b`.
Documentation approval/status changes do not bump Studio/Cast application versions.

## Integrated verification and version diff — 2026-09-26

Code refs: S2 `7c30ea1`, S3 `235875b`, S3 changelog correction `362bbd0`;
integration branch `codex/lalin-play-integration`, based on `43121cc`. The
independent review found no code blocker in either lane.

| Component / command | Result |
|---|---|
| Studio frontend, `apps/desktop`: `npm test -- src/playback/playMigrationExport.test.ts src/playback/playbackClient.native.test.ts` | 6/6 passed |
| Play frontend, `apps/play-desktop`: `npm test -- src/playMigration.test.ts src/playMigrationImport.test.ts src/components/PlayMigrationImport.test.tsx src/handoffContract.test.ts` | 23/23 passed |
| Play native Rust, `apps/play-desktop`: `cargo test --manifest-path src-tauri/Cargo.toml --offline` | 31/31 passed |
| Studio handoff Rust, `apps/desktop`: `cargo test --manifest-path src-tauri/Cargo.toml playback_handoff::tests --offline` | 6/6 passed, including cold/warm launch decisions |
| API files, `apps/api`: `.venv/Scripts/python.exe -m pytest tests/test_files_upload.py -q` | 10/10 passed |
| Studio and Play frontend builds | Both passed (`npm run build`) |
| Rust format checks in Studio and Play | Both passed (`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`) |
| Staged diff hygiene | `git diff --cached --check` passed on final integration changes |

The Studio native test used a temporary junction to the existing Studio backend
sidecar directory because the isolated worktree has no local `binaries` folder;
the junction was removed after testing. Frontend dependency junctions were also
removed. No generated schema or permission churn is retained. Cold/warm checks
are launch-decision unit tests, not a live Studio–Play process pair. Same-session
unauthorized connection attempts, interrupted ACK recovery, actual mapped-SMB
and reparse fixtures, Studio/API exit during playback, S2 process-crash/power-loss
recovery and audible parity remain NOT_RUN/NOT_VERIFIED. Keep ordinary Studio
playback available until parity is observed.

| Document | Before → after |
|---|---|
| Integration/migration spec | 0.2.4b → 0.2.5b |
| Play documentation register | 0.2.1b → 0.2.2b |
| Foundation evidence | 0.2.1b → 0.2.2b |
| Traceability matrix | 0.2.1b → 0.2.2b |
| Execution DAG | 0.1.0b → 0.2.0b |
| Play README | 0.4.1b → 0.4.2b |
| ADR-004 | 0.4.1b → 0.4.2b |
| Repository Architecture SOT | 0.4.2b → 0.4.3b |
| Play user guide | 0.1.0b → 0.1.1b |
| Docs index | 0.10.10b → 0.10.11b |
| S2 migration evidence and both RCA notes | New 0.1.0b documents |
| Studio and Play application versions | No change |

## Current paired G3 lifecycle evidence — 2026-09-27

The test-only Play executable was built through Tauri CLI with its frontend
embedded at a relative path, `g3-test-app-data-dir` enabled, and distinct empty
WebView2 and app-data directories under system temp. The ignored Studio test
`playback_handoff::tests::paired_windows_cold_and_warm_handoff_ack_state_and_duplicate`
passed **1/1** with this command from `apps/desktop`:

```powershell
cargo test --offline --manifest-path src-tauri/Cargo.toml playback_handoff::tests::paired_windows_cold_and_warm_handoff_ack_state_and_duplicate -- --ignored --exact --test-threads=1 --nocapture
```

Play Rust tests with `--features g3-test-app-data-dir` passed **31/31**;
Studio `playback_handoff::tests` passed **6/6**, with this paired test ignored in
the ordinary run. Rust format checks passed for both crates.

The run verified cold launch, warm Play Next/Add to Queue, ACK/STATE agreement,
ACK-disconnect reconciliation, duplicate suppression, ordered unique-path queue
entries and owner restart without replay of an uncertain prior-owner command.
The four queue entries were sent sequentially; concurrent independent clients
were not tested. Cross-session/unauthorized and remote rejection, invalid or
mapped-drive/reparse runtime cases, process-interrupted ACK loss, Studio/API exit
during playback and audible parity remain open. The startup RCA records why the
earlier test artifact did not run the frontend and the FIFO fixture corrections.
Normal Studio playback remains enabled.

## G3 receiver invalid-path follow-up — 2026-09-27

After the owner restart, the ignored paired Windows test sends
`https://example.invalid/audio.wav` as a raw `COMMAND` over the live same-logon
Play pipe. Play returns `ERROR/invalid_file_path`. A fresh STATE query confirms the owner
session, revision and complete playback snapshot remain unchanged. The
URL-shaped path is rejected before filesystem/network lookup.

The paired test passed **1/1** with this case. Studio native tests passed **6/6**
with the paired test ignored in the ordinary suite; Play native tests with
`g3-test-app-data-dir` passed **31/31**. Both Rust formatting checks and
`git diff --check` passed. The isolated Tauri CLI Play executable was built with a
relative embedded frontend and the fail-closed app-data feature. The run used
an empty disposable WebView2 profile, separate test-only app-data, and a
120-second silent WAV under system temp; the test process exited and the
disposable paths were removed.

This proves only receiver rejection of the URL-shaped invalid path. UNC or
mapped-drive/reparse runtime behavior, cross-session/unauthorized and remote
client rejection, concurrent ordering, ACK loss across process interruption,
Studio/API exit during playback and audible parity remain unverified. See the
[receiver path-rejection RCA](../../.brain/rca/2026-09-27-lalin-play-handoff-invalid-path-runtime-coverage.md).
Keep ordinary Studio playback enabled.

## G3 concurrent-client ordering follow-up — 2026-09-27

The paired run exposed two linked causes for possible cold Play launches during
warm handoff: Studio returned the cold-start sentinel after a busy-pipe wait,
and Play dropped/recreated its only server pipe instance after every request.
Studio now retries a busy instance without calling the launch callback; Play
reuses the same disconnected instance for the next connection. See the
[concurrent-client RCA](../../.brain/rca/2026-09-27-lalin-play-handoff-concurrent-client-launch.md).

The ignored Windows paired test
`playback_handoff::tests::paired_windows_cold_and_warm_handoff_ack_state_and_duplicate`
passed **1/1** with a Tauri CLI-built Play executable embedded from the relative
frontend path and `g3-test-app-data-dir`. One live HELLO connection occupied the
single pipe while four independent Studio client states started together. They
did not complete early or invoke the cold-launch callback; after release, each
received one applied ACK. The final queue suffix matched the strict ACK revision
order, with four unique increasing revisions. Revisions need not be contiguous
because Play's published playback snapshots may advance the state revision
between ACKs.

The same paired run retained the earlier cold/warm, ACK/STATE reconciliation,
duplicate suppression and owner-restart/no-blind-replay checks. A following
run also sent URL- and UNC-shaped invalid paths over separate live pipe
connections and confirmed both were rejected without changing STATE. A further
run closed the command connection before reading ACK, recovered the original
applied result through QUERY/STATE while Play remained alive, and confirmed a
same-ID retry did not enqueue a duplicate. Play Rust tests with
`g3-test-app-data-dir` passed **31/31**; Studio native handoff tests passed
**6/6** with the paired case ignored in the ordinary run. Tauri CLI test-feature
release build, both Rust format checks and `git diff --check` passed. The run
used an empty disposable WebView2 profile, separate test-only app-data and
unique silent WAV fixtures under system temp; no normal Play profile was used.
After the pipe-creation error path was updated to release a failed instance
before replacement, the Tauri CLI release binary was rebuilt from final source
and the paired test was rerun successfully (**1/1**).

G3 remains **PARTIAL**. Different-logon-session and remote pipe-client
rejection, mapped-drive/reparse runtime cases (including a reparse target
resolving to UNC), ACK loss across Play process interruption,
Studio/API exit during active playback and audible parity remain unverified.
S2 process-crash/power-loss recovery and remaining storage-write cases also
remain open. Preserve ordinary Studio playback until parity is proven.

## G3 lost ACK across Play owner restart — 2026-09-27

The ignored paired Windows test now closes the command sender before reading
ACK, confirms the same owner STATE contains exactly one appended queue item
relative to the pre-command HELLO snapshot, and only then terminates Play. After
Play starts with a new owner session, reconciliation returns delivery_unknown;
Studio retains the uncertain request and a same-ID retry does not relaunch Play
or append to the new owner's queue. See the [restart-test RCA](../../.brain/rca/2026-09-27-lalin-play-handoff-restart-test-title-assumption.md).

The paired test passed 1/1 with the Tauri CLI-built Play executable, the
g3-test-app-data-dir feature, a silent WAV, and fresh disposable WebView2 and
app-data directories under system temp. Studio native handoff tests passed 6/6
with the paired test ignored in the ordinary run; Play native tests passed
31/31. Both Rust format checks and git diff --check passed.

This closes the tested control-plane no-blind-replay boundary across owner
restart. It does not establish durable ACK history, active Studio/API exit
behavior or audible parity. Different-logon-session and remote-client
rejection and mapped-drive/reparse runtime cases remain unverified. S2
process-crash/power-loss and remaining storage-write cases also remain open.
Preserve ordinary Studio playback until parity is proven.

## G3 local restricted-logon SID ACL test — 2026-09-27

The Play Windows Rust ACL test now impersonates a restricted token with the
current logon SID disabled and attempts to open the real local pipe. `CreateFileW`
returns `ERROR_ACCESS_DENIED`; the same test then opens it from the normal current
session and sends HELLO successfully. The focused ACL test passed 1/1 and the
complete Play Rust suite passed 31/31 with `g3-test-app-data-dir`; `cargo fmt --
--check` and `git diff --check` passed.

This verifies denial of a local client token without the pipe's allowed logon SID.
It does not exercise a different Windows logon session or a remote client.
Cross-session and remote rejection, mapped-drive/reparse runtime cases, Studio/API
exit during active playback, audible parity, S2 process-crash/power-loss recovery
and remaining native write-failure cases remain open. Preserve Studio playback.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.10b | 2026-09-27 | beta | Add local Windows ACL denial evidence for a restricted logon token; retain cross-session and audible-parity gates | based on 988a3e4 | Codex |
| 0.2.9b | 2026-09-27 | beta | Add paired evidence that an applied lost-ACK command is not replayed after Play owner restart; retain audible parity and remaining security gates | based on 17a5c96 | Codex |
| 0.2.8b | 2026-09-27 | beta | Add paired lost-ACK recovery and same-ID no-duplicate evidence; preserve owner-restart and audible parity gates | based on cee5e93 | Codex |
| 0.2.7b | 2026-09-27 | beta | Add live paired rejection of URL- and UNC-shaped commands with unchanged STATE; retain runtime parity gates | based on cee5e93 | Codex |
| 0.2.6b | 2026-09-27 | beta | Revalidate paired concurrent lifecycle against a rebuild of final pipe-recovery source; retain open playback parity gates | based on 1084d5e | Codex |
| 0.2.5b | 2026-09-27 | beta | Add isolated concurrent-client paired FIFO evidence and record busy-pipe lifecycle fix; keep playback parity gates open | based on 1084d5e | Codex |
| 0.2.4b | 2026-09-27 | beta | Add paired invalid-path receiver evidence and retain remaining S3 parity gates | based on b90ffaed | Codex |
| 0.2.3b | 2026-09-27 | beta | Add isolated paired lifecycle evidence while keeping audio parity and remaining S3 acceptance gates open | based on 9e0cb06 | Codex |
| 0.2.2b | 2026-09-26 | beta | Reconcile S2 and S3 local implementation checks and preserve native lifecycle/parity gates | 7c30ea1 / 235875b | Codex |
| 0.2.1b | 2026-09-25 | beta | Add synthetic journal-phase recovery and selected native write-failure evidence | based on 411d2ed | LALIN |
| 0.2.0b | 2026-09-25 | beta | Add focused S2 migration implementation evidence without claiming runtime crash acceptance | based on 411d2ed | LALIN |
| 0.1.0b | 2026-09-20 | beta | Record standalone foundation, native evidence and user-confirmed audio; preserve incomplete split gates | based on 8429010 | LALIN |
