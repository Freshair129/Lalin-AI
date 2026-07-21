---
version: "0.1.1b"
created_at: "2026-07-19T12:21:00+07:00,ATHER,b2c2d0d"
last_update: "2026-07-19T12:33:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  doc_type: "architecture-change-request"
  domain: "rwang-governance"
  scope: "QuickStart, MasterPlan, and Version gate semantics"
---

# ARCHITECTURE CHANGE REQUEST — RWANG Gate Semantics

- **ID:** `ACR-RWANG-2026-07-19-GATE-SEMANTICS`
- **Owner authorization:** requested by the project owner on 2026-07-19 to send to RWANG and remediate its own skill source.
- **Status:** implemented and verified at source/template level; beta pending use on a fresh project and a legacy-project migration.

## Reason

RWANG currently makes the Master Plan approval boundary ambiguous. `rwang-quickstart` says to stop at the first approval gate, while `rwang-masterplan` also defines a complete Phase 0 package. A Master Plan-only review was therefore misrepresented as a completed Phase 0 review. `rwang-version` audits registered files but does not require an explicit governed-scope declaration, making a clean audit appear broader than it is.

## Impact

- Fixes incorrect `awaiting_approval` transitions before Phase 0 is complete.
- Preserves a legitimate owner checkpoint immediately after a Master Plan is written.
- Makes RWANG version audit boundaries honest and machine-readable.
- Requires migration behavior for projects already misclassified by the old workflow.

## Affected Modules

- `C:\Users\freshair\.agents\skills\rwang-quickstart\SKILL.md`
- `C:\Users\freshair\.agents\skills\rwang-masterplan\SKILL.md`
- `C:\Users\freshair\.agents\skills\rwang-masterplan\RWANG-MASTERPLAN.md`
- `C:\Users\freshair\.agents\skills\rwang-masterplan\templates\MASTER_PLAN.md`
- `C:\Users\freshair\.agents\skills\rwang-masterplan\templates\PHASE_REVIEW.md`
- `C:\Users\freshair\.agents\skills\rwang-version\SKILL.md`
- `C:\Users\freshair\.agents\skills\rwang-version\RWANG-VERSION.md`
- `C:\Users\freshair\.agents\skills\rwang-version\templates\registry.json`

## Required Design

1. Introduce a distinct **Master Plan sub-gate**.
   - Create `docs/MASTER_PLAN_REVIEW.md` after `docs/MASTER_PLAN.md`.
   - Keep `state/PROJECT_STATE.json.phase_status` as `in_progress` while this sub-gate awaits owner approval.
   - Do not create or label this review as `PHASE_0_REVIEW.md`.
2. Reserve `docs/PHASE_0_REVIEW.md` and `phase_status = awaiting_approval` for a complete Phase 0 package only.
   - Required package: `MASTER_PLAN.md`, `PROJECT_SCOPE.md`, `PROJECT_GLOSSARY.md`, `SYSTEM_REQUIREMENTS.md`, `NON_FUNCTIONAL_REQUIREMENTS.md`, and `ARCHITECTURE_PRINCIPLES.md`.
3. Clarify QuickStart ordering.
   - Bootstrap → Master Plan → Master Plan sub-gate → owner approval → remaining Phase 0 package → Phase 0 review → owner approval.
4. Require registry-level `governed_scope`.
   - Audit output must show governed scope, registered count, excluded pre-existing files, and drift/violation results only for the declared scope.
5. Provide a safe migration rule.
   - A project with `awaiting_approval` and a Phase 0 review but no full Phase 0 package must be reclassified to `in_progress`; its review must be converted to a Master Plan review without overwriting owner-authored content silently.

## Migration Plan

1. Update RWANG skill SSOT documents and templates.
2. Add deterministic documentation-level checks or an executable smoke script for the acceptance tests.
3. Document how an existing project is detected and corrected.
4. Bump affected frozen governance materials according to their own SemVer/change-control policy and record the ACR ID in their changelog.
5. Run the new checks against a fresh bootstrap and a synthetic legacy misclassification fixture.

## Risks

- Existing agents may rely on the former filename/state behavior.
- A migration that overwrites review text could erase owner context.
- Scope enforcement must not accidentally govern every legacy file in `docs/`.

## Alternatives Considered

| Alternative | Rejected because |
|---|---|
| Remove the Master Plan approval gate | removes an important owner decision point before full Phase 0 drafting |
| Treat the Master Plan alone as all of Phase 0 | contradicts RWANG's canonical Phase 0 registry |
| Leave scope implicit in the registry | repeats misleading “clean audit” results |

## Acceptance Tests

1. Fresh project: QuickStart writes Master Plan and `MASTER_PLAN_REVIEW.md`; project state remains `in_progress` before owner approval.
2. After owner approves the sub-gate: RWANG writes the remaining canonical Phase 0 documents; no production code is written.
3. Only after all canonical Phase 0 documents exist: RWANG writes `PHASE_0_REVIEW.md` and sets `awaiting_approval`.
4. Legacy fixture: incomplete Phase 0 marked `awaiting_approval` is detected and safely reclassified, with a recorded event and no silent overwrite.
5. Version audit report always prints its explicit `governed_scope`, registered count, and exclusions; it never claims coverage outside that scope.
6. Existing QuickStart, Version, and MasterPlan instructions contain no conflicting “first approval gate” semantics.

## Remediation Evidence

- RWANG source updated its QuickStart, MasterPlan, Version SSOTs, and the relevant templates to version `1.1.0` with this ACR as the reference.
- Final gate passed static acceptance checks for sub-gate state, Phase 0 completeness guard, legacy migration, governed scope, audit coverage, valid JSON templates, and absence of stale “first approval gate” wording.
- The remaining beta evidence is operational: exercise a fresh project bootstrap and a legacy misclassification migration through a future RWANG session.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-19 | beta | RWANG source remediation completed; source/template final gate passed | b2c2d0d | ATHER |
| 0.1.0b | 2026-07-19 | candidate | Initial owner-authorized CR for RWANG gate semantics remediation | b2c2d0d | ATHER |
