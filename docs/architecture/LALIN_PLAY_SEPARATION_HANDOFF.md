---
version: "0.1.0b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-09-20T22:40:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "handoff-checklist"
  scope: "Play extraction inventory, provenance, recovery and export gates"
---

# Lalin Play separation handoff — execution pending

This is the prepared handoff **plan**, not a certificate of completed separation.
Parent [ADR-004](ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md); peers
[integration/migration](LALIN_PLAY_INTEGRATION_MIGRATION_SPEC.md),
[release runbook](../operations/LALIN_PLAY_RELEASE_RUNBOOK.md).
Existing S0–S7 order remains authoritative. No removal, remote creation or merge
is authorized merely by this document. New execution details await review.

## 1. Provenance record

| Field | Recorded value |
|---|---|
| Origin | `https://github.com/Freshair129/Lalin-AI.git` |
| Development branch | `codex/lalin-play-split` |
| Source before candidate | `84290102b84fd76dec069bf6d61ffdd2fc8466ab` |
| Implemented candidate commit | `f5a66819ad58b481635733dd29e1658d67e29e3d`, pushed to origin branch |
| Proposed destination | `Freshair129/lalin-play`; not created/verified by this handoff |
| Approved export source SHA | NOT_SELECTED — must include approved final docs/integration, not silently assume f5a6681 |
| Destination commit/tag | NOT_RUN |
| Independent checkout CI/native evidence | NOT_RUN |
| Studio integration/removal commit | NOT_RUN |
| Recovery artifact and replay result | NOT_RUN |

Latest local runtime evidence is [fullscreen/skip](../validation/LALIN_PLAY_FULLSCREEN_SKIP.md).
Its binary hash is debug-build provenance, not an installer checksum.
Each later export must record source SHA, destination SHA, transformed path list,
checksums, test reports and independent-checkout location in this record.

## 2. Export and retention inventory

| Source | Destination / action | Gate |
|---|---|---|
| `apps/play-desktop/src`, `src-tauri`, `tools` | Proposed repo-root `src`, `src-tauri`, `tools`; keep lockfiles and native command manifests | Build without parent links |
| App manifests, configs, `index.html`, `.gitignore`, `app-icon.svg`, README | Proposed root equivalents; verify icon/bundle settings at release time | Do not copy ignored build outputs |
| Play PRD section, CR-003/004, ADR-004, new Play docs and relevant screenshots/RCA | Copy into destination `docs`/`.brain` with provenance; rewrite relative links | Document closure review |
| CR-001/002, legacy delivery/TV plans and original reports | Copy as explicitly historical Studio baselines or pin links to source SHA | Never relabel Studio proof as standalone proof |
| Root AGENTS/PRODUCT/SRS/Sitemap | Extract Play-specific guidance into destination; retain Studio versions here | User reviews product identity and ownership |
| `apps/desktop/src/playback` and `LalinPlayWindow.tsx` | Retain now; later scoped removal only after S3–S5 and migration access | Consumer audit and recovery |
| Studio `playbackClient`, bridge, launch helper | Retain/replace with verified sender rather than blanket deletion | Native handoff parity |
| Arrange `timeline/peaks.ts` → `playback/audioContext.ts` | Retain or move Studio-owned primitive and fix import | Arrange regression |
| Cast launcher → `windowManager.isTauri` | Retain or move helper | Cast launch regression |
| `packages/contracts` | Keep shared Studio/API/MCP exports; copy only required playback DTOs with source parity record | No deletion of unrelated voice contracts |
| `LalinPlayModal.tsx` legacy prototype | Recheck live consumers before separately approved retirement; do not copy as owner | No opportunistic cleanup |

Exclude `node_modules`, `dist`, `target`, `.smoke`, `runtime`, local WebView/app
data, private paths/logs, keys, `.env`, API/ML sidecars, model weights and media.
Use an explicit tracked-file manifest after selecting the source SHA; never copy
the whole dirty working tree. Include only reviewed generated icons/screenshots,
not an executable or private test library. Record path rewrites; retain upstream
attribution. Proposed export is a provenance-recorded snapshot, subject to user
review of snapshot versus history-preserving extraction before execution.

## 3. License and notices gate

At this audit, `git ls-files '*LICENSE*' '*NOTICE*'` returned no tracked files.
README records root license unresolved. This is an **unresolved provenance gate**,
not a legal conclusion or permission to choose a license on the owner's behalf.

| Inventory | Evidence to collect before S4/release | Current state |
|---|---|---|
| Original Studio engine/store/contracts/UI copied to Play | Source SHA/path/author provenance and owner-approved distribution license | Path provenance in README; license decision pending |
| Frontend runtime and transitive deps | Exact lockfile versions, package license texts, required notices; separate build-only deps | Lockfile present; full notice audit NOT_RUN |
| Rust runtime and transitive deps | Cargo.lock versions, source license texts and notices including Tauri/plugins, Lofty, WalkDir and Serde | Lockfile present; full notice audit NOT_RUN |
| Icons and screenshots | Creator/source record and review for private data/redistribution | Generated local evidence; final distribution review NOT_RUN |
| Future Windows/WebView2 installer assets | Exact distribution method and applicable notices | NOT_SELECTED |

Deliverables: owner-approved LICENSE text, reviewed dependency/license inventory,
THIRD_PARTY_NOTICES with required text/attribution, exclusions and reviewer/date.
Do not fabricate these files as “complete” from dependency names alone. Do not
reuse Cast/VacuumTube or Studio ML license statements for Play by assumption.

## 4. Execution and verification checklist (all future)

- [ ] Review candidate wire/migration/release documents; record decisions.
- [ ] Finish S2 import/relink/persistence acceptance; run S3 sender/receiver security/lifecycle tests.
- [ ] Select export source SHA and extraction-history policy; freeze explicit path manifest.
- [ ] Close license/notices gate and validate screenshot privacy.
- [ ] Obtain destination creation/export authorization; record repository identity and access policy.
- [ ] Export, rewrite docs links, then install/build/test from an independent checkout.
- [ ] Record frontend/Rust/native results and screenshots with exact destination SHA.
- [ ] Verify Studio cold/warm handoff, Arrange preview/waveforms, Cast launcher and retained API/MCP/contracts.
- [ ] Prepare and review removal diff plus old-state recovery; retain migration entrypoint.
- [ ] Execute only authorized removal and record source/destination commits, recovery test and final ownership.
- [ ] Separately qualify distribution through the release runbook; no automatic main merge.

## 5. Recovery and evidence requirements

Before export/removal, record the last working Studio revision, both app versions,
approved non-destructive state backups and exact changed paths. Recovery for the
current additive candidate is explicit Quit; original Studio code/state is intact.
After integration, restore the reviewed Studio version or revert only integration
commits, preserving Play library, source media and concurrent changes. Never use
workspace reset/profile deletion as rollback. Migration journal recovery is
specified separately and still unimplemented.

An executed handoff must attach: old/new source manifests, both SHAs, dependency
retention checks, clean-checkout logs, native lifecycle proof, migration/undo
results, installation recovery instructions, known issues and release status.
Leave NOT_RUN fields open until actual execution; this file is not yet a final
separation certificate like the completed Cast handoff.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | candidate | Prepare scoped export inventory, provenance/license gates and recovery record without claiming separation | based on f5a6681 | LALIN |
