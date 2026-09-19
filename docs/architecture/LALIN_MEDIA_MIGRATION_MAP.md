---
version: "0.7.0b"
created_at: "2026-09-19T18:01:18+07:00,LALIN,uncommitted"
last_update: "2026-09-20T03:44:16+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "migration-map"
  scope: "Current Lalin Studio/Play tree to umbrella platform target"
---

# Lalin AI Umbrella Platform — Current to Target Migration Map

## Status and migration rule

**APPROVED FOR LOCAL P1/P2, TAURI T0/T1 AND THE BOUNDED DIAL SLICE.** This map is a staged target, not permission
to retire current Play or move playback ownership. Existing working paths remain
authoritative until each row's gate is passed and a separate implementation
change is approved.

Complexity: **C-3**. Risk: **HIGH**. Default migration strategy: additive,
reversible, and one runtime boundary at a time.

## Current-to-target map

| Current asset/fact | Target owner | Action now | Migration gate | Status |
|---|---|---|---|---|
| `apps/desktop/` Tauri + React | Lalin Studio / Create | keep unchanged as the Studio shell | no Media feature may require a Studio rail tab | current |
| `apps/desktop/src/playback/` | interim Lalin Play owner | keep current owner and contracts | Media parity and explicit ownership handoff | current/interim |
| native `play` window | current Play surface | keep as fallback during Media validation | Media lifecycle, playback and storage parity | current/interim |
| `apps/api/` FastAPI + ML | Lalin Core audio/brain service boundary | keep API and audio ownership | no YouTube proxy dependency introduced | current |
| `apps/mcp/` local stdio MCP | Lalin Core tool boundary | keep API-only access | explicit cross-app tool contract if needed | current |
| `packages/contracts/` | shared Lalin Core contracts | extend only for a real Media boundary | schema/version/compatibility tests | current seed |
| no `apps/media-desktop/` today | Lalin Media / Electron | add only in P1 after approval | pinned VacuumTube build and provenance check | proposed |
| no `apps/media-tauri/` today | Lalin Media / Rust + Tauri v2 | add as a parallel candidate; keep Electron fallback | Rust/WebView2 parity and native permission review | approved candidate |
| no `apps/media-remote/` today | Lalin Remote companion | do not create in Media slice | stable Media protocol + auth scope | deferred |
| no `apps/ride/` today | Lalin Ride experience | do not create in Media slice | mobile product scope + shared media contract | deferred |
| no `services/room-server/` etc. today | Lalin Room/cloud services | do not create in Media slice | multi-user/session/security ADR | deferred |
| Studio Library/Home launcher | entry to separate Media app | add only after Media bootstrap is proven | user gesture, focus/timeout/error behavior | proposed |
| current Studio sitemap rail | Studio navigation | preserve exactly | product/design review for any future change | current |

## Migration stages

### M0 — Documentation and provenance

Create and review ADR-001, the Media platform plan and this map. Record the
VacuumTube license, baseline release/tag/commit and the difference between
official Leanback, DIAL discovery and numeric TV-code pairing.

**Rollback:** discard candidate docs; current Studio/Play tree is unchanged.

### M1 — Parallel Media bootstrap

Add a separately buildable Electron Media workspace from the pinned upstream fork.
It must start independently before Studio launches it. No playback ownership is
moved in M1.

**Rollback:** remove the unlaunched Media artifact and its workspace registration;
Studio remains the only shipped surface.

### M2 — Launcher/lifecycle bridge

Studio launches/focuses/closes Media through a small versioned contract. The
launcher reports starting, ready, stopped and failed states. It never hides a
launch failure or creates a local replacement playback engine.

**Rollback:** disable the launcher entry and continue using the current Play
surface; no user queue/EQ data is rewritten.

**Local status:** implemented for Studio-to-Media `launch`, `focus`, `close` and
`status`. Real packaged-app and user-account lifecycle evidence remains pending.

### M3 — Media capability verification

Verify the selected official YouTube endpoint, sign-in flow, any real pairing
support, upstream ad-block controls, controller input and fullscreen in the
Electron runtime. Record unsupported capabilities explicitly.

**Rollback:** keep Media experimental and current Play active; do not claim TV
pairing or complete ad blocking.

