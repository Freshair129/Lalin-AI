---
version: "0.1.0b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-09-20T22:40:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "operations"
  doc_type: "release-runbook"
  scope: "Proposed standalone Play Windows installer, signed updater and recovery"
---

# Lalin Play release runbook — not yet executable end-to-end

Parent: [ADR-004 S7](../architecture/ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md).
Peers: [handoff/license gate](../architecture/LALIN_PLAY_SEPARATION_HANDOFF.md),
[traceability](../validation/LALIN_PLAY_TRACEABILITY.md), [user guide](../guides/LALIN_PLAY_USER_GUIDE.md).
This candidate specifies review/qualification steps, not an existing workflow or
authorization to create keys, change repo settings, publish assets or install apps.

## Current versus target

| Area | Current `f5a6681` | Release target / required decision |
|---|---|---|
| Version/identity | `0.1.0`, `ai.lalin.play`, `lalin-play.exe` | Independent Play version, unchanged app identity unless migration reviewed |
| Packaging | `bundle.active:false`, target list `nsis`, bundle icon list empty | Review/enable Play-only NSIS packaging and icons; target list alone is not an installer |
| Updater | No updater plugin/config/key in candidate; UI explicitly unavailable | Play-only endpoint/public key and verified signed update |
| CI | Existing root release workflow belongs to Studio | Independent Play workflow in approved destination; no Studio/Cast artifact/key reuse |
| Distribution | Native debug binary only | Release binary + installer + update metadata/signatures + checksums/notices |
| Signing custody | NOT_SELECTED | Owner selects custodian/secret storage, access policy and offline recovery; never commit private keys |
| OS code signing | NOT_SELECTED | Separate decision from updater signing; record signed/unsigned trust prompts honestly |

## R0 — prerequisites (STOP until satisfied)

- [ ] Candidate contract/runbook reviewed; product owner and release operator named.
- [ ] S2–S6 gates completed or an explicitly approved reduced-scope release documented.
- [ ] Destination source SHA and clean checkout verified; no parent workspace links.
- [ ] License/notices gate closed; no user data, models or debug-only fixtures in bundle.
- [ ] Choose supported Windows versions/architecture, WebView2 provisioning and test machines.
- [ ] Choose release version/tag/channel, asset naming and endpoint; record exact approved values.
- [ ] Choose Play updater key custody/recovery and OS signing policy; test without exposing secrets.

Unresolved choices are release blockers, not default values for the agent to invent.

## R1 — reproducible build and draft artifacts

From the independent Play root, the existing source-validation commands are:

```powershell
npm ci --workspaces=false
npm test
npm run build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Native debug validation currently uses `npm run tauri -- build --debug --no-bundle`.
That command does **not** produce release installer/updater proof. Add and review
release build/signing automation only after R0 choices; exact commands must match
the implemented configuration and installed toolchain, not a placeholder recipe.

Proposed pipeline: locked checkout/install → tests → native release build →
NSIS packaging → updater signing → checksums/notices/SBOM inventory → **draft**
GitHub release. Never expose private signing material in logs or repository files.
Record runner/toolchain/Windows/WebView2 versions, source SHA, CI run, artifact
names/size/hash, signature verification result and release notes. Verify app,
Cargo, npm and Tauri versions agree. Draft creation and publication require
their own authorization; neither is performed by this documentation task.

## R2 — installer and update qualification

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
| 0.1.0b | 2026-09-20 | candidate | Define release decisions, draft/installer/update tests and non-destructive recovery gates | based on f5a6681 | LALIN |
