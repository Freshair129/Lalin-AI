---
version: "0.1.4b"
created_at: "2026-09-27T02:44:46+07:00,Codex,daa2867"
last_update: "2026-09-27T09:01:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "playback-reliability"
  doc_type: "rca"
  scope: "Cold Play owner registration before Studio-to-Play pipe readiness"
---

# RCA: Play owner registration does not become ready in the cold paired run

## Symptom

The expanded Windows paired-process test starts `lalin-play.exe` but times out
before the Studio client can complete HELLO/STATE. The process remains
responsive with a `Lalin Play` window, while the sender cannot connect to the
expected owner pipe.

## Evidence

| Evidence | Observation |
|---|---|
| Expanded paired test with release executable | Timed out before the cold owner pipe became connectable; the added FIFO and restart assertions were not reached. |
| Expanded paired test with debug executable | Also timed out when no Vite server was running; this launch is an invalid debug setup and is not acceptance evidence. |
| Manual release launch with a dedicated WebView2 profile | The Play process remained alive and responsive, but the paired client still could not observe an owner pipe. |
| Paired-test child launch environment | Sets `WEBVIEW2_USER_DATA_FOLDER`; does not isolate Tauri app data. |
| Play app-data callers | `library::initialize` and migration recovery call `app.path().app_data_dir()`. Tauri 2.11.6 resolves this via `dirs::data_dir`; the Windows implementation uses `SHGetKnownFolderPath`. |
| Manual diagnostic launch | Started the normal `ai.lalin.play` executable with only a fresh WebView2 profile. No user app-data files were inspected or compared, so whether startup accessed or changed app data is unknown. |
| Isolated paired rerun | Play was built with `g3-test-app-data-dir`; the test app-data directory was created under system temp, but the sender still timed out before HELLO/STATE after 31.26 seconds. |
| Direct Cargo test-build reproduction | Test-only startup trace reached native setup and library initialization, but had no WebView page-load, migration-recovery or owner-registration stages. |
| Absolute `frontendDist` diagnostic build | Native probe recorded a `file:///...` page and `root=false`; the React app did not mount or register the pipe owner. |
| Correct embedded-assets build | Tauri CLI with a relative frontend directory recorded `http://tauri.localhost/`, `root=true`, migration recovery, `register_handoff_owner`, pipe creation and `handoff_receiver_ready`. The successful cold launch and owner restart each recorded the ready stages. |
| Isolated paired lifecycle rerun | The ignored Studio paired test passed **1/1** with a fresh WebView2 profile, a separate test-only app-data directory under system temp and a local silent WAV. It exercised cold/warm actions, ACK/STATE reconciliation, duplicate suppression, four unique-path queue entries in ACK order, owner restart and refusal to replay an uncertain prior-owner command. |
| FIFO fixture investigation | Reusing one media path gave every native queue item the same path-derived title, so the order assertion could not distinguish entries. A first unique-file attempt used the canonical `\\?\...` temp prefix, which the unchanged Studio validator correctly rejects; copying beside the raw-path temp WAV fixed the fixture without relaxing validation. |
| `apps/play-desktop/src/App.tsx` | `bindHandoffReceiver` is started in the Tauri-only effect and its errors are passed to UI state. |
| `apps/play-desktop/src-tauri/src/handoff.rs` | `register_handoff_owner` marks the owner ready and creates the Windows pipe server; this command is the server startup path. |

## Root Cause (confirmed test-build artifact; historical exact artifact varies)

The reproduced pre-HELLO timeout came from a test executable that did not load
the bundled frontend. Direct Cargo build instrumentation stopped before any
WebView page-load or frontend registration stage. A diagnostic build that
configured `frontendDist` as an absolute temp path loaded the app as a
`file:///...` URL and recorded `root=false`. Without the React app mounted,
`register_handoff_owner` never ran and no server pipe was created, so a live
window could not satisfy the Studio client's HELLO attempt.

The correct test artifact is produced through Tauri CLI with a relative
embedded frontend path: the native probe sees `http://tauri.localhost/` and
`root=true`, after which migration recovery and native pipe registration become
ready. The paired lifecycle test then passes. This establishes the build/setup
cause for the reproduced timeout path; the exact artifact used in every older
recorded failed attempt is unavailable, so those individual runs cannot all be
attributed to it. No production IPC or authorization defect is indicated by the
current evidence.

## Root Cause (FIFO assertion failure)

