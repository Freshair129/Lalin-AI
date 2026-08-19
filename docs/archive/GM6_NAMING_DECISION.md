# GM6 Product Naming Decision Brief

**Status:** name locked — migration planning approved; implementation requires a controlled rename release.

## Why decide now

`G-Music` began as a placeholder and `GM6` reads as an internal version label. Either becomes increasingly expensive to replace once it appears in the Tauri bundle identifier, installer/updater channel, executable name, documentation, storage paths, and user-created projects.

## Naming criteria

1. Covers voice, speech, dubbing, mastering, and remix without naming only one feature.
2. Pronounceable in Thai and English; 2–3 syllables; not tied to one model/vendor.
3. Distinct enough for an original wordmark and app icon.
4. Supports the descriptor **Local AI Audio Workstation** without sounding like a generic music player.
5. Must pass trademark, app-store, GitHub organisation, and domain checks before final adoption. Availability has not been verified in this document.

## Considered shortlist

| Candidate | Pronunciation | Rationale | Risk |
|---|---|---|---|
| **Auvra** | ออ-วรา / AW-vra | Invented from audio + aura; carries the warm-signal visual direction while remaining broad enough for a workstation. | Needs availability search; unfamiliar spelling needs early pronunciation guidance. |
| **Sonory** | ซอ-นอ-รี / SON-or-ee | Sonic + story; friendly for speech and music creation, easy campaign language. | Slightly closer to generic audio naming. |
| **Veyla** | เว-ลา / VAY-la | Short, calm, premium, and not tied to a single audio operation. | Meaning needs to be defined by the brand. |
| **Orvyn** | ออร์-วิน / OR-vin | Technical but human; works as a professional workstation brand. | Less immediately audio-associated. |
| **Tonoa** | โท-โน-อา / TOH-no-a | Hints at tone without being literal; supports Thai/English use. | Tone association may feel narrower than the full tool suite. |

## Final decision

**Public brand:** **Lalin AI**

**Desktop product:** **Lalin Studio**

**Brand lockup:** `LALIN AI` — *Local AI Audio Workstation*

**Product language:** `Lalin Voice`, `Lalin Dub`, `Lalin Arrange`, `Lalin Master`, and `Lalin Library`.

Why it is the selected choice:

- It remains credible for voice cloning, dubbing, mastering, remix, and future agent audio.
- It carries a calm, human, moonlit quality that fits the dark-studio and warm-signal design language without borrowing the reference identity.
- It gives an original monogram direction: a distinct `L`/waveform/track mark, replacing the provisional GM6 mark.
- It is short enough for a desktop title, mobile icon label, installer, and spoken recommendation.

## Architecture after selection

| Layer | Current technical name | Target after controlled migration |
|---|---|---|
| Repository path | `D:\G-Music` may remain temporarily | Lalin AI in documentation/product copy |
| Python module/package | `app` remains unchanged | no user-visible effect |
| Sidecar binary | `g-music-backend` | `lalin-backend` |
| Tauri product/title | `G-Music` | `Lalin Studio` |
| Bundle identifier | `com.gmusic.app` | e.g. `ai.lalin.studio` after availability/legal review |
| User data | explicit migration compatibility plan | preserve current G-Music data |
| Update channel | new release strategy required | never silently cross-update identifiers |

## Remaining release gate

The product name is selected. Do not perform an opportunistic search-and-replace: identifiers, executable names, updater endpoints, package folders, and user-data paths must change only through [LALIN_RENAME_MIGRATION_PLAN.md](../design/LALIN_RENAME_MIGRATION_PLAN.md). Domain registration and trademark clearance remain owner-authorized external actions.
