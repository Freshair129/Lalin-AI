---
version: "0.1.1b"
created_at: "2026-09-17T03:45:00+07:00,LALIN,uncommitted"
last_update: "2026-09-17T04:12:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "playback"
  doc_type: "validation"
  scope: "Approved CR-001 command delivery and single-owner repair"
---

# Playback command delivery validation

User approval: `approve` on 2026-09-17 after the
[C-3 / HIGH-risk plan](../architecture/LALIN_PLAY_COMMAND_DELIVERY_PLAN.md).
Baseline: `3d7b60e96fe43f2cc2564ffd13ee0e8ecb3a6446`.
Implementation and these records are committed together on `codex/cr001-playback-followup`
following the user's explicit commit/push request.
Luna max implemented/reviewed the native window slice and regression tests.

## Implemented behavior

- Play Window owns consumer audio, queue, EQ persistence and MediaSession.
  Studio imports only a command client and displays the owner's state snapshot.
  Surface code is lazy-loaded, so importing Studio does not construct its own
  consumer audio engine. Arrange's editing engine remains independent.
- Readiness precedes FIFO command delivery. Commands carry client/owner session
  IDs and a deduplication ID. ACK confirms command application, STATE reports
  playback. Unknown delivery never silently replays into a new owner.
- Explicit reconciliation can reopen a closed popup and inspect the old command
  result. A changed owner requires a new user action. Native failures remain
  visible and do not open a browser fallback.
- Native Play uses its predeclared window and scoped caller capability. Custom
  close and native close requests hide it without destroying the owner.
- Actual HTML `playing` events restore playback state after buffering; the
  [RCA](../../.brain/rca/2026-09-17-lalin-play-command-delivery.md) includes the real
  WebView2 failing trace `play → waiting → playing` and its regression.

## Evidence

| Gate | Result and boundary |
|---|---|
| Baseline focused tests | 28/28 PASS; missed cold-listener loss reproduced separately with actual Node BroadcastChannel |
| Desktop suite | **177/177 PASS**, 20 files; bridge 15/15, ownership, native permission/window and real-engine event regressions included |
| Root Node build | PASS: contracts, MCP and desktop TypeScript/Vite |
| Browser smoke | PASS in isolated headless Edge context, real media element with synthetic 60-second PCM silence and fixture API |
| Native smoke | PASS in actual Windows Tauri debug executable / WebView2, isolated user-data folder, same synthetic media/API fixture |
| Standard Cargo check | Initially blocked by missing sidecar; **PASS** after the user's sidecar-build follow-up, with normal Tauri config |
| Native engineering build | PASS using process-local `TAURI_CONFIG` with bundle externalBin/resources omitted; canonical packaging config unchanged |
| API | Follow-up: 86 backend tests and real sidecar health/full-profile route smoke PASS; see sidecar report |
| ML, packaged installer, release/hosted CI | NOT_RUN; no backend or packaging source changed |

Browser assertions: first FileManager Play arrives exactly once; one Play audio
element and one play invocation, zero Studio consumer audio elements/invocations;
saved queue and EQ preserved; queue mutation, warm focus and Studio navigation do
not reopen/replay; cold Play Next reopens the owner and updates its queue without
autoplay. No page errors in the checked flow.

Native assertions additionally verify shared origin storage before playback,
minimize/restore, maximize/restore, custom hide, OS `WM_CLOSE` hide and reopening
the same owner without another play invocation. The OS request is restricted to
the verified workspace debug executable PID and exact `Lalin Play` window title.
An attempted unrelated `plugin:process|exit` call from Play is rejected. The test
does not widen production permissions to drive window close.

Native first-play evidence: state `playing`, current time advancing, duration 60,
one audio element, one play call, event sequence `play`, `waiting`, `playing`.
This verifies media event/progress and window behavior; it does **not** certify
audible sound quality, physical output, EQ response, media keys, device hotplug,
sleep/wake, application restart persistence or release packaging.

Local ignored artifacts are in `runtime/playback-verification/`:
`browser-smoke.json`, `native-smoke.json`, screenshots `browser-play.png` and
`native-play.png`, and the pre-fix `native-loading-reproduction.json`. The native
screenshot was visually inspected. Fixtures use no real user media or profile.

## Reproduction

1. Start Vite at port 5173 after the Rust build is complete. A simultaneous first
   Rust compilation exposed a Vite watcher `EBUSY` on generated target executables;
   restarting Vite after compilation resolved the verification environment.
2. Set `PLAYWRIGHT_MODULE` to an installed Playwright module and run
   `node tools/verify/playback_window_smoke.cjs` for browser validation.
3. For the native engineering build, set process-local
   `TAURI_CONFIG={"bundle":{"externalBin":[],"resources":[]}}` and run
   `cargo build --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`.
   This is not the standard release build.
4. Launch that debug executable with an unused localhost CDP port and a **new
   isolated** `WEBVIEW2_USER_DATA_FOLDER` under the ignored verification directory.
   Set `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223`.
   Never point the fixture script at a user's existing browser/app profile.
5. Set `LALIN_SMOKE_CDP=http://127.0.0.1:9223`, `LALIN_SMOKE_PROFILE` to that folder,
   and `LALIN_SMOKE_PID` to the launched debug app PID, then run the same smoke
   script in its desktop context. Native close uses `playback_native_close.ps1`.
   Stop only the test app and dev server started for this run afterward.

WebView2 CDP/profile configuration follows the
[Microsoft Playwright WebView2 guide](https://github.com/microsoft/playwright/blob/main/docs/src/webview2.md)
and [Microsoft environment override documentation](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/webview2-idl).

## Final verification

Final local run at 03:50 ICT: **177/177 tests PASS**, root Node build PASS,
browser smoke PASS and native smoke PASS after all bridge review corrections.
Logs: `runtime/playback-verification/desktop-tests.log` and `node-build.log`.
Existing jsdom queue tests print unimplemented media `pause` warnings; real media
behavior is separately verified by the Edge/WebView2 fixture checks.

Documentation links and `git diff --check` pass. Regenerated graph contains
330 nodes / 362 edges, zero stale nodes/edges, all 46 endpoints and 35 components
mapped. Graph scanning is structural traceability only, not semantic approval or
production certification. Those graph counts describe the playback checkpoint
before adding the sidecar follow-up document.

The later user request authorizes committing/pushing this repair and building
the missing sidecar. [Sidecar validation](2026-09-17-SIDECAR-BUILD.md) records the
successful standard `npm run check:all`, real copied executable smoke and artifact
hash. Source/tests/docs are committed; generated binaries stay ignored. No release
tag, installer or hosted release was created.

## Document version diff

| Document | Before this approval | After |
|---|---|---|
| Command-delivery plan | 0.1.0b candidate | 0.1.1b beta, approved/implemented |
| RCA | 0.1.0b need review | 0.1.1b beta with native reproduction/remediation |
| CR-001 | 0.2.3b need review | 0.2.4b need review; scoped repair evidence, broad MVP gate retained |
| Architecture SOT | history 0.1.13b; stale header 0.1.0b | 0.1.14b beta |
| DOCS_INDEX | 0.1.16b | 0.1.17b |
| This report | absent | 0.1.0b beta → 0.1.1b sidecar/commit follow-up |

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-09-17 | beta | Record authorized commit/push follow-up and successful normal-config check after sidecar build | included with source repair | LALIN |
| 0.1.0b | 2026-09-17 | beta | Record approved repair, browser/native fixture evidence and release limitations | uncommitted | LALIN |
