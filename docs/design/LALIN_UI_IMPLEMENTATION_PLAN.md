---
version: "0.1.1b"
created_at: "2026-07-21T00:00:00+07:00,ATHER,uncommitted"
last_update: "2026-07-21T00:00:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "product-ui"
  doc_type: "implementation-plan"
  scope: "Lalin Studio desktop shell and top-level tabs"
---

# Lalin Studio UI Implementation Plan

**Status:** approved implementation baseline — Slice 0–3 in progress.  
**Design authority:** [LALIN_UI_SOT.md](LALIN_UI_SOT.md) and its approved W0
and tab specifications.

## Objective

Implement the approved Lalin Studio desktop shell and top-level tab layouts
without changing audio-job semantics. Existing panels are migrated into the
approved shell in safe slices; functionality not represented in a completed
slice remains accessible until its replacement is verified.

## Scope and exclusions

| In scope | Out of scope |
|---|---|
| M0/H1/R1/F1 shared shell, 22px footer, activity log overlay | Public website, mobile companion implementation, visual-brand rewrite beyond approved layouts |
| Runtime telemetry read contract and explicit `N/A` states | Invented telemetry values, GPU monitoring service, performance optimization unrelated to the footer |
| Shell migration for Workspace, Voice, Dubbing, Arrange, Mastering, Library, Jobs, Settings | Changing audio pipeline algorithms, model licenses, job semantics, or storage migrations |

## Implementation order

| Slice | Deliverable | Dependencies | Acceptance checks |
|---|---|---|---|
| 0 | Baseline audit | current `App.tsx`, styles, existing API/job contracts | build passes before changes; existing routes/panels catalogued |
| 1 | W0 shell | M0 28px, H1 56px, R1 96px, F1 22px, common tokens | exact rail order on every tab; no duplicate status footer; desktop layout works at 1440 and 1280px |
| 2 | Runtime/activity contract | one read-only runtime status endpoint or existing equivalent; job/activity projection | CPU/RAM/GPU/VRAM/model/agent are live or `N/A`; current job shows name/state/progress; no fabricated values |
| 3 | Activity log overlay | F1 selection opens job history/detail overlay | open job, completed output, failed reason/retry, and cancellable action paths are available |
| 4 | Arrange migration | approved Arrange v1 composition; preserve existing timeline/patch contracts | M0 visible; D1 below T1; D1 collapses before B1; save/open actions work; timeline remains primary |
| 5 | Workspace and Voice migration | approved Workspace/Voice layouts | recents/create/jobs remain reachable; profile consent/source/readiness and TTS CTA remain visible |
| 6 | Dubbing and Mastering migration | approved Dubbing/Mastering layouts | dubbing step/assignment/error context remains visible; mastering source/target/preview/export remain visible |
| 7 | Library, Jobs, Settings migration | approved operations layouts | Library provenance/actions scoped; Jobs recovery works; Settings impact/restart notices are explicit |
| 8 | Regression and release review | all slices | frontend build, targeted backend tests, desktop screenshot review at 1440/1280, `git diff --check` |

## Runtime/activity data contract

The frontend receives a best-effort read model. Missing probes return `null`
with a machine-readable availability state; the UI renders `N/A`.

```ts
type RuntimeActivityStatus = {
  telemetry: {
    cpu_percent: number | null
    ram_used_bytes: number | null
    ram_total_bytes: number | null
    gpu_name: string | null
    gpu_percent: number | null
    vram_used_bytes: number | null
    vram_total_bytes: number | null
  }
  runtime: { profile: "full" | "lite" | null; model: string | null; agent: string | null }
  activity: { job_id: string | null; label: string | null; state: string | null; progress: number | null }
}
```

- This read model does not create, alter, or cancel jobs.
- F1 polls at a bounded interval only while the desktop window is active; it
  must not block timeline interaction.
- The status endpoint must not cold-load an ML runtime solely to collect a
  metric; a probe that is not already available returns `null`.
- Detailed logs/retry/cancel remain on the Jobs overlay/page, not in the 22px
  footer.

## Shared-shell implementation rules

- `M0` owns File/Edit/View/Help and direct Open/Save/Settings access.
- `H1` owns breadcrumb, search, and utilities; `R1` has the approved fixed
  order.
- `F1` is exactly 22px in desktop CSS; it has telemetry left, activity centre,
  runtime identity right. At compact desktop widths, abbreviate telemetry
  before truncating active-job identity.
- A tab supplies `S1` content only. It cannot replace R1, reposition F1, or
  add another persistent status bar.

## Test and review matrix

| Check | Evidence |
|---|---|
| Source safety | existing test/build baseline recorded before Slice 1 |
| Layout | screenshots at 1440px and 1280px for each migrated tab |
| Footer | live telemetry or `N/A`; job progress; log overlay; no fake values |
| Accessibility | keyboard reachability for M0/R1/F1; labels for icon controls; visible focus; no colour-only states |
| Functional regression | current Remix save/load/patch, TTS, Dubbing, Mastering, Library, Jobs, and Settings paths exercised as their slice lands |
| Exit | all slice acceptance checks pass; docs status/version updated; no known layout regression |

## Rollback and scope guard

Each slice is separately reviewable. If a migrated tab fails its functional
checks, retain W0 shell only and restore that tab's prior stage component until
the fault is corrected. No audio pipeline or job API change is bundled merely
to complete a visual slice.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-21 | beta | Approved for implementation; Slice 0-3 started. | uncommitted | ATHER |
| 0.1.0b | 2026-07-21 | candidate | First shell-to-tab implementation plan based on approved W0 and tab designs. | uncommitted | ATHER |
