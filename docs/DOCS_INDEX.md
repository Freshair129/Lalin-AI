---
version: "0.1.14b"
created_at: "2026-07-22T00:00:00+07:00,Codex,uncommitted"
last_update: "2026-08-09T00:00:00+07:00,LALIN"
status: "beta"
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
- `docs/architecture/SPEC.md`: technical system specification.
- `docs/architecture/BLUEPRINT.yaml`: machine-readable legacy blueprint.
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

## Product and Runtime Docs

- `docs/product/PRD.md`
- `docs/product/SRS.md`
- `docs/product/ROADMAP_MUSIC.md`
- `docs/product/LOCAL_MODEL_LEDGER.md`
- `docs/product/COMPETITIVE_BRIEF.md`
- `docs/product/ROADMAP_EXECUTION_BACKLOG.md`
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
- `.brain/rca/*.md`
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
