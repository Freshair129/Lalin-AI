---
version: "0.1.1b"
created_at: "2026-07-19T12:06:10+07:00,ATHER,b2c2d0d"
last_update: "2026-07-19T12:16:00+07:00,ATHER"
status: "candidate"
superseded_by: null
attributes:
  doc_type: "master-plan"
  domain: "remix-arrange-workspace"
  scope: "G-Music Remix timeline-first workspace restructure"
---

# MASTER PLAN — G-Music Remix Arrange Workspace

## Purpose

Make `Arrange` the primary, timeline-first finishing workspace for Remix. The layout must retain the current local-first Remix pipeline and project persistence while moving sound-processing controls into secondary, contextual panels.

## Responsibilities

- Define the approved UI architecture before any Remix layout code changes.
- Preserve the existing Remix request contract and Arrange/Patch project snapshot behavior.
- Make timeline editing, transport, import, and Run the visual and keyboard-operable center of the desktop workflow.

## Invariants

- `POST /music/remix` payload and backend processing semantics do not change.
- `Arrange` remains the default view; `Patch` remains an advanced, optional view.
- Source/beat import, sync, FX, stem gains, loudness, save/open, render progress, and export remain available.
- The current snapshot contract is preserved unless a later approved migration says otherwise: it restores `patchGraph`, while layout, selected left tab, and stem gains are not currently persisted.
- The design references Suno Studio's information hierarchy only; no Suno branding, copy, or visual assets are copied.

## Interfaces

| Interface | Responsibility | Change status |
|---|---|---|
| `RemixPanel` | session bar, Arrange stage, Patch mode, controls | restructure required |
| `StudioDock` / timeline engine | tracks, clips, playhead, transport, preview | primary surface; behavior preserved |
| `FxRack` and `StemMixer` | processing and mix inputs | moved into contextual device dock |
| `useRemixStore` / project snapshot | UI state and persisted workspace | preserve compatibility |
| `/music/remix` and `/music/export` | render and export contracts | unchanged |

## 1. Roadmap

| Phase | Outcome | Gate |
|---|---|---|
| 0a | Approve this Master Plan sub-gate and its scoped architecture direction | owner approval required |
| 0b | Complete the canonical Phase 0 package: scope, glossary, system requirements, NFRs, and architecture principles | owner approval required |
| 1 | Produce detailed system architecture, decisions, invariants, and affected file map | owner approval required |
| 2 | Freeze interaction and state contracts for dock, responsive layout, keyboard use, and snapshots | owner approval required |
| 3 | Not applicable: no multi-agent runtime is introduced; record the explicit exclusion | owner approval required |
| 4 | Produce implementation specification for `RemixPanel`, styles, dock modules, and tests | owner approval required |
| 5 | Define visual, accessibility, responsive, and regression verification | owner approval required |
| 6 | Decompose implementation into independently verifiable tasks | owner approval required |
| 7 | Implement in approved waves only | build and visual verification per wave |

## 2. Target Architecture

```text
Session bar: Project | Import Source/Beat | Save/Open | Arrange/Patch | Export | Run
├─ Left sidebar: Library | Tracks | selected-clip inspector
└─ Arrange stage
   ├─ Timeline canvas (primary: 65–70% of available height)
   │  └─ track headers, clips, time ruler, playhead, transport, zoom
   └─ Device dock (secondary, collapsible, contextual)
      ├─ Inspector: selected clip, sync, offset, phrase/key controls
      ├─ FX: autotune, reverb, delay
      ├─ Mix/Master: stem gains, loudness, master controls
      └─ Output: render status, result, export

Patch mode: separate advanced workspace; never competes with Arrange timeline height.
```

## 3. Dependency Graph

```text
Approved Phase 0
  -> Phase 1 UI architecture
     -> Phase 2 interaction/state contracts
        -> Phase 4 component specification
           -> Phase 5 verification plan
              -> Phase 6 task queue
                 -> Phase 7 implementation
```

## 4. UX and Visual Decisions

