---
version: "0.1.0b"
created_at: "2026-07-19T12:18:00+07:00,ATHER,b2c2d0d"
last_update: "2026-07-19T12:18:00+07:00,ATHER"
status: "candidate"
superseded_by: null
attributes:
  doc_type: "rca"
  domain: "governance"
  scope: "Remix Master Plan review gate"
---

# RCA — Remix Master Plan Gate Misclassification

## Incident

The new Remix timeline-first Master Plan was initially reported as a completed Phase 0 review and `state/PROJECT_STATE.json` was set to `awaiting_approval`. The independent review gate blocked it because the canonical Phase 0 package was incomplete and parts of the plan overstated current snapshot persistence.

## Severity and Scope

- Severity: governance P0; no production outage and no user data impact.
- Scope: `docs/MASTER_PLAN.md`, `docs/PHASE_0_REVIEW.md`, `state/PROJECT_STATE.json`, and `.rwang/` only.
- Customer impact: none. Implementation did not start and no Remix API or UI code changed.

## Symptom

- Phase 0 was labeled ready for approval before its canonical scope, glossary, system-requirements, NFR, and architecture-principles documents existed.
- The plan claimed that project snapshots restore layout and Patch graph state, while the current implementation restores `patchGraph` but does not persist layout, selected left tab, or stem gains.
- The version audit said zero violations without declaring that the registry governed only four explicitly registered files.

## Evidence

| Evidence | Observation |
|---|---|
| `state/events.jsonl` | records initial bootstrap as `awaiting_approval`, followed by `ReviewGate` result `BLOCK` with four findings |
| `docs/MASTER_PLAN.md` v0.1.0b | listed only plan/review/state/registry as Phase 0 deliverables and promised a broader snapshot restore contract |
| `frontend/src/components/RemixPanel.tsx` | snapshot creation includes `patchGraph`; layout and selected left tab are absent, and stem gains are intentionally excluded |
| `docs/UI_SITEMAP.md` §3.5 | already defines the authoritative timeline-first target, information hierarchy, parameter mapping, and responsive behavior |
| `.rwang/registry.json` | initially held four entries but did not declare the narrow governed scope |

## Root Cause

The planning pass conflated two different gates:

1. the **Master Plan sub-gate**, which may be reviewed before the rest of Phase 0 is authored; and
2. the **Phase 0 completion gate**, which requires the entire canonical Phase 0 document package.

Because the distinction was not made explicit, the state and review document incorrectly represented the first as the second. At the same time, the plan used intended persistence behavior as if it were verified current behavior, instead of treating it as a later contract decision. The version audit was technically correct for registered files but its governed boundary was implicit, which made its clean result misleading.

## Why the Issue Escaped Detection

- The initial self-review checked hash integrity and document formatting, not the completeness of the canonical Phase 0 registry.
- The planning source was not explicitly traced back to the authoritative UI sitemap and the exact snapshot construction code before the approval state was set.
- An independent gate was run after the state transition rather than before it.

## Immediate Correction

- Reclassified the review as a **Master Plan sub-gate**.
- Returned `state/PROJECT_STATE.json` to `in_progress`.
- Added traceability to the PRD, UI sitemap, and current Remix implementation.
- Replaced the snapshot assertion with the actual current contract and deferred any migration decision to Phase 2.
- Declared the explicit `.rwang` governed scope and bumped the affected sidecars to `0.1.1`.

## Prevention

1. Before changing a MasterPlan state to `awaiting_approval`, validate the deliverable set against the canonical phase registry.
2. Name interim gates `MASTER PLAN SUB-GATE`; reserve `PHASE_<N>_REVIEW` completion semantics for full phase packages.
3. Every persisted-state assertion must cite the snapshot writer and restore path, or be labeled as a proposed future contract.
4. Every RWANG audit must state its governed scope and its registered-item count alongside the result.
5. Run an independent review gate before any owner approval request that changes Phase status.

## Verification

- `state/PROJECT_STATE.json` is `in_progress`.
- `docs/MASTER_PLAN.md` and `docs/PHASE_0_REVIEW.md` identify the approval as a sub-gate.
- `.rwang/registry.json` declares all currently governed paths.
- The registry hash audit passes with zero drift for every governed item.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-07-19 | candidate | Initial evidence-backed RCA for the Master Plan gate misclassification | b2c2d0d | ATHER |
