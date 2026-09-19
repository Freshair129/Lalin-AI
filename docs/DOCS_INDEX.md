---
version: "0.3.0b"
created_at: "2026-07-22T00:00:00+07:00,Codex,uncommitted"
last_update: "2026-09-19T20:50:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "documentation"
  doc_type: "index"
  scope: "Canonical documentation map"
---

# Documentation Index

## Canonical Root Docs

- `PRODUCT.md`: product identity, users, product promise, current compatibility truth.
- `DESIGN.md`: desktop design system, shell invariants, navigation, visual rules.
- `README.md`: entrypoint for setup and contributor orientation.
- `AGENTS.md`: agent operating rules for this repository.

## Canonical Architecture Docs

- `docs/architecture/REPOSITORY_ARCHITECTURE_SOT.md`: target repo architecture and ownership.
- `docs/architecture/ADR-001-LALIN-UMBRELLA-PLATFORM.md`: candidate umbrella platform decision and Tauri/Electron/YouTube boundaries.
- `docs/architecture/ADR-002-LALIN-MEDIA-TAURI-PORT.md`: approved local Rust + Tauri v2 port boundary and VacuumTube feature matrix.
- `docs/architecture/ADR-003-LALIN-CAST-REPOSITORY-SPLIT.md`: candidate standalone `Freshair129/lalin-cast` boundary, product identity and approval gates.
- `docs/architecture/LALIN_MEDIA_PLATFORM_PLAN.md`: candidate Lalin Media vertical slice, ownership matrix, VacuumTube provenance and verification gates.
- `docs/architecture/LALIN_MEDIA_MIGRATION_MAP.md`: candidate current-to-target migration, rollback and retention map.
- `docs/architecture/LALIN_CAST_REPOSITORY_SPLIT_PLAN.md`: candidate exact export inventory, history policy and staged release gates.
- `docs/architecture/LALIN_CAST_UPDATER_SPEC.md`: candidate signed Windows updater and GitHub Actions release contract.
- `apps/media-desktop/LALIN_PROVENANCE.md`: local VacuumTube fork pin, source hash and Lalin patch boundary.
- `docs/architecture/REPO_MIGRATION_PLAN.md`: phased migration plan and execution status.
- `docs/architecture/DOCS_PHASE1_MOVE_MAP.md`: exact documentation consolidation move map and rollback guide.
- `docs/architecture/DOCS_PHASE2_MOVE_MAP.md`: exact tooling consolidation move map and rollback guide.
- `docs/architecture/PHASE3_RUNTIME_STATE_PLAN.md`: runtime state audit, blocker, target contract, and approval-gated move plan.
- `docs/architecture/PHASE3_RUNTIME_MOVE_MAP.md`: exact runtime data move map and rollback guide.
- `docs/architecture/PHASE4_APP_FOLDER_MIGRATION_PLAN.md`: app folder migration audit, move policy, blockers, and validation gates.
- `docs/architecture/PHASE4_APP_MOVE_MAP.md`: exact app source move map and rollback guide.
- `docs/architecture/PHASE5_CONTRACTS_MCP_PLAN.md`: executed shared contracts and MCP integration plan.
- `docs/architecture/PHASE6_WORKSPACE_ORCHESTRATION_PLAN.md`: executed root workspace orchestration plan.
- `docs/architecture/PHASE7_RELEASE_WORKFLOW_PLAN.md`: executed GitHub Actions release workflow repair plan.
- `docs/architecture/PHASE8_REPO_RENAME_PRESENTATION_READINESS.md`: executed GitHub repository rename and presentation readiness note.
- `docs/architecture/PHASE9_SIGNED_DRAFT_RELEASE_PLAN.md`: approved signed draft release plan for merge commit `d553067` and version `0.1.1`.
- `docs/architecture/SPEC.md`: technical system specification.
- `docs/architecture/BLUEPRINT.yaml`: machine-readable legacy blueprint.
- `docs/architecture/API_SEMANTICS.md`: พฤติกรรมของ REST/WS ที่อ่านจาก OpenAPI schema ไม่ได้ (state, ลำดับ, error ที่ไม่ตรงสัญชาตญาณ).
- `docs/architecture/LALIN_PLAY_COMMAND_DELIVERY_PLAN.md`: approved/locally implemented Play Window readiness, single consumer owner, and scoped native capabilities.
- `docs/architecture/LALIN_PLAY_TV_MODE_PLAN.md`: approved TV Mode architecture, fullscreen/input adapters and native permission boundary.
- `docs/design/LALIN_RENAME_MIGRATION_PLAN.md`: product rename and compatibility plan.

## Current Lalin UI Docs

These now live in `docs/design/` after Phase 1 of the repo migration:

