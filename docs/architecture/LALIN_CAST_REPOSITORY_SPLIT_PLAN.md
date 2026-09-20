---
version: "0.2.0"
created_at: "2026-09-20T04:12:08+07:00,LALIN,uncommitted"
last_update: "2026-09-20T12:00:00+07:00,LALIN"
status: "active"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "implementation-plan"
  scope: "File inventory, history-preserving export and release handoff for lalin-cast"
---

# Lalin Cast — Repository Split and Release Plan

## Status and risk

**IMPLEMENTED — source separation and target push completed.** The standalone
Cast source is in `Freshair129/lalin-cast` at commit
`eb904213dd470e78eb502e118fb4b26b6c00cfa8`. The root cleanup below removes the
duplicated source trees from `Freshair129/Lalin-AI`; signed release and update
smoke remain separate open gates.

Complexity: **C-3**. Risk: **HIGH**. The plan is additive and reversible until
the target repository push is explicitly approved.

## Success criteria

The split is complete only when all of the following are evidenced:

1. The exact target is `Freshair129/lalin-cast` and its default branch is
   `main`.
2. A clean standalone checkout builds the Lalin Cast Tauri app without reading
   files from `F:\lalin` or `apps/desktop`.
3. The shipped identity is consistently `Lalin Cast` / `lalin-cast.exe` and the
   approved Tauri identifier is used everywhere.
4. The VacuumTube baseline and MIT notice remain attributable and reproducible.
5. Lalin Studio consumes an installed Cast artifact through
   `LALIN_CAST_EXECUTABLE` without a source-tree dependency.
6. The updater checks a signed GitHub Releases manifest and fails closed when a
   signature, version or download check is invalid.
7. A tagged GitHub Actions build produces an NSIS installer, signed updater
   artifact and `latest.json`, with no private key in the repository or logs.
8. A clean install and update from one published Cast version to the next are
   tested on Windows x64. Until then, release readiness remains `NOT_RUN`.

## Exact migration inventory

### Move into `Freshair129/lalin-cast`

| Current path | Target path | Treatment |
|---|---|---|
| `apps/media-tauri/src-tauri/` | `src-tauri/` | primary Rust + Tauri runtime; rewrite product identity and relative asset paths |
| `apps/media-tauri/fallback/` | `fallback/` | standalone fallback HTML used by Tauri build |
| `apps/media-tauri/README.md` | `README.md` | rewrite as Cast product/readiness guide |
| `apps/media-tauri/LALIN_PROVENANCE.md` | `LALIN_PROVENANCE.md` | retain provenance; update product/repository paths |
| `apps/media-desktop/` | `reference/vacuumtube/` | retain pinned upstream reference/fallback; do not ship it from the Tauri release job by default |
| `apps/media-desktop/LICENSE` | `reference/vacuumtube/LICENSE` | preserve MIT notice with the upstream source |
| `apps/media-desktop/LALIN_PROVENANCE.md` | `reference/vacuumtube/LALIN_PROVENANCE.md` | preserve source archive hash and local patch boundary |
| `docs/architecture/ADR-002-LALIN-MEDIA-TAURI-PORT.md` | `docs/architecture/ADR-001-CAST-TAURI-PORT.md` | copy/rewrite as Cast-owned architecture record; keep root ADR-002 as historical handoff |
| `docs/architecture/LALIN_MEDIA_PLATFORM_PLAN.md` | `docs/architecture/CAST_PLATFORM_PLAN.md` | copy/rewrite Cast-specific portions and current gates |
| `docs/architecture/LALIN_MEDIA_MIGRATION_MAP.md` | `docs/architecture/CAST_MIGRATION_MAP.md` | copy/rewrite standalone ownership and rollback map |
| `.brain/rca/2026-09-19-media-tauri-store-access-denied.md` | `.brain/rca/` | preserve runtime RCA evidence |
| `.brain/rca/2026-09-20-lalin-media-tauri-pairing-missing-dial.md` | `.brain/rca/` | preserve pairing/firewall evidence |
| `.brain/rca/2026-09-20-lalin-media-tauri-dial-disconnect.md` | `.brain/rca/` | preserve listener recovery RCA and commit result |

The final target path names above were executed in the standalone export. The
source paths are removed from the umbrella repository by the root cleanup
commit; the previous content remains recoverable from Git history.

### Retain in `Freshair129/Lalin-AI`

