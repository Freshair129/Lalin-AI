# Lalin Play remote web feasibility spike

This package is a static, responsive Controller-shell preview for the approved
iOS Safari and Android Chrome browser profile. It is isolated from the Tauri
desktop player.

Every control changes in-memory preview state only. This spike does not pair a
phone, connect to a PC, use network APIs, store credentials, control playback,
play audio, or access the library or files. The mock screen and desktop viewport
emulation do not prove real-device browser support or establish browser version
floors.

Run locally:

```powershell
npm ci
npm run dev
npm run build
```

The dev server binds to loopback only. Do not expose this package on the LAN or
wire it to Lalin Play; browser TLS, credentials, pairing and remote commands
remain behind the W0-B/C and later implementation gates.