- `docs/design/LALIN_UI_SOT.md`
- `docs/design/DESIGN_SYSTEM.md`
- `docs/design/LALIN_LAYOUT_SOT.md`
- `docs/design/LALIN_SITEMAP_SOT.md`
- `docs/design/LALIN_SHELL_SOT.md`
- `docs/design/LALIN_ARRANGE_TAB_SPEC.md`
- `docs/design/LALIN_WORKSPACE_TAB_SPEC.md`
- `docs/design/LALIN_VOICE_STUDIO_TAB_SPEC.md`
- `docs/design/LALIN_DUBBING_TAB_SPEC.md`
- `docs/design/LALIN_MASTERING_TAB_SPEC.md`
- `docs/design/LALIN_LIBRARY_TAB_SPEC.md`
- `docs/design/LALIN_JOBS_TAB_SPEC.md`
- `docs/design/LALIN_SETTINGS_TAB_SPEC.md`
- `docs/design/LALIN_UI_IMPLEMENTATION_PLAN.md`
- `docs/design/COMPONENT_REGISTRY.md`
- `docs/design/LALIN_PLAY_TV_MODE_SPEC.md`: approved 10-foot layout, focus order, input mapping and accessibility hooks.

## Product and Runtime Docs

- `docs/product/PRD.md`
- `docs/product/SRS.md`
- `docs/product/ROADMAP_MUSIC.md`
- `docs/product/LOCAL_MODEL_LEDGER.md`
- `docs/product/COMPETITIVE_BRIEF.md`
- `docs/product/ROADMAP_EXECUTION_BACKLOG.md`
- `docs/product/CR-002--LALIN_PLAY_TV_MODE.md`: approved TV / Leanback presentation change request and FR-18 acceptance.
- `docs/architecture/SPEC.md`
- `docs/architecture/BLUEPRINT.yaml`
- `docs/operations/PACKAGING_SIDECAR.md`
- `docs/operations/WORKSTATION_DISTRIBUTION.md`
- `docs/operations/CPU_GPU_DISTRIBUTION_STRATEGY.md`

## Tooling Layout

- `tools/dev/`: canonical setup and local runtime utilities.
- `tools/build/`: canonical icon, sidecar, installer, and release build utilities.
- `tools/verify/`: canonical smoke and release verification utilities.
- `tools/doc_graph_scan.py`: doc-graph scanner — เทียบ endpoint/component ในโค้ดกับ `docs/architecture/BLUEPRINT.yaml` แล้วเขียน `docs/.doc-graph.json`.
- `scripts/`: compatibility shims that keep older commands working.

## Validation and Evidence Docs

- `docs/validation/SPRINT*_VALIDATION.md`
- `docs/validation/2026-09-18-LALIN-PLAY-TV-MODE.md`: TV Mode unit, browser and native evidence with hardware limits.
- `docs/validation/2026-09-17-LALIN-PLAY-COMMAND-DELIVERY.md`: regression, build and isolated browser/native debug fixture evidence; broad MVP/release gates remain separate.
- `docs/validation/2026-09-17-SIDECAR-BUILD.md`: local sidecar build, exact artifact hash, Python environment and independent runtime checks.
- `.brain/rca/*.md`
- `.brain/rca/2026-09-17-lalin-play-command-delivery.md`: reproduced cold-listener command loss and source/config evidence for playback ownership and native permission gaps.
- `.brain/rca/2026-09-18-release-workflow-billing-block.md`: documented the GitHub account billing restriction that prevented the v0.1.1 signed draft workflow from starting.
- `.brain/rca/2026-09-18-installer-version-hardcode.md`: documented the local packaging filename drift after the 0.1.1 version bump.
- `.brain/rca/2026-07-23-release-workflow-legacy-path.md`
- `docs/rca/RCA--LOCAL-LLM-DISPATCH.md`
- `docs/rca/REPORT--LOCAL-LLM-DISPATCH.md`

## Archive Candidates

These are not deleted. They moved to `docs/archive/` during Phase 1:

- `docs/archive/GM6_BRAND_CI.md`
- `docs/archive/GM6_DESIGN_SYSTEM.md`
- `docs/archive/GM6_NAMING_DECISION.md`
- `docs/archive/GM6_SITEMAP.md`
- proposal packs beginning with `docs/archive/PROPOSED_`
- old sprint and RC planning files once their facts are represented in canonical docs.

## Presentation Docs

