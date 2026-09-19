# RCA: Lalin Media Tauri host exits when settings persistence is denied

## Symptom

The `lalin-media.exe` debug build exited before a targetable window appeared
when launched from the restricted workspace environment.

## Evidence

- `cargo run --manifest-path apps/media-tauri/src-tauri/Cargo.toml` reached the
  Tauri event loop and then panicked with `Failed to setup app: error encountered
  during setup hook: Access is denied. (os error 5)`.
- The setup path called `seed_settings()` before `build_media_window()` and
  propagated the store `save()` error.
- The same locally built executable stayed alive when launched once outside the
  sandbox, so the failure is tied to restricted local persistence rather than a
  compile failure or a missing WebView2 runtime.
- Native GUI inspection was unavailable in this session because the Windows
  Computer Use bridge exposed no native app inventory; endpoint rendering and
  visible window behavior remain a separate runtime gate.

## Root Cause

The Tauri Store persistence path was treated as a mandatory startup dependency.
When the host denied access to the app-data path, the setup hook returned the
error and Tauri terminated the process before the media window could be shown.

## Why The Issue Escaped Detection

Static Rust checks and the no-bundle Tauri build do not execute the setup hook or
write the app-data store. The failure only appears when the built executable is
started under a restricted Windows host.

## Proposed Prevention

- Keep settings persistence best-effort: use safe defaults when the store cannot
  be opened or saved, and do not block creation of the media window.
- Keep the GUI/WebView2 smoke gate separate from static build evidence.
- Record persistence success and endpoint rendering independently before claiming
  a production-ready package.
