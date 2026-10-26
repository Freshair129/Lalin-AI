---
version: "0.1.2d"
created_at: "2026-10-20T21:38:01+07:00,Codex"
last_update: "2026-10-26T20:22:14+07:00,Codex"
status: "candidate"
superseded_by: null
attributes:
  domain: "lalin-play"
  doc_type: "functional-flow-specification"
  scope: "Owner and mobile-browser pairing/control flows over a private LAN"
---

# Lalin Play Mobile Remote — Functional Flow Specification

## 1. Status

Candidate UX/functional flow for the browser Controller approved in CR-008. The owner accepts the iPhone 12 Pro Max Safari secure-context/camera/WSS probe as sufficient for the next review checkpoint only. The probe does not establish iOS floor support, product pairing, or playback acceptance. Not a UI implementation, final pairing contract, or authority to start W1-B/W1-C. System boundary: [SIS](../architecture/LALIN_PLAY_MOBILE_REMOTE_SIS.md). Decision rationale: [ADR-006](../architecture/ADR-006-LALIN-PLAY-BROWSER-FIRST-MOBILE-REMOTE.md).

## 2. User promise and limits

**Promise:** control Lalin Play on the PC from the phone browser without installing an iOS app or submitting a native iOS client to App Store.

Show these limits:
- PC must be running and reachable over the private LAN.
- The exact HTTPS/WSS origin must be trusted. Never offer HTTP or certificate-warning bypass.
- PC owns playback and queue advancement; closing the phone page does not stop music.
- Pairing is foreground and multi-step: open trusted page, scan PC invitation using the page camera, compare confirmation code/fingerprint, approve on PC. This is not a one-scan system-Camera flow.
- Current page-memory key is lost on reload/close/crash; pairing is required again.
- Internet-off requires PC-hosted page and reachable LAN. Same Wi-Fi name alone is insufficient.
- Add to Home Screen is optional; it is not App Store install, durable pairing, offline cache or background-host guarantee.

## 3. Actors

| Actor/surface | Function |
|---|---|
| PC owner | Starts/stops pairing, displays invite/code, approves/rejects exact attempt, revokes device, sees status |
| Phone browser | Opens trusted origin, scans invite in-page, confirms code, submits Controller commands |
| PC Play session | Owns queue, current track, transport, clock, output and transitions |
| Home Screen shortcut | Reopens the same origin; does not change auth or network requirements |

## 4. Flow A — first pairing (candidate)

Exact steps must be checked against the final W0-B/C contract before freezing.

**On PC**
1. Owner opens Settings → Mobile Remote. Remote is Off until owner action.
2. For this browser-v1 candidate, the selected origin is the PC private IPv4 address with per-PC CA. Explain fingerprint verification, full-device trust and manual removal; do not offer automatic FQDN/IP fallback. The owner-invited FQDN mode requires separate selection and review.
3. Show exact HTTPS origin and identity/fingerprint. Owner creates an invitation.
4. Show a structured invitation QR and matching confirmation material; wait for owner approval of the exact attempt.
5. Owner approves or rejects. Expiry/rejection grants no partial access.

**On phone**
1. User opens the exact HTTPS origin in Safari/Chrome without certificate warning. Complete any separately reviewed CA trust setup first if that mode was chosen.
2. Tap Pair with PC and grant camera access to the page for this foreground scan, or use only a reviewed manual fallback.
3. Scan the PC's structured invitation. Submit only to that origin; do not put invitation data in URL, fragment, history or referrer.
4. Compare the page's confirmation code/key fingerprint with the PC display.
5. Wait for PC approval; controls stay disabled.
6. On approval, receive Controller access and load the current PC snapshot.

**QR limitation:** the current contract candidate expects the trusted page to be open before scanning the PC invite. The PC QR carries a one-time invitation secret as structured data, so treat the displayed QR as a temporary credential; it is not a URL containing the secret. A system Camera scan that directly opens and pairs in one scan is not current behavior. An address-only QR may reduce typing but is a separate UX/security variant to review.

## 5. Flow B — control

1. Render the latest PC snapshot.
2. User sends Play/Pause, next/previous, seek, master level, ordered queue edits or transition settings. Disable controls while unpaired/disconnected/revoked.
3. Queue mutations target one queueEntryId and carry requestId, sessionId and expectedRevision from the reviewed protocol.
4. Show Sending, Accepted, Applied, Playback ready and Needs refresh separately.
5. On revision conflict, show latest state and ask before retry; do not overwrite or replay automatically.
6. PC audio clock schedules playback/fades; phone displays sampled state and sends intent only.

## 6. Flow C — interruption, reload and revoke

- **Brief suspension/Wi-Fi loss:** show Reconnecting; PC playback continues. If the page key/grant remain valid, perform fresh challenge and fetch snapshot. Do not replay uncertain mutation.
- **Reload/close/crash/key loss:** return to unpaired state and repeat Flow A.
- **PC restart:** create a new live session; do not auto-play because phone returns; fetch a fresh snapshot after authorization.
- **Revoke:** owner revokes exact key on PC; PC closes socket and denies later commands; phone clears page-memory credential and must pair again. Revoking an IP-mode grant does not remove the CA profile from the phone.
- **Wrong origin/TLS failure/expired invitation:** stop and show safe recovery; no downgrade.

