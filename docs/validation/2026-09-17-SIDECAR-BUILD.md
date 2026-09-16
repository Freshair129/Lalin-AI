---
version: "0.1.1b"
created_at: "2026-09-17T04:05:00+07:00,LALIN,uncommitted"
last_update: "2026-09-17T04:31:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "packaging"
  doc_type: "validation"
  scope: "Requested local sidecar build and commit/push follow-up"
---

# Local backend sidecar build

The user requested commit/push of the approved playback repair and creation of
the missing sidecar. This follows the tracked PyInstaller spec and current
release workflow; no backend, installer, signing or ML code was changed.

## Build environment

- Python **3.11.16**, installed only under ignored `runtime/sidecar-build/python`.
  No system Python default, executable registration or registry change.
- Canonical project venv: `apps/api/.venv`, created with workspace-local uv 0.12.15.
- `apps/api/requirements.txt` installed unchanged; PyInstaller **6.22.3** and
  hooks **2026.7**. Exact resolved packages saved in the ignored build evidence.
- Command: `tools/build/build_sidecar.ps1 -Profile full -VenvPath F:\lalin\apps\api\.venv`.
- `apps/api/g-music-backend.spec` was preserved and used unchanged. Generated
  cleanup/output paths were checked inside this workspace before the build.
- API checks use isolated data under `runtime/sidecar-build`; the Ollama endpoint
  was deliberately disconnected (`127.0.0.1:1`) so no actual model was called.

`full` means the full API route profile. The tracked spec continues to exclude
Torch, Whisper, F5, Demucs and other optional ML packages/model weights. This
artifact does not establish standalone ML inference readiness.

## Artifact

Verified canonical directory: `apps/desktop/src-tauri/binaries/`.
The executable must be distributed with its adjacent `_internal/` directory;
the `.exe` alone is not a standalone distribution.

| Property | Value |
|---|---|
| Executable | `g-music-backend-x86_64-pc-windows-msvc.exe` |
| Executable bytes | 14,783,897 |
| Executable SHA-256 | `3f8d87dc76fe12711acb8bdbaef2ae2638035d46c9753e142038ee2c2cf97f20` |
| Complete onedir payload | 203 files / 233,676,848 bytes |
| Source spec | `apps/api/g-music-backend.spec` |

Generated executable, dependencies, venv, interpreter and raw logs remain
gitignored. The source repair and evidence documents are the commit/push scope.

## Local installer

The checkout does not contain `keys/g-music.key`, so the tracked signed
installer workflow could not produce updater signatures. For local packaging
verification only, an ignored Tauri config set `bundle.createUpdaterArtifacts`
to `false`; no signing key was generated and no release metadata was changed.
The resulting NSIS installer was built from the same full-profile sidecar and
installed into the isolated `target/installed-smoke` directory.

| Property | Value |
|---|---|
| Installer | `apps/desktop/src-tauri/target/release/bundle/nsis/G-Music_0.1.0_x64-setup.exe` |
| Installer bytes | 68,243,834 |
| Installer SHA-256 | `94EEBBC4CD9E0C209F267C2A6E857EC90DB5B2AD5705DADA877081B038242D7A` |
| Installed layout | PASS: `G-Music.exe`, `g-music-backend.exe` and adjacent `_internal/` payload present |
| Installed runtime | PASS: isolated app launch, sidecar-owned port 8756, `/health` HTTP 200 and `/` profile `full`; test processes stopped afterward |

The installer is unsigned and has no `.sig` artifact by design. This is local
installer evidence; clean-VM acceptance, model inference and signed release
remain separate gates.

## Verification

| Check | Result |
|---|---|
| Tracked-spec PyInstaller build | PASS |
| Source backend tests | **86/86 PASS** |
| Built executable `/` | HTTP 200, profile `full` |
| Built executable `/health` | HTTP 200, service `g-music`, status `ok`; brain unavailable as intentionally configured |
| Frozen API route presence | `/health`, `/fs`, `/fs/file`, `/render`, `/tts`, `/dubbing`, `/mastering`, `/music/remix` all present |
| Canonical copied bundle | PASS: all 203 file hashes match the PyInstaller output manifest |
| Canonical executable runtime | PASS: verified executable owns port 8756, health HTTP 200 and profile `full`; test process stopped afterward |
| `npm run check:all` | PASS: contracts/MCP/desktop build, API compileall and normal-config Cargo check; no `TAURI_CONFIG` override |
| Local unsigned NSIS installer and isolated installed-app smoke | **PASS**: installer hash/layout/runtime recorded above |
| Clean VM, model inference and signed release | NOT_RUN |

The build script's existing smoke loop allows only two seconds per `/health`
request. An independent reproduction returned curl exit 28 at **2004 ms** using
those exact arguments, while the same executable and endpoint passed with a
five-second request budget. `OllamaProvider.health()` itself permits five seconds
for its dependency probe. The disconnected endpoint chosen for this isolated
test triggers the shorter wrapper timeout. The build script completed with exit
0 and its documented smoke warning after 180 attempts (the message says 180s,
but each attempt also includes a one-second wait and a two-second request).
This is not evidence that the backend
failed to start: an independent request verified the running executable and
actual HTTP 200 response. No production timeout or health semantics were changed.

Raw local evidence: `runtime/sidecar-build/build.log`, `api-tests.log`,
`python-packages.txt`, `bundle-manifest.json`, `dist-runtime-smoke.json`,
`canonical-runtime-smoke.json`, `installed-runtime-smoke.json`,
`unsigned-installer.log` and `check-all.log`.
The manifest contains the size and SHA-256 of every bundled file.

## Related evidence

- [Playback repair validation](2026-09-17-LALIN-PLAY-COMMAND-DELIVERY.md)
- [Packaging operations](../operations/PACKAGING_SIDECAR.md)

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-09-17 | beta | Record local unsigned NSIS build and isolated installed-app runtime smoke | pending docs follow-up | LALIN |
| 0.1.0b | 2026-09-17 | beta | Record local Python 3.11 sidecar build, provenance and runtime checks | included with source repair | LALIN |
