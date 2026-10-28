# Lalin Studio Cross-Platform Feasibility Audit

**Audit date:** 2026-10-28
**Source revision:** `8807990b5dd29869e817ebf5ed391d735211c7b2` (`origin/main`)
**Scope:** Lalin Studio desktop shell, bundled API sidecar, release packaging, and Studio-owned Play/Cast integrations.

## Decision

Do not describe macOS or Linux support as available or near-ready. The repository has a few portability footholds, but its configured CI, release, sidecar, installer, and native integration paths are Windows-specific. No macOS/Linux build, installation, or runtime evidence was collected for this audit.

Slice C1's source audit and packaging delta are complete. Product target choices, implementation, target-specific CI, and native acceptance remain open. PRD v0.3.0 continues to list macOS/Linux as future work.

## Scope and method

This is a read-only source/configuration audit of the revision above. It reviewed checked-in GitHub workflows, Tauri packaging, sidecar and setup scripts, Rust platform guards, backend dependency manifests, and the PRD/backlog. No non-Windows build, test, installer, or UAT was run. The findings describe the configured paths and explicit source behavior; they do not prove that the Tauri app or all dependencies fail to compile on another target.

## Findings

| ID | Finding | Repository evidence | Consequence |
|---|---|---|---|
| C1-01 | Pull-request verification and tagged release jobs run on Windows only. The release job is named `build-windows`. | `.github/workflows/pull-request.yml:19-24`; `.github/workflows/release.yml:8-12` | Existing hosted CI/release results do not establish macOS or Linux buildability. |
| C1-02 | The Tauri bundle is configured for NSIS, includes a Windows installer icon/language configuration, and sets a Windows updater install mode. It also bundles an external backend and `_internal/` resources. | `apps/desktop/src-tauri/tauri.conf.json:37-63,66-73` | Each target needs a matching backend artifact/resource layout and a defined installer/updater path. The configured updater feed points at `Freshair129/G-Music`; confirm its ownership and release contract before adding targets (`:66-73`). |
| C1-03 | The sidecar builder uses Windows virtual-environment paths, expects a `.exe`, invokes PowerShell/Windows process APIs, and its smoke probe uses `curl.exe` and `NUL`. | `tools/build/build_sidecar.ps1:10-20,115-127,152-183` | There is no checked-in macOS/Linux sidecar build path. Target-specific output naming, Python environment handling, resource staging, and smoke execution need implementation. |
| C1-04 | The installer script selects an `nsis` output directory and names an x64 `.exe` setup artifact. The developer setup script is explicitly Windows-specific and installs CUDA 12.1 PyTorch. | `tools/build/build_installer.ps1:9-17,37`; `tools/dev/setup_windows.ps1:1-5,52-75` | The current installer and full-ML setup are not a cross-platform packaging contract. CPU/GPU and optional-model support must be decided per target. |
| C1-05 | Windows-only Rust dependencies are target-gated, but the Play handoff has non-Windows stubs that return “Native Play handoff รองรับเฉพาะ Windows”. Cast's default fallback executable is `lalin-cast.exe`; an environment override is available. | `apps/desktop/src-tauri/Cargo.toml:24-31`; `apps/desktop/src-tauri/src/playback_handoff.rs:1056-1070`; `apps/desktop/src-tauri/src/lib.rs:69-95` | The dependency guard is a useful portability seam, not proof of a non-Windows build. Play needs a replacement IPC contract or an explicit unsupported boundary; Cast needs a target-aware executable distribution and launch contract. |
| C1-06 | The ffmpeg helper uses `imageio-ffmpeg` and selects the `ffprobe` suffix by OS. The Linux lockfiles explicitly describe voice-worker runtimes/images, not a complete Studio desktop/API environment. | `apps/api/app/utils/ffmpeg.py:12-49`; `apps/api/requirements-tts-linux-gpu.lock.txt:1-8`; `apps/api/requirements-voice-worker-linux-cpu.lock.txt:1-7` | These are portability footholds for selected components only. They do not supply a pinned, validated macOS/Linux Studio sidecar or desktop package. |

## Packaging delta

| Target | Checked-in baseline | Delta before support can be claimed |
|---|---|---|
| Windows | x64 NSIS setup path, Windows PR/release runners, Windows sidecar build and setup scripts. | Keep as the current compatibility baseline; confirm the updater feed/repository ownership as part of release governance. |
| macOS | No macOS CI/release job, backend build recipe, bundle target, signing/update contract, or native acceptance evidence identified in this audit. | Select supported CPU architectures and minimum OS; define app distribution, signing/notarization, updater artifacts, target-specific Python/ML dependency profile, sidecar/resource layout, and the Play/Cast feature boundary. Add a native build/install/runtime lane. |
| Linux | Linux voice-worker lockfiles exist, but no full Studio desktop/API package or Studio release/CI lane was identified. | Select supported architectures, distribution baseline and package/update format; define runtime prerequisites, Python/ML dependency profile, sidecar/resource layout, and the Play/Cast feature boundary. Add a native build/install/runtime lane. |

Shared decisions for both targets:

1. Define whether the promise is Studio core only or parity that includes Play and Cast. If integrations are included, design and own non-Windows IPC/distribution; if excluded, define clear product behavior for those features.
2. Choose target OS versions and CPU architectures. GPU/model support is a separate capability decision from desktop-shell support.
3. Define reproducible sidecar builds, bundled resources, installer/update artifacts, release signing, and ownership of updater endpoints.
4. Add target-specific CI and native clean-install acceptance for launch, backend health, core audio workflows, upgrade, and uninstall. Windows-only CI and the Linux voice-worker container are not substitutes for this evidence.

## Readiness gates

Do not change the PRD support claim to “supported” or “near-ready” until each selected target has:

- an approved OS/architecture/feature matrix;
- reproducible desktop and backend artifacts with target-specific dependency locks and packaging;
- CI that builds the selected target and publishes inspectable artifacts;
- native clean-install and upgrade evidence for the Studio workflows included in the support promise; and
- an explicit tested/unsupported status for Play and Cast integration behavior.

## Backlog disposition

Record Slice C1 as **source audit and packaging delta complete; platform selection, implementation, CI, and native UAT remain open**. Keep PRD v0.3.0's macOS/Linux item as future work. This audit does not close the separate Music Slice B2 licensed-vocal A/B acceptance gate.
