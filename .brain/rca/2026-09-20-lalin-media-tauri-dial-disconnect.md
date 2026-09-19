# RCA: Lalin Media loses the iPhone connection while the PC process remains open

## Symptom

The iPhone can connect to Lalin Media with the numeric TV code, but the
connection later disappears while the `lalin-media.exe` window remains open.

## Evidence

- The live process was still present and responding:
  `F:\lalin\apps\media-tauri\src-tauri\target\debug\lalin-media.exe`.
- The same process had no `UDP 1900` endpoint and no TCP listening endpoint
  when inspected during the reported failure state.
- `apps/media-tauri/src-tauri/src/lib.rs` keeps the shell running and falls
  back to `dial::disabled_state()` when DIAL startup fails; it does not surface
  the failure to the user or retry startup.
- `apps/media-tauri/src-tauri/src/dial.rs` exits `run_ssdp` or `run_http` on a
  non-timeout socket error. There is no supervisor or rebind loop.
- DIAL binds to the LAN IPv4 address selected at startup and the HTTP listener
  uses an ephemeral port. A network-interface/IP change can therefore leave
  the running shell advertising no usable DIAL endpoint.

## Root Cause

The confirmed root cause is a DIAL service lifecycle gap: the native shell can
remain alive after the DIAL sockets fail at startup or later, but the DIAL
threads do not restart and the UI has no degraded-state signal. The iPhone
therefore loses the PC endpoint even though the desktop window is still open.

The one-shot Leanback device-id sync is a secondary stability risk because the
Rust identity is updated in memory but is not persisted when the official
WebView id becomes available. It is not treated as the confirmed cause of this
incident because the live failure already proves that both network listeners
were absent.

## Why The Issue Escaped Detection

The first DIAL slice verified startup bind, a descriptor response and a
successful real-device pairing, but not listener survival after a network
change, socket error or long-running session. The shell process staying alive
made a failed DIAL runtime look like a normal open app.

## Proposed Prevention

- Add a small DIAL supervisor that reports listener failure, reselects the
  active LAN IPv4 address and rebinds UDP 1900 plus the HTTP listener with
  bounded backoff.
- Keep the service state explicit (`starting`, `ready`, `degraded`) and emit a
  recoverable status rather than silently continuing with no DIAL endpoint.
- Persist the official Leanback device id when it is first observed and avoid
  identity churn across relaunches.
- Add tests for socket-failure recovery, interface/IP changes and device-id
  persistence, followed by a Windows same-Wi-Fi reconnect test.

## Approved Follow-up Result

The approved recovery slice is implemented:

- a supervisor now retries DIAL startup, rebinds both listeners after a socket
  failure and rebinds when the selected LAN IPv4 address changes;
- the official Leanback device id is synced continuously and persisted when the
  local settings store is available;
- Rust formatting, offline check, JavaScript syntax check and three DIAL unit
  tests pass;
- the rebuilt debug runtime exposes UDP `192.168.1.100:1900`, an ephemeral TCP
  listener and a valid HTTP DIAL descriptor with `Application-URL`.

The actual physical network-drop/reconnect scenario remains a separate runtime
test; no clean-VM or production readiness claim is made.

Status: implemented locally; physical network-drop recovery test pending.
