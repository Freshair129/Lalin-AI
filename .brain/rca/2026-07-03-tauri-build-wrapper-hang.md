# RCA: Tauri build wrapper does not reliably exit after setup artifact generation

## Symptom

`scripts\build_installer.ps1` could create `frontend\src-tauri\target\release\bundle\nsis\G-Music_0.1.0_x64-setup.exe`, but the calling shell could remain blocked until the command timed out.

## Evidence

- The NSIS setup executable was generated and had a stable non-zero size.
- Process inspection showed the G-Music Tauri wrapper process tree still alive after the setup executable existed.
- A direct local Tauri CLI run showed the bundler could reach `Finished 1 bundle`, proving NSIS was no longer the size blocker for the lite profile.
- The stale updater `.sig` and `.nsis.zip` artifacts remained from an earlier build, so default local validation could not honestly claim fresh updater artifact generation.

## Root Cause

The local Windows Tauri CLI wrapper path does not reliably return control after setup executable generation in this workspace. The exact upstream hang point was not fully isolated, so the local script now treats a stable setup executable as the default validation contract and reserves strict process-exit behavior for release mode.

## Why The Issue Escaped Detection

Earlier packaging checks stopped at the NSIS size failure. Once the lite profile removed that blocker, the next issue appeared at the orchestration layer: the artifact could be produced while the wrapper process remained active.

## Proposed Prevention

- Use the local `frontend\node_modules\.bin\tauri.cmd` instead of `npx` for deterministic script execution.
- Capture Tauri stdout/stderr into `frontend\src-tauri\target\release\bundle\tauri-build.log` and `.err`.
- In default local validation mode, poll for the setup executable and require stable size before stopping the non-exiting wrapper process tree.
- In release mode, run `scripts\build_installer.ps1 -WithUpdaterArtifacts`, require the Tauri process to exit successfully, and fail if the setup executable, signature, or updater zip artifact is missing or empty.
