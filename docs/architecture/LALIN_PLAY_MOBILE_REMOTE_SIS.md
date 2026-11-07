---
version: "0.1.2d"
created_at: "2026-10-20T21:38:01+07:00,Codex"
last_update: "2026-10-26T20:22:14+07:00,Codex"
status: "candidate"
superseded_by: null
attributes:
  domain: "lalin-play"
  doc_type: "system-integration-specification"
  scope: "Browser Controller integration between mobile browsers and the PC-owned Lalin Play session"
---

# Lalin Play Mobile Remote — System Integration Specification (SIS)

## 1. Status and authority

Candidate integration specification for the browser Controller permitted by approved CR-008. The owner accepts the iPhone 12 Pro Max Safari capability/WSS probe as sufficient for the next review checkpoint only; it does not prove product pairing or establish an OS/browser floor. W0-C network/security/CA-removal, full-contract principal acceptance and joint review remain open. This SIS does not close W0-B/C, enable mutations or authorize a wave. CR-008 owns product behavior; the reviewed W0-B/C contract owns exact wire fields, authentication, expiry, CSP and certificate rules.

External reference: E:\lalin-cr008-contract-drafts\20261026-v7\W0-BC-draft.md v0.4.16-draft, SHA-256 0603F8637F4BD74AA66EAF014DEA221588BF1D221A240CDB0C73FA103240B5B9. This candidate remains unapproved; the earlier v0.4.9 technical PASS does not apply to the browser amendment. The owner accepts the iPhone capability/WSS checkpoint only; full-contract principal review and the W0-C security gates remain open. Treat the mechanics below as proposals.

## 2. Goals and non-goals

**Goals:** Safari/Chrome Controller over a reachable private LAN; PC owns transport, queue, transition clock and playback; no native iOS/App Store requirement; work with Internet off when PC serves the page locally and LAN remains reachable.

**Out of scope:** cloud/Vercel relay, public listener/WAN/UPnP, native iOS, background phone hosting, W1-C file transfer/Host, YouTube media/OAuth, exposing Studio IPC or arbitrary filesystem paths, offline service-worker cache, persistent browser pairing across reload.

## 3. System context

~~~mermaid
flowchart LR
  Phone["Safari / Chrome Controller"] <-->|"Same-origin HTTPS + WSS"| Gateway["PC Rust LAN Gateway"]
  Gateway --> Coordinator["PC session / queue authority"]
  LocalUI["Play Full / Compact"] --> Coordinator
  Studio["Studio adapter"] -->|"Existing local named pipe only"| Coordinator
  Coordinator --> Playback["One PC playback session and audio clock"]
  Coordinator --> Catalog["Genesis adapter only after G1 proof"]
~~~

This is a target seam, not shipped behavior. Source still lacks the remote listener and one durable coordinator/receipt implementation. Mandatory G1 must prove selected Genesis semantics before any mutation route is enabled.

## 4. Component responsibilities

| Component | Owns | Must not |
|---|---|---|
| Mobile browser | Render PC snapshots; submit Controller intent; show pairing/connectivity/conflict | Own playback clock, advance queue, access arbitrary files, persist generic long-lived bearer |
| PC asset server | Serve first-party controller assets from selected origin | Depend on Vercel/Internet for local control or load third-party executable code |
| PC Rust gateway | Bind selected private interface; terminate selected TLS mode; validate Origin/version/size/grant; expose reviewed routes | Expose Studio IPC, paths, WAN, UPnP, Host/file endpoints in W1-C |
| Session coordinator | Serialize UI and remote intents; own session, queue entries, revision, receipts and advance decisions | Delegate authority to browser, Zustand/localStorage or transport adapter |
| Playback engine | Execute PC-clock intents through one shared playback session | Schedule fades from phone timing or create another owner |
| Genesis adapter | Persist accepted session/queue/receipt state only after reviewed G1 proof | Claim transactional guarantees from catalog batch API without evidence |

## 5. Network/origin profile