- `docs/presentation/lalin-ai-launch/index.html`: local presentation landing page for the internal demo.
- `docs/presentation/lalin-ai-launch/READINESS.md`: real/mockup/pending readiness note.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.3.0b | 2026-09-20 | candidate | Added Lalin Cast repository split, export plan and signed updater specification | uncommitted | LALIN |
| 0.2.1b | 2026-09-19 | candidate | Indexed the local Lalin Media fork provenance and P1/P2 implementation evidence | uncommitted | LALIN |
| 0.2.2b | 2026-09-19 | candidate | Indexed the approved Rust + Tauri v2 Media port ADR | uncommitted | LALIN |
| 0.2.0b | 2026-09-19 | candidate | Indexed the candidate Lalin AI umbrella platform ADR, Media plan and migration map | uncommitted | LALIN |
| 0.1.27b | 2026-09-18 | beta | Closed provenance for the TV Mode and local packaging work before feature-branch cleanup. | c86ddc4 | LALIN |
| 0.1.26b | 2026-09-18 | beta | Indexed the approved TV Mode validation report and local browser/native evidence. | c86ddc4 | LALIN |
| 0.1.25b | 2026-09-18 | beta | Indexed approved Lalin Play TV Mode product, architecture and design docs. | c86ddc4 | LALIN |
| 0.1.24b | 2026-09-18 | beta | Indexed the local installer version-drift RCA and local-only packaging fix. | 839bb9e | LALIN |
| 0.1.23b | 2026-09-18 | beta | Indexed final rerun attempt 3 and stopped retries after the repeated GitHub billing blocker. | pending provenance follow-up | LALIN |
| 0.1.22b | 2026-09-18 | beta | Indexed the controlled rerun and repeated GitHub billing blocker for the v0.1.1 release workflow. | pending provenance follow-up | LALIN |
| 0.1.21b | 2026-09-18 | beta | Indexed the v0.1.1 release workflow billing-block RCA and updated current release evidence. | pending provenance follow-up | LALIN |
| 0.1.20b | 2026-09-17 | beta | Updated Phase 9 release provenance to the merged version commit d553067. | pending provenance follow-up | LALIN |
| 0.1.19b | 2026-09-17 | beta | Indexed the Phase 9 signed draft release plan for version 0.1.1. | uncommitted | LALIN |
| 0.1.18b | 2026-09-17 | beta | Index requested sidecar build and runtime verification. | included with source repair | LALIN |
| 0.1.17b | 2026-09-17 | beta | Index approved playback remediation and scoped native/browser validation. | uncommitted | LALIN |
| 0.1.16b | 2026-09-17 | beta | Index CR-001 command-delivery RCA and candidate remediation plan. | uncommitted | LALIN |
| 0.1.15b | 2026-08-09 | beta | Added API semantics doc for behavior not expressible in OpenAPI. | uncommitted | LALIN |
| 0.1.14b | 2026-08-09 | beta | Added component registry, doc-graph scanner, and full REST API spec (42 endpoints). | uncommitted | LALIN |
| 0.1.13b | 2026-07-24 | beta | Added Phase 8 repo rename and presentation readiness docs. | uncommitted | LALIN |
| 0.1.12b | 2026-07-23 | beta | Updated Phase 7 release workflow plan and RCA status after implementation. | uncommitted | LALIN |
| 0.1.11b | 2026-07-23 | candidate | Added Phase 7 release workflow plan and RCA pointer. | uncommitted | LALIN |
| 0.1.10b | 2026-07-22 | beta | Updated Phase 6 workspace orchestration plan status after implementation. | uncommitted | LALIN |
| 0.1.9b | 2026-07-22 | candidate | Added Phase 6 workspace orchestration plan to the canonical architecture index. | uncommitted | LALIN |
| 0.1.8b | 2026-07-22 | beta | Updated Phase 5 contracts and MCP plan status after implementation. | uncommitted | LALIN |
| 0.1.7b | 2026-07-22 | beta | Added Phase 5 contracts and MCP plan to the canonical architecture index. | uncommitted | LALIN |
| 0.1.6b | 2026-07-22 | beta | Added Phase 4 executed app move map to the canonical architecture index. | uncommitted | LALIN |
| 0.1.5b | 2026-07-22 | beta | Added Phase 4 app folder migration plan to the canonical architecture index. | uncommitted | LALIN |
| 0.1.4b | 2026-07-22 | beta | Added executed Phase 3 runtime move map to the canonical architecture index. | uncommitted | LALIN |
| 0.1.3b | 2026-07-22 | beta | Added Phase 3 runtime state plan to the canonical architecture index. | uncommitted | LALIN |
| 0.1.2b | 2026-07-22 | beta | Added Phase 2 tooling map and canonical tools layout. | uncommitted | LALIN |
| 0.1.1b | 2026-07-22 | beta | Updated paths after Phase 1 documentation consolidation. | uncommitted | Codex |
| 0.1.0b | 2026-07-22 | beta | Created documentation index for the new SOT set and migration staging. | uncommitted | Codex |
