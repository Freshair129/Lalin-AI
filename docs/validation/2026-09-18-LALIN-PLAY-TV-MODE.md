---
version: "0.1.0b"
created_at: "2026-09-18T05:00:00+07:00,LALIN,uncommitted"
last_update: "2026-09-18T05:00:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "playback"
  doc_type: "validation"
  scope: "Approved Lalin Play TV and Leanback presentation mode"
---

# Lalin Play TV Mode validation

User approval: `approve` on 2026-09-18 after the
[C-3 / HIGH-risk TV Mode plan](../architecture/LALIN_PLAY_TV_MODE_PLAN.md).
Baseline: `839bb9e` (local branch `codex/local-installer-version-fix`).
The implementation remains local and uncommitted; no push or release action is
included in this report.

## Implemented slice

- Existing `Lalin Play` keeps the single playback owner, queue, Now Playing,
  position, volume and persisted EQ state while switching a session-local TV
  presentation.
- TV Mode adds a visible enter/exit control, 10-foot typography and target
  sizing, high-contrast focus, keyboard navigation and a semantic Gamepad API
  adapter with teardown cleanup.
- Browser fullscreen uses the Fullscreen API when available and keeps the TV
  layout usable with an actionable Thai error when unavailable. Native Tauri
  fullscreen is restricted to the predeclared `play` window.
- The `play` capability adds only `is-fullscreen` and `set-fullscreen`; no
  backend route, network permission, decoder, second engine or second window
  was added.

## Evidence

| Gate | Result and boundary |
|---|---|
| TV input/fullscreen focused tests | **25/25 PASS**, 3 files (`tvMode`, `windowManager`, exact Play ACL contract) |
| Full desktop suite | **184/184 PASS**, 21 files |
| Desktop production build | **PASS**: TypeScript check and Vite build |
| Root `npm run check:all` | **PASS**: contracts, MCP, desktop build, API compileall and Cargo check |
| Browser smoke | **PASS**: isolated Playwright browser context, synthetic 60-second silence WAV and mocked API; enter/exit TV, focus, Escape, fullscreen stub and queue/EQ/Now Playing preservation |
| Native smoke | **PASS**: Windows Tauri debug executable/WebView2, isolated user-data profile and CDP; native fullscreen true/false, Escape, focus, preservation and existing window lifecycle |
| Physical gamepad | **NOT_RUN**: no physical controller was attached; semantic adapter unit coverage is not hardware certification |
| Audible output, media keys, output-device hotplug, clean VM, production/release or hosted CI | **NOT_RUN** |

Browser evidence is stored in the ignored
`runtime/playback-verification/browser-smoke.json`; native evidence is stored in
`runtime/playback-verification/native-smoke.json`. Both fixtures use no real
user media or profile. The native build used a process-local
`TAURI_CONFIG={"bundle":{"externalBin":[],"resources":[]}}` override only to
compile the debug executable without packaging inputs; the tracked release
configuration was not changed.

The browser fixture stubs `requestFullscreen`/`exitFullscreen` so the flow can
verify state transitions in an isolated browser context. Native smoke reads the
actual WebView2/Tauri fullscreen state. These checks prove presentation and
window behavior; they do not prove audible sound quality, a physical display or
controller, media-key delivery, device switching, sleep/wake, restart
persistence, signed packaging or production readiness.

## Acceptance matrix

| Requirement | Evidence |
|---|---|
| FR-18.1 / FR-18.2 | Browser and native smoke enter via visible button, render TV root and expose visible focus; startup remains normal Play |
| FR-18.3 | `tvMode.test.ts` mappings plus browser Arrow/Enter/Escape flow |
| FR-18.4 | Semantic button mapping, edge-trigger and cleanup tests; hardware marked NOT_RUN |
| FR-18.5 | Browser mocked Fullscreen API and native `isFullscreen`/`setFullscreen` smoke |
| FR-18.6 / FR-18.7 | Browser/native snapshots preserve queue, EQ, Now Playing and exit/error hooks |
| FR-18.8 | Exact capability test and `check:all`; no backend or network delta |

## Reproduction

1. Run `npm --workspace apps/desktop test -- --run` for the full desktop suite.
2. Start Vite on `127.0.0.1`, set `PLAYWRIGHT_MODULE` to the installed
   Playwright module, and run `node tools/verify/playback_window_smoke.cjs`.
3. Build the debug native executable with the process-local bundle override,
   launch it with a fresh ignored `WEBVIEW2_USER_DATA_FOLDER` and unused CDP
   port, then set `LALIN_SMOKE_CDP`, `LALIN_SMOKE_PROFILE` and `LALIN_SMOKE_PID`
   before running the same smoke script.
4. Run `npm run check:all` and the document graph scanner after documentation
   changes.

## Documentation and evidence boundary

The approved CR, architecture plan and interaction spec are linked from
`docs/DOCS_INDEX.md`. This report records local implementation evidence only;
physical-controller, production, signed-release and hosted-CI gates remain
open. A browser fullscreen stub and a semantic Gamepad mock must not be
reported as hardware evidence.

## Document version diff

| Document | Before approval | After local implementation |
|---|---|---|
| CR-002 | absent | 0.1.0b beta, approved TV presentation scope and acceptance gates |
| TV architecture plan | absent | 0.1.0b beta, approved and implemented locally with module/permission boundary |
| TV interaction spec | absent | 0.1.0b beta, 10-foot layout, focus and stable hooks |
| SRS | 1.3.x baseline | 1.4.0b with FR-18 and NFR-TV-01..04 |
| BLUEPRINT / layout / sitemap / component registry | prior Play-only records | TV surface, ownership and adapter traceability added |
| This validation report | absent | 0.1.0b beta, local unit/browser/native evidence |

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-18 | beta | Record approved TV Mode implementation, browser/native smoke and evidence limits | uncommitted | LALIN |
