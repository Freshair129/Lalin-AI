# Lalin AI Rename Migration Plan

**Status:** Studio updater migration approved. Release and native upgrade acceptance are tracked in [#48](https://github.com/Freshair129/Lalin-AI/issues/48).

## Name lock

- Public brand: **Lalin AI**
- Desktop app: **Lalin Studio**
- Product modules: Lalin Voice, Dub, Arrange, Master, and Library
- Legacy placeholder: G-Music

## Controlled migration waves

| Wave | Scope | Acceptance criteria |
|---|---|---|
| 0 — External readiness | Domain, social handles, trademark/legal clearance, updater-release decision | Owner confirms rights and chosen identifiers |
| 1 — Product copy | Docs, visible app title, about screen, release notes, icon/wordmark assets | No visible G-Music placeholder in selected surfaces; legacy data untouched |
| 2 — Packaging | `productName`, executable, sidecar name, installer, updater channel | Fresh install works; full runtime starts; rollback artifact retained |
| 3 — Data compatibility | Existing data path/project/export discovery and migration | Existing G-Music users retain projects/voices/outputs; migration is reversible or backed up |
| 4 — Repository and service identifiers | Folder/repository, URLs, bundle identifier, release automation | Existing update/install paths have an explicit migration or deprecation notice |

## Non-negotiable safeguards

- Preserve `com.gmusic.app` for the approved Studio updater bridge. Changes to the bundle ID or packaging identity need a separate migration decision.
- Do not rename or remove user data directories without a migration copy and a tested rollback.
- Do not ship the supplied reference images or copied brand assets.
- Each packaging wave must stop the running `g-music` and `g-music-backend` process before build, then smoke-test the resulting executable and `GET /` full-runtime profile.

## Studio updater migration (S1)

The owner approved this updater migration on 2026-11-21 in #48. The bridge
installer keeps bundle ID `com.gmusic.app`, the current Studio signing key,
G-Music packaging names, installation directory, and existing data paths.
The product rename and AppData migration are later changes.

- Studio checks `https://github.com/Freshair129/Lalin-AI/releases/download/studio-updates/latest.json`.
- Studio draft builds still use `v*` tags and attach Tauri's `latest.json`,
  the NSIS installer, and its detached signature. Promotion accepts a published
  stable `vX.Y.Z` tag whose Tauri configuration points to Studio's channel.
- Play uses its existing `play-updates/latest-play.json` channel.

### Qualify the bridge installer

Use an isolated Windows VM with a snapshot. Seed the [v0.1.1 build](https://github.com/Freshair129/Lalin-AI/actions/runs/35379933376)
with test projects, voices and outputs. Cover both the sidecar's install-relative
`data` directory and an existing `DATA_DIR` override in separate runs.
Stop G-Music and its sidecar, back up the data, and run the new installer with
the same Windows user, install mode and existing install directory. Keep the
old installation in place when starting the upgrade. Verify the files and
WebView settings are readable after restart, then verify the full sidecar
starts and the new client uses Studio's endpoint. Include a clean install and
a signed Studio A→B update in the release evidence. Keep the old installer and
VM snapshot for rollback.

The legacy updater uses the repository-wide latest URL. Existing clients
migrate by installing the approved Studio bridge over G-Music. The channel
becomes usable after the signed Studio release and its manifest are published.

### Publish and promote

Use a new stable version above v0.1.1 for the bridge and keep the old tag as
upgrade-test evidence. After separate owner approval, publish the qualified
Studio release with GitHub's latest flag disabled. On first setup the release operator creates
a `studio-updates` release with `--latest=false` on the approved source
commit. The operator then runs **Promote Lalin Studio update metadata** from
`main`, selecting the published Studio version tag. This checks the tag and
installer provenance, then promotes only `latest.json`. Confirm that the
public Studio URL serves those manifest bytes and that Play still serves
its own manifest.

If promotion fails, retry the same validated release after checking the workflow
log. If restoration of the prior manifest also failed, the release operator can
restore the asset from the last known-good Studio release with owner approval.
An installed newer version requires a separately qualified rollback or a
fix-forward release.

## Branding follow-up

Create original Lalin AI SVG brand assets and a product-copy inventory. Implement Wave 1 only after visual-identity approval; packaging is a separate acceptance gate.