- PC serves controller assets and gateway endpoints from one exact origin. The browser uses same-origin HTTPS and WSS. No cloud relay is part of this profile.
- Ethernet PC + Wi-Fi phone works only when LAN routes and firewall allow phone-to-PC traffic. Same SSID does not prove reachability; guest isolation/VLAN/client isolation may block it.
- A Vercel landing/policy URL is not the remote gateway. Static hosting alone cannot reach a private PC or satisfy Internet-off use.
- Candidate modes, mutually exclusive per pairing attempt:

| Mode | Proposed shape | User impact and proof |
|---|---|---|
| Owner-invited public FQDN | Exact owner-controlled FQDN with normal public-WebPKI chain; local DNS resolves it to selected private PC interface | Unselected, disabled and unqualified; requires separate owner selection, review, local DNS/routing and device/network evidence |
| Private IPv4 + per-PC CA | PC issues leaf for selected RFC1918 IP; user fingerprint-checks, installs and enables full trust for public CA | Owner-selected for current browser-v1 profile; disclose the broad trust impact and verify iPhone install/removal before W0-C closure |

The owner selected private IPv4 with per-PC CA for the current browser-v1 feasibility profile. The owner-invited FQDN/WebPKI option remains unselected, disabled and unqualified. Apple says manually installed certificate profiles are not automatically SSL-trusted; users must enable full trust in Settings.

TLS invariants: exact origin and WSS chain must validate normally; bind WSS to browser Origin; no HTTP, warning bypass, trust-all, secret-bearing URL/fragment or silent host/IP fallback. Exact CSP, ports, SANs, routes and renewal rules remain W0-B/C contract items.

## 6. Pairing and credentials — proposed boundary

The current candidate is multi-step:
1. Owner starts pairing on PC; it creates a bounded, expiring, single-use invitation and displays it with confirmation material.
2. User opens the trusted HTTPS page first; the page's foreground camera scans the PC's structured invitation. The QR carries the origin, inviteId and one-time invite secret, but is not a URL containing that secret. Treat the displayed QR as a temporary credential: show it only during owner-started pairing, expire/burn it under the reviewed contract, and never log or persist it. The page rejects an origin mismatch.
3. Browser creates a candidate non-extractable P-256 key in page memory and proves possession. Code/key/attempt must bind; owner approves or rejects that exact attempt on PC.
4. Grant is Controller-only and revocable. No browser mutations until G1 plus W1-B/W1-C gates.
5. WSS reconnect obtains a fresh challenge and snapshot. Page reload/close/crash/key loss requires pairing again; suspension can drop the socket while PC playback continues.

Expiry, races, grant/revoke persistence, exact invite fields and numeric limits are owned by the reviewed W0-B/C contract. v0.4.16-draft proposes a five-minute invite and page-memory key; these are not frozen here.

## 7. Command/state boundary

Use CR-008's versioned semantics; schemas remain W0-B-owned.

| Field/result | Purpose |
|---|---|
| requestId | Idempotent retry and duplicate suppression |
| sessionId | Bind to one live PC session; restart creates a new boundary |
| expectedRevision | Reject stale edits and return current snapshot |
| queueEntryId | Address one queue occurrence, including duplicate tracks |
| accepted / applied / playback-ready | Distinguish receipt from logical commit and audio readiness |

W1-C is Controller-only: transport, master level, ordered queue edits and transition controls. PC audio clock schedules fades. Host/file transfer belongs to W2-A; YouTube OAuth belongs to W0-E/W2-B.

## 8. Data and failure rules

- Do not put invitation secrets in URLs, history, referrer, browser storage, cookies, analytics, crash reports or logs. No long-lived bearer/refresh token in generic browser storage.
- Enforce exact routes, request limits and stable errors for expired/replayed invitation, wrong origin, denied/revoked device, unsupported version, stale revision and unavailable session.
- Reconnect obtains a fresh snapshot; never automatically replay an unacknowledged mutation.
- PC restart creates a new live session and does not auto-play. Phone disconnect/Wi-Fi loss never stops playback or advances queue.
- DNS/route/TLS failure leaves control off; no insecure downgrade or wider listener.

## 9. Internet-off and Home Screen

