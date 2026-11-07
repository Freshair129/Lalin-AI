---
version: "0.2.3b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-11-08T00:00:00+07:00,Codex"
status: "approved reduced scope; release qualification NOT_RUN"
superseded_by: null
attributes:
  domain: "operations"
  doc_type: "release-runbook"
  scope: "Owner-approved reduced-scope Lalin Play v1.0 Windows installer, signed updater and release recovery"
---

# Lalin Play v1.0 release runbook

Parent: [ADR-004 S7](../architecture/ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md).
Peers: [handoff/license gate](../architecture/LALIN_PLAY_SEPARATION_HANDOFF.md),
[traceability](../validation/LALIN_PLAY_TRACEABILITY.md), [user guide](../guides/LALIN_PLAY_USER_GUIDE.md).
The owner-approved reduced scope is recorded in
[LALIN_PLAY_V1_RELEASE_SCOPE.md](../product/LALIN_PLAY_V1_RELEASE_SCOPE.md).
P1.4 implements the Play installer/updater and release workflows. Key ceremony,
dependency license review, release qualification and publication remain open;
this runbook does not claim that a release has been built or published.

## Current versus target

| Area | Implemented v1.0 code-round configuration | Evidence still required |
|---|---|---|
| Version/identity | `1.0.0`, `ai.lalin.play`, `lalin-play.exe` | Tag `play-v1.0.0`; all app manifests must agree |
| Platform | Windows 10 22H2+ and Windows 11, x64 | Clean-machine qualification NOT_RUN |
| Packaging | Active NSIS; Play SVG icon outputs; `currentUser`; embedded WebView2 bootstrapper | Installer build/install/uninstall NOT_RUN |
| Updater | Play-only updater plugin and static endpoint; signed NSIS update artifact | Signed A→B, tampered-signature and state-retention checks NOT_RUN |
| CI | `.github/workflows/release-play.yml`; separate `.github/workflows/promote-play-update.yml` | Hosted release workflow NOT_RUN; `play-updates` promotion is a manual step after publication |
| Assets | `Lalin-Play_1.0.0_x64-setup.exe`, `.exe.sig`, `latest-play.json`, `SHA256SUMS.txt`, `THIRD_PARTY_NOTICES.txt` | Draft generation NOT_RUN |
| Updater key | Play-only encrypted key at ignored `keys/lalin-play-updater.key`; secrets `PLAY_TAURI_SIGNING_PRIVATE_KEY` and `PLAY_TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Owner key ceremony, GitHub secrets and offline backup location remain open |
| OS code signing | Unsigned installer for v1.0; updater artifacts use the Play key | SmartScreen warning is documented; no Authenticode publisher is claimed |
| License and privacy | Dependency notice generator; no telemetry; network only for manual update checks and user-opened YouTube links | Owner must choose the Play source license; notice/license review remains open |

## R0 — approved release values and remaining gates

Reduced-scope decision: [LALIN_PLAY_V1_RELEASE_SCOPE.md](../product/LALIN_PLAY_V1_RELEASE_SCOPE.md) (owner-approved 2026-11-07).

| R0 item | Approved value | State |
|---|---|---|
| Product owner / operator | Owner `Freshair129`; lead agent prepares; owner publishes | Set |
| Supported platform | Windows 10 22H2+ and Windows 11, x64; NSIS `embedBootstrapper` | Set; test matrix NOT_RUN |
| Version / tag | `1.0.0` / `play-v1.0.0`; Studio continues using `v*` | Set |
| Channel / endpoint | Stable; dedicated rolling release `play-updates`; `https://github.com/Freshair129/Lalin-AI/releases/download/play-updates/latest-play.json` | Set; endpoint publication NOT_RUN |
| Assets | `Lalin-Play_1.0.0_x64-setup.exe`, `.exe.sig`, `latest-play.json`, `SHA256SUMS.txt`, `THIRD_PARTY_NOTICES.txt` | Set; draft NOT_RUN |
| Updater key custody | New Play-only minisign key; ignored local key plus the two named GitHub secrets | Script implemented; key ceremony and offline backup location remain owner-open |
| Windows code signing | Unsigned installer; signed Play updater | Set; SmartScreen note in guide |
| Source license | MIT (owner decision 2026-11-07, `apps/play-desktop/LICENSE`); third-party dependency notices generated from Cargo/npm metadata | Set; notices review before release |
| Bundle contents | No models or user data in the installer | Bundle inventory NOT_RUN |
| Privacy | No telemetry; network requests only for manual update checks and user-opened YouTube links | Documented; runtime verification NOT_RUN |

The approved reduced scope allows this release path while ADR-004 S4–S6 remain
deferred. Do not treat that scope decision as evidence for the remaining v1.0
product or release acceptance gates.

### Owner key ceremony