The paired test originally queued the same silent WAV repeatedly, while Play
derives each queue title from the native file path and ignores the
Studio-supplied title. The title-based assertion therefore received identical
titles and could not distinguish FIFO order. The first fixture fix joined the
canonical temp root, whose `\\?\` prefix is intentionally rejected by Studio's
raw-path validation. The corrected fixture copies unique WAV files beside the
raw local temp fixture, verifies that their canonical parent is the system temp
directory, and removes them after the isolated Play process exits. Production
path validation and FIFO implementation were not changed for this test issue.

## Confirmed harness defect: paired-test app-data was not isolated

The G3 harness sets `WEBVIEW2_USER_DATA_FOLDER` but does not redirect the Play
app-data path. Play startup calls `library::initialize` and migration recovery
through `app.path().app_data_dir()`, which resolves to the user's Windows Known
Folder plus `ai.lalin.play`. Therefore an empty WebView2 profile does not
protect the user's Play library or recovery journal. This is a confirmed
test-isolation defect; evidence does not establish it as the cause of the
pipe-readiness timeout.

## Why the issue escaped detection

The normal Studio Rust library suite ignores the paired-process test. Earlier
G2 evidence covered unit/protocol behavior and builds, while G3 checked only
that the WebView2 profile was disposable. Neither the test preflight nor its
documentation checked where Tauri stores the Play library and migration journal.

## Prevention applied and remaining limits

Build the paired executable through Tauri CLI with its frontend embedded by a
relative path; use a test-only fail-closed app-data override and a separate empty
WebView2 profile under system temp. Keep native startup stage traces gated by
`g3-test-app-data-dir`. Use unique local file paths for path-derived FIFO queue
assertions and keep canonical-path checks active. Continue to require the Studio
sender to receive matching HELLO/ACK/STATE before marking paired delivery
passed. Concurrent independent-client FIFO, cross-session/unauthorized and
remote rejection, UNC/mapped-drive/reparse runtime cases, ACK loss across
process interruption, Studio/API exit during active playback and audible parity
remain unverified. The paired test now covers rejection of one URL-shaped path;
see the [invalid-path coverage RCA](2026-09-27-lalin-play-handoff-invalid-path-runtime-coverage.md).
Keep ordinary Studio playback enabled until those full acceptance gates pass.

## Resolution and validation

The harness app-data isolation is addressed with `g3-test-app-data-dir` and the
test executable is now built with Tauri CLI's embedded frontend. The test-only
startup trace showed migration recovery and receiver registration complete.
The ignored Studio test
`playback_handoff::tests::paired_windows_cold_and_warm_handoff_ack_state_and_duplicate`
passed **1/1** using separate, fresh temporary WebView2 and Play app-data paths.
It verified cold launch, warm Play Next/Add to Queue, matching ACK/STATE,
ACK-disconnect reconciliation, duplicate suppression, ordered unique-path queue
entries and owner restart without blind replay. The native control-plane pair
is therefore verified for these cases; concurrent clients, unauthorized or
cross-session attempts, remote rejection, UNC/mapped-drive/reparse runtime
cases, process-interrupted ACK loss, Studio/API exit during playback and audible
parity remain **NOT_VERIFIED**. A later paired run verifies URL-shaped invalid
path rejection without state change; see the [invalid-path coverage RCA](2026-09-27-lalin-play-handoff-invalid-path-runtime-coverage.md).
G3 remains PARTIAL; Studio playback stays enabled and no merge or parity
acceptance is claimed.

Earlier unisolated manual diagnostics may have accessed the normal Play
app-data path; its contents were not inspected, and whether those attempts
changed data remains unknown. The current paired runs use only disposable
test-feature app-data directories and do not inspect or remove normal user data.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.4b | 2026-09-27 | beta | Record later paired invalid-path rejection evidence and narrow the remaining runtime gate | based on b90ffaed | Codex |
| 0.1.3b | 2026-09-27 | beta | Confirm test asset-loading cause for reproduced startup timeout and record passing isolated paired lifecycle; retain remaining parity gates | based on 9e0cb06 | Codex |
| 0.1.2b | 2026-09-27 | beta | Add fail-closed temporary app-data isolation and record the still-unresolved paired timeout | based on 5351a18 | Codex |
| 0.1.1b | 2026-09-27 | beta | Separate the unconfirmed pipe timeout from the confirmed paired-test app-data isolation defect | based on 5351a18 | Codex |
| 0.1.0b | 2026-09-27 | beta | Record the unconfirmed cold owner-registration readiness boundary and remaining diagnosis | based on daa2867 | Codex |
