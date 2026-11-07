---
version: "1.0.1b"
created_at: "2026-11-07T00:00:00+07:00,Claude"
last_update: "2026-11-07T00:00:00+07:00,Claude"
status: "approved"
superseded_by: null
attributes:
  domain: "lalin-play"
  doc_type: "release-scope-decision"
  scope: "Reduced-scope Lalin Play v1.0 production release from the Lalin-AI repository (runbook R0)"
---

# Lalin Play v1.0 — release scope decision

## 1. Status and authority

- **Approved by the owner on 2026-11-07** (human approval, given in the lead session and recorded in [issue #47](https://github.com/Freshair129/Lalin-AI/issues/47)) for §2 scope, §3 deferrals, §4 release values and §5 exit criteria. Still owner-open inside §4: the offline backup location for the updater key. (Source license decided: MIT, 2026-11-07.) Owner direction given on 2026-11-07 in the lead session: ship Lalin Play before Lalin Studio, non-commercial posture, release from `Freshair129/Lalin-AI` instead of extracting `lalin-play` first, and ship an unsigned Windows installer with a signed updater. This document turns those directions into concrete scope and values. 
- It is the "explicitly approved reduced-scope release documented" that [runbook R0](../operations/LALIN_PLAY_RELEASE_RUNBOOK.md) allows instead of completing ADR-004 S2–S6. ADR-004 itself is not superseded: S4 export, S5 clean-checkout verification and S6 removal remain the long-term plan and are deferred, not cancelled.
- Requirements stay as approved in [PRD](PRD.md) §PLAY. This document only selects which of them gate v1.0.

## 2. In scope for v1.0 (must pass before release)

| ID | Gate for v1.0 | Current evidence → remaining work |
|---|---|---|
| PLAY-01 | Launch with Studio/API closed, pick a file, hear audio | Automated local-first L0–L3 evidence (P1.3) + owner audible check (P1.6) |
| PLAY-02 | Library/playlist from user-picked files | Existing tests; owner check |
| PLAY-03 | Full ↔ Compact keep media, queue, position, volume, output, EQ | Existing tests; owner check |
| PLAY-04 | Transport, queue, repeat/shuffle, 10-band EQ + presets | Existing tests; owner audible EQ check |
| PLAY-05 | Keep playing after Studio closes; tray restore; explicit quit | Owner check |
| PLAY-06 | Single instance; second launch / file open reuse it | **Reduced:** single-instance + CLI/file forwarding only. Studio → Play handoff stays as already merged (G3 PARTIAL) and is not a v1.0 gate; Studio keeps its own playback. |
| PLAY-07 | Play-owned storage; opt-in resume, no autoplay | Genesis restart/persistence tests (genesis-tests branch, after #46 fix) |
| PLAY-08 | Missing/moved/unsupported file → reason + pick a new file, queue kept | Linked relink merged (PR #45); **PLAY-08-M managed-object recovery required** (P1.2); owner cross-drive check |
| PLAY-09 | Opt-in queue/EQ import from Studio export | Existing S2 automated pass; power-loss durability recorded as a known limitation, not a gate |
| PLAY-10 | Installer/uninstaller + Play-only signed updater | P1.4 + P1.5 (values in §4) |
| PLAY-11 | Mixer MEDIA/MASTER | Existing tests; owner audible check |
| PLAY-12 | Stereo default; Virtual 7.1 HRTF | Existing tests; owner headphone check |
| PLAY-13 | ENG/TH UI, ENG default, persisted | Runtime screenshot review (P1.3) |
| PLAY-14 | Dashboard: recent, most played, local recommendations | genesis-tests branch; owner restart check |
| PLAY-15 | GenesisBlockDB single store | Blocked by [#46](https://github.com/Freshair129/Lalin-AI/issues/46) fix + repin (Phase 0) |
| PLAY-16 | YouTube *links* open externally only, outside the queue | genesis-tests URL-policy tests |
| PLAY-18 | USER / OFFLINE badges, favorites + filter persist | genesis-tests branch; `YOUTUBE` badge N/A (links are not tracks) |
| PLAY-25 | Off / Smooth crossfade on one output chain | Cancel/failure tests (P1.3); owner audible check |
| PLAY-26 | Manual DJ + cue-based Medley | Cancel/failure tests (P1.3); owner check |

## 3. Deferred to v1.1+ (not gates; hidden or clearly labelled in the UI)

| ID | Reason |
|---|---|
| PLAY-17 authorized-source cache | No authorized provider exists; settings UI hidden for v1.0 |
| PLAY-19 RustFS S3 + Range streaming | Local object store is enough for a single-PC release |
| PLAY-20 Genesis graph/vector hybrid search | Spec needs an embedding design note; exact/filter search ships |
| PLAY-21–23 mobile remote, phone host, phone file copy | W0-B/C contracts not accepted; needs firewall run and security sign-off |
| PLAY-24 YouTube playlist import | Needs YouTube API key, OAuth and published Terms/Privacy |
| PLAY-27 Smart Medley | Benchmark/listening evidence NOT_RUN; hidden behind a disabled flag |
| ADR-004 S4–S6 | Repository extraction deferred by owner decision |
| Studio ↔ Play full handoff parity (G3 remainder) | Mapped-drive/reparse runtime, Studio/API exit during playback, audible parity |
| `apps/lalin-play-site` | Not published; operator identity and legal text unconfirmed |

## 4. Proposed release values (runbook R0 choices — owner to confirm)

| R0 item | Proposed value |
|---|---|
| Product owner / release operator | Owner (Freshair129) / lead agent prepares, owner publishes |
| Supported platform | Windows 10 22H2+ and Windows 11, x64; WebView2 via the NSIS bootstrapper (`embedBootstrapper`) |
| Version / tag | `1.0.0` / tag `play-v1.0.0` (Studio keeps `v*` tags) |
| Channel / endpoint | Stable only. GitHub's `releases/latest` is shared with Studio's `v*` releases, so Play cannot use it. Endpoint: `https://github.com/Freshair129/Lalin-AI/releases/download/play-updates/latest-play.json` — a dedicated rolling release `play-updates` whose `latest-play.json` asset the Play release workflow replaces only after the owner publishes a `play-v*` release |
| Asset names | `Lalin-Play_1.0.0_x64-setup.exe`, `.exe.sig`, `latest-play.json`, `SHA256SUMS.txt`, `THIRD_PARTY_NOTICES.txt` |
| Updater key custody | New Play-only minisign keypair; private key in gitignored `keys/lalin-play-updater.key` on the owner PC + GitHub secret `PLAY_TAURI_SIGNING_PRIVATE_KEY`(+ password); offline backup copy chosen by owner. Never shared with Studio. |
| OS code signing | **Unsigned** for v1.0 (owner decision); SmartScreen "Unknown publisher" warning documented in the user guide and release notes |
| License / notices | Play source license: **MIT** (owner decision 2026-11-07, `apps/play-desktop/LICENSE`); third-party notices generated from Cargo + npm dependency metadata by a script in `tools/verify/`; no models or user data in the bundle |
| Privacy | Play sends no telemetry and makes network calls only for update checks and opening YouTube links in the browser; stated in the user guide and About dialog |

## 5. Exit criteria for v1.0

1. Every §2 row has automated evidence recorded in [LALIN_PLAY_TRACEABILITY.md](../validation/LALIN_PLAY_TRACEABILITY.md) or an owner check recorded in issue #47.
2. Runbook R1–R4 pass for this reduced scope: reproducible release build in CI from a clean checkout; updater A→B upgrade with two signed builds; tampered-signature rejection; install/uninstall/reinstall keeps the library under `%APPDATA%\ai.lalin.play`; clean-VM install by the owner.
3. Deferred §3 features are hidden or labelled "coming later" and cannot corrupt v1.0 data.
4. Draft release reviewed and publication approved by the owner.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 1.0.1b | 2026-11-07 | approved | Record owner license decision: Lalin Play source is MIT | working tree | Claude |
| 1.0.0b | 2026-11-07 | approved | Owner approved scope, deferrals, release values and exit criteria; license and key backup location remain open | working tree | Claude |
| 0.1.0b | 2026-11-07 | candidate | Propose reduced-scope Play v1.0 release from Lalin-AI: in-scope gates, deferrals, R0 release values and exit criteria | working tree | Claude |