1. From the repository root, run `powershell -NoProfile -ExecutionPolicy Bypass -File tools/build/new_play_updater_key.ps1` on the owner PC. The script refuses to overwrite either key file, prompts for the password without echoing it, writes the private key only to ignored `keys/lalin-play-updater.key`, and commits only the public key in `tauri.conf.json`.
2. Run the two `gh secret set` commands printed by the script. They target only `Freshair129/Lalin-AI`; the private key is sent as base64 over stdin and the password is prompted as a secure string. Do not paste either secret into chat or source files.
3. Choose and verify an offline backup location for the private key and password before the first release. That location is still an owner decision and must not be inferred by the release workflow.
4. Keep Studio/Cast keys separate. Never commit the private key, its password, or a generated private-key copy.

The release workflow rejects a missing/invalid signing secret, a public-key
placeholder, or a tag that differs from all app version fields. The Rust release
build also fails while the public-key placeholder remains.

## R1 — reproducible build and draft artifacts

From `apps/play-desktop`, the release workflow runs these checks before bundling:

```powershell
npm ci
npm test
npm run build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
node ../../tools/verify/play_third_party_notices.mjs
```

On a Windows hosted runner, `.github/workflows/release-play.yml` validates the
secrets/tag/version, runs the checks above, builds with
`npm run tauri -- build --ci`, and creates a **draft** GitHub release from the
NSIS installer, its updater signature, generated update metadata, checksums and
third-party notice inventory. It does not modify the `play-updates` release.
The draft assets also include the Play MIT `LICENSE`, covered by the checksums.
Never expose private signing material in logs or repository files.

### Local P1.4 test round — 2026-11-07 (partial)

Source `898949cbe73dce49db971d63cf88ddb8d28ac6ae`, Windows, Node
24.20.0, npm 11.19.0, rustc/cargo 1.96.0. `npm test`: 16 files,
105 tests passed. `cargo fmt --check`: passed. The notices generator produced
an inventory of 434 Cargo and 11 production npm packages; this is metadata,
not license compliance review. Signing preflight rejected both an empty key
and invalid base64 with exit code 1. An attempted ephemeral-key setup and
cleanup command was rejected before execution by automatic policy review
(`rejected: blocked by policy`); valid-key preflight remains NOT_RUN.

`cargo test --offline --locked --manifest-path src-tauri/Cargo.toml`: unit
tests 80 passed, 6 ignored; integration tests 3 passed; main and benchmark
each ran 0 tests. Overall exit 1: the operator stopped the owned rustdoc
process after it made no visible progress for several minutes; doc-tests are
incomplete, not an assertion of a product test failure. The added `--offline`
follows the lane's recorded dependency boundary; the exact online command
remains NOT_RUN. Resume by diagnosing and completing doc-tests under the lane.

Lane lock acquired 15:03:39 and released 15:18:10 ICT, 2026-11-07.
Immediately before Cargo the free bytes were C: 124,415,971,328;
E: 132,360,876,032; F: 2,040,792,535,040. Before release they were
C: 124,386,955,264; E: 132,360,843,264; F: 2,036,505,907,200.
These are volume snapshots including other activity, not isolated build sizes.
The lane's recorded floors are C/E: 53,687,091,200 and F: 107,374,182,400
bytes. No release-profile delta exists because no release build ran.

Static workflow review: version/tag and placeholder checks are present, the
release is created as a draft, and promotion requires a published stable
`play-vX.Y.Z` release. `LICENSE` is included in the draft asset and checksum
lists in this change, alongside the five scope assets. `actionlint` NOT_RUN
(not installed). No GitHub release or secret was changed.

Release-profile guard/build, ephemeral-key NSIS artifact and signature/tamper
checks, generated NSIS script and bundle contents are NOT_RUN. The lane's
existing measured write basis covers debug/test, not the new release profile;
qualify its physical paths, peak writes and concurrent growth before a build.
The guard currently reads `tauri.conf.json` directly: compatibility with a
`--config` public-key override is unverified and needs a release-build test.
Frontend production build also remains NOT_RUN pending a qualified build
write/path budget. CI, real-key ceremony and secrets, clean-VM installation,
and A→B updates between published releases remain NOT_RUN.
Record runner/toolchain/Windows/WebView2 versions, source SHA, CI run, artifact
names/size/hash, signature verification result and release notes. Verify app,
Cargo, npm and Tauri versions agree. The draft is not published by this workflow.

After the owner publishes a qualified `play-v*` release, use the
`Promote Lalin Play update metadata` workflow with that published tag. It checks
the release and manifest, then uploads only `latest-play.json` to the existing
`play-updates` release with `--clobber` and verifies the promoted file hash.

### R1 local smoke evidence (2026-11-07)

