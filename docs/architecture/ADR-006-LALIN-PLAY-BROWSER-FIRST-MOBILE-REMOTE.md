---
version: "0.1.1d"
created_at: "2026-10-20T21:38:01+07:00,Codex"
last_update: "2026-10-26T20:22:14+07:00,Codex"
status: "candidate"
superseded_by: null
attributes:
  domain: "lalin-play"
  doc_type: "architecture-decision-record"
  scope: "Browser-first distribution and LAN connection for the Lalin Play mobile controller"
---

# ADR-006 — Browser-first mobile remote for Lalin Play

## 1. Status and authority

**Candidate.** CR-008 v0.5.0b/v0.5.1b approves a responsive browser controller for iOS Safari and Android Chrome, defers native iOS, and leaves native Android Host optional. The owner accepts the iPhone 12 Pro Max Safari secure-context/camera/WSS probe as sufficient for the next review checkpoint only. Exact iOS/Safari-WebKit version and Android/iOS support floors remain unqualified; network/security, CA-removal, full-contract principal acceptance and joint W0-B/C gates remain open. This ADR proposes the rationale and integration shape; it does not close W0-B/C or start W1-B/W1-C/G1.

The product-level choice is to avoid requiring an iOS binary/App Store submission for the first controller. Browser origin, certificate lifecycle, QR onboarding and credential handling remain W0-B/C decisions.

Source context is the Lalin Play candidate on main, base 61151edf69c5d0e66acaa976c6be42ca4fb46a47. The working tree contains unrelated/in-flight changes; this document does not reset or normalize it.

## 2. Context

The phone's job is to control playback and queue state owned by Lalin Play on a PC. A native iOS release would add packaging, signing, distribution and review work even though CR-008 already selects Safari/Chrome and keeps the PC as playback authority.

A browser still needs an authenticated local HTTPS/WSS origin. It does not inherit the native client's SPKI pinning or OS key-storage contract. QR does not remove that trust requirement, and two devices on the same Wi-Fi are not necessarily allowed to reach each other.

## 3. Proposed decision

1. **Browser first:** use one responsive controller in iOS Safari and Android Chrome. No native iOS app, App Store listing, TestFlight or sideload is required for this capability. Native Android is unnecessary for W1-C; it remains optional only for a separately gated Host capability.
2. **PC-hosted LAN origin:** the PC serves the controller assets and versioned HTTPS/WSS endpoints from one reviewed origin. Vercel may host a landing/policy page, but a static Vercel page cannot by itself reach a private PC or provide Internet-off control. No cloud relay is selected.
3. **Accurate QR promise:** current W0-B/C candidate has the user open the trusted origin first, scan the PC's structured invitation through the page's foreground camera, compare code/fingerprint, then approve on PC. This is not “scan once with iPhone Camera and control immediately.” An address-only QR or one-scan variant is a separate design to review.
4. **Owner-selected IP/per-PC CA trust:** the current browser-v1 candidate uses the PC numeric private-LAN IPv4 authority with a per-PC CA. The owner selected this mode and accepted manual full-device trust and post-test removal on both phones. The owner-invited FQDN/public-WebPKI option is unselected, disabled and unqualified; it needs separate owner selection, review and evidence before use.
5. **Home Screen is optional:** Add to Home Screen is a shortcut/web-app presentation, not an App Store install, durable pairing, offline cache, background socket or background file host. The current candidate keeps the key in page memory, so reload/close/crash requires pairing again.
6. **Define Internet-off narrowly:** control can work without Internet only if PC serves the page locally and phone can resolve/reach the selected PC origin through the LAN. Guest isolation, VLAN, firewall or local DNS may block it even on the same router.

## 4. Alternatives

| Option | Disposition | Reason |
|---|---|---|
| Native iOS app | Defer | Adds store distribution that the controller does not need. Revisit for a required OS capability only. |
| Vercel page plus cloud relay | Not selected | Requires Internet and a secure relay; static hosting alone cannot reach a private PC. |
| Plain HTTP or trust-all TLS | Reject | Does not authenticate the control origin and exposes commands to network interception. |
| Per-PC root CA as default iPhone setup | Not selected as default | Manual install requires enabling full trust; the trust anchor is broader than a Lalin-only pin and cannot be removed remotely. |
| PC-hosted trusted browser controller | Proposed | One client across iOS/Android, PC remains playback owner; must pass W0-B/C. |