**Local status:** **NOT_RUN**.

### M2-T — Tauri shell candidate

Add `apps/media-tauri` as a separately buildable Rust + Tauri v2 candidate. It
loads the pinned upstream Leanback endpoint in a remote WebView with a narrow
User-Agent compatibility configuration. Native shell behavior belongs in Rust;
DOM enhancements remain a later adapter. No current Play owner moves in this
stage.

**Rollback:** do not launch the candidate and continue using Electron/current
Play. Remove only the candidate app and its workspace registration if the
WebView2 boundary cannot meet the required gates.

**Local status:** **PARTIAL / static + process start + supervised DIAL +
user-confirmed iPhone pairing**; the restricted-host settings-store failure is
non-fatal now; physical network-drop recovery, GUI/WebView2 parity, packaged
repeatability and production gates remain pending.

### M4 — Ownership decision

Only after M3 compare Media playback, queue, now-playing, storage and lifecycle
behavior against current Play. Decide in a new approved change whether to extract
shared playback primitives or keep two explicitly scoped owners.

**Rollback:** no move. The existing Play owner remains authoritative.

### M5 — Optional companions and shared experiences

Remote, Room and Ride receive separate product/architecture decisions. Each must
have a real consumer and an authorization model before new packages/services are
created.

## Forbidden shortcut migrations

- renaming `apps/desktop` to `apps/studio` before package/updater/data compatibility
  is designed;
- embedding Electron in Tauri to avoid defining a process boundary;
- replacing current Play playback with an unverified Media process;
- introducing a YouTube proxy or credential relay to make pairing appear to work;
- creating target folders with no owner, contract or verification gate;
- treating a local build or screenshot as production/account acceptance.

## Deletion and retention inventory

| Item | Decision | Reason |
|---|---|---|
| current `apps/desktop` | retain | active Studio and Play implementation |
| current `apps/api` | retain | active AI/audio backend |
| current `apps/mcp` | retain | active local tool boundary |
| `packages/contracts` | retain/extend cautiously | existing shared contract package |
| current `play` window | retain until parity | reversible fallback and current owner |
| future Media fork | add only after approval | new runtime with upstream obligations |
| empty future `services/*` | do not create yet | speculative and unowned |

## Verification matrix

| Stage | Required evidence | Result before implementation |
|---|---|---|
| M0 | docs links, provenance and boundary review | **PASS / local** |
| M1 | reproducible Electron start/build | **PASS / local bootstrap** |
| M2 | lifecycle contract tests and local process smoke | **PASS / contract; process smoke pending** |
| M2-T | Tauri Rust shell, remote URL/User-Agent, native boundary and supervised DIAL descriptor | **PASS / local + user-confirmed iPhone TV-code connection; network-drop, GUI and package parity pending** |
| M3 | real endpoint/auth/pairing/ad-filter/controller evidence | **PARTIAL / TV-code pairing only; endpoint/account/ad-filter/controller evidence pending** |
| M4 | ownership/storage/playback comparison | **NOT_RUN** |
| M5 | separate product/security/architecture approval | **NOT_RUN** |

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.3.0b | 2026-09-19 | beta | Added the Tauri shell candidate and static WebView boundary evidence | uncommitted | LALIN |
| 0.4.0b | 2026-09-19 | beta | Recorded process-start smoke and non-fatal settings persistence fallback | uncommitted | LALIN |
| 0.5.0b | 2026-09-20 | beta | Recorded the approved bounded DIAL/H5VCC slice and kept phone pairing as a separate gate | uncommitted | LALIN |
| 0.6.0b | 2026-09-20 | beta | Recorded user-confirmed local iPhone TV-code connection after the Ethernet profile/firewall fix; packaging and parity gates remain open | uncommitted | LALIN |
| 0.7.0b | 2026-09-20 | beta | Recorded supervised DIAL retry/rebind and continuous Leanback device-id persistence after the disconnect RCA | uncommitted | LALIN |
| 0.2.0b | 2026-09-19 | beta | Recorded local M0-M2 implementation status and retained M3+ as explicit gates | uncommitted | LALIN |
| 0.1.0b | 2026-09-19 | candidate | Added reversible current-to-target map and retention/deletion inventory for the umbrella platform | uncommitted | LALIN |
