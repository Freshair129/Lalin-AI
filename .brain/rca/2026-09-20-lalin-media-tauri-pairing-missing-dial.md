# RCA: Lalin Media Tauri shows a TV code but iPhone cannot find the PC

## Symptom

The Lalin Media window shows the official Leanback "Link with TV code" screen,
but entering the displayed code on an iPhone does not find or link the PC.

## Evidence

- The supplied screenshots show both the Leanback activation screen and the
  separate settings screen that displays a numeric TV-link code. The ephemeral
  code values are intentionally not recorded here.
- The pinned Electron/VacuumTube baseline starts `window.h5vcc`, waits for the
  Leanback device id, starts a local HTTP server, and enables DIAL discovery in
  `apps/media-desktop/src/preload/modules/h5vcc/index.js`.
- The upstream discovery implementation listens for SSDP on multicast
  `239.255.255.250:1900` and answers DIAL `M-SEARCH` requests in
  `apps/media-desktop/src/preload/modules/h5vcc/dial/discover.js`.
- The Tauri candidate currently contains only the remote WebView, User-Agent,
  window lifecycle and store boundary in
  `apps/media-tauri/src-tauri/src/lib.rs`; its injected script does not expose
  `window.h5vcc` and its Rust crate has no DIAL/network service.
- Runtime inspection while `lalin-media.exe` was responding returned no local
  UDP listener on port `1900`.
- Host follow-up evidence showed the active `Ethernet` profile was `Public`
  while the Lalin Media DIAL rules were limited to `Private`; after the
  profile was changed to `Private` and the app was relaunched, the user
  confirmed that the iPhone connected using the displayed numeric TV code.

## Root Cause

The Tauri port copied the Leanback surface and User-Agent compatibility but did
not port VacuumTube's H5VCC/DIAL device-discovery boundary. The page can render
the TV-code UI, but the PC does not advertise a DIAL device or expose the local
HTTP endpoint used by the upstream wrapper. The visual code therefore does not
prove that a discoverable/linkable TV device exists.

The `yt.be/activate` alphanumeric activation flow and the numeric "Link with TV
code" flow are also separate YouTube flows; neither should be treated as proof
that the Tauri runtime has DIAL parity.

## Why The Issue Escaped Detection

ADR-002 intentionally deferred DIAL and TV-code parity while the Tauri P0 shell
was being built. Static Rust checks, process-start smoke, and a screenshot of
the remote Leanback page do not exercise LAN multicast, local HTTP routing,
device-id persistence, or the iPhone YouTube client.

## Proposed Prevention

- Keep Electron/VacuumTube as the pairing-capable fallback until a separate
  Tauri DIAL slice passes real-device verification.
- If approved, port a minimal, least-privilege DIAL boundary: stable device-id
  lookup, bounded local HTTP routes, SSDP discovery response, and a narrow
  `window.h5vcc` WebView bridge.
- Validate on the same non-isolated Wi-Fi with the iPhone YouTube app and record
  discovery, link success, relink, restart, and failure states separately.
- Keep the active LAN profile aligned with the scoped firewall rule profile and
  relaunch the app after changing host networking or rebuilding the binary.
- Do not log or commit TV codes, QR contents, cookies, account tokens, or
  pairing/session data.

## Approved Follow-up Result

The approved bounded DIAL slice is implemented in `apps/media-tauri`:

- Rust now binds the active LAN interface on UDP `1900` with `SO_REUSEADDR`,
  serves a bounded local HTTP descriptor, persists a non-secret device identity
  in the local settings store, and forwards only `/apps/*` DIAL requests to the
  WebView.
- The initialization script exposes the upstream-shaped `window.h5vcc.dial`
  route surface and the capability file permits only the response command and
  event listener on `www.youtube.com`.
- Static/unit evidence: Rust formatting, offline check, two DIAL unit tests,
  JavaScript syntax check and Tauri debug no-bundle build pass.
- Runtime evidence: the debug process binds LAN UDP `1900`; its HTTP listener
  returns `200` for `GET /` with `Application-URL` and a DIAL XML descriptor.

The host SSDP probe did not produce a response in this environment while the
Windows `SSDPSRV` service and inbound firewall policy were active. A subsequent
host fix changed the active Ethernet profile to `Private`, relaunched the
debug app, and the user confirmed a same-Wi-Fi iPhone connection using the
numeric TV code. This is **USER-CONFIRMED LOCAL ACCEPTANCE** for the current
debug runtime; packaged, clean-VM, repeatability, relink and production
acceptance remain unverified.