## 5. Consequences

**Benefits:** avoid App Store release for the remote; reuse one controller UI; keep playback/queue at PC; do not require cloud relay.

**Costs:** prove HTTPS/WSS trust, hostname/DNS, certificate renewal, firewall binding and real-device behavior. Pairing is foreground and multi-step; reload loses the page key. Same Wi-Fi is not acceptance evidence.

## 6. Security and scope

- Keep Studio-to-Play named-pipe handoff local and separate from the network gateway.
- No public listener, WAN exposure, UPnP or port forwarding by default.
- No HTTP credentials, TLS-warning bypass, trust-all behavior, long-lived bearer token in generic browser storage, or secret-bearing URL.
- Freeze invite, origin binding, key, PC approval, roles, revoke and retry semantics in the jointly reviewed W0-B/C contract before remote mutation.
- W1-C is Controller-only. Phone-file copy/stream and Host remain gated to W2-A and explicit START_W2_PHONE_FILES.
- CR-008 remains product authority. This ADR adds no requirements and grants no implementation start.

## 7. Review gates

Before accepting this ADR as the implementation decision:
1. Reconcile the exact W0-B/C v0.4.16 candidate and DAG. The earlier v0.4.9 technical review does not approve the browser amendment; full-contract principal acceptance remains open.
2. Independently review the exact ADR, SIS and Functional Flow revisions under the Lalin document review gate.
3. The owner-selected private-IP/per-PC-CA mode has an iPhone Safari secure-context/camera/WSS capability PASS. This satisfies the next review checkpoint only, not product pairing or a supported OS floor. Record exact iOS/Safari-WebKit build, verify iPhone CA removal, and complete the remaining origin/network checks before W0-C closure.
4. Keep iOS Safari and Android Chrome in the product profile. The iPhone test build is unrecorded and Android 16/Chrome 155 is supplemental; claim no minimum floor from either. Qualify both floors before W1-C exit/product release. Internet-off/LAN-on, firewall/interface scope and isolation remain W0-C closure evidence.
5. Preserve W0-B/C principal closure and separate verifier/reviewer START gates for W1-B, W1-C and G1.

## 8. References

- [CR-008](../product/CR-008--LALIN_PLAY_MOBILE_REMOTE_HOST_CROSSFADE.md), [SRS PLAY-21..27](../product/SRS.md), [execution DAG](LALIN_PLAY_CR008_EXECUTION_DAG.md).
- [System Integration Specification](LALIN_PLAY_MOBILE_REMOTE_SIS.md); [Functional Flow Specification](../design/LALIN_PLAY_MOBILE_REMOTE_FUNCTIONAL_FLOW_SPEC.md).
- External W0-B/C candidate: E:\lalin-cr008-contract-drafts\20261026-v7\W0-BC-draft.md v0.4.16-draft, SHA-256 0603F8637F4BD74AA66EAF014DEA221588BF1D221A240CDB0C73FA103240B5B9. Exact-hash review and principal acceptance remain pending.
- [Apple: add website to iPhone Home Screen](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios); [Apple: manually installed certificate trust](https://support.apple.com/en-us/102390); [WebKit: Safari 26 web apps](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/); [W3C Secure Contexts](https://www.w3.org/TR/secure-contexts/).

## Change history

| Version | Date | Status | Summary | Source |
|---|---|---|---|---|
| 0.1.1d | 2026-10-26 | candidate — iPhone-only W0-C device gate; selected IP/per-PC-CA mode reconciled; security/contract gates remain open | Align origin decision and device-test scope with owner direction and exact W0-B/C amendment | Astra REWORK + owner decisions + exact-hash review pending |
| 0.1.0c | 2026-10-20 | candidate | Propose browser-first distribution and PC-hosted LAN origin; retain W0-B/C and device evidence gates | Approved CR-008 direction + Astra review |
