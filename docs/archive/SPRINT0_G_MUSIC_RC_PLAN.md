---
version: "0.1.1b"
created_at: "2026-07-03T11:28:12+07:00"
status: "active"
attributes:
  doc_type: "sprint-control"
  scope: "G-Music MVP/RC lane"
---

# Sprint 0 - G-Music MVP/RC Control Plan

## Purpose

Sprint 0 creates the control surface for finishing G-Music as the single active
product lane. It does not start new feature work. Its job is to make the next
implementation sprint traceable, bounded, and safe to verify.

## Scope

Main lane:

- Project: G-Music
- Workspace: `D:\G-Music`
- Remote: `https://github.com/Freshair129/G-Music`
- Active branch: `swarm/local-llm-refine`
- Release target: `v1.0-rc1`

Sidecar lane:

- `G:\.ollama_blobs_root` / G-Telemetry maintenance only.
- Allowed only for local LLM infrastructure upkeep and urgent Ollama/offload
  issues.
- No product features may be added there during this sprint.

## Sprint 0 Exit Gates

Sprint 0 is complete only when all gates below are true:

| Gate | Required Evidence | Status |
| --- | --- | --- |
| G0.1 GitHub remote | `git remote -v` shows `origin` for `Freshair129/G-Music` | Done |
| G0.2 Branch tracking | `swarm/local-llm-refine` tracks `origin/swarm/local-llm-refine` | Done |
| G0.3 Secrets safety | `.gitignore` excludes `keys/`, `.env`, `backend/.env`, generated media, venvs, node modules, and Tauri target | Done |
| G0.4 Path conflicts recorded | RWANG and BikeOps path conflicts are listed as blockers outside this lane | Done |
| G0.5 WIP limits recorded | Product MVP work is capped at one main lane | Done |
| G0.6 Sprint 1 ready | Feature backlog is reduced to the minimum work needed for G-Music RC | Done |

## Sprint 0 Findings

Code truth checked on 2026-07-03:

- `backend/app/routers/music.py` already exposes `POST /music/remix`.
- `backend/app/routers/music.py` already exposes `POST /music/export`.
- `backend/app/routers/mastering.py` exposes `POST /mastering`.
- `frontend/src/api.ts` calls `/music/remix`, `/music/export`, and `/mastering`.
- `frontend/src/components/RemixPanel.tsx` sends `offset_ms`, `reverb`,
  `delay`, `target_lufs`, and optional `stem_gains`.
- `backend/app/pipelines/music.py` already has `_master_to_target()` with a
  `pedalboard.Limiter` path plus fallback peak-scaling when `pedalboard` is not
  installed.
- `backend/smoke_remix.py` exists and is the smallest current smoke entrypoint
  for measuring Remix output metadata.

Sprint 1 should therefore validate and measure the existing implementation
before adding new DAW features.

## Sprint 1 Candidate Work

Sprint 1 should stay focused on feature close. Do not pull in Wave 1/2 DAW
refactors until the RC path is proven.

| Priority | Work | Acceptance Criteria |
| --- | --- | --- |
| P0 | Re-run end-to-end Remix smoke | Source + beat input produces a downloadable output without code edits during the run |
| P0 | Measure LUFS and peak after Remix | Output reports target LUFS tolerance and no clipping; failures become the first code fix |
| P0 | Docs truth-sync for Remix/Mastering | Docs stop referring to stale `/music/master` work and describe the actual `/mastering`, `/music/remix`, and `/music/export` route set |
| P1 | RC validation checklist | Commands for backend, frontend, and smoke verification are recorded with pass/fail results |
| P1 | Packaging readiness check | Existing sidecar/installer docs are reviewed for what is validated vs scaffolding only |

## Frozen During G-Music RC

These projects may receive inventory notes or read-only reviews only. Do not
start feature work in them until G-Music reaches `v1.0-rc1`.

| Project | Reason |
| --- | --- |
| GenesisBlock | Architecture-heavy foundation lane; high risk of stealing focus |
| GoVibe | Governance/process-heavy lane; keep for a later narrow vertical |
| RWANG | Path conflict exists: `D:\rwang\RWANG` vs `G:\Rwang` |
| BikeOps | Path conflict exists: `G:\BikeOps` vs `D:\BikeOps`; old `G:\covibe` is superseded |
| NotiKeeper | Distribution/install path should remain bounded for a later sprint |
| fluxnode-dev | Release proof is blocked by cross-OS/cross-hardware evidence needs |

## Agent Allocation

| Agent | Role | Allowed Work |
| --- | --- | --- |
| Codex | Main executor and final gate | Code, tests, validation, integration, final decision |
| Claude Code / Fable5 | Strategy and review gate | Roadmap refinement, docs truth-sync review, exit gate review |
| Local LLM / Ollama | Offline assistant | Log summaries, draft release notes, doc indexing, non-critical prep |
| Quadcode-like external executor | Second opinion | Clean install / RC review only; no main-lane implementation |

## WIP Limits

- One product MVP lane at a time: G-Music only.
- One active feature branch at a time.
- No GenesisBlock, GoVibe, RWANG, BikeOps, NotiKeeper, or FluxNode feature work
  until G-Music reaches `v1.0-rc1`.
- G-Telemetry/Ollama work is capped at maintenance. If it needs more than two
  hours in a week, it is no longer a sidecar and must wait.
- No new projects during this sprint. New ideas go to backlog.

## Version Diff

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.1b | 2026-07-03 | active | Marked Sprint 1 readiness complete after route/UI truth check and reduced Sprint 1 to smoke, LUFS/peak measurement, docs truth-sync, RC validation, and packaging readiness. |
| 0.1.0b | 2026-07-03 | active | Created Sprint 0 control plan, exit gates, WIP limits, frozen project list, and agent allocation for the G-Music MVP/RC lane. |
