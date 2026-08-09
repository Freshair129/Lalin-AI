# Lalin AI Rename Migration Plan

**Status:** approved planning artifact — no identifier or updater change has been executed.

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

- Do not change `com.gmusic.app` or updater endpoints until Wave 0 legal/operational decisions are complete.
- Do not rename or remove user data directories without a migration copy and a tested rollback.
- Do not ship the supplied reference images or copied brand assets.
- Each packaging wave must stop the running `g-music` and `g-music-backend` process before build, then smoke-test the resulting executable and `GET /` full-runtime profile.

## Immediate next artifact

Create original Lalin AI SVG brand assets and a product-copy inventory. Implement Wave 1 only after visual-identity approval; packaging is a separate acceptance gate.