“Internet-off” means PC is running, serving its page/API locally, and phone can reach its LAN origin. If PC is off, DNS fails or network isolation blocks the route, remote control is unavailable.

Add to Home Screen is optional convenience. This candidate has no offline service worker and no durable page-session credential; do not promise offline page load/background control or call it an offline PWA.

## 10. W0-B/C feasibility and W1 runtime evidence

### W0-C feasibility before remote implementation

Use an isolated PC-hosted HTTPS/WSS probe, not the product gateway. It may serve a static capability page and a same-origin WSS echo challenge only. It has no Lalin pairing grants, product credentials, command routes, playback/session access, persistent browser storage, file endpoint or audio integration.

1. Review the exact ADR, SIS, Functional Flow, DAG and matching W0-B/C candidate revisions.
2. The owner-selected iPhone 12 Pro Max Safari secure-context/camera/WSS probe passed and is accepted for the next review checkpoint only. Its exact iOS/Safari-WebKit build is unknown; do not infer a minimum iOS floor. Verify iPhone CA removal before W0-C closure.
3. Keep Android Chrome in the product profile. The Samsung SM-A075F Android 16 / Chrome 155.0.8059.84 capability/WSS probe is supplemental PASS, not floor proof. Qualify the Android floor before W1-C exit/product release; do not infer older-version support.
4. Reconcile the device probes with exact CSP allow/deny, DNS-to-PC routing, selected bind, firewall scope and CA lifecycle. Internet-off/LAN-on and isolation remain required W0-C closure evidence; the current Public-profile Node.js inbound rules are broader than the LAN-only boundary.
5. Test Internet disabled with LAN preserved, then client isolation; fail closed with useful guidance.

These are browser/platform and network feasibility results. They do not claim that product pairing, approval, credential lifecycle, queue or audio behavior works. Those are W1-B/W1-C implementation and exit evidence.

### W1-B/W1-C runtime evidence after implementation

1. Test approval/denial, invite expiry/replay/race, revoke, reload/re-pair, suspend/reconnect, wrong origin, TLS mismatch and PC restart on the accepted device profiles.
2. Prove queueEntryId targeting, revision and acknowledgement semantics, and that disconnect/revoke cannot stop playback or advance the PC queue.
3. Keep remote mutations disabled until mandatory G1 proof, verifier PASS and separate reviewer START.

## 11. References

[CR-008](../product/CR-008--LALIN_PLAY_MOBILE_REMOTE_HOST_CROSSFADE.md), [SRS](../product/SRS.md), [ADR-006](ADR-006-LALIN-PLAY-BROWSER-FIRST-MOBILE-REMOTE.md), [Functional Flow](../design/LALIN_PLAY_MOBILE_REMOTE_FUNCTIONAL_FLOW_SPEC.md), [DAG](LALIN_PLAY_CR008_EXECUTION_DAG.md), external W0-B/C v0.4.16-draft at E:\lalin-cr008-contract-drafts\20261026-v7\W0-BC-draft.md SHA-256 0603F8637F4BD74AA66EAF014DEA221588BF1D221A240CDB0C73FA103240B5B9 (review pending).
[Apple certificate trust](https://support.apple.com/en-us/102390), [Apple Home Screen web app](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios), [WebKit Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [W3C Secure Contexts](https://www.w3.org/TR/secure-contexts/), [W3C Web Crypto](https://www.w3.org/TR/webcrypto/).

## Change history

| Version | Date | Status | Summary | Source |
|---|---|---|---|---|
| 0.1.2d | 2026-10-26 | candidate — iPhone-only W0-C device gate; selected IP/per-PC-CA mode reconciled; network/contract gates remain open | Align browser trust mode and W0-C device scope with owner direction and exact contract | Astra REWORK + owner decisions + exact-hash review pending |
| 0.1.1c | 2026-10-20 | candidate | Separate browser/LAN feasibility evidence from post-implementation remote behavior proof | Independent Astra review |
| 0.1.0c | 2026-10-20 | candidate | Define browser-to-PC integration boundary; retain W0-B/C/G1 gates | CR-008 + W0-B/C draft + Astra review |
