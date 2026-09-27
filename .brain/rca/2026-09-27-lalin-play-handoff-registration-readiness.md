---
version: "0.1.2b"
created_at: "2026-09-27T02:44:46+07:00,Codex,daa2867"
last_update: "2026-09-27T06:56:17+07:00,Codex"
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
| `apps/play-desktop/src/App.tsx` | `bindHandoffReceiver` is started in the Tauri-only effect and its errors are passed to UI state. |
| `apps/play-desktop/src-tauri/src/handoff.rs` | `register_handoff_owner` marks the owner ready and creates the Windows pipe server; this command is the server startup path. |

## Root Cause (startup timeout)

At the confirmed boundary, native owner registration did not become reachable
to the paired sender. The server is created only after the frontend calls
`register_handoff_owner`; process creation alone does not establish pipe
readiness. Available evidence does not distinguish a frontend mount/guard
failure, event/API bridge failure, command authorization failure, or a native
server creation error. The lower-level cause remains unconfirmed; no production
handoff change is justified by this evidence alone.

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

## Proposed prevention

Keep the paired gate open until the first owner-registration boundary reports
an observable success or failure and the Studio sender receives HELLO/STATE.
Build a dedicated test executable with a test-only, fail-closed app-data path;
point it at a fresh system-temp directory and keep the WebView2 profile separate.
This isolation guard is now implemented, but the paired rerun still fails
before HELLO/STATE. Next distinguish frontend effect entry, listener resolution,
`register_handoff_owner` result, and named-pipe creation without weakening the
same-session boundary or reusing user data. Keep Studio playback enabled until
native and audible parity are proven.

## Resolution and validation

The harness isolation defect is addressed with the `g3-test-app-data-dir`
feature. Its Play native tests passed **31/31** both with and without the
feature; the feature release build passed. Studio native tests passed **6/6**
with the paired test ignored. The expanded paired run used new temporary
WebView2 and app-data paths, but still timed out before HELLO/STATE after
**31.26 seconds**; FIFO burst and owner restart were not reached. The owner
readiness root cause remains unresolved. The earlier unisolated diagnostic
launch may have accessed the user's Play app-data path; its contents were not
inspected, and whether it changed data remains unknown. G3 stays PARTIAL; no PR
merge or parity acceptance is claimed.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.2b | 2026-09-27 | beta | Add fail-closed temporary app-data isolation and record the still-unresolved paired timeout | based on 5351a18 | Codex |
| 0.1.1b | 2026-09-27 | beta | Separate the unconfirmed pipe timeout from the confirmed paired-test app-data isolation defect | based on 5351a18 | Codex |
| 0.1.0b | 2026-09-27 | beta | Record the unconfirmed cold owner-registration readiness boundary and remaining diagnosis | based on daa2867 | Codex |
