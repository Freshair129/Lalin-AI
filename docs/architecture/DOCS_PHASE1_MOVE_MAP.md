---
version: "0.1.0b"
created_at: "2026-07-22T00:00:00+07:00,Codex,uncommitted"
last_update: "2026-07-22T00:00:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "documentation"
  doc_type: "move-map"
  scope: "Repository documentation consolidation phase 1"
---

# Docs Phase 1 Move Map

## Status

This map records the approved documentation-only consolidation. No source code, runtime data, packaging config, or build scripts are moved in this phase.

## Moves

| Source | Target |
|---|---|
| `docs/LALIN_*.md` | `docs/design/` |
| `docs/reference/` | `docs/design/reference/` |
| `docs/DESIGN_SYSTEM.md` | `docs/design/DESIGN_SYSTEM.md` |
| `docs/PRD.md` | `docs/product/PRD.md` |
| `docs/SRS.md` | `docs/product/SRS.md` |
| `docs/ROADMAP_MUSIC.md` | `docs/product/ROADMAP_MUSIC.md` |
| `docs/COMPETITIVE_BRIEF.md` | `docs/product/COMPETITIVE_BRIEF.md` |
| `docs/LOCAL_MODEL_LEDGER.md` | `docs/product/LOCAL_MODEL_LEDGER.md` |
| `docs/ROADMAP_EXECUTION_BACKLOG.md` | `docs/product/ROADMAP_EXECUTION_BACKLOG.md` |
| `docs/SPEC.md` | `docs/architecture/SPEC.md` |
| `docs/BLUEPRINT.yaml` | `docs/architecture/BLUEPRINT.yaml` |
| `docs/ARCHITECTURE_CHANGE_REQUEST_RWANG_GATE_SEMANTICS.md` | `docs/architecture/ARCHITECTURE_CHANGE_REQUEST_RWANG_GATE_SEMANTICS.md` |
| `docs/SWARM_PLAN.md` | `docs/architecture/SWARM_PLAN.md` |
| `docs/PACKAGING_SIDECAR.md` | `docs/operations/PACKAGING_SIDECAR.md` |
| `docs/WORKSTATION_DISTRIBUTION.md` | `docs/operations/WORKSTATION_DISTRIBUTION.md` |
| `docs/CPU_GPU_DISTRIBUTION_STRATEGY.md` | `docs/operations/CPU_GPU_DISTRIBUTION_STRATEGY.md` |
| `docs/SPRINT*_VALIDATION.md` | `docs/validation/` |
| `docs/PHASE_0_REVIEW.md` | `docs/validation/PHASE_0_REVIEW.md` |
| `docs/RCA--LOCAL-LLM-DISPATCH.md` | `docs/rca/RCA--LOCAL-LLM-DISPATCH.md` |
| `docs/REPORT--LOCAL-LLM-DISPATCH.md` | `docs/rca/REPORT--LOCAL-LLM-DISPATCH.md` |
| `docs/GM6_*.md` | `docs/archive/` |
| `docs/PROPOSED_*.md` | `docs/archive/` |
| `docs/SPRINT0_G_MUSIC_RC_PLAN.md` | `docs/archive/SPRINT0_G_MUSIC_RC_PLAN.md` |
| `docs/UI_SITEMAP.md` | `docs/archive/UI_SITEMAP.md` |
| `docs/MASTER_PLAN.md` | `docs/archive/MASTER_PLAN.md` |

## Rollback

Reverse each row in this file. If a target already exists during rollback, stop and inspect before overwriting.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-07-22 | beta | Created Phase 1 documentation consolidation move map. | uncommitted | Codex |
