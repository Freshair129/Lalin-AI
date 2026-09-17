---
version: "0.1.1b"
created_at: "2026-09-17T23:33:00+07:00,LALIN,uncommitted"
last_update: "2026-09-18T00:17:44+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "release-engineering"
  doc_type: "implementation-plan"
  scope: "Signed draft release for the merged 0.1.1 candidate"
---

# Phase 9 Signed Draft Release Plan

## Decision

Use merge commit `d5530677b4c20bf75c98a321bde5dde08a29f1b4` as the release
candidate and set the product version to `0.1.1`. The existing draft release
`v0.1.0` is retained as historical evidence because it targets
`672aa186479a03ac702566358de38751f388f87a`; it must not be overwritten or
presented as the current build.

The first release action creates a **draft** GitHub release only. Publishing,
clean-VM acceptance and model inference remain separate gates.

## Complexity and risk

- Complexity: **C-3** — version metadata, CI packaging, updater assets and release provenance cross repository boundaries.
- Risk: **HIGH** — a tag can trigger a signed artifact build and an incorrect version or target SHA can publish the wrong update channel.

## Current evidence

- Release candidate commit `d5530677b4c20bf75c98a321bde5dde08a29f1b4` is the exact peeled target of the pushed annotated tag `v0.1.1`; the base branch now also contains the docs-only provenance follow-up `d17a6ea4388faa56bf14847760c15b3981edac91`.
- Local full-profile sidecar and unsigned NSIS installer passed independent runtime smoke; their generated files remain ignored.
- GitHub Actions has the secret name `TAURI_SIGNING_PRIVATE_KEY`; its value is never read through chat or committed.
- Draft `v0.1.0` has `.exe`, `.exe.sig` and `latest.json`, but its target commit is the older `672aa18`.
- The release workflow triggers on `v*`, runs `npm run check:all`, desktop/backend tests, builds the full-profile sidecar and requests a draft release with updater JSON.

## Latest execution result

- Tag `v0.1.1` was pushed and GitHub Actions run `35249842440` resolved to the
  intended head SHA `d5530677b4c20bf75c98a321bde5dde08a29f1b4`.
- The run concluded `failure` before any job step started (four seconds). GitHub
  reported: `The job was not started because recent account payments have failed
  or your spending limit needs to be increased. Please check the 'Billing &
  plans' section in your settings`.
- A controlled rerun of the same run (attempt 2, job `105305479891`) concluded
  `failure` again in three seconds with the identical pre-run billing annotation.
- No `v0.1.1` GitHub release or signed `.exe`, `.exe.sig` and `latest.json`
  assets were created. Existing draft `v0.1.0` remains unchanged and historical.
- This external account restriction is documented in
  [RCA: GitHub Actions release workflow blocked by account billing](../../.brain/rca/2026-09-18-release-workflow-billing-block.md).
- After the account restriction is resolved, rerun the existing tag workflow;
  no source or signing-key change is proposed for this blocker.

## Approved scope

1. Update only version metadata needed for the `0.1.1` desktop release:
   root/workspace package metadata, desktop package metadata, Tauri config,
   Cargo package metadata and their lockfile entries.
2. Add current release provenance to the packaging documentation and this plan.
3. Run local checks before opening the PR.
4. Open and merge a PR from the version branch into `swarm/local-llm-refine`.
5. Create tag `v0.1.1` on the merged version commit and let the existing
   workflow produce a **draft** release.
6. Verify the workflow head SHA and fresh `.exe`, `.exe.sig` and `latest.json`
   asset names, sizes and digests before treating the draft as usable evidence.

## Out of scope

- Reading, generating, rotating or committing private signing keys.
- Deleting or rewriting the existing `v0.1.0` draft release.
- Publishing the draft release or changing the updater endpoint.
- Claiming clean-VM acceptance, model inference or production readiness.
- Changing application behavior or ML dependency selection.

## Acceptance criteria

- All intended version fields equal `0.1.1`; unrelated package/dependency versions are unchanged.
- `npm run check:all`, desktop tests, backend tests, `git diff --check` and a stable doc-graph scan pass.
- The merged version commit is the exact commit tagged `v0.1.1`.
- The release workflow succeeds on that tag and creates a draft containing a fresh
  NSIS executable, matching `.exe.sig` and `latest.json`.
- The draft remains unpublished until a separate release decision and clean-VM gate.

## Rollback

Before the tag is pushed, revert the version PR. After a draft is created, leave
it unpublished and delete only the candidate tag/release after recording the
failure reason; do not alter the existing `v0.1.0` draft.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.3b | 2026-09-18 | beta | Recorded the controlled rerun and repeated GitHub billing restriction for tag v0.1.1. | pending provenance follow-up | LALIN |
| 0.1.2b | 2026-09-18 | beta | Recorded tag v0.1.1 and the GitHub billing restriction that prevented the draft workflow from starting. | pending provenance follow-up | LALIN |
| 0.1.1b | 2026-09-17 | beta | Update the release candidate provenance to the merged version commit d553067. | pending provenance follow-up | LALIN |
| 0.1.0b | 2026-09-17 | beta | Approved plan for a versioned signed draft release from merge commit f83d440. | uncommitted | LALIN |