Local release smoke 2026-11-07 (lane F:\cargo-lanes\lalin-play, ephemeral key via `--config`, key deleted): placeholder pubkey blocks `cargo build --release`; NSIS `Lalin Play_1.0.0_x64-setup.exe` 8,171,989 B SHA-256 `0ca55fa8…0a743f`; updater `.sig` verifies, tampered copy fails; currentUser + embedBootstrapper; bundle = `lalin-play.exe` + WebView2 bootstrapper only; cargo lib 80 pass/6 ignored + integration 3 pass; vitest 16 files/105 pass.
Fixes found by the smoke: `build.rs` guard honours `TAURI_CONFIG` overrides; `default-run = "lalin-play"` (Tauri could not pick the main binary); Smart Medley benchmark binary gated behind the `smart-medley-benchmark` feature so it is not bundled.

## R2 — installer and update qualification

P1.5 attempt 2026-11-08: native cases remain NOT_RUN because concurrent
build growth was unqualified. [Partial handoff and resume conditions](../validation/evidence/play-v1-p15/README.md).
The owner retains clean-VM and real-identifier install qualification.

| Case | Required observation | Status |
|---|---|---|
| Clean install / launch | Play-only app, no Studio/Python/API dependency, local audio/video | NOT_RUN |
| Normal user launch | No unnecessary elevation during playback/import | NOT_RUN |
| Uninstall / reinstall | Binary/shortcut removal; explicit data-retention policy; never delete user media | NOT_RUN |
| Signed A → B update | Installed A discovers approved B, validates signature, installs and restarts into B | NOT_RUN |
| State retention | Library/playlist/queue/EQ retained per policy; restart never autoplays unexpectedly | NOT_RUN |
| Same/older version | No unintended downgrade/reinstall loop | NOT_RUN |
| Invalid signature / wrong key | Update rejected with actionable error; current installed app remains usable | NOT_RUN |
| Offline / server error / interrupted download | Recoverable error, retry available, no corrupt partial install | NOT_RUN |
| Installer interrupted / locked file | Defined recovery and unchanged or recoverable current install | NOT_RUN |
| Key/channel mismatch | Reject cross-product/cross-channel metadata and artifacts | NOT_RUN |
| Device/UI regression | DPI, multiple monitors, keyboard/touch, audio output and known issue checks from traceability | NOT_RUN |

Use two real signed test versions; one successful build does not prove updater
behavior. Update restart can interrupt playback: require user confirmation and
preserve state before restart. First public version, key rotation and emergency
rollback need a reviewed plan; do not silently bypass version/signature checks.

## R3 — publish and monitor manually

After qualification and explicit approval, verify draft tag/SHA/assets/notices,
publish the intended release, fetch published metadata and validate hashes plus
an installed-app update from the intended endpoint. Record publication URL,
operator, time and test machine. This checklist does not schedule monitoring.

Release notes must include version/date/source SHA, changes, supported/tested
formats and Windows environment, installation/update instructions, known issues,
data migration compatibility, checksums/signing status and support path. Never
label an untested codec/device or unresolved release gate as supported.

## R4 — failure and rollback

Stop promotion on signature/state-loss/install failure; retain logs without
secrets. Record exact bad artifact/metadata and last known-good signed artifacts.
With explicit authority, withdraw the faulty update metadata or publish a fixed
newer version; do not force an unsigned downgrade. Offer reviewed manual reinstall
of a retained version only when storage compatibility is verified. Preserve app
state backups and user media. Key compromise requires a separate reviewed trust
recovery path, not deleting/replacing keys ad hoc.

## Release evidence record (fill only after execution)

Source/export SHA, version/tag, workflow/run URL, artifact hashes/signatures,
key fingerprint (public only), OS signing status, Windows/WebView2 test matrix,
A→B results, migration/recovery results, reviewer approval and published URL:
**NOT_RUN**. Link this record from the Play document register when executed.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.3b | 2026-11-08 | qualification NOT_RUN | Record blocked P1.5 attempt and resume conditions | working tree | Codex |
| 0.2.2b | 2026-11-07 | approved scope; qualification NOT_RUN | Record R1 local release smoke evidence and the three fixes it found | working tree | Claude |
| 0.2.1b | 2026-11-07 | approved scope; qualification NOT_RUN | Merge with the R0 scope link; record MIT source license | working tree | Claude |
| 0.2.0b | 2026-11-07 | approved scope; qualification NOT_RUN | Fill R0 values from the owner-approved scope and record P1.4 installer, signed updater, key ceremony and workflow steps | working tree | Codex |
| 0.1.1b | 2026-11-07 | candidate | Link the candidate reduced-scope Play v1.0 release decision from R0 | working tree | Claude |
| 0.1.0b | 2026-09-20 | candidate | Define release decisions, draft/installer/update tests and non-destructive recovery gates | based on f5a6681 | LALIN |
