---
version: "0.1.1b"
created_at: "2026-09-18T00:04:01+07:00,LALIN,uncommitted"
last_update: "2026-09-18T00:55:57+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "release-engineering"
  doc_type: "rca"
  scope: "GitHub Actions signed draft release for tag v0.1.1, run 35249842440"
---

# RCA: GitHub Actions Release Workflow Blocked by Account Billing

## Symptom

The signed draft release workflow for tag `v0.1.1` concluded `failure` without
starting a runner job. No current `.exe`, `.exe.sig`, `latest.json` or GitHub
draft release was produced.

## Evidence

1. Tag `v0.1.1` is present on the remote and its peeled commit is
   `d5530677b4c20bf75c98a321bde5dde08a29f1b4`, the intended version commit.
2. GitHub Actions run `35249842440` has event `push`, head branch `v0.1.1`,
   head SHA `d5530677b4c20bf75c98a321bde5dde08a29f1b4`, and its first attempt
   completed in four seconds with conclusion `failure`.
3. A controlled rerun produced attempt 2, job `105305479891`, which completed in
   three seconds with the same conclusion and no executed project steps.
4. A final controlled rerun produced attempt 3, job `105318554292`, which
   completed in seven seconds with the same conclusion and no executed project
   steps.
5. All three attempts have no executed steps or job log. The repeated annotation is:
   `The job was not started because recent account payments have failed or your
   spending limit needs to be increased. Please check the 'Billing & plans'
   section in your settings`.
6. `gh release list` shows only the existing draft `G-Music v0.1.0`; there is no
   `v0.1.1` release to inspect or overwrite.
7. Local release gates already passed before tagging: root checks, 177 desktop
   tests, 86 backend tests, locked Cargo check, version consistency and stable
   doc-graph scans.

Source: <https://github.com/Freshair129/Lalin-AI/actions/runs/35249842440>

## Root Cause

GitHub account billing or spending-limit enforcement prevented GitHub-hosted
Actions from allocating a runner for run `35249842440`. The workflow source,
tag target and repository signing-secret name were not reached by execution, so
the failure is external runner admission rather than an application, packaging,
signing, or workflow-step defect.

## Why the Issue Escaped Detection

- Local validation and prior successful release runs cannot prove that the
  current GitHub account can allocate a hosted runner at the time of a new tag.
- The release workflow has no repository-local signal for account billing state;
  GitHub rejects the run before checkout and before any project step can report
  a diagnostic.
- The pre-tag audit verified workflow structure, secret-name presence and local
  artifacts, but account billing is an external control-plane prerequisite.

## Impact

- No signed draft release exists for version `0.1.1`.
- The existing `v0.1.0` draft remains unchanged and is not evidence for the
  current candidate.
- No source rollback is indicated. Clean-VM acceptance, model inference and
  publication remain unrun.

## Proposed Resolution

Resolve the account notice in GitHub **Billing & plans** or raise the account
spending limit, then rerun the existing failed workflow run for tag `v0.1.1`.
Keep the tag target and source revision unchanged. Recheck the run head SHA and
the fresh `.exe`, `.exe.sig` and `latest.json` assets before treating the draft
as usable release evidence.

## Proposed Prevention

- Add a release checklist item for GitHub account billing/Actions runner
  availability immediately before pushing a release tag.
- Treat a pre-run GitHub admission failure as an external release gate and do
  not alter application code or signing configuration to bypass it.
- Keep the existing draft-only, exact-SHA and clean-VM gates after the workflow
  becomes runnable.

## Acceptance Criteria

- A rerun for tag `v0.1.1` starts a hosted runner and completes successfully.
- The workflow head SHA remains `d5530677b4c20bf75c98a321bde5dde08a29f1b4`.
- A new draft release contains a fresh NSIS `.exe`, matching `.exe.sig` and
  `latest.json` for version `0.1.1`.
- The draft remains unpublished pending the separate release decision and
  clean-VM gate.

## Resolution Status

Blocked on GitHub account billing/spending-limit remediation. Three controlled
attempts (including the final attempt 3) repeated the pre-run admission failure,
so no repository source fix is authorized or required for this RCA.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.2b | 2026-09-18 | beta | Recorded final controlled rerun attempt 3 and stopped retries after the repeated pre-run billing restriction. | pending provenance follow-up | LALIN |
| 0.1.1b | 2026-09-18 | beta | Recorded controlled rerun attempt 2 and the repeated pre-run billing restriction. | pending provenance follow-up | LALIN |
| 0.1.0b | 2026-09-18 | beta | Recorded the pre-run GitHub billing restriction for the v0.1.1 signed draft workflow. | pending provenance follow-up | LALIN |
