---
version: "0.1.1b"
created_at: "2026-08-23T18:34:31+07:00,LALIN,uncommitted"
last_update: "2026-08-23T19:29:39+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "release-engineering"
  doc_type: "rca"
  scope: "GitHub Actions release creation for build-windows run 32606363191 attempt 2"
---

# RCA: Release Token Cannot Create the Draft GitHub Release

## Symptom

Attempt 2 of GitHub Actions run `32606363191` passed updater signing but failed
at the end of `Build Tauri` while `tauri-action` attempted to create a draft
release:

```text
Couldn't find release with tag v0.1.0. Creating one.
Resource not accessible by integration
```

## Evidence

1. Attempt 2 job `97184237862` passed sidecar build, workspace verification,
   frontend tests, and backend tests.
2. The job log shows `TAURI_SIGNING_PRIVATE_KEY: ***`, proving the secret was
   supplied without revealing its value.
3. Tauri successfully created both
   `G-Music_0.1.0_x64-setup.exe` and
   `G-Music_0.1.0_x64-setup.exe.sig`. The original signing-key error did not
   recur.
4. `tauri-action` failed only when calling GitHub's create-release endpoint.
5. The repository Actions policy reports
   `default_workflow_permissions: read`.
6. `.github/workflows/release.yml` does not declare a `permissions` block.
7. The official `tauri-action` release example grants the publishing job
   `contents: write`.
8. No release currently exists for tag `v0.1.0`.

Sources:

- Attempt 2 job: <https://github.com/Freshair129/Lalin-AI/actions/runs/32606363191/job/97184237862>
- Tauri Action release example: <https://github.com/tauri-apps/tauri-action#example>
- GitHub workflow permissions: <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions>

## Root Cause

The release job relies on the repository's restricted default `GITHUB_TOKEN`.
That token has read-only repository contents access, while creating a GitHub
Release and uploading release assets requires write access. Because the job does
not request `contents: write`, GitHub rejects the create-release API call with
`Resource not accessible by integration`.

## Why the Issue Escaped Detection

- The missing updater private key stopped attempt 1 before the release API call,
  hiding this downstream permission failure.
- Local installer and updater-signature validation never calls GitHub's Releases
  API.
- The Phase 7 workflow repair preserved release inputs but did not validate the
  repository's effective default token policy.
- The workflow has no static test asserting the least-privilege permission
  required by its release-publishing behavior.

## Impact

- The signed installer exists only on the completed ephemeral runner and was not
  uploaded to a GitHub Release.
- No draft release or `latest.json` was created.
- Runtime code, tests, NSIS packaging, and updater signing all passed before the
  authorization failure.

## Proposed Resolution

### Persistent Least-Privilege Fix

Grant only the release job the permission required by `tauri-action`:

```yaml
jobs:
  build-windows:
    permissions:
      contents: write
```

Keep the repository-wide default at `read`; do not enable pull-request approval
permission. Add a static test that the release job declares exactly
`contents: write`.

### Recovery of the Existing Tagged Run

A rerun uses the workflow stored at tag commit `672aa186...`, which does not
contain the proposed job-level permission. Recovering that exact run therefore
requires one of these separately authorized actions:

1. **Temporary repository permission elevation:** set the default workflow
   permission to `write`, confirm no unrelated workflow is active, rerun only
   the failed job, then restore the default to `read` immediately after the job
   completes. This avoids rewriting the existing tag but temporarily broadens
   permissions for any job starting during that window.
2. **New release-candidate tag:** commit the scoped workflow fix and create a new
   RC tag from the intended release commit. This preserves least privilege but
   requires deciding which currently uncommitted Phase 1 changes belong in that
   release commit.

The recommended immediate recovery for the existing run is option 1 only with
an active-run check and guaranteed restoration to `read`. The persistent
job-level permission must still be committed before future release tags.

## Acceptance Criteria

- The release job declares `permissions: contents: write`; other jobs receive no
  added write permission.
- Repository default workflow permission is `read` after recovery completes.
- A successful release run creates a draft release for the intended commit.
- Draft assets include a fresh NSIS `.exe`, matching `.exe.sig`, and
  `latest.json`.
- No unrelated workflow runs while temporary repository-wide write permission
  is active.
- The draft remains unpublished pending the existing release and clean-VM gates.

## Proposed Prevention

- Test release workflow permissions as part of workflow validation.
- Keep repository defaults restricted and grant write permission at job scope.
- Treat GitHub secret provisioning and token authorization as separate external
  release prerequisites.
- Verify the resolved release tag (`v0.1.0` for the current package version)
  before publishing or promoting any draft.

## Resolution

Approved and executed on 2026-08-23:

- Added job-scoped `permissions: contents: write` to `build-windows`; no other
  workflow permission was added.
- Added a regression test that requires the release job's permission block to
  contain only `contents: write`.
- Confirmed no workflow was active before recovery.
- Temporarily changed the repository default from `read` to `write`, started
  attempt 3 job `97189999691`, and restored the default to `read` immediately
  after the job received its token. Pull-request approval permission remained
  disabled throughout.
- Attempt 3 of run `32606363191` completed successfully in 35m29s.
- Created draft release `G-Music v0.1.0` (release ID `375204293`) targeting
  commit `672aa186479a03ac702566358de38751f388f87a`.
- Verified uploaded assets:
  - `G-Music_0.1.0_x64-setup.exe`: 68,636,358 bytes
  - `G-Music_0.1.0_x64-setup.exe.sig`: 416 bytes
  - `latest.json`: 1,365 bytes
- Verified `latest.json` version `0.1.0`, both Windows NSIS platform entries,
  non-empty 416-character signatures, and download URLs under
  `Freshair129/Lalin-AI`.
- The release remains draft and unpublished. Repository default workflow
  permission is `read` and pull-request approval permission is `false`.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-08-23 | beta | Recorded approved least-privilege fix, temporary recovery, successful run, and verified draft assets. | uncommitted | LALIN |
| 0.1.0b | 2026-08-23 | candidate | Documented missing contents write permission and recovery options after signing succeeded. | uncommitted | LALIN |
