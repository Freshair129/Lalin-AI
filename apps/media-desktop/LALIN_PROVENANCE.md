# Lalin Media — VacuumTube fork provenance

## Baseline

| Field | Value |
|---|---|
| Upstream | https://github.com/shy1132/VacuumTube |
| Release/tag | `v1.8.2` |
| Release reference | `4dd3ee4` |
| Source archive SHA-256 | `23D327E4EE69B9DDE4126C15EE32C02101F60235451B79DF88228BAA26134AA0` |
| Upstream license | MIT; see [`LICENSE`](LICENSE) |
| Runtime baseline | Electron `^42.5.0` |
| Source surface | `https://www.youtube.com/tv` from upstream `src/index.js` |

The source was imported from the tagged release archive on 2026-09-19. The
upstream source remains recognizable and is not rewritten into a custom YouTube
client. The upstream user-agent, Leanback integration, controller support, DIAL
discoverability and built-in ad-block setting remain the provenance-bearing
implementation.

## Lalin integration patches

The initial local patches are intentionally narrow:

1. Add a `check` script for workspace validation.
2. Add single-instance handling so a lifecycle `focus` request can focus the
   existing Electron window instead of creating a second Media window.
3. Use the Lalin Media window title/name while retaining upstream runtime behavior.

No new YouTube network interceptor, DRM path, credential relay or custom ad
bypass is added by Lalin. The upstream ad-block setting remains subject to its
own behavior and is reported as an engineering capability, not a promise about
all future ad formats.

## Packaging boundary

The upstream package/app identity is retained during P1/P2 development. Final
Lalin Media bundle identity, user-data migration, updater and installer wiring
are deferred to the packaging slice and must not be inferred from this local
workspace app.

## Update procedure

An upstream update must record the new release/tag, commit, archive hash, local
patch diff and rerun the endpoint, lifecycle, sign-in/pairing and ad-filter
checks before the pin changes.
