---
version: "0.1.3b"
created_at: "2026-08-23T17:56:43+07:00,LALIN,uncommitted"
last_update: "2026-08-23T19:29:39+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "release-engineering"
  doc_type: "rca"
  scope: "GitHub Actions updater signing for build-windows run 32606363191"
---

# RCA: Release Build Reached Updater Signing Without a Private-Key Secret

## Symptom

The `build-windows` job in GitHub Actions run `32606363191` failed during the
`Build Tauri` step after the application and NSIS installer had already built.

Run evidence:

- Workflow: `Release G-Music`
- Trigger: push of tag `v0.1.0-rc1`
- Commit: `672aa186479a03ac702566358de38751f388f87a`
- Failed job: `97111861606`
- Failure time: `2026-08-23T00:22:28Z`

## Evidence

1. Steps 1-12 succeeded, including workspace verification, frontend tests,
   backend tests, sidecar build, Rust compilation, and NSIS packaging.
2. The log confirms creation of
   `G-Music_0.1.0_x64-setup.exe` before the failure.
3. The `Build Tauri` environment in the job log shows both
   `TAURI_SIGNING_PRIVATE_KEY` and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as empty.
4. The terminal error is:
   `failed to decode secret key: incorrect updater private key password: Missing comment in secret key`.
5. `.github/workflows/release.yml` maps the signing environment to repository
   secrets with those names, while `gh secret list --repo Freshair129/Lalin-AI`
   currently returns no repository-level Actions secrets.
6. `apps/desktop/src-tauri/tauri.conf.json` sets
   `bundle.createUpdaterArtifacts` to `true`, so updater signing is mandatory for
   this release path.
7. The local canonical key `keys/g-music.key` exists, is gitignored, and has the
   expected base64-encoded minisign envelope. Its content was not printed or
   copied during this investigation.
8. Tauri's updater documentation requires
   `TAURI_SIGNING_PRIVATE_KEY` to contain either the private-key path or its
   content when building updater artifacts. The password is optional for a key
   generated without one.

Sources:

- GitHub run: <https://github.com/Freshair129/Lalin-AI/actions/runs/32606363191/job/97111861606>
- Tauri updater signing: <https://v2.tauri.app/plugin/updater/#signing-updates>

## Root Cause

The tagged release workflow requested updater artifact generation but the
repository did not provision `TAURI_SIGNING_PRIVATE_KEY`. GitHub therefore
expanded the workflow expression to an empty value. Tauri completed the normal
Windows executable and NSIS bundle, then attempted to decode the empty updater
private key and terminated with exit code 1.

The empty password variable is not independently proven to be a fault: the
local release script intentionally uses an empty password, and Tauri documents
the password as optional. The decisive fault is the empty private-key value.

## Why the Issue Escaped Detection

- Local installer validation reads `keys/g-music.key` directly; it does not
  validate GitHub repository-secret provisioning.
- The release workflow runs only for `v*` tags, so ordinary branch checks do not
  exercise the signing environment.
- The workflow has no early preflight that rejects a missing signing key before
  the expensive sidecar, test, Rust, and NSIS stages.
- Phase 7 preserved the existing signing secret names but validated workflow
  structure and paths, not the external GitHub secret state.

## Impact

- No signed updater artifact, `latest.json`, or completed draft release was
  produced by this run.
- The compiled application and NSIS installer succeeded inside the ephemeral
  runner, but the job failure prevents treating them as a release result.
- Evidence does not indicate a regression in Phase 1 runtime code or tests.
- Approximately 30 minutes of runner time elapsed before the missing-secret
  condition surfaced.

## Proposed Resolution

1. Provision the existing canonical private key as the repository Actions secret
   `TAURI_SIGNING_PRIVATE_KEY` without printing it to logs or committing it.
2. Provision `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only if the canonical key is
   password-protected. For the current local empty-password key, keep the
   effective password empty.
3. Add an early PowerShell preflight before dependency installation/build that
   fails with a non-secret diagnostic when the private-key environment value is
   empty or cannot decode to the expected minisign envelope.
4. Re-run failed jobs for run `32606363191` after provisioning the secret.
5. Confirm the rerun produces a draft release containing a fresh NSIS installer,
   matching `.sig`, and `latest.json`.

## Acceptance Criteria

- `gh secret list --repo Freshair129/Lalin-AI` lists
  `TAURI_SIGNING_PRIVATE_KEY` without revealing its value.
- Missing-key preflight fails before expensive build steps and never prints key
  material.
- The rerun of `build-windows` completes successfully.
- The draft release has fresh `.exe`, `.exe.sig`, and `latest.json` assets for
  commit `672aa186479a03ac702566358de38751f388f87a`.
- No signing key or password is added to the repository, artifacts, or logs.

## Out of Scope

- Rotating or regenerating the updater key pair.
- Changing the Tauri public key.
- Changing the updater endpoint from the existing G-Music URL as part of the
  Lalin rename; that remains governed by the rename migration gate.
- Publishing the draft release or promoting this release candidate.

## Proposed Prevention

- Treat repository signing-secret presence as an external release prerequisite,
  distinct from local build validation.
- Keep the early non-secret preflight in the tag workflow.
- Add the secret-name and verification commands to the release runbook while
  keeping all secret values out of documentation.
- Retain draft-only publishing until updater assets and clean-VM validation pass.

## Implementation Status

Approved and implemented on 2026-08-23:

- Provisioned repository Actions secret `TAURI_SIGNING_PRIVATE_KEY` from the
  gitignored canonical key without printing its value.
- Added `tools/verify/check_tauri_signing_key.ps1` to reject an empty, malformed,
  or structurally invalid key without echoing key material.
- Added the preflight immediately after checkout in
  `.github/workflows/release.yml`, before dependency installation and builds.
- Added automated coverage for missing, malformed, and valid key-envelope cases.
- Attempt 2 proved the signing fix: Tauri created a fresh NSIS installer and
  `G-Music_0.1.0_x64-setup.exe.sig` without the prior key-decoding error.
- The run then exposed a separate downstream blocker while creating the draft
  GitHub Release: the workflow token lacks `contents: write`. That issue is
  documented separately in
  `.brain/rca/2026-08-23-release-token-missing-contents-write.md`.
- Attempt 3 completed successfully after the separate token-permission recovery
  and produced the expected draft `.exe`, `.exe.sig`, and `latest.json` assets.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.3b | 2026-08-23 | beta | Recorded successful attempt 3 and complete draft updater asset verification. | uncommitted | LALIN |
| 0.1.2b | 2026-08-23 | beta | Recorded attempt 2 evidence that updater signing now succeeds and identified the separate release-token blocker. | uncommitted | LALIN |
| 0.1.1b | 2026-08-23 | beta | Recorded approval, secret provisioning, tested preflight implementation, and rerun request. | uncommitted | LALIN |
| 0.1.0b | 2026-08-23 | candidate | Documented missing updater private-key secret root cause and proposed release preflight. | uncommitted | LALIN |
