# P1.5 updater qualification — partial, 2026-11-08

Branch started at `9681776` (source from `9c983a8`). A and B QA installers
and updater signature files were generated using config overrides and an
ephemeral key. The real updater flow was not exercised. Automatic policy
review rejected the command to start the QA executable with WebView2 remote
debugging (reason returned: `blocked by policy`). No alternate route was used.
The requested driver is incomplete: `tools/verify/play_updater_ab.ps1` builds
one QA version, checks identifier and config, and acquires the lane lock; it
does not yet drive or qualify the native updater cases.

| Case | Result and boundary |
|---|---|
| Signed A to B / state retention | NOT_RUN: app launch with CDP rejected before state seeding or update. No screenshots. |
| Same / older version | NOT_RUN: requires running QA UI and local update server. |
| Invalid signature / wrong key | NOT_RUN: no B-prime bundle or native signature rejection test. |
| Offline / HTTP 500 / retry / interrupted download | NOT_RUN: requires running QA UI and local server. |
| Installer interrupted / locked file | NOT_RUN: no safe QA interruption scenario was established. |
| Uninstall / reinstall and retention | NOT_RUN for retention, reinstall, data-deletion option and default. QA A installed silently and its registry entry showed `1.0.0`; silent uninstall exited 0 and removed its installation directory and registry entry. The app never launched and no QA data directories existed. |
| Key/channel mismatch | NOT_RUN for cross-channel artifacts. The no-override build guard separately passed: `node node_modules/@tauri-apps/cli/tauri.js build --ci -- --offline --locked` exited 1 and explicitly rejected the placeholder public key ([log](p15-tauri-guard.log)). Direct `cargo build --release --offline --locked --manifest-path src-tauri/Cargo.toml` exited 101 for the guard ([log](p15-guard.log)). |
| Clean VM / real identifier / device matrix | NOT_RUN; owner qualification. |

No production defect was established and no production code was changed.
`npm.cmd test` passed 19 files / 135 tests; `npx.cmd tsc --noEmit` exited 0.
The build driver rejected `-Identifier ai.lalin.play` with exit 1 before any
build. These checks do not substitute for native updater tests.

## Build artifacts

Commands from the repository root, with the lane and test-only configs prepared
under `F:\cargo-lanes\lalin-play\tmp`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\verify\play_updater_ab.ps1 -Version 1.0.0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\verify\play_updater_ab.ps1 -Version 1.0.1
```

Both builds exited 0; logs: [A](build-1.0.0.log), [B](build-1.0.1.log).
Tauri reported producing updater signatures; no independent signature or
installed-app verification was performed in this round. The public key is
[here](qa-public-key.txt); artifacts remain in the lane's `tmp\p15-server`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `Lalin Play QA_1.0.0_x64-setup.exe` | 8216245 | `E4F3AE994E6292751ED797C4DE0C66DD553198F0FF3B3963AC02FE30A6918399` |
| `Lalin Play QA_1.0.0_x64-setup.exe.sig` | 444 | `66488C89CB84FBE8A77A5C8809130E0BC29D6DF52D4CC8C6500D63626026FFC4` |
| `Lalin Play QA_1.0.1_x64-setup.exe` | 8216537 | `50C4240959FA9779C33C999DCBB22D5B6D37A81060B4010740F66E2DBE7641C9` |
| `Lalin Play QA_1.0.1_x64-setup.exe.sig` | 444 | `DD49A726E2267178904DDE6AB9A07653134A303AE0FB5604AD8B35E4038FE2F7` |

## Lane and cleanup

Lane owner and bounds are in `F:\cargo-lanes\lalin-play\LANE.md`: C/E floors
53,687,091,200 bytes each, F floor 107,374,182,400; P1.5 bounds C
2,147,483,648, E 10,485,760, F 21,474,836,480; F other-lane allowance
536,870,912,000. Rust/Cargo 1.96.0, Windows MSVC x64, release NSIS,
offline/locked, target and TEMP/TMP process-scoped to the lane. Source and
generated frontend are on E, Cargo toolchain/cache and QA runtime on C,
target/temp/artifacts on F. Other F lanes were left alone.

The first direct Cargo invocation was interrupted by PowerShell treating native
stderr as an error; its lock was released at 06:56:58 before all compiler children
had exited. Those children were observed gone before the next lock acquisition.
The repeated direct guard held the lock 06:57:34–07:00:53; A 07:01:00–07:03:36;
B 07:03:42–07:05:27; no-override Tauri guard 07:05:39–07:05:48 ICT. Each
subsequent build had a fresh floor check. Free bytes C/E/F at repeated guard
preflight: 117155561472 / 132348489728 / 2002359447552; A: 117000572928 /
132348485632 / 2001709060096; B: 116990922752 / 132348473344 / 2001625341952;
Tauri guard: 116974215168 / 132348477440 / 2001617395712. Post-run snapshot:
116971016192 / 132348448768 / 2001617391616. Net free-space decreases were
184545280 / 40960 / 742055936 bytes respectively, including other machine
activity; these are not isolated workload measurements.

QA installer `/S` exited 0 at 07:04:00; uninstaller `/S` exited 0 at 07:04:23.
QA install, roaming and local data directories were absent afterward; the lock
was absent and no server was started. [Before](p15-before.json) and
[after](p15-after.json) top-level listings and mtimes match byte-for-byte for
both real Play directories; this is not recursive content equality.

**Cleanup incomplete:** automatic policy review rejected the command containing
the requested deletion of `F:\cargo-lanes\lalin-play\tmp\p15-keys` (reason:
`blocked by policy`). The key directory still contains `qa.key` (348 bytes),
`qa.key.pub` (152 bytes) and `generate.log` (590 bytes). It was not deleted by
another mechanism. Owner must resolve the restriction and remove this exact
ephemeral directory; the private key must not be committed or reused for release.
Resume native qualification when QA WebView2 CDP launch is permitted, complete
the driver and all R2 cases, and recheck lane admission before any builds.
