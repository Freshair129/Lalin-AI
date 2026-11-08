# P1.5 updater and installer qualification — 2026-11-08

Native run by the lead (Claude Opus 5.5) on the owner PC, Windows 11 Pro
10.0.26300, after Codex rounds 1–2 were blocked by Codex auto-approval policy
(WebView2 CDP launch and key deletion). The UI was driven through the Windows
UI Automation tree with `agent-desktop` 1.2.0 (WebView2 ignores
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` because Tauri sets its own browser
arguments, so CDP was not used). Nothing in the app was mocked: real NSIS
installers, real updater plugin, real Genesis store and WebView storage.

## Setup

- Source: branch `codex/lalin-play-p15-updater` @ `76fa0fa` (P0 stack fix included).
- Builds: `tools/verify/play_updater_ab.ps1 -Version 1.0.0|1.0.1` on lane
  `F:\cargo-lanes\lalin-play` (lock held 08:51:14–08:53:59 and 08:54:00–08:56:16 ICT;
  preflight free C/E/F 114,796,339,200 / 132,348,215,296 / 2,000,719,851,520 B).
  `--config` overrides only: identifier `ai.lalin.play.qa`, product `Lalin Play QA`,
  endpoint `http://127.0.0.1:39347/latest-play.json`,
  `dangerousInsecureTransportProtocol: true`, ephemeral pubkey ([public key](qa-public-key.txt)).
  Committed `tauri.conf.json` was not changed.
- PE guard on the built exe: `SizeOfStackReserve=8388608`.
- Local server: Node `http` on `127.0.0.1:39347`, manifest shape identical to
  `release-play.yml` (`version`, `notes`, `pub_date`, `platforms.windows-x86_64.{signature,url}`),
  modes ok / HTTP 500 / truncated body. Logs: [part 1](server-part1.log), [part 2](server-part2.log).

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `Lalin Play QA_1.0.0_x64-setup.exe` (A) | 8,355,469 | `496fcd27e716f64560ef23a1869884dcf74fe71e5686ada20e99b712ca223dd7` |
| `Lalin Play QA_1.0.0_x64-setup.exe.sig` | 444 | `aafa09487894b18a28f27c8c97f00e8b1d1b61041651fcdad715f19c8ad51f91` |
| `Lalin Play QA_1.0.1_x64-setup.exe` (B) | 8,356,471 | `9fb1d2ea68560b023ea53fc6d627ed17346e0ca61f091aa6559b30fd58e9aede` |
| `Lalin Play QA_1.0.1_x64-setup.exe.sig` | 444 | `780f2ea004ab07653faf34996eb14047175f9ad9642eecbe1659ee5395d2090e` |
| `tampered-1.0.2.exe` (B + 1 appended byte, B's signature) | 8,356,472 | `3a38a9cf3e8d60eed2f84538312b337270d92c648bf4e6f5460dbd691b4e7a78` |
| `wrongkey-1.0.2.exe` (B signed by a second ephemeral key) | 8,356,471 | same as B |

## Defect found and fixed: P0 stack overflow (PLAY-02 import / boot)

Pre-fix QA A (1.0.0 built from `ec704cf`): first "Import offline" of an 8 s WAV
crashed with `0xc00000fd` (Windows Application Error 1000 / WER APPCRASH) and every
relaunch crashed at boot with `thread 'main' has overflowed its stack`
([pre-fix first boot, before the import](a-launch.png)). The same exe with only the PE stack reserve patched
1 → 8 MiB booted the same data and showed 1 track ([patched](a-8mb-boot.png)).
Fix `76fa0fa`: Genesis/library/migration work on a 16 MiB worker thread, 8 MiB
main-thread reserve, release-workflow PE guard, 1 MiB-caller Rust tests.
Post-fix A installed over the crashed data boots with the track ([a2-boot](a2-boot.png))
and imports a second WAV without crashing.

## Results

| R2 case | Result | Evidence |
|---|---|---|
| Signed A → B | **PASS (restart: environment-limited)**. A 1.0.0 → Settings → Check for updates → "Version 1.0.1 is available." → Install update → B downloaded (`GET b-1.0.1.exe`), signature accepted, passive NSIS ran; uninstall registry `DisplayVersion 1.0.1`, exe `FileVersion 1.0.1`. The automatic relaunch (`/P /R` → `nsis_tauri_utils::RunAsUser` via Explorer) did not start B, because Explorer outside this agent session cannot see the session's QA install path ([explorer-dialog](explorer-dialog.png): "The specified path does not exist"); the same happens when Explorer launches the exe directly. B was then started manually. | [available](a2-update-available.png), [B boot](b-boot.png) |
| State retention | **PASS**. After A→B: 2 tracks, 1 favorite (p15-tone), 1 play, playlist "P15 QA list", EQ preset Bass Boost, status IDLE (no autoplay). Volume returned to default (volume is not a persisted setting). | [B boot](b-boot.png), [B EQ](b-eq.png) |
| Same / older version | **PASS**. Manifest 1.0.1 to installed 1.0.1 and manifest 1.0.0 to 1.0.1 → "Lalin Play is up to date.", no Install button. | [same](b-same-version.png), [older](b-older-version.png) |
| Invalid signature | **PASS**. Tampered 1.0.2 → "Could not install the update."; banner `The signature verification failed`; app keeps running at 1.0.1. | [tampered](b-tampered.png) |
| Wrong key | **PASS**. 1.0.2 signed with another key → "Could not install the update."; banner `The signature was created with a different key than the one provided`; app keeps running at 1.0.1. | [wrong key](b-wrongkey.png) |
| Offline / HTTP 500 / retry | **PASS**. HTTP 500 and server stopped → "Could not check for updates."; after recovery the retry returns "up to date". | [500](b-http500.png), [offline](b-offline.png) |
| Interrupted download | **PASS**. Server closes the connection after 1/3 of the exe → "Could not install the update."; installed version stays 1.0.1, app usable. | [cut](b-cut.png) |
| Uninstall / reinstall | **PASS**. Quit → `uninstall.exe /S` exit 0 → install dir and HKCU uninstall entry removed; `%APPDATA%\ai.lalin.play.qa` kept (16 files, 3,401,289 B) and WebView profile kept. Uninstaller "Delete app data" checkbox exists only in the interactive uninstaller and is **unchecked by default**; when ticked it removes `%APPDATA%\ai.lalin.play` and `%LOCALAPPDATA%\ai.lalin.play` (incl. managed media copies; user source files are never touched). Reinstall B → 2 tracks, favorite and playlist present; playback of p15-tone-b runs (PLAYING 0:03). | [reinstall](b-reinstall.png), [playing](b-playing.png) |
| Installer interrupted / locked file | NOT_RUN — no safe way to kill the passive installer mid-write inside this session; owner clean-VM. |
| Key/channel mismatch | PASS for the build guard: a build without overrides is refused for the placeholder pubkey ([tauri](p15-tauri-guard.log), [cargo](p15-guard.log)). Cross-product metadata is covered by the wrong-key case (another product's key is rejected). |
| Clean install / launch, real identifier, auto-relaunch after update, device/DPI matrix | NOT_RUN — owner clean-VM (P1.6). |

### Findings (non-blocking)

1. **Updater error banner is not localized.** The global error banner shows the
   plugin's raw English message (e.g. `The signature verification failed`) in addition
   to the localized status line. In TH locale this is mixed language (PLAY-13).
   Suggested fix: map updater errors to `updater.installFailed` / `updater.checkFailed`
   and do not forward the raw text to the banner.
2. **Auto-relaunch after update** could not be observed in this agent session (see A→B row).
   Must be checked on the clean VM.

## Isolation and cleanup

- Real Play data was not touched: recursive fingerprints (path + size + mtime, md5 of the
  sorted listing) before and after the whole run — `%APPDATA%\ai.lalin.play`
  `5c04610fb69b9548b584082f634ffe3d` (12 files) and `%LOCALAPPDATA%\ai.lalin.play`
  `9e5029e3bf852b4de1242b50b9d74621` (252 files), identical.
- Removed after the run: QA install (`uninstall.exe /S`), `%APPDATA%\ai.lalin.play.qa`,
  `%LOCALAPPDATA%\ai.lalin.play.qa`, `%LOCALAPPDATA%\Lalin Play QA`, lane
  `tmp\p15-keys` (both ephemeral private keys), lane `tmp\p15-stack`; server stopped
  (port 39347 closed); lane lock absent. Installers remain under lane `tmp\p15-server`
  for audit; they are signed only by the deleted ephemeral key.

## Earlier Codex rounds (superseded)

Round 1 (`9681776`) stopped on an unrelated G-Maiden Cargo job; round 2 (`ec704cf`)
built pre-fix A/B (SHA-256 `E4F3AE99…` / `50C42409…`, superseded) and recorded the
no-override guard logs kept here.
