---
version: "0.2.0"
created_at: "2026-09-20T12:00:00+07:00,LALIN,eb90421"
last_update: "2026-09-20T12:00:00+07:00,LALIN,6163c57"
status: "active"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "handoff"
  scope: "Product separation of Lalin Cast from the Lalin-AI umbrella repository"
---

# Lalin Cast — Product Separation Handoff

## Decision and current state

Lalin Cast is now a separately owned product and source repository:

- Canonical repository: `https://github.com/Freshair129/lalin-cast`
- Default branch: `main`
- Standalone source commit: `eb904213dd470e78eb502e118fb4b26b6c00cfa8`
- Product identity: `Lalin Cast`
- Windows executable: `lalin-cast.exe`
- Tauri identifier: `ai.lalin.cast`
- Leanback endpoint: `https://www.youtube.com/tv`

The standalone repository owns the Rust + Tauri v2 shell, the DIAL/SSDP and
H5VCC bridge, the VacuumTube reference source, Cast settings, updater
configuration and the GitHub Release workflow. The signed release and clean
install/update gates remain open until a tagged Windows release is tested.

## Separation boundary

`Freshair129/Lalin-AI` remains the umbrella product. It owns Lalin Studio,
the audio/API services, MCP, shared contracts and the Studio-side lifecycle
client. It no longer owns the Cast implementation or the VacuumTube source.

The Studio-to-Cast boundary is a process contract:

| Boundary | Contract |
|---|---|
| executable | `LALIN_CAST_EXECUTABLE` points to the installed `lalin-cast.exe`; a sibling executable is accepted for bundled installations |
| optional working directory | `LALIN_CAST_WORKDIR`; otherwise the executable directory |
| lifecycle command | existing `media_lifecycle` contract remains stable for Studio compatibility |
| process ownership | Studio starts, focuses, polls and closes the Cast process it owns |
| source dependency | no `F:\lalin` or `apps/media-*` path is used at runtime |

The compatibility name `media_lifecycle` is intentionally retained at the
Studio contract boundary; it is not ownership of the old product.

## Removed from the umbrella repository

The following product source trees are removed from `Freshair129/Lalin-AI` in
the separation change:

- `apps/media-desktop/` — Electron/VacuumTube reference and fallback source;
- `apps/media-tauri/` — Rust + Tauri v2 Cast runtime.

The root npm workspace and check scripts are also removed from the old Media
workspace. Historical ADRs and RCA records remain as provenance; they are
not executable product code and are marked as historical where applicable.

## Retained in the umbrella repository

- `apps/desktop/` and its Cast lifecycle client;
- `packages/contracts/` and the versioned lifecycle schema;
- root release/build workflows for Lalin Studio only;
- architecture, provenance and RCA documents that explain the handoff;
- no Cast signing private key, user state, cookies or pairing state.

## Updater and release ownership

Lalin Cast uses its own Tauri updater public key and GitHub Release endpoint.
The standalone workflow expects these GitHub secrets:

- `LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY`
- `LALIN_CAST_TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

The workflow is tag-driven (`v*`) and creates signed Windows x64 artifacts and
`latest.json` as a draft release. No production update claim is made until a
published release has passed clean install, update, restart and failure-path
checks.

## Verification evidence

- standalone `cargo fmt --check`: passed;
- standalone `cargo check --offline`: passed;
- standalone `cargo test --offline`: 3 DIAL tests passed;
- standalone Tauri debug build: passed;
- runtime smoke: Cast process, UDP 1900 listener and HTTP DIAL descriptor
  returned successfully;
- signed debug NSIS bundle and `.sig`: generated locally;
- target `main` remote SHA: matched `eb904213dd470e78eb502e118fb4b26b6c00cfa8`;
- published release/update smoke: `NOT_RUN` (no GitHub Release published yet).

## Recovery

The standalone repository remains independently recoverable at the recorded
commit. Removing the old source trees from Lalin-AI does not rewrite history;
the previous files remain available through the umbrella repository history.
Rollback of the root cleanup is a normal revert of the cleanup commit, while
Cast fixes must be made in `Freshair129/lalin-cast`.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.0 | 2026-09-20 | active | Recorded the pushed Lalin Cast ownership boundary, Studio process contract and root-repository cleanup scope | 6163c57 | LALIN |