- Use a dark, professional DAW density with the existing Cinemaro semantic tokens.
- Preserve one visually dominant action: `Run`. Secondary actions belong in the session bar or overflow on compact widths.
- Use progressive disclosure: one device module is open at a time; selected clip context opens Inspector rather than a permanent large panel.
- Keep keyboard alternatives for timeline drag/edit operations and visible focus states for all controls.
- Maintain at least 4.5:1 text contrast, labels for icon-only controls, and no color-only status meaning.
- At widths below the desktop target, collapse the left sidebar and secondary dock before reducing the timeline below a usable editing height.

## 5. Traceability and Current-Contract Decisions

| Source | Decision carried forward |
|---|---|
| `docs/product/PRD.md` §4.6 and Remix UX principles | Arrange is timeline-first; Patch is advanced; key session controls remain on top |
| `docs/archive/UI_SITEMAP.md` §3.5 | timeline, device dock, responsive ordering, and existing request mappings are authoritative inputs |
| `frontend/src/components/RemixPanel.tsx` | current Arrange structure uses `StudioDock` before bottom processing controls; snapshot behavior is the source of truth for persistence |

**Phase 2 contract decision:** choose one path before implementation: (A) preserve the current snapshot surface exactly, or (B) introduce a versioned migration to persist layout, dock state, and/or stem gains. This Master Plan does not choose B yet.

## 6. Master Plan Sub-Gate Deliverables and Exit Criteria

| Deliverable | Status | Exit criterion |
|---|---|---|
| `docs/MASTER_PLAN.md` | candidate | owner approves scope and target architecture |
| `docs/PHASE_0_REVIEW.md` | candidate | owner reviews this Master Plan sub-gate; it is not the Phase 0 completion review |
| `state/PROJECT_STATE.json` | in progress | Phase 0 remains open until its full canonical package exists |
| `.rwang/` registry | active | registered artifacts hash-match their sidecars |

## 7. Risks and Failure Modes

| Risk / failure mode | Mitigation |
|---|---|
| Timeline is visually central but becomes too short at compact widths | define minimum timeline height; collapse secondary panels first |
| Moving controls loses existing Remix parameter state | preserve store keys and snapshot schema; add state round-trip checks |
| A new persistence migration silently changes existing project files | make the decision explicit in Phase 2 and add a compatible migration plus round-trip test |
| Drag interaction conflicts with panel resizing or transport | isolate hit regions and retain visible non-drag controls |
| Device dock hides an essential action | retain Run/import/save/export in session bar; show active processing summary in dock tab |
| Visual redesign drifts from existing app identity | reuse Cinemaro tokens and current icon system; do not copy Suno assets |

## 8. Examples

**First-use flow:** Import source and beat → see both clips in timeline → adjust offset from Inspector → Run.

**Mix flow:** Select a vocal clip → open Mix/Master dock → adjust stem gain and loudness → preserve preview state until Run.

**Advanced flow:** Switch to Patch → inspect routing graph → return to Arrange with timeline-first layout unchanged.

## 9. Tradeoffs and Rejected Alternatives

| Alternative | Decision |
|---|---|
| Keep all FX and stem controls permanently visible above the timeline | rejected: contradicts the product's timeline-first requirement and reduces editing space |
| Make Patch the default workspace | rejected: node graphs are advanced and reduce first-use learnability |
| Copy Suno Studio UI verbatim | rejected: use only a general workflow reference; retain original G-Music branding and components |
| Change Remix API while restructuring UI | rejected: not necessary for this layout scope |

## 10. Review Checkpoint

Owner approval of this Master Plan sub-gate accepts the timeline-first direction, contextual device dock, Arrange/Patch separation, interface invariants, and no-API-change scope. It does not freeze Phase 0 or approve implementation; Phase 0 continues with its canonical document package.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-19 | candidate | Clarified sub-gate status, authoritative traceability, governed scope, and actual snapshot contract after review | b2c2d0d | ATHER |
| 0.1.0b | 2026-07-19 | candidate | Initial Phase 0 master plan for the Remix timeline-first restructure | b2c2d0d | ATHER |