## 7. Flow D — Internet off, LAN available

1. PC remains running and serves page/gateway locally.
2. Internet is disabled but the selected PC interface and phone-to-PC route remain.
3. Phone opens/pairs or reconnects under the current page-key lifetime.
4. If DNS, firewall or client isolation blocks access, show “PC not reachable on this network” and checks. Do not switch to Vercel, HTTP, WAN listener or another origin.
5. PC playback continues even without phone control.

## 8. Flow E — optional Home Screen shortcut

User may choose Safari Share → Add to Home Screen. The shortcut reopens the same origin; it does not bypass trust, pairing, key lifetime, foreground limits or LAN reachability. No offline page loading/background control is promised in the initial profile.

## 9. Required UI states

| State | Behavior |
|---|---|
| Remote Off | No listener/grant; page cannot control |
| Waiting for trusted origin | Show exact address/setup; never request credentials over HTTP |
| Waiting for invite scan | Foreground camera; manual fallback only if reviewed |
| Awaiting PC approval | Show code/fingerprint; controls disabled |
| Connected | Show PC identity, freshness, current state and Controller-only actions |
| Reconnecting | Preserve PC playback; show last update and retry status |
| Revision conflict | Show latest snapshot; ask before reapplying intent |
| Revoked/expired/wrong origin | Clear page-session credential; safe re-pair/owner action |
| LAN unreachable | Explain same SSID is insufficient; check isolation/VLAN/route/firewall |
| TLS failure | Stop and show trust/renewal help; no bypass |

## 10. Acceptance gates

### 10.1 W0-C browser feasibility — before W1-B/W1-C implementation

Use a disposable, isolated HTTPS/WSS feasibility harness hosted by the PC. It proves browser transport and LAN deployment only; it does not implement or simulate the Lalin pairing protocol.

- The owner-provided iPhone 12 Pro Max Safari secure-context/camera/WSS pass satisfies the next review checkpoint only. The exact iOS/Safari-WebKit build is unknown, so no iOS minimum floor is established; verify iPhone CA removal before W0-C closure.
- Confirm the page is a secure context, the in-page camera API can request permission, and a same-origin WSS probe succeeds under the proposed Content Security Policy.
- Android Chrome remains in the product profile. The supplemental Samsung SM-A075F Android 16 / Chrome 155.0.8059.84 probe passed capability/WSS, but does not establish the Android floor. Qualify the Android floor before W1-C exit/product release.
- Exercise the selected private interface, DNS/origin mapping, firewall and certificate renewal/revocation path. With Internet disabled and LAN preserved, the test page and WSS probe remain reachable; a client-isolated network fails closed with useful diagnostics.
- Do not treat this harness as proof of product pairing, PC approval, credential lifecycle, queue behavior or audio behavior. It has no invite/grant, persistent storage, product gateway, playback/session access, remote command or file endpoint.
- No HTTP downgrade, trust-all mode, WAN listener, UPnP or port forwarding is permitted.

### 10.2 W1-B/W1-C runtime acceptance — after implementation

- Complete the implemented pairing, PC approval and controller flow on the same real-device/browser profiles used for W0-C feasibility.
- Wrong origin, untrusted certificate or altered host cannot pair; reject, expiry and replay leave no grant; revoke prevents later commands and clears the page-session credential.
- Reload requires re-pair; reconnect fetches a fresh snapshot and never duplicates an uncertain queue mutation.
- Verify queueEntryId targeting, revision conflict handling and separate Accepted/Applied/Playback-ready states.
- Phone disconnect, reload or revoke does not stop playback, advance the queue or change the PC audio clock.
- Internet-off/LAN-on and network-isolation behavior remain as proven in W0-C. Host/file transfer, YouTube media, App Store publication and background behavior remain outside this flow.

The [execution DAG](../architecture/LALIN_PLAY_CR008_EXECUTION_DAG.md) defines the separate reviewer START and wave-close gates. W0-C feasibility is not W1 implementation acceptance, and neither gate alone closes W0-B/C or authorizes G1.

## 11. References

[CR-008](../product/CR-008--LALIN_PLAY_MOBILE_REMOTE_HOST_CROSSFADE.md), [SIS](../architecture/LALIN_PLAY_MOBILE_REMOTE_SIS.md), [ADR-006](../architecture/ADR-006-LALIN-PLAY-BROWSER-FIRST-MOBILE-REMOTE.md), [DAG](../architecture/LALIN_PLAY_CR008_EXECUTION_DAG.md).
[Apple: add website to iPhone Home Screen](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios), [Apple certificate trust](https://support.apple.com/en-us/102390).

## Change history

| Version | Date | Status | Summary | Source |
|---|---|---|---|---|
| 0.1.2d | 2026-10-26 | candidate — selected IP/per-PC-CA mode and iPhone-only W0-C device gate reconciled; security and wave gates remain open | Align origin setup and device-test scope with owner direction and exact contract | Astra REWORK + owner decisions + exact-hash review pending |
| 0.1.1c | 2026-10-20 | candidate | Separate pre-implementation browser transport feasibility from post-implementation pairing and queue acceptance | Independent Astra review |
| 0.1.0c | 2026-10-20 | candidate | Specify first-pair, control, reconnect, revoke and LAN-offline flows; keep one-scan QR unresolved | CR-008 + W0-B/C candidate + Astra review |
