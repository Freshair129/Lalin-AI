# Lalin Media — Rust + Tauri v2 candidate

This candidate ports the native shell boundary of the pinned VacuumTube fork to
Rust + Tauri v2. It loads the upstream Leanback surface at
`https://www.youtube.com/tv` in a remote WebView and keeps the Electron fork in
`apps/media-desktop` as the behavior reference and fallback.

Current scope:

- native Tauri window and lifecycle;
- upstream-derived Leanback User-Agent;
- single-instance focus;
- fullscreen, keep-on-top, reload and quit native menu actions;
- best-effort shell-setting persistence through the Tauri Store plugin;
- supervised Rust DIAL SSDP discovery on the LAN plus a bounded HTTP device
  descriptor that rebinds after listener/IP failure;
- narrow `window.h5vcc` DIAL route bridge for the official YouTube WebView.
- continuous Leanback device-id sync with best-effort persistence.

If the local settings store is unavailable, the shell uses safe defaults and
still opens; the failure is not allowed to block the media window.

Current evidence: local debug runtime binds the DIAL SSDP port, returns the
device descriptor with an `Application-URL` header and passes the DIAL unit
tests. Same-Wi-Fi iPhone TV-code connection is user-confirmed for the current
debug runtime; network-drop recovery, WebView2 ad filtering, SponsorBlock
parity, controller parity, production packaging and account acceptance remain
separate gates.

Static check:

```powershell
cargo check --manifest-path apps/media-tauri/src-tauri/Cargo.toml
cargo fmt --manifest-path apps/media-tauri/src-tauri/Cargo.toml -- --check
```

The GUI/WebView2 smoke test is a separate Windows runtime gate. Do not remove
the Electron fallback until that gate passes.