| Current path | Reason |
|---|---|
| `apps/desktop/` | Lalin Studio remains the umbrella application and launcher consumer |
| `apps/api/` | AI/audio backend is unrelated to Cast ownership |
| `apps/mcp/` | local tool boundary remains with the umbrella product |
| `packages/contracts/` | Studio-side lifecycle contract remains versioned in the umbrella until a cross-repo contract package is approved |
| `apps/desktop/src/media/` and related Tauri launcher code | transitional consumer; later changes resolve an installed `lalin-cast.exe` rather than a source-tree path |
| root `package.json` and root lockfile | update only in the implementation phase to remove the moved Media workspace |
| root `.github/workflows/release.yml` | existing G-Music release workflow; do not mix Cast secrets or tags into it |
| `keys/g-music.*` | G-Music trust boundary; never copy or reuse for Cast |
| root umbrella ADRs and docs index | preserve the cross-product architecture and link to the new repo/handoff |

### Exclude from the export

`keys/`, all private signing material, `target/`, `node_modules/`, generated
runtime state, user settings, cookies, pairing state, local logs and unrelated
Studio/API/MCP files must not enter the target repository.

## History-preserving export evidence

The implementation used a disposable isolated worktree:

1. Freeze and record the source revision (`58af113` is the current DIAL-recovery
   baseline) and verify a clean source worktree.
2. Create a path-filtered export containing only the approved inventory. Preserve
   the relevant file history where the tooling supports it; record any rewritten
   paths in a handoff manifest.
3. Rewrite the app root from `apps/media-tauri/` to the standalone layout and
   rename the fallback directory/reference paths.
4. Run a secret/path scan. A match for `keys/`, user data, `F:\lalin`, Studio
   icon paths or private updater material blocks the export.
5. Build and test from the standalone checkout before adding the new remote.
6. Add the target remote only after the exact exported commit was reviewed.
7. Push `main` after explicit approval; remote `main` now resolves to
   `eb904213dd470e78eb502e118fb4b26b6c00cfa8`.

The original `Freshair129/Lalin-AI` branch is not reset, force-pushed or
rewritten; its cleanup is a normal deletion commit.

## Ordered execution slices

| Slice | Work | Evidence / exit state |
|---|---|---|
| S0 | documentation and identity decision | complete |
| S1 | isolated export dry-run | complete; path/secret scan recorded |
| S2 | standalone code rename | complete; Rust/Tauri build and unit tests passed |
| S3 | updater implementation | complete locally; published update check not run |
| S4 | Cast GitHub Actions workflow | complete; release remains draft-first |
| S5 | target repo push | complete; exact SHA visible on `Freshair129/lalin-cast` |
| S5b | umbrella cleanup | complete in the root cleanup commit |
| S6 | draft release | NSIS, `.sig`, `latest.json`, checksums and draft review |
| S7 | publish/update smoke | clean install, update, restart, rollback/failure evidence |

## Release gates

Every release candidate must record:

- source commit and tag (`vX.Y.Z`);
- Rust/Tauri tests and standalone build output;
- Windows x64 NSIS installer hash;
- updater artifact and `latest.json` presence;
- signature verification and absence of private-key leakage;
- clean install from no prior Cast state;
- update from the previous published Cast release;
- failure behavior for offline endpoint, invalid signature and interrupted
  download;
- whether the release is draft, prerelease or published.

The first workflow should create a draft release for review. The updater cannot
be considered live until the release is published and the public endpoint
returns the expected signed manifest.

## Rollback

- Before target push: delete only the disposable export/worktree; source repo is
  unchanged.
- After target push but before release: revert the target branch to the reviewed
  commit or remove the unapproved workflow; do not rewrite the source repo.
- After release: publish a higher fixed version. Do not reuse a version or
  replace a signed artifact in place.
- If the updater is broken: keep the previous installer/release available and
  provide a manual installer path; do not disable signature verification.

## Out of scope

- migrating Studio's source tree into the Cast repository;
- mobile app, remote control service or room backend;
- custom YouTube ad bypass or DRM changes;
- silent migration of old `ai.lalin.media` data;
- macOS/Linux/ARM release jobs;
- production readiness claims before the Windows install/update gate passes.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.0 | 2026-09-20 | active | Recorded executed standalone export/push and root cleanup handoff | root-cleanup-commit | LALIN |
| 0.1.0b | 2026-09-20 | candidate | Proposed exact split inventory, history-preserving export and staged release gates | 11c62a8 | LALIN |
