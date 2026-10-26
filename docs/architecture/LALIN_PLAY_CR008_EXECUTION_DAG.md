---
version: "0.1.81b"
created_at: "2026-10-20T00:00:00+07:00,Codex"
last_update: "2026-10-26T20:24:48+07:00,Codex"
status: "candidate"
superseded_by: null
attributes:
  domain: "lalin-play"
  doc_type: "execution-plan"
  scope: "Approved CR-008 delivery waves, dependency gates, parallel ownership, verification and independent review decisions"
---

# CR-008 execution DAG — implementation waves and review gates

## Purpose and authority

This plan decomposes approved [CR-008](../product/CR-008--LALIN_PLAY_MOBILE_REMOTE_HOST_CROSSFADE.md)
into independently owned implementation waves. CR-008 and PRD §4.9 remain the
product authority. This plan controls sequencing and evidence; it does not add
product scope or authorize YouTube media playback/download, WAN exposure,
UPnP, automatic tethering, or sample-accurate mixing.

PC remains the only playback-session and queue authority. The new LAN gateway
must be a separate native-owned interface. Keep
[handoff.rs](../../apps/play-desktop/src-tauri/src/handoff.rs) as the existing
same-session Studio-to-Play named-pipe contract; never expose it as a network
API or widen its path permissions.

## Current implementation and readiness snapshot — 2026-10-20

The status below comes from the current Play traceability matrix and the
approved CR-008 implementation note. It is a planning baseline, not a fresh
test run.

| Requirement | Current evidence | Readiness gap |
|---|---|---|
| PLAY-21 pairing/gateway | No mobile companion or LAN gateway is registered in the current traceability. | Pairing, TLS trust, PC approval, role enforcement, revocation and LAN-only exposure. |
| PLAY-22 remote commands | Local queue occurrence IDs and revisions are implemented; the desktop build passed. | Versioned remote contract, idempotent requests, stale-revision snapshot, reconnect and remote acceptance. |
| PLAY-23 phone media | No phone transfer is implemented. | Resumable copy, whole-file hash verification, safe publication and offline-after-disconnect; depends on the PLAY-19 storage seam. |
| PLAY-24 YouTube references | Current saved links open externally; playlist ingestion is not implemented. | Official API pagination/auth/quota/retention, distinct playlist items and explicit local-track mapping. |
| PLAY-25 Smooth | Dual audio decks, one shared graph, equal-power scheduling, Off default and one commit point exist; build passed. | Transition-specific automated tests, readiness/failure/end behavior and native audible/output evidence. |
| PLAY-26 Manual DJ/Medley | A/B controls, cue points, pause and cancellation behavior exist in source. | Automated failure/cancel tests, per-deck audible listen accounting and native listening evidence. |
| PLAY-27 Smart Medley | Deferred. | Confidence-bound local analysis, fallback behavior, resource profile and listening/artifact evidence. |

The W0-A source baseline was pinned before worker dispatch at E:\lalin, branch main, base SHA 61151edf69c5d0e66acaa976c6be42ca4fb46a47, source digest a4425e59043a6bd0814c5873db0c1456ded42e9b01a34f8b6adbe4675ed23f7a, 51 manifest entries and manifest checksum b6612d546aaacd4b0faabdb5064e33770ea8d11e70d7e2090306f99918afe899.
An earlier read-only audit at 30911f98e12d535133e77dbe3c3bd42ed6ee9864 was not used as the implementation baseline. The pinned snapshot is authoritative; the mutable DAG itself is excluded to avoid self-reference.

## Dependency graph

~~~mermaid
flowchart TD
  B0["W0-A: Pin reproducible source snapshot"]
  B1["W0-B/C: Freeze browser/native client profiles, protocol and security contract"]
  B2["W0-D: Freeze PLAY-19 media-store seam"]
  B3["W0-E: Freeze YouTube metadata/auth policy"]
  B4["W0-F: Freeze Smart Medley acceptance contract"]
  V0D{"Verify + review: PLAY-19 seam contract ready?"}
  V0E{"Verify + review: YouTube reference contract ready?"}
  V0A{"Verify + review: audio lane may start?"}
  V0B{"Verify + review: remote lanes may start?"}
  V0F{"Verify + review: Smart Medley contract ready?"}
  A["W1-A: Transition automated coverage and listen accounting"]
  G1["Mandatory W1-B-L0/G1: Genesis coordinator + durable commit proof"]
  P["W1-B: PC LAN gateway and pairing"]
  M["W1-C: Browser remote clients; optional native Android Host"]
  D19["W1-D: PLAY-19 local object store and finalizer"]
  VS{"Verify + review: local object store/finalizer ready?"}
  VA{"Verify W1-A; reviewer decides audio successor"}
  VP{"Verify W1-B/C; reviewer decides remote successors"}
  F["W2-A: Phone copy/stream, sender and receiver"]
  Y["W2-B: YouTube playlist references and local mapping"]
  S["W2-C: Smart Medley analysis"]
  V2{"Verify W2 evidence; reviewer decides integration"}
  I["W3: Integrated native acceptance and CR-008 closeout"]
  B0 --> V0A --> A
  B0 --> B1 --> V0B
  V0B -. "mandatory; requires separate reviewer START" .-> G1
  V0B --> P
  V0B --> M
  G1 -. "after verifier PASS + principal review" .-> VP
  B0 --> B2 --> V0D --> D19 --> VS --> F
  B0 --> D19
  B0 --> B3 --> V0E
  B0 --> B4 --> V0F --> S
  A --> VA --> S
  P --> VP
  M --> VP
  VP --> F
  VP --> Y
  V0E --> Y
  F --> V2
  Y --> V2
  S --> V2
  V2 --> I
~~~

A wave may start only when its own entry gate is cleared. W1-A does not depend
on mobile framework selection, but still requires W0-A's exact source snapshot.
W1-B and W1-C require the frozen protocol/security contract for the approved
browser/native client profiles. The mandatory, principal-approved W1-B-L0/G1
gate requires W0-A, joint W0-B/C closure for those exact profiles, accepted
VG-0 evidence, and its own reviewer START before proving the actual
Genesis/coordinator durability path. Approval of G1 as a gate is not a start or
mutation capability. Until its entry conditions and separate START pass, no
W1-B/C START is issued, and remote mutations, persistent mobile enrollment and
rotation remain disabled.
W2-A additionally
requires the PLAY-19 object-store interface and local adapter needed to publish
verified phone copies, the frozen W0-D contract, W1-D closure, and explicit
reviewer `START_W2_PHONE_FILES` after the PLAY-23 entry review. W1-C remains
Controller-only; no Host grant, file-transfer endpoint, sender/receiver, or
stream implementation may start in that lane. The RustFS adapter is tracked
under CR-007; it is not a substitute for that local object-store contract and
is not required to test a local-only copy path. If authenticated range streaming
is included, its storage provider capability must be verified before the stream
lane starts.

## W0 — readiness and shared contracts

W0 is serial where its decisions affect multiple agents. Its outputs are versioned
contracts and a reproducible source snapshot, not parallel feature code.

| Node | Owner | Deliverable | Entry/exit condition |
|---|---|---|---|
| W0-A — source snapshot | Integrator | Pin the Git base SHA and create a content-verifiable snapshot of every in-scope approved tracked change and untracked file. Hash sorted UTF-8 path-byte records encoded as `<path><TAB><bytes><TAB><lowercase SHA-256><LF>`; `snapshot.sha256` separately hashes the exact manifest bytes. Record deletions and path ownership; keep unrelated dirty paths separately inventoried and untouched. Give every worker the same snapshot artifact. | Exit after two independent digest calculations match, every included file matches its byte length and SHA-256 in the snapshot overlay and verification checkout, and the manifest checksum matches. Each worker must confirm the full base SHA, changed-path manifest and digest in its lane-specific pre-write gate, after `START_WAVE` and before editing; worker confirmation is not a prerequisite for closing W0-A. |
| W0-B — remote contract | Architecture owner | Freeze requestId/sessionId/revision/queueEntryId and acknowledgement semantics for the native profile and selected browser profile. Reconcile [ADR-006](ADR-006-LALIN-PLAY-BROWSER-FIRST-MOBILE-REMOTE.md), [SIS](LALIN_PLAY_MOBILE_REMOTE_SIS.md) and [Functional Flow](../design/LALIN_PLAY_MOBILE_REMOTE_FUNCTIONAL_FLOW_SPEC.md) with exact W0-B/C contract v0.4.16-draft. Preserve invite, origin, idempotency, revoke and receipt guarantees. | Exit only after every selected client profile implements one versioned, independently reviewed contract with the principal decision pinned. |
| W0-C — platform/security | Architecture owner + security reviewer | Keep the approved split: iOS Safari and Android Chrome Controller; native iOS deferred; native Android Host optional. Reconcile the exact browser TLS identity and credential profile. Review the two-stage onboarding (open trusted origin, then scan the PC structured invite in-page, compare code/fingerprint, approve on PC); do not promise one-scan Camera pairing. Treat the QR as a short-lived invitation carrier, never put its secret in a URL. Evaluate owner-FQDN/public-WebPKI against private IPv4/per-PC CA, including the manual full-trust impact of IP mode. Use the bounded W0-C browser transport feasibility sublane below for pre-implementation device/network evidence; reserve product pairing, credential lifecycle and queue behavior for W1 exit acceptance. | Exit only after independent contract/principal review, exact iPhone HTTPS/WSS feasibility evidence, local DNS/interface/firewall checks, and Internet-off/LAN-on plus isolation tests. The owner accepts the iPhone probe as sufficient device evidence for the next review gate. Android Chrome remains in the product profile; qualify its supported floor at W1-C/product-release acceptance and do not infer it from the supplemental Android 16/Chrome 155 test. No HTTP, trust-all, generic persistent bearer, WAN, UPnP, Host grant or direct WebView network access. Re-review jointly with W0-B; no W1-B/C or G1 start without their separate gates. |
| W0-D — media-store/transfer contract | Architecture owner + CR-007 storage owner | Freeze resumable transfer manifest/chunk/hash/finalize semantics and the interface boundary for PLAY-19. | Contract review confirms `PublicationCommitReceiptV1` and its complete-set visibility predicate keep partial objects/Genesis rows unreadable. W1-D/VG-1 owns implementation and failure-injection/recovery proof before W1-D closes/W2-A starts; do not assume cross-store atomicity. |
| W0-E — YouTube metadata/auth contract | YouTube lane owner | Freeze playlist item schema, official API authorization, quota/error handling and metadata expiry/deletion policy for the selected client profile. Specify public API-key provisioning and browser-compatible OAuth/PKCE plus token handling for Safari/Chrome, or explicitly limit OAuth to a selected native profile; do not assume browser OS secure storage. | Exit only when references remain non-playable external items until explicit user mapping, client-specific credential handling is reviewed, and no secret enters source control. |
| W0-F — Smart Medley acceptance contract | Architecture owner + analysis lane owner | Freeze confidence thresholds, required local analysis outputs, fallback behavior, CPU/memory/latency budgets on the minimum supported PC, and test/listening evidence. | Exit only after the verifier confirms measurable thresholds and the independent reviewer approves the acceptance contract; W2-C still waits for W1-A closure. |

### Bounded sublane proposal — W0-C-BROWSER-TRANSPORT-FEASIBILITY

**State: IMPLEMENTED — exact-source/static verification PASS; host HTTPS/WSS and iPhone Safari plus Android Chrome capability/WSS probes PASS as of 2026-10-26. The owner accepts iPhone Safari evidence for the next review gate; remaining network/security evidence is open; sublane remains OPEN.** This new sublane is separate from the already-closed inert static-shell spike and does not reopen or extend that spike's scope.

- **Owner and write scope:** one browser-feasibility worker owns only the new `apps/play-remote-tls-feasibility/**` package. The package is standalone and must not import the Play desktop app or Tauri. The integrator owns no shared Cargo/Tauri registration because none is allowed in this lane.
- **Allowed behavior:** host one static capability page and one same-origin WSS echo/challenge endpoint on an explicitly selected RFC1918 private LAN interface. The operator explicitly selects either an IP origin with exactly one matching IP SAN or an owner-controlled public FQDN with exactly one matching DNS SAN; internal names, wildcard/multi-SAN certificates and implicit fallback are rejected. The operator supplies certificate/key paths outside the repository. The harness reports secure-context, camera API/permission and WSS probe results; it neither proves hostname ownership/public-WebPKI trust nor selects, issues or installs a certificate/CA.
- **Hard limits:** no Lalin pairing protocol, invite/grant, credential persistence, cookies/local storage/IndexedDB, product gateway, command or mutation route, Genesis access, playback/session/queue/audio access, phone files, external telemetry, WAN listener, wildcard bind, HTTP fallback, trust-all mode or certificate-warning bypass. No private key/certificate is committed. Generated reports must omit secrets and full request payloads.
- **Entry:** SATISFIED — Astra issued `START_WAVE` for this exact sublane against DAG v0.1.67b SHA-256 `66EAE0155FB246809769D42E41CBAA26BAE2CCA58EFD1D11E4E913C9FC3B55E7`. Before the first write, the worker confirmed the lane-specific input manifest with W0-A base SHA `61151edf69c5d0e66acaa976c6be42ca4fb46a47`, snapshot digest `a4425e59043a6bd0814c5873db0c1456ded42e9b01a34f8b6adbe4675ed23f7a`, exact CR-008/ADR/SIS/Flow/DAG hashes, and a clear owned package path; see `E:\lalin-cr008-snapshots\20261020-w0c-browser-transport-feasibility\prewrite-manifest.json` SHA-256 `7bea4949e33b4b71772a04e6da53ddedc8db0a9cfaed385e0fe14ce22e9b6080`. Unrelated dirty paths remain unchanged.
- **Exit evidence:** EXACT SOURCE/STATIC PORTION PASS — 16-file source manifest `E:\lalin-cr008-snapshots\20261020-w0c-browser-transport-feasibility\source-manifest.json` SHA-256 `b228de39751717e2dd1c96a63169116d1f666f977fa324ce92c9f3060016d7b7`; Astra exact-source review PASS; `npm test` 22/22, `npm run build` PASS (6 JavaScript files and 3 static assets), and `npm ls ws --depth=0` PASS on Node v24.20.0 / ws@8.22.0. As of the 2026-10-20 source/static verification close, no listener had been started and no certificate/trust store had been generated or changed; iPhone Safari, Android Chrome, LAN, Internet-off and isolation trials were NOT_RUN at that point. The owner accepts the iPhone 12 Pro Max Safari probe as sufficient physical-device evidence for progression to the next review gate. It proves only the observed, unrecorded iOS/WebKit build; do not claim a supported iOS floor. Android Chrome remains in the product profile, but Android 16/Chrome 155 is supplemental evidence and does not establish a minimum supported Android floor; qualify the floor at W1-C/product-release acceptance. The live network/security gates above remain open. Therefore this sublane remains OPEN until those gates and its joint review are resolved; the harness does not close W0-B/C.
- **Next gate:** the owner-accepted iPhone device-evidence checkpoint is satisfied. The architecture owner reconciles the exact W0-B/C contract and docs, resolves the remaining network/security gates, collects full-contract principal acceptance, then requests joint VG-0 and separate reviewer START for G1, W1-B and W1-C. Android floor qualification is deferred to W1-C/product-release acceptance. No product remote implementation or mutation starts from this sublane.

### W0 verification gate (VG-0)

The verifier reports evidence only:

- Before a lane makes its first write, record the worker confirmation of the full base SHA, content digest and changed-path manifest in that lane's pre-write gate; the reviewer must already have issued `START_WAVE`.
- Run the current Play baseline commands from apps/play-desktop: npm test,
  npm run build, and npm run check:native; record exact results and do
  not infer a pass from a command that was not run.
- Validate the versioned protocol, transfer, platform and API decisions against
  CR-008 / PRD PLAY-21..27. Record all unresolved assumptions as named blockers.
- Validate the Smart Medley acceptance contract and measurable method before
  opening W2-C; validate benchmark, fixture-run and native-listening evidence
  at W2-C exit, before closing W2-C or opening W3.
- Confirm no worker can reach the LAN socket through WebView permissions and no
  existing named-pipe contract was changed into a network endpoint.

The independent review agent then issues START_W1_AUDIO,
START_W1_REMOTE, START_W1_STORAGE, or BLOCKED per dependency path. W0 is not considered
closed by the plan author or verifier.

## W1 — parallel foundation and local transition proof

Once the matching W0 entry gate is approved, dispatch each lane with its own
worktree and explicit file ownership. The lanes may run concurrently.

| Lane | Agent ownership | Scope | Required evidence |
|---|---|---|---|
| W1-A — audio reliability and baseline stabilization | Audio agent owns audioEngine.ts, usePlaybackStore.ts, App.tsx listen attribution, playMigrationImport.ts, transition/migration tests, and stale test setup in App.test.tsx and CompactTransport.test.tsx. Do not change dashboard or compact-player behavior solely to satisfy old assertions; do not modify remote gateway files. | Cover decoder readiness/failure, equal-power schedule, pause/resume, seek/stop/edit/repeat/shuffle/output-loss cancellation, one queue commit, duplicate queue occurrences, Manual DJ target/fader, Medley cues and per-deck audible listen accounting. Failed migration transactions restore exact prior state/storage without persisting a new revision; successful undo restores queue contents while advancing the monotonic revision once. Update stale dashboard navigation and localized-label assertions. | Focused tests, npm test, npm run build; native tests remain separate if blocked. |
| W1-B-L0/G1 — Genesis coordinator and durable commit proof (mandatory; principal-approved gate) | Native coordinator agent; integrator owns shared Tauri/Cargo registration. | Prove the actual Genesis API/version and one Rust coordinator can commit queue/session state, revision and final receipt with dedupe/unique-key semantics; fault-test every write boundary and restart/recovery; reserve receipt and tombstone count/bytes before acceptance; enforce REQUEST_STATUS retention and revocation linearization; ensure TypeScript cannot assert applied. No SQLite side database. | Entry: W0-A, jointly closed W0-B/C contract for the approved browser/native profiles, accepted VG-0, and explicit reviewer START for G1. G1 must pass verifier evidence and principal review before any remote mutation endpoint or persistent mobile enrollment/rotation is enabled and before VP/W2 closure. If Genesis cannot prove these guarantees, G1 is BLOCKED and the design returns to review. |
| W1-B — PC gateway | Native implementation agent owns a new remote-gateway module and its tests. Integrator alone resolves shared Tauri registration/Cargo conflicts. | LAN-only TLS/WSS gateway, expiring single-use invitation, certificate identity, PC approval, reconciled device roles/scopes/revoke, rate/size limits and versioned command handling. Keep session/queue authority and the audio clock on PC. | Tests cover pairing and PC approval/credential issuance, QR/manual pairing, invite expiry/replay, the selected profile TLS identity and origin binding, approval denial, role-scope enforcement, request/session identity, idempotent retry, accepted/applied/playback-ready acknowledgements, duplicate-track queueEntryId targeting, PC-only queue advancement, stale-revision snapshot, reconnect, durable revoke, rate/size limits, LAN-only binding and restart recovery; run `npm run check:native`. Exact SPKI-pin success/mismatch tests and device-only OS storage apply only if a native client is selected. Browser trust/origin behavior is verified with the W1-C browser-device tests; never claim browser SPKI pinning. Remote mutations stay disabled until W1-B-L0/G1 passes. |
| W1-C — mobile remote clients | Mobile implementation agent owns the responsive web remote and its mobile-browser tests; a separate Android-native owner is required only if W0-C selects native Host capability. | iOS Safari and Android Chrome controller UI, secure browser pairing/reconnect against the reviewed W0-B/C profile, transport and ordered queue controls. Native Android Host code is out of scope unless explicitly selected by W0-C. | Browser-device tests cover trusted HTTPS/WSS identity, pairing/approval/revoke, credential deletion/expiry, reconnect snapshot, queueEntryId targeting and phone disconnect not stopping PC playback/advancing its queue. Any selected native Android target additionally proves SPKI pinning, device-only key/token storage, OS file-picker/foreground-host behavior and clean target build. |
| W1-D — PLAY-19 local media store | Storage agent owns a new object-store interface/local adapter and focused native tests; integrator owns shared Cargo/Tauri registration. | Add temporary staging, content-addressed immutable objects and a visibility-gated local finalizer for the existing Genesis catalog. Verify immutable object bytes, stage Genesis rows/indexes, append/reconcile `PublicationCommitReceiptV1`, and apply its complete-set visibility predicate on every read path. Do not claim cross-store atomicity. This is the local transfer dependency only; the RustFS adapter remains in the CR-007 lane. | Native tests cover hash mismatch, interrupted/duplicate chunks, write-boundary faults, hidden partial Genesis rows/indexes, receipt reconciliation and restart/readback; run `npm run check:native`. VG-1 must prove no incomplete object/catalog set becomes visible and recovery is deterministic before W1-D closes/W2-A starts. |

W1-C must not begin until W0-B/C jointly freeze the browser/native client profiles, security path, framework/runtime versions and supported target floors.
W1-B/C must not independently redefine the wire contract. W1-A may be started
without those remote decisions, after W0-A is cleared.
W1-D may start only after W0-A and the reviewer-approved W0-D contract. The
W1-B/C protocol and security cases above are required automated evidence before
any W2 lane can accept remote commands, playlist references or phone media.

### W1 verification gate (VG-1)

The verifier checks all lane-specific suites, builds and security cases, then
reports each as PASS, FAIL, NOT_RUN or BLOCKED. The integration
checkout SHA and exact command outputs are part of the report. A successful build
does not prove pairing security or audible transition behavior.

For the mandatory W1-B-L0/G1 gate, the verifier must inspect the exact Genesis
API/version and run the coordinator durability, uniqueness, reservation,
crash-boundary and restart-recovery cases against that implementation; mocks
or a wrapper name alone cannot pass. If atomic queue/revision/receipt semantics
or durable reservations cannot be proven, report BLOCKED and keep mutation,
enrollment and rotation disabled. The principal reviewer must record a distinct
G1 PASS before VP can open remote successors.

- The review agent may return `CLOSE_LANE_AND_OPEN_NAMED_SUCCESSORS` — the
  named lane's acceptance items have evidence and required independent review is clean.
- `CLOSE_WAVE_HOLD` — a lane is complete, but its successor prerequisites are open.
- REWORK — the lane has fixable acceptance failures.
- BLOCKED — external/platform or prerequisite evidence prevents a valid
  decision; name the blocker and its owner.

## W2 — media sources and Smart Medley

W2 begins only for lanes whose dependencies have passed W1 review. Work remains
parallel across separately owned mobile/native modules.

| Lane | Dependency | Agent ownership | Acceptance focus |
|---|---|---|---|
| W2-A — phone files | W1-B + W1-C closed; W1-D local object-store/finalizer closed; W0-D contract frozen; PLAY-23 entry review accepted; explicit reviewer `START_W2_PHONE_FILES`. | Phone sender owns the selected foreground browser file-copy or separately selected native file-sharing/Host UI. PC receiver owns native transfer module and visibility-gated object/catalog finalizer integration. Nothing in W1-C grants Host or starts transfer endpoints. | Resume after interruption, idempotent chunks, whole-file hash mismatch rejection, verified immutable object publication, staged Genesis metadata plus reconciled commit receipt and complete-set visibility on reads, offline play after phone disconnect. Optional authenticated Range streaming is a separately reviewed and started capability; stream loss affects only the next item. |
| W2-B — YouTube references | W1-B + W1-C closed; W0-E client-specific metadata/authorization policy and E-Q1/E-Q3/E-Q5 decisions frozen; Terms/Privacy publication and consent evidence accepted. | Mobile agent owns consent and phone-side requests only under the accepted client profile: public metadata uses the approved configured API-key provisioning model; private/unlisted OAuth follows the browser-compatible flow/token handling accepted by W0-E, or is limited to a selected native client with OS secure storage. Do not assume native system-browser OAuth or OS secure storage for Safari/Chrome. Keep credentials on the phone; relay only consented references. PC catalog agent owns validation, Genesis persistence, retention/expiry/deletion, explicit local-track mapping, and queue/cache exclusion. YouTube API agent owns the versioned reference schema and provider contract tests. | Pagination, quota/auth/revocation/deleted items, refresh/expiry deletion, explicit user mapping to a local-owned track, and proof references never enter the audio queue or media cache by themselves. |
| W2-C — Smart Medley | W1-A audio behavior closed; W0-F acceptance contract verified and reviewer-approved. | Analysis agent owns an isolated local analysis module, confidence model, fixtures and resource benchmarks; UI integration is owned separately after the contract is reviewed. | Confidence-bound BPM/key/cue data, fallback to normal crossfade when uncertain, measured CPU/memory/latency against W0-F budgets and audible-artifact results. Do not claim beat-perfect/sample-accurate mixing. |

PLAY-23 is blocked until the PLAY-19 object-store seam can finalize local
content-addressed media and W2-A receives its explicit reviewer START. The RustFS S3
adapter may be verified in its CR-007 lane; it must not be conflated with local-copy
acceptance. PLAY-24 live API acceptance needs valid official API configuration and
the client-specific W0-E authorization path, but mocked contract tests may run
without credentials. Secrets and OAuth tokens must not be committed.

### W2 verification gate (VG-2)

The verifier checks each lane independently and includes failure-path evidence,
not only happy paths. The review agent decides lane closure and may open only
successors whose dependencies are satisfied. A satisfied dependency row is not
authority to start a lane. For W2-A, the principal reviewer records the explicit
`START_W2_PHONE_FILES` only after confirming W1-B/C and W1-D closure, frozen W0-D,
and the reviewed PLAY-23 transfer scope. No Host grant or transfer endpoint is
enabled before that decision. W2-B likewise remains closed until its client-
specific W0-E authorization and consent conditions are accepted. NOT_RUN
native/device checks remain visible and cannot be converted to PASS by static
inspection.

## W3 — integrated native acceptance and closeout

W3 is serial integration on one pinned candidate after the W2 review verdict.
The integrator resolves overlapping changes; no implementation agent writes
another lane's files during integration.

Required acceptance includes:

1. Pair a real supported phone with the PC over the same LAN. Verify single-use
   expiry, fingerprint mismatch rejection, PC approval, scoped roles, revoke,
   LAN-only bind, stale revision/replay behavior and reconnect snapshot.
2. Verify playback continues after phone disconnect and no queue command
   duplicates an item after retry.
3. Copy a selected phone file with interruption/resume. Confirm hash mismatch
   leaves no published object or Genesis row; confirm a completed copy plays
   after the phone disconnects. If Range streaming is delivered, verify scoped
   authorization and stream loss leaves the current deck intact.
4. Import official YouTube playlist metadata with pagination/auth/quota and
   expiry cases. Confirm local-track mapping requires explicit user choice and
   no YouTube media is downloaded, cached or sent to either deck.
5. Exercise Smooth, Manual DJ and Medley on the supported native audio output:
   overlap, pause/resume, cancellation, decoder/end failure, one queue commit,
   output routing and per-deck listen attribution. Video remains single-stage.
6. Run all required frontend/native/mobile suites and builds on the pinned
   integration tree; record full commands, result counts, platform and device.
   Any unavailable host/device case is NOT_RUN with a named follow-up.
7. Update [Play traceability](../validation/LALIN_PLAY_TRACEABILITY.md) and
   [CR-008](../product/CR-008--LALIN_PLAY_MOBILE_REMOTE_HOST_CROSSFADE.md) with
   tested SHA, automated results, native evidence and remaining limitations.

The review agent closes CR-008 only when PLAY-21 through PLAY-27 meet their
registered acceptance. If PLAY-27 is intentionally deferred by a later owner
decision, record that as a scope/status decision; do not silently call CR-008
complete while the approved success criteria remain open.

## Review protocol and evidence record

The verifier is a separate role from implementation and reports observable
evidence. The review agent is independent of the implementation lane and alone
controls wave state:

- Before dispatch: START_WAVE or BLOCKED, with dependency IDs and owners.
- After verification: CLOSE_WAVE_AND_OPEN_NEXT, CLOSE_WAVE_HOLD,
  REWORK or BLOCKED.
- Every verdict records reviewed SHA, requirements, test commands/results,
  runtime evidence, remaining NOT_RUN items and named blockers.
- A new commit/revision requires a new verify and review. The integrator can
  prepare a candidate but cannot self-approve closure or start a blocked successor.
- Review agents do not edit implementation files. If evidence is insufficient,
  they specify the missing artifact and responsible lane.

### Initial independent review decision — 2026-10-20

The read-only review agent returned BLOCKED for every implementation path:
W1-A waits for a content-verifiable W0-A snapshot; W1-B/C wait for W0-A and
W0-B/C; W1-D waits for W0-A and the W0-D contract; W2-A also waits for W1-D;
W2-B waits for W1-B/C and W0-E; W2-C waits for W1-A and the reviewed
confidence/resource acceptance contract. The reviewer also required protocol
security tests before W2, explicit W2-B mobile/PC ownership, and a separate
W1-D implementation lane for the missing PLAY-19 local adapter. Those items
are reflected in this revision; the implementation lanes remain unstarted.

### Second independent review decision — 2026-10-20

The reviewer again returned BLOCKED for all implementation paths. It accepted
the content-verifiable snapshot requirement, W1-D dependency and explicit
mobile/PC YouTube ownership. It required successful pinned pairing and PC
approval/credential issuance, Host access limited to explicitly selected files,
duplicate-track queueEntryId targeting with PC-only advancement, and an explicit
W0-F Smart Medley confidence/resource contract. It also clarified that missing
W1-A tests and the W1-D adapter are lane exit work, while only their upstream
gates belong in the start-blocker register. These changes are recorded above;
implementation remains unstarted pending another review.

### Third independent review decision — 2026-10-20

The reviewer returned BLOCKED for all implementation lanes and found one DAG
defect: W2-B had direct W1-B/W1-C edges that bypassed the VP review gate.
Those edges now route through VP, matching the W2-B entry condition and the
reviewer's closure authority. A fourth review is required for this revision;
no implementation wave has started.

### Fourth independent review decision — 2026-10-20

The reviewer confirmed the W2-B path now passes through VP with no bypass,
and the W0-F, W1-D and remaining review-gated successor paths match their
dependencies. It returned BLOCKED for every implementation lane because the
content-verifiable W0-A snapshot and shared W0 contracts are still open. The
reviewer also recommended listing W0-D explicitly in W2-A's readiness row;
that dependency is now stated directly below. No tests or runtime checks were
performed as part of this planning review.

### VG-0 baseline run — verification worktree, 2026-10-20

Verification checkout: `E:\lalin-cr008-worktrees\w0-verify`, base
`61151edf69c5d0e66acaa976c6be42ca4fb46a47`, snapshot content digest
`a4425e59043a6bd0814c5873db0c1456ded42e9b01a34f8b6adbe4675ed23f7a`.
The 51-file source snapshot overlay and the verification checkout both match every
manifest byte length and SHA-256. Node and PowerShell independently recomputed
the same digest using ordinal UTF-8 path-byte ordering.

| Command | Result | Evidence |
|---|---|---|
| `npm ci` | PASS | Installed the locked desktop dependencies in the isolated verification checkout. npm reported 7 dependency advisories (3 moderate, 2 high, 2 critical); this did not alter the source manifest. |
| `npm test` | FAIL | 70/81 passed; 11 failed across `src/App.test.tsx` (5), `src/playMigrationImport.test.ts` (5), and `src/components/CompactTransport.test.tsx` (1). See the exact baseline command output for assertions. |
| `npm run build` | PASS | `tsc` and Vite production build exited 0. |
| `npm run check:native` | BLOCKED | Cargo build scripts for `icu_properties_data` and `icu_normalizer_data` were denied by Windows Application Control (OS error 4551) in the verification worktree. Native tests did not execute; this is not a code-result PASS or FAIL. |

The failing test groups are being independently classified. No implementation
agent wrote to the verification checkout during this baseline run.
### Independent baseline failure classification — 2026-10-20
### Independent baseline failure classification — 2026-10-20

A read-only audit reproduced and classified all 11 baseline failures in
isolation. Five `App.test.tsx` failures query track rows while the dashboard is
active; the tests must navigate to All tracks or seed dashboard history. Five
`playMigrationImport.test.ts` failures expose a real rollback persistence bug:
`replaceFromMigration` rewrites the exact restored storage snapshot with a
normalized queue and a bumped revision. `CompactTransport.test.tsx` has one
stale English label assertion (`Open file` versus `Import file`). W1-A owns
these repairs; the reviewer requires the migration regression to be fixed before
lane closure. Successful undo advances the monotonic revision once; failed
transactions restore the exact prior storage and revision.
### Fifth independent review decision — 2026-10-20

The reviewer independently matched all 52 snapshot files in the overlay, verification checkout and operator checkout, and verified the manifest file checksum. It returned BLOCKED because “sorted path” was locale-dependent across implementations, the README contained control characters, and requiring worker confirmation before W0-A closure created a circular start gate. This revision pins UTF-8 bytewise ordinal ordering, repairs the artifact instructions, and moves worker confirmation to each lane's pre-write gate. The reviewer did not run tests or runtime checks.

### Sixth independent review decision — 2026-10-20

The reviewer closed W0-A and issued `START_W1_AUDIO` for the content-matched v2 snapshot, while keeping every remote, storage, YouTube and Smart Medley lane blocked. It accepted the recorded non-green baseline and classified the migration rollback regression as a W1-A lane exit requirement. Before dispatch, the integrator identified that including the mutable execution DAG in its own source snapshot made the review-state update self-referential. The v3 snapshot excludes that run-state ledger. The reviewer independently confirmed its digest, manifest checksum and 51/51 file matches across the overlay, operator checkout and verification checkout; `W0-A: CLOSE` and `W1-A: START_W1_AUDIO remains valid for v3`. This decision does not close W1-A or authorize other lanes.

### Seventh independent review decision — 2026-10-20

The reviewer independently verified source snapshot v3: 51/51 file hashes and byte lengths match across overlay, operator checkout and verification checkout; Node and PowerShell reproduce the digest and manifest checksum. It closed W0-A and confirmed `START_W1_AUDIO` remains valid for this exact digest. The worker must record the v3 base SHA, digest and path-manifest confirmation before its first write. W1-A owns the five migration rollback regressions and six stale UI test assumptions; no lane closure or remote/storage successor is authorized by this decision.

### W1-A pre-write gate and eighth independent review — 2026-10-20

Before implementation, the W1-A worker independently verified the detached worker checkout at base SHA 61151edf69c5d0e66acaa976c6be42ca4fb46a47, matched all 51 manifest entries by byte length and SHA-256, reproduced content digest a4425e59043a6bd0814c5873db0c1456ded42e9b01a34f8b6adbe4675ed23f7a, and verified manifest SHA-256 b6612d546aaacd4b0faabdb5064e33770ea8d11e70d7e2090306f99918afe899. No files were changed during the check.

The independent reviewer repeated the worker-checkout verification and returned PRESERVE START_W1_AUDIO; no blocker to starting W1-A. The reviewer confirmed the 0.1.8b ledger metadata correction did not change scope or authority. This does not authorize another lane or close W1-A.

### W0-D/E/F independent contract review — 2026-10-20

The principal reviewer performed a static, source-only review of the external
`W0-DEF-draft.md`; no tests were run and no implementation lane was authorized.
All three contract gates remain **REWORK / OPEN**:

- **W0-D:** choose or explicitly defer staging, per-file, active-transfer,
  chunk and abandoned-transfer limits; establish Genesis catalog-batch
  atomicity or define recovery; freeze Host access to user-selected files and
  session/revocation boundaries; specify transfer state/error outcomes; add
  disk-full and staging-GC safety cases. W1-D stays blocked.
- **W0-E:** add testable Terms/privacy consent and disclosure, a non-embedded
  API credential distribution path, mandatory PKCE/system-browser
  `youtube.readonly` OAuth, authorizing-user access control for phone-to-PC
  relay, and distinct LAN-disconnect, consent-revoke and transient-refresh
  states. W2-B stays blocked.
- **W0-F:** specify the actual deterministic score formula and inputs, obtain
  an owner decision for H1/H2 host/resource targets, and add pass/fail bounds
  for coverage and false confidence. W2-C stays blocked.

The author is revising only the external draft. These findings do not amend
CR-008 boundaries or grant implementation authority.

### W1-A independent VG-1 verification and reviewer decision — 2026-10-20

The independent verifier checked the frozen worker patch at base SHA
`61151edf69c5d0e66acaa976c6be42ca4fb46a47`. Of the 51 snapshot files, 46
remain byte-identical and 5 changed; four additional paths are outside the
snapshot. Those nine changed paths are within the assigned W1-A scope; no
other worker writes were found.

| Check | Result |
|---|---|
| Focused W1-A tests | PASS — 5 files, 37 tests |
| Full Play suite | PASS — 16 files, 87 tests |
| `npm run build` | PASS — TypeScript and Vite |
| `git diff --check` | PASS — only existing LF/CRLF notices in snapshot-backed files |
| `npm run check:native` | BLOCKED — Windows Application Control denied the generated `crc32fast` build script (OS error 4551); not bypassed |

The verifier confirmed failed migration transactions restore exact prior raw
storage and in-memory queue/EQ/now-playing/revision, and successful undo bumps
the monotonic revision once. It recommended **REWORK** because automated tests
do not yet cover transition pause/resume and cancellation on seek/stop/edit/
repeat/shuffle/output loss, Manual DJ deck/fader and Medley cue behavior, or
per-deck listen accounting during overlap.

The principal reviewer independently returned **REWORK**: those tests are
explicit W1-A acceptance items. Add them, rerun VG-1, and return for another
review. Native check remains BLOCKED and is separate when the OS prevents it.
No successor opens; W2-C separately remains blocked on W0-F.

### W0-B/C independent security audit — 2026-10-20

The independent security auditor reviewed the revised external `W0-BC-draft.md`
against the prior seven findings and current source. Both gates remain **REWORK /
OPEN**; no tests or edits were made, and no lane received START.

- **W0-B:** still needs one defined queue/revision/receipt authority across
  Zustand/localStorage, GenesisBlockDB and Rust handoff; exact control and
  WebSocket authentication; in-flight command versus revoke ordering; a
  verifiable applied bridge response; and a non-circular split between frozen
  contract and later implementation proof.
- **W0-C:** still needs precise identity for DPAPI/ACL, pinned self-signed TLS
  trust without validation bypass, recoverable credential-rotation delivery,
  pairing bound to a phone-generated key, durable receipt/tombstone and
  per-source counter caps, device-only mobile storage, and minimum OS versions.

Host remains disabled until PLAY-23 is reviewed. The author is revising only
the external draft; W1-B/C remain blocked until re-audit and principal review.

### W1-A reviewer-directed rework — worker report — 2026-10-20

The worker reports the same nine-path W1-A delta, all within its assigned scope,
and added tests for pause/resume; cancellation on seek, stop, queue edit, repeat,
shuffle and output loss; Manual DJ deck/fader behavior; Medley cue-in/cue-out;
and per-deck audible attribution with muted-preload suppression. It reports no
playback behavior change was needed.

Worker-reported checks: focused 3 files / 35 tests PASS, full Play suite 16
files / 100 tests PASS, build PASS, and `git diff --check` PASS. The previous
native check remains BLOCKED by Windows Application Control (OS error 4551);
the worker did not repeat or bypass it. These are worker results pending the
independent verifier's rerun and inspection; the lane is not closed yet.

### W1-A second independent VG-1 verification — 2026-10-20

The verifier rechecked the frozen nine-path delta against the v3 snapshot and
found all changes within scope: 46/51 snapshot files remain byte-identical and
four assigned paths are outside the snapshot; no out-of-scope writes were
found. It reports the requested pause/resume, cancellation, Manual DJ, Medley
and two-deck listen-accounting cases now covered, but recommends **REWORK** for
two remaining tests: assert the scheduled Smooth curve is equal-power, and
exercise duplicate track IDs with distinct queue-entry IDs during transitions.

The focused suite passed 3 files / 35 tests; full suite passed 16 files / 100
tests; build and `git diff --check` passed. Native verification remains
**BLOCKED** by Windows Application Control (OS error 4551). The principal
reviewer has the report for a lane decision. No successor is authorized yet.

The principal reviewer returned **REWORK**, confirming two remaining W1-A
acceptance items: assert the scheduled Smooth equal-power curve at normalized
endpoints and midpoint against `A=cos(πx/2)`, `B=sin(πx/2)`; and transition a
queue containing duplicate track IDs with distinct `queueEntryId`s, proving
the intended occurrence prepares and commits exactly once without collapsing
or double-advancing. Native remains OS-blocked; no successor opens. The worker
is adding only these tests before the next VG-1 run.

### W1-A second reviewer rework — worker report — 2026-10-20

The worker added assertions in the two assigned transition test files only. The
Smooth test captures the scheduled outgoing/incoming curves and checks
`cos(πx/2)` and `sin(πx/2)` at x=0, 0.5 and 1, including unit power sum. The
store test uses three copies of one media ID with distinct queueEntryIds,
targets the second entry, commits index 1/revision 11 once, preserves all
entries, and ignores duplicate transition completion.

Worker-reported checks: focused 2 files / 19 tests PASS, full suite 16 files /
102 tests PASS, build PASS and diff check PASS. It reports no behavior defect,
no out-of-scope changes and no commit. Native remains blocked by the prior
Windows Application Control OS error 4551; no retry/bypass was performed.
These worker results await the independent VG-1 recheck.

### W1-A third independent VG-1 verification — 2026-10-20

The verifier matched the frozen source snapshot digest
`a4425e59043a6bd0814c5873db0c1456ded42e9b01a34f8b6adbe4675ed23f7a`, manifest
checksum `b6612d546aaacd4b0faabdb5064e33770ea8d11e70d7e2090306f99918afe899`,
and all 51 overlay files. Against base SHA
`61151edf69c5d0e66acaa976c6be42ca4fb46a47`, 46/51 snapshot files remain
byte-identical; the five changed snapshot paths and four assigned paths
outside the snapshot are all within W1-A's nine-path scope. No out-of-scope
paths were found.

The Smooth transition test captures scheduled curves and checks
`cos(πx/2)`, `sin(πx/2)`, and unit power sum at x=0, 0.5 and 1. The queue
transition test uses duplicate media IDs with distinct queue-entry IDs and
checks the intended occurrence prepares and commits once, entries remain
distinct, and duplicate completion does not write again.

| Check | Result |
|---|---|
| Focused two-file suite | PASS — 19/19 |
| Full Play suite | PASS — 102/102 |
| `npm run build` | PASS |
| `git diff --check` | PASS — existing LF/CRLF notices only |
| Native check | Not rerun; prior Windows Application Control error 4551 remains recorded |

The independent verifier returns **PASS** for VG-1 #3. This is verification
evidence only; the principal reviewer still owns the W1-A close decision. No
successor is authorized by this verifier result.

### W1-A principal review and primary-checkout integration — 2026-10-20

The principal reviewer inspected the exact nine-path W1-A delta against base
`61151edf69c5d0e66acaa976c6be42ca4fb46a47` and the pinned v3 snapshot. It
returned **CLOSE_WAVE_HOLD**: W1-A is closed, but no successor starts from this
decision. W2-C still waits on W0-F; W2-A/B retain their own dependency gates.
The reviewer checked the equal-power and duplicate queue-entry tests, earlier
pause/resume/cancellation/Manual DJ/Medley/listen-attribution coverage, and
migration rollback assertions. VG-1 evidence was accepted; the reviewer did
not rerun tests. Native remains **OS-blocked / NOT_RUN**, not PASS.

Before integration, the primary checkout was verified at the same base SHA.
Each in-snapshot file matched its pinned snapshot checksum; each tracked
out-of-snapshot file was clean at base; both new transition test paths were
absent. The nine reviewed files were then copied into the primary working tree
without staging or committing. Their post-copy SHA-256 values match the
reviewed worker worktree for all nine paths.

Primary-checkout integration checks:

| Check | Result |
|---|---|
| `npm test` | PASS — 16 files / 102 tests |
| `npm run build` | PASS — TypeScript and Vite |
| `git diff --check` on the seven tracked W1-A source paths | PASS |
| Reviewed-worktree hash comparison | PASS — all nine paths match |
| Native check | Not run; prior Windows Application Control error 4551 remains recorded |

The no-successor hold remains active. No code was staged or committed.

### W0-D/E/F independent VG-0 review — Draft 0.3 — 2026-10-20

The independent verifier reviewed the external
`E:\lalin-cr008-contract-drafts\20261020-v1\W0-DEF-draft.md` read-only. No
repository files were changed; no tests, benchmarks, or provider calls were
run. It returned separate results for the three contract gates:

- **W0-D — BLOCKED for closure or W1-D start.** Draft 0.3 adds finite proposed
  transfer bounds, explicit states/errors, selected-file grants and session
  checks, disk-full behavior, staging-GC protections, and crash/reconciliation
  cases. D-Q2 still only names a safe visibility/reconciliation protocol; it
  does not define its publish/recovery steps. The draft also requires
  failure-injection proof before W1-D starts, while this DAG assigns
  implementation proof to W1-D/VG-1. D-Q1's bounds remain proposed pending
  owner acceptance or replacement. Principal review must resolve the gate and
  sequencing.
- **W0-E — REWORK.** The draft adds OAuth PKCE, token handling, relay
  authorization, retention/revocation states, and fixture cases, while
  preserving the no-download/no-playback boundary. It omits a visible link to
  YouTube's Terms of Service, the statement in Lalin's own terms that API
  users agree to those terms, and the Google Security Settings link in the
  privacy disclosure. It proposes OAuth-only even though approved CR-008
  describes a public API-key path; that source change needs explicit
  reconciliation. E-Q3 principal binding and E-Q5 lifecycle values remain
  open; live API acceptance is not claimed. See the current
  [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies).
- **W0-F — REWORK.** Formula, eligibility, coverage, false-confidence and
  sample thresholds are drafted. H1 is proposed as Windows 10 x64, 4 CPU
  cores, 8 GiB, CPU-only, sourced to SPEC §9, and explicitly unmeasured; H2,
  formula and fixture thresholds still await owner/reviewer acceptance. Pair
  labels exist in fixtures but no acceptance metric uses them to catch
  pair-score or eligibility false positives. The reviewer should require a
  pair-level metric or an explicit rationale, and record H1's decision
  provenance.

The verifier confirmed source-map anchors against CR-007/008, PRD, this DAG
and SPEC. These are verifier findings pending principal review; they do not
close a W0 gate or authorize any successor.

### W0-B/C contract author revision — Draft 0.3.0 — 2026-10-20

The contract author revised only the external
`E:\lalin-cr008-contract-drafts\20261020-v1\W0-BC-draft.md`. The candidate
maps the prior eight security findings into explicit sections: process-token
SID/DACL identity and strict SPKI-pinned TLS; staged DPAPI credential rotation
with ACK and crash recovery; durable receipt/tombstone/counter/response caps;
phone-generated key-bound pairing and race handling; explicit Zustand,
Genesis catalog and handoff authority limits; Rust grant/revoke linearization
and applied status; proposed Android 10/iOS 16 device-only storage matrix; and
separate W0 contract freeze from W1-B-L0/G1 runtime proof.

The author lists remaining unproven coordinator/Genesis schema, atomicity,
uniqueness, recovery and quota reservation semantics; no mobile/TLS/DPAPI
implementation or device proof; and unmeasured numeric limits. The draft
keeps Host disabled until PLAY-23 review. It is now with the independent
security auditor for re-audit. No source/doc changes, tests, START, or lane
authorization are claimed.

### W0-D/E/F principal review — Draft 0.3 — 2026-10-20

The principal reviewer returned separate decisions after the independent
VG-0 findings:

- **W0-D — BLOCKED.** D-Q2's safe Genesis alternative remains a placeholder.
  A frozen contract must define the visibility predicate/boundary, commit
  marker, read/retry behavior, partial catalog/index-row handling and crash
  recovery. Resolve the sequence by freezing the protocol and test cases in
  W0-D, then running failure-injection during W1-D/VG-1 before W1-D closes or
  W2-A starts. The tests do not block W1-D start once the contract is frozen.
  The storage owner must accept or replace D-Q1's finite bounds and explicit
  durable-quota deferral. W1-D remains blocked until then.
- **W0-E — REWORK.** Add the YouTube Terms link, Lalin-terms acceptance
  statement and Google Security Settings revocation link with UI acceptance
  checks. Preserve CR-008's public playlist reads through a safe non-embedded
  API-key configuration path and OAuth for private/unlisted playlists, or
  obtain owner approval for a canonical CR scope change. Resolve E-Q3 local
  principal binding and E-Q5 lifecycle values. E-Q2 publication/contact and
  E-Q4 provider status remain live-API acceptance gates; W2-B cannot start.
- **W0-F — REWORK.** Add an acceptance metric for pair-level false positives
  with pair labels, denominator, minimum sample count and pass threshold, or
  an owner-approved falsifiable alternative. Record H1 provenance as an
  integrator proposal based on SPEC §9, not a user-approved decision. Obtain
  owner/reviewer decisions for H2, F-Q1 formula/eligibility, and F-Q2 fixture,
  coverage, false-confidence and listening thresholds. The host target is
  selected, not performance evidence; W2-C remains blocked.

The contract author is revising the external Draft 0.3 in response. These
decisions authorize no implementation lane.

### W0-B/C independent security re-audit — Draft 0.3.0 — 2026-10-20

The security auditor returned **REWORK** for both W0-B and W0-C after a
read-only review of the external draft. The findings are:

1. Startup rotation reconciliation must distinguish the pending rotation
   envelope from the old active grant by `rotationId`, reconcile it before the
   listener starts, and define what happens when the old token expires.
2. A successful revoke acknowledgement must follow durable revoked-generation
   state and terminal receipts for in-flight requests. Restart must not
   reactivate a grant after a confirmed revoke.
3. Reserve worst-case receipt and tombstone count/bytes before accepting a
   request; checking capacity after acceptance is insufficient.
4. W0-C needs target/toolchain feasibility evidence. The audit observed Node
   24.20/npm 11.19 but no Java, Gradle, adb, Android SDK or Xcode in the current
   host; this does not prove a supported mobile target can build.
5. Provide manual endpoint and certificate-pin pairing alongside QR.
6. Reconcile the draft's disabled Host role with CR-008's approved Host role
   for user-selected files. File endpoints may remain gated by PLAY-23/W0-D/
   W1-D; the product scope must not be silently removed.
7. Make W1-B-L0/G1 explicit in the DAG and require both W0-B and W0-C before
   its START. Keep remote mutation endpoints, persistent enrollment and
   rotation disabled until G1 passes.
8. Source mapping is otherwise substantially complete, but there is no START.

These findings update readiness only. The author has supplied Draft v0.4.1,
recorded below, for independent re-audit. The proposed G1 gate remains subject
to principal approval of this DAG revision. No implementation, device proof or
tests are claimed.

### W0-B/C contract author revision — Draft v0.4.1 — 2026-10-20

The author reports that the external contract at
`E:\lalin-cr008-contract-drafts\20261020-v1\W0-BC-draft.md` addresses the
security re-audit findings. Its pinned SHA-256 is
`43A6B87ED17BD052A9E1A2C1ACD802178E740CB23CAB6ED09D055299230CE0D6`.
It now distinguishes pairing and rotation-envelope recovery, persists expiry
and revocation semantics, reserves worst-case receipt/tombstone capacity,
records current mobile toolchain gaps and feasibility criteria, includes
manual endpoint/pin pairing, preserves the approved selected-file Host scope,
and matches the proposed G1 gate in this DAG. The draft remains open; W0-B/C
need independent re-audit and principal review. No START is authorized.

### W0-D/E/F contract author revision — Draft v0.5 — 2026-10-20

The author reports the external contract at
`E:\lalin-cr008-contract-drafts\20261020-v1\W0-DEF-draft.md` is ready for
independent re-review. Its observed SHA-256 is
`97EAEC3ACF84A1CEA9016BFADAAE828999A918161B03EC69172C9A8C71D0227F`.
Draft v0.5 specifies visibility-gated Genesis publication and recovery, moves
failure injection to W1-D/VG-1 exit before W1-D closes/W2-A starts, preserves
the public API-key path with the documented key parameter and diagnostic
redaction plus OAuth for private/unlisted playlists, adds Terms/privacy/
revocation checks, and adds the pair-level false-positive metric while marking
H1/H2 and thresholds as owner questions. It remains open and unfrozen; verifier
and principal review plus owner decisions are pending. No W1-D or W2 START is
authorized.

### Principal review of pinned contracts — 2026-10-20

The principal reviewer verified the exact W0-BC Draft v0.4.1 SHA-256
`43A6B87ED17BD052A9E1A2C1ACD802178E740CB23CAB6ED09D055299230CE0D6`, the
W0-DEF Draft v0.5 SHA-256
`97EAEC3ACF84A1CEA9016BFADAAE828999A918161B03EC69172C9A8C71D0227F`, and this
DAG at v0.1.25b, SHA-256
`53ABB34DBF45F5F56D73F438CFA13D6BFB100191C0BFE79DBFD3519C90890896`.
The source-only review ran no tests and changed no implementation.

- **W0-B — PASS; close the contract gate.** Independent security re-audit and
  principal review accept one Rust coordinator, its receipt/revision authority,
  and G1 as a mandatory separate proof gate. G1 approval is not permission to
  start it or enable remote mutations. Update the external contract's stale
  v0.1.24b DAG references to its reviewed baseline v0.1.25b.
- **W0-C — REWORK / BLOCKED.** Persist `rotationId` on the phone before the
  rotation request and restore/reuse it after restart, with an acceptance case
  spanning a lost start response through delivery and ACK. Select/prove the
  React Native adapter/framework and target platform(s), including clean target
  builds and secure-storage/pinning capability evidence. Fix stale DAG citations
  and clarify that the device label is display-only. No W1-B/C start.
- **W0-D — PASS for technical review; OPEN pending owner decisions.** Keep the
  visibility-gated publication/receipt/read/recovery protocol. Failure injection
  is W1-D/VG-1 exit evidence before W1-D closes or W2-A starts. The storage owner
  must accept or replace D-Q1 limits and durable-library-quota deferral, and
  accept or revise D-Q2 before `START_W1_STORAGE`.
- **W0-E — REWORK.** Preserve public API-key support and OAuth for private or
  unlisted playlists. Require the published Lalin Privacy Policy to contain the
  exact Google revocation URL
  `https://security.google.com/settings/security/permissions`. Reclassify E-Q2
  publication/consent as W0-E closure and W2-B start prerequisites. Keep E-Q4
  provider contact/verification as a separate live-acceptance gate. E-Q1, E-Q3
  and E-Q5 remain owner decisions. No W2-B start.
- **W0-F — REWORK.** Freeze fixture labels independently of analyzer output;
  distinguish expected-ineligible low-confidence challenge pairs from
  expected-eligible pairs and define compatible coverage denominators. H1 must
  identify whether Windows 10 is benchmark-only or the minimum supported
  runtime target, including edition/version/servicing. Windows 10 Home/Pro
  support ended 2025-10-14; if H1 is a legacy benchmark, separate it from the
  DAG's minimum-supported-PC wording and define a current supported-runtime
  baseline. H2, formula and F-Q1/F-Q2 thresholds remain owner decisions.
- **W1-B-L0/G1 — BLOCKED.** G1 is approved as a mandatory DAG gate, but requires
  W0-B and W0-C closure and its own explicit reviewer START. Since W0-C remains
  open, no G1, W1-B/C or successor wave starts. Keep remote mutations,
  persistent enrollment and rotation disabled.
- **DAG-level disposition — BLOCKED/REWORK.** W1-A remains closed with its prior
  `CLOSE_WAVE_HOLD`; no new implementation lane is authorized.

### Revised contract candidates and independent re-audit — 2026-10-20

The exact revised external drafts are pinned for a new principal review:

| Gate | Candidate | SHA-256 | Independent re-audit |
|---|---|---|---|
| W0-B/C | `E:\lalin-cr008-contract-drafts\20261020-v1\W0-BC-draft.md`, v0.4.3-draft | `7A42D4570F3730BBAA3BA95ABCEF70352B650EDE4201407762483343A4524A4E` | W0-B semantics PASS; W0-C revised rotation sequence PASS, but mobile framework/target/toolchain feasibility remains unproven. |
| W0-D/E/F | `E:\lalin-cr008-contract-drafts\20261020-v1\W0-DEF-draft.md`, v0.6.2-draft | `14BC28A1BD46FB8F22C41E225D60A2BD3C11A00D7C4F91B73F31054C75BF2FFE` | W0-D decisions D-Q1/D-Q2 owner-accepted; exact revision independently verified for D and awaits principal pin/closure. W0-E/F remain unchanged from v0.6.1 and open for their owner decisions. |

The W0-C rotation envelope now persists `rotationId` before the first request and
reuses it after restart. The lost-start-response/delivery/ACK scenario is W1-C
exit evidence, not a W0-C closure prerequisite. No mobile framework or clean
target build is claimed; W0-C remains blocked on feasibility evidence and
principal security review. The security auditor confirmed G1 remains a separate
mandatory gate and remote mutation, persistent enrollment and rotation stay
disabled until G1 passes.

For W0-D, the reviewer accepts the visibility-gated publication/receipt/read/
recovery text for technical review. D-Q1 transfer bounds/quota deferral and D-Q2
protocol selection remain storage-owner decisions; runtime failure injection is
W1-D/VG-1 exit evidence. For W0-E, the review accepts the policy/API contract
text, but closure still requires publication of the Lalin Terms and Privacy
Policy, the exact Google revocation URL in the published Privacy Policy, and a
recorded consent gate. E-Q1, E-Q3 and E-Q5 remain owner decisions; E-Q4 is a
separate live-provider acceptance gate. W0-F's eligible/ineligible fixture
labels and denominators reconcile, but H1, H2, F-Q1 and F-Q2 remain owner
decisions and no benchmark or listening evidence exists. These independent
re-audits do not themselves close a contract gate or authorize a lane.

The principal review of candidate DAG v0.1.27b returned **BLOCKED/REWORK** after
confirming all three hashes. It closed W0-B on v0.4.3, kept W0-C blocked on
mobile feasibility evidence, and accepted D/E/F technical text while leaving
their gates open for owner choices and required publication. It also identified
the active graph/prose still calling G1 proposed, W1-D/W2-A implying atomic
cross-store publication, and W2-B omitting the approved public API-key path.
The corrections above address those three consistency defects. A follow-up read
of v0.1.28b found one remaining active phrase, "atomic-publication proof," in
the W0-D exit row. Candidate v0.1.29b replaced it with the receipt/visibility
and W1-D failure-recovery boundary. The principal reviewer confirmed exact
SHA-256 `A55B405909F919EA8981528FF088C73EC4BCFAAE6A07C3E77329AED895939BAC`
and returned READY with `CLOSE_WAVE_HOLD`. The review closes planning only; no
implementation lane receives `START_WAVE`.

### Principal review of candidate DAG v0.1.27b — 2026-10-20

The principal reviewer independently confirmed the exact hashes recorded for
DAG v0.1.27b, W0-BC v0.4.3-draft and W0-DEF v0.6.1-draft.

- **W0-B — PASS/CLOSE on v0.4.3.** The approved protocol, queue/session/receipt
  authority and mandatory G1 boundary are preserved. This does not start G1.
- **W0-C — BLOCKED.** Rotation ID persistence and recovery are specified, but
  framework, target platforms, toolchain builds, and secure-storage/pinning
  capability evidence remain unproven.
- **W0-D — technical PASS; gate OPEN.** D-Q1 bounds/quota deferral and D-Q2
  protocol selection remain storage-owner decisions. Failure injection is
  W1-D/VG-1 exit evidence.
- **W0-E — technical PASS; gate OPEN.** E-Q1/E-Q3/E-Q5 owner decisions and
  published Terms/Privacy plus recorded-consent evidence remain outstanding.
  E-Q4 is a live-provider acceptance gate.
- **W0-F — technical PASS; gate OPEN.** H1/H2/F-Q1/F-Q2 remain owner decisions;
  no benchmark or listening evidence exists. The proposed Windows 11 26H2
  baseline is not an approved target.

**DAG-level disposition — BLOCKED/REWORK.** The principal found three active
cross-artifact defects; their resolutions are recorded in candidate v0.1.28b
above and were subsequently verified in the principal's READY review of exact
candidate v0.1.29b SHA-256
`A55B405909F919EA8981528FF088C73EC4BCFAAE6A07C3E77329AED895939BAC`. No
implementation lane receives `START_WAVE`.

| Blocked lane | Required entry evidence and owner | Disposition |
|---|---|---|
| W1-B-L0/G1 | Close W0-C, accepted VG-0 and a separate reviewer START; architecture/mobile feasibility owners | BLOCKED |
| W1-B / W1-C | Close W0-C and lane-specific reviewer START; architecture/mobile feasibility owners | BLOCKED |
| W1-D | Owner accepts D-Q1 and D-Q2; reviewer `START_W1_STORAGE`; CR-007 storage owner | BLOCKED |
| W2-A | W1-B/C and W1-D closed with approved W0-D contract; storage and transfer owners | BLOCKED |
| W2-B | W1-B/C closed, W0-E choices resolved, Terms/Privacy published and consent evidence accepted; policy/API owners. E-Q4 is live-acceptance only. | BLOCKED |
| W2-C | W0-F choices and measurable contract approved; analysis owner | BLOCKED |

### Principal review of DAG v0.1.29b — READY / `CLOSE_WAVE_HOLD` — 2026-10-20

The principal reviewer confirmed the exact candidate SHA-256
`A55B405909F919EA8981528FF088C73EC4BCFAAE6A07C3E77329AED895939BAC` and
approved closing the planning wave with `CLOSE_WAVE_HOLD`. The W0-D exit row
correctly assigns complete-set visibility semantics to
`PublicationCommitReceiptV1`, implementation and recovery proof to W1-D/VG-1,
and makes no cross-store atomicity claim. This disposition accepts the DAG's
sequencing and gates; it issues no implementation START. W1-A remains closed
with `CLOSE_WAVE_HOLD`. W0-C remains blocked on mobile feasibility evidence;
W0-D/E/F remain open for the listed owner decisions and publication/consent
requirements. All successor lanes remain blocked in the readiness register.

### Principal W0-D gate decision — 2026-10-20

The principal reviewer confirmed exact DAG v0.1.31b SHA-256
`51743D3A3C0CE96830D9A44F3D658C2A280ABBD7B2A0A2EB8A7948567120C297` and
W0-DEF v0.6.2-draft SHA-256
`14BC28A1BD46FB8F22C41E225D60A2BD3C11A00D7C4F91B73F31054C75BF2FFE`,
with the independent verifier PASS and owner acceptance of D-Q1/D-Q2. It
returned **CLOSE_W0_D** and issued **`START_W1_STORAGE`**. This start covers
only the PLAY-19 local object-store/finalizer lane against the pinned v0.6.2
contract; it does not start G1, remote endpoints, phone transfer, the RustFS
adapter or W2-A. Before its first write, the worker must independently confirm
base SHA `61151edf69c5d0e66acaa976c6be42ca4fb46a47`, source digest
`a4425e59043a6bd0814c5873db0c1456ded42e9b01a34f8b6adbe4675ed23f7a`, the
`b6612d546aaacd4b0faabdb5064e33770ea8d11e70d7e2090306f99918afe899` manifest
checksum and all 51 changed paths against the W0-A snapshot. Any mismatch or
unavailable manifest holds writes. W1-D/VG-1 failure-injection, runtime and
recovery proof remain exit evidence before W1-D closes/W2-A starts.

### W1-D worker pre-write verification — 2026-10-20

The W1-D worker independently confirmed the exact pre-write inputs before any
source overlay or code edit: detached clean checkout
`E:\lalin-cr008-worktrees\w1-storage` at the full 40-character base SHA
`61151edf69c5d0e66acaa976c6be42ca4fb46a47`; manifest checksum
`b6612d546aaacd4b0faabdb5064e33770ea8d11e70d7e2090306f99918afe899`; content
digest `a4425e59043a6bd0814c5873db0c1456ded42e9b01a34f8b6adbe4675ed23f7a`; 51
entries and 51 files; and every snapshot path's length and SHA-256. The isolated
checkout was clean, with zero mismatches. No overlay or source edit occurred
during that check. An earlier historical report transcribed this base SHA as a
39-character value missing the `6` after `...976c`; this correction reconciles
that spelling with Git HEAD, the manifest, and the independently verified
pre-write result without changing the approved W1-D scope.

After this PASS, the integrator authorized the worker to overlay the exact
snapshot and implement only W1-D. At pre-write time, runtime/failure-injection evidence remained pending; the completed proof is recorded in the next section.
No W2-A start is implied.

### W1-D implementation and independent VG-1 — 2026-10-20

The W1-D implementation was integrated into the primary checkout from the reviewer-audited worker patch. Only these five native files were overlaid: lib.rs, library.rs, library_store.rs, local_media_store.rs, and migration.rs. The four existing W1-D target files matched the source snapshot before integration; local_media_store.rs was new. At integration, seven other primary paths differed from the snapshot and were preserved: apps/play-desktop/src/App.test.tsx, apps/play-desktop/src/App.tsx, apps/play-desktop/src/components/CompactTransport.test.tsx, apps/play-desktop/src/playback/audioEngine.ts, apps/play-desktop/src/playback/usePlaybackStore.ts, docs/DOCS_INDEX.md, and docs/product/LALIN_PLAY_DOCUMENTATION.md.

Reviewed source SHA-256 values (the primary files match the independent auditor report):
- lib.rs: 7FEAF6DEDB9F47F7769E10469D501BEC0D1909EF3AB1614366064F0A5BE8ED18
- library.rs: AFDE71BDA152B15D6D9CF2ED2852BF74704EBAD43A91B8E54AC315129AB60B0B
- library_store.rs: 2928D821AB2DF50087D1DE047B3F417C72398B0006BFB381752BDD7707D23CD2
- local_media_store.rs: BCB331420EB7CE5780029E376CE81652A29CBD5B228C81CFF43A1876A5450638
- migration.rs: 67A563093F37DFC8A5650475B4C1C650822B83F9BF813141EBBEBE8E751A8656

Primary-checkout verification after integration:
- npm run check:native from apps/play-desktop — PASS: 46 passed, 0 failed; main binary and doc tests had no tests.
- rustfmt --check --edition 2021 on library.rs, library_store.rs, and local_media_store.rs — PASS.
- Scoped git diff --check for the five W1-D files — PASS. Git emitted one LF-to-CRLF normalization notice for library.rs.
- Two compiler dead-code warnings remain for library_store::add_track and local_media_store::put_chunk.

Independent VG-1 result: PASS for the local object-store/finalizer scope. Test-only failpoints cover a fault after Genesis row/index readback but before receipt append, receipt append failure before durable write, and ambiguous readback after receipt sync. The tests assert that incomplete sets stay hidden, startup reconciliation and same-ID retry are deterministic, and a durably receipted complete set remains visible under the complete-set predicate. The worker full native run also passed 46/46; the primary-checkout result above independently reproduces it.

Limits retained by the verifier:
- Seven-day idle-stage expiry and 30-day terminal transfer-ID tombstones are not implemented in this local adapter; they remain receiver/transfer lifecycle work for a future lane.
- Physical power-loss recovery is NOT_RUN. Current tests cover sync/reopen, readback and reconciliation semantics only.
- The existing migration.rs JSON-then-Genesis dual-write remains non-atomic across stores. It predates W1-D and is not evidence of cross-store atomicity.
- No cross-store atomicity, phone transfer receiver, RustFS adapter, or physical power-loss guarantee is claimed.

W1-D is submitted for the principal reviewer close decision. W2-A remains BLOCKED until W1-B/C and W1-D are closed by their gates.

### Principal re-review — 2026-10-20 — W1-D REWORK

The principal reviewer reviewed candidate DAG v0.1.34b at SHA-256
`668CAEB671AC3B04E2911340423DA92635CC38CA362BFD639AEABE1A934B4572` and
confirmed all five submitted W1-D source hashes. It returned **REWORK — do not
close W1-D** after finding that `remove_track` deletes the Genesis row without
recording retirement state, while startup reconciliation replays publication
journals. A removed managed track can therefore reappear after restart. The
deterministic source-path/content import ID can also collide with its prior
journal when the same file is deliberately reimported.

Required within the already-authorized W1-D scope: persist retirement/tombstone
state in GenesisBlockDB and make reconciliation honor it; leave media bytes
untouched on removal; define and test same-file reimport; add restart coverage
for continued absence; and verify catalog replacement and legacy migration do
not resurrect retired entries. W1-D remains open during bounded rework. No
successor lane, including W2-A, is authorized by this finding.

### W0-F v0.6.4 independent contract audit — 2026-10-20

The external candidate E:\lalin-cr008-contract-drafts\20261020-v1\W0-DEF-v0.6.4-draft.md has SHA-256 F2BE4182BE1A0F3034288F5EB6517DC379247BB35B0E01E5592124A31369D34E. The independent audit returned PASS. The frozen W0-D v0.6.2 and v0.6.3 artifacts are unchanged; W0-D, W0-E and E-Q1 through E-Q5 in v0.6.4 match the frozen v0.6.2 text. The accepted W0-F decisions are recorded without expanding the owner-approved scope: Windows 11 26H2 x64 Home/Pro with current public security updates, minimum 4 cores / 8 GiB / CPU-only; Windows 10 is legacy-only; H2 targets apply to the Win11 minimum profile (cold analysis p95 at most 15 seconds, cached lookup p95 at most 100 ms, incremental peak working set at most 256 MiB, and zero analysis-attributable playback underruns/dropouts); the named score formula and fixture/accuracy/coverage/pair-false-positive thresholds are owner-accepted.

Benchmark sample counts, fixture construction and annotation, listening design, and the analysis-record schema remain PROPOSED. Smart Medley benchmark and native-listening evidence remain NOT_RUN. The audit does not freeze the contract or authorize W2-C; principal review and the required evidence remain open.

### Principal re-review — 2026-10-20 — W0-F REWORK

The principal reviewer followed up on DAG v0.1.35b SHA-256
`6E541CDD44513DB7B0ED00BECB1F54A1BF4169AE06270C70B5309C15438712DF` and W0-DEF
v0.6.4 SHA-256 `F2BE4182BE1A0F3034288F5EB6517DC379247BB35B0E01E5592124A31369D34E`.
It accepted a reproducible, **reviewer-defined** evidence protocol that
operationalizes the already accepted profile and thresholds without changing
them. The protocol specifies a Windows 11 26H2 minimum-profile host record;
hash-pinned 180-second WAV inputs; 30 cold trials with explicit cache
invalidation and monotonic timing boundaries; 100 persistent-cache reads;
nearest-rank p95; 100-ms process-tree working-set samples; matched 15-minute
minimum playback control/concurrent runs with WASAPI loopback dropout
classification; frozen 80-pair fixtures with blinded labels and adjudication;
12 eligible plus 6 fallback/control transitions with two blinded listener
ratings; and versioned local JSONL evidence fields and privacy limits.

The principal confirmed that v0.6.4 does not contain this protocol and remains
**REWORK — not pinned**. Candidate W0-DEF v0.6.5 has SHA-256
`E8E4001757B3D9E707E6BE247C10003F22240099C293ADD1301B2247E521C098`; its
independent exact-hash audit returned REWORK as recorded below. Candidate
v0.6.6 is in bounded revision. A later principal pin decision is still
required. Benchmark and native-listening evidence remain NOT_RUN, and W2-C
remains BLOCKED. The reviewer explicitly issued no W2-C authorization.

### W1-D corrected patch, independent VG-1 and primary verification — 2026-10-20

The worker completed the already-authorized retirement/reimport rework in only
`library_store.rs` and `local_media_store.rs`. Exact SHA-256 values are
`71CAC57C6D724D4A488137B1612D3524A183306EA37F1A96143A1AD4A77F3B7B` and
`8C855DD9A6B9E89D3BF1FE0790149FD2A526C8BE06CB22896C16A57926900EC4`.
The independent VG-1 reviewer verified these exact hashes and returned PASS:
retirement rows are committed with managed-row deletion, visibility and startup
reconciliation honor retirement, removal preserves media bytes, and tests cover
restart, replacement, same-ID/content legacy replay, same-file reimport as a
new generation, interrupted-import generation reuse, and v2-to-v3 schema
upgrade. Scoped verifier tests passed `library_store::tests` 13/13 and
`local_media_store::tests` 10/10.

After confirming both primary targets still matched their pre-integration
hashes, the integrator copied only these two files. Primary
`npm run check:native` passed 54/54 library tests (0 failed); scoped
`rustfmt --edition 2021 --check` passed for both files. A crate-wide
`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` remains non-green
because pre-existing formatting differences are reported in `lib.rs` and
`migration.rs`, which this rework did not edit. The independent verifier notes
that tests cover the retired entry's exact ID and content hash, not hash-wide
retirement under an unrelated ID. The principal reviewer accepted the exact-ID/
content criterion; hash-wide retirement is not required and would conflict with
supported fresh-generation reimport behavior.

Limitations remain explicit: `migration.rs` JSON-to-Genesis dual-write is not
cross-store atomic; power-loss testing is NOT_RUN; seven-day staging expiry and
30-day transfer-ID tombstones remain deferred because this slice has no
transfer-ID lifecycle. No RustFS adapter is included. The principal reviewer
returned `CLOSE_W1_D` for the exact patch and DAG v0.1.38b hash
`8E4DE8BEC10212159865E1AD54CD03D23764E694E33A6A9FC812FBBF0511549B`.
W1-D is CLOSED. W2-A remains BLOCKED on W1-B/C; no successor was started.

### W0-F v0.6.5 independent contract audit — 2026-10-20 — REWORK

Independent exact-hash audit verified candidate SHA-256
`E8E4001757B3D9E707E6BE247C10003F22240099C293ADD1301B2247E521C098` and
confirmed W0-D/W0-E and every owner-accepted W0-F threshold/formula are
unchanged. It returned REWORK because reference labels do not define
deterministic consolidation for within-tolerance BPM/cue labels (including
two confidence-3 labels); the 256-MiB measurement does not define its exact
analysis/playback workload interval; dropout comparison does not define
alignment, dBFS statistic or channel aggregation; and the required binomial
confidence interval has no specified method or confidence level. Benchmark,
fixture-run and native-listening evidence remain NOT_RUN. The draft is not
pinned and W2-C remains blocked. Candidate v0.6.6 is available at
`E:\lalin-cr008-contract-drafts\20261020-v1\W0-DEF-v0.6.6-draft.md`,
SHA-256 `D4A96A8B15244C3BD66F19DD346B53B833A5430D8DF9D6733BD66DB4D72BA2F9`.
Its exact-hash independent re-audit returned REWORK: clarify whether the 900-
second scored dropout interval excludes the five-second capture pre-roll, and
whether a cache miss invalidates the memory workload. Candidate v0.6.7 is now
available at `E:\lalin-cr008-contract-drafts\20261020-v1\W0-DEF-v0.6.7-draft.md`,
SHA-256 `0966427B8C5044952CDDB07D3DD98F6EC2DAA8C3A12D752E7A47BF7A84920CE5`.
The exact-hash independent re-audit verified the candidate and byte-identical
W0-D/W0-E plus the checked owner-accepted thresholds/formula/decision rows. It
confirmed both v0.6.6 ambiguities are fixed, then returned narrow REWORK because
the new cache-miss-to-NOT_RUN rule is missing from the candidate's principal-
confirmation list. The exact rule also needs to cover both slot-30 failure and
later cache misses. Candidate remains unpinned; evidence is NOT_RUN; no W2-C
authority is granted. Candidate v0.6.8 is now available at
`E:\lalin-cr008-contract-drafts\20261020-v1\W0-DEF-v0.6.8-draft.md`,
SHA-256 `727FFC931CD90DDFC508B56CD7C0DF6455DE869968AA34D1DFC10AA4856A0F1B`.
The candidate adds the missing cache-status rule to the confirmation list while
preserving the operative method; exact-hash re-audit is pending.

### W0-F v0.6.7 candidate — independent audit REWORK — 2026-10-20

The contract author produced v0.6.7 at the external path above. The candidate
defines the scored interval as playback start through playback start + 900
seconds, excludes the five-second capture pre-roll from scoring, and requires
capture to span pre-roll through the scored endpoint. It also specifies that a
cache miss or hash mismatch in any of the 100 persistent-cache slots fails the
cached-lookup gate and makes memory evidence NOT_RUN while every remaining slot
is still consumed and recorded; the 30-cold then 100-persistent order remains.
The independent audit verified the exact hash, W0-D/W0-E and checked
owner-accepted threshold/formula/decision text across v0.6.5/v0.6.6/v0.6.7;
it confirmed both prior reproducibility findings were resolved, then returned
narrow REWORK because the cache-miss-to-NOT_RUN rule is absent from the
principal-confirmation list. The next bounded revision must list both slot-30
failure and any later persistent-cache miss/mismatch as requiring confirmation.
The candidate remains unpinned; benchmark, fixture and listening evidence are
NOT_RUN; no W2-C authority is granted. Other method choices still require
principal confirmation.

### W0-F v0.6.8 candidate and audit status — 2026-10-20

The contract author added to the principal-confirmation list the cache-phase
status choice: if cold slot 30 fails, mark cache/memory evidence NOT_RUN while
still consuming and recording all 100 persistent slots; if any later
persistent-cache slot misses or mismatches its hash, fail cached lookup and mark
memory evidence NOT_RUN while continuing every remaining slot in order. The
operative measurement rules remain unchanged from v0.6.7. The author reports
W0-D/W0-E and all accepted thresholds/formulas/decision rows are byte-identical.
Candidate SHA-256 is `727FFC931CD90DDFC508B56CD7C0DF6455DE869968AA34D1DFC10AA4856A0F1B`;
independent exact-hash audit returned REWORK: the new status rule is present in
the operative text but still does not fully define how scalar cue points are
selected from labeled intervals for the compatibility formula. Add a
deterministic representative cue rule and enforce ordered valid cue pairs before
fixture freeze. Evidence remains NOT_RUN and the draft is unpinned; no W2-C
authority is granted. Candidate v0.6.9 is now available at
`E:\lalin-cr008-contract-drafts\20261020-v1\W0-DEF-v0.6.9-draft.md`,
SHA-256 `C613F2C50A35BB1909DE10EF8E83104A5126DA8B710D60AF17D5767B56338618`;
independent exact-hash re-audit returned REWORK as detailed below.

Exact-hash audit verified W0-D/W0-E and all checked owner-approved thresholds,
formulas and decision rows unchanged, and confirmed the pre-roll/scored-interval
and cache-slot rules are explicit. It found that annotated cue-in/out ranges are
not converted to scalar values required for score inputs `cueOutA` and `cueInB`,
so expected-eligibility could vary. It also requires every consolidated clip
reference to satisfy `0 <= cueIn < cueOut <= duration`. Candidate v0.6.9
proposes deterministic interval midpoints, rounding and invalid-pair handling
for principal confirmation. Candidate v0.6.8 hash is
`727FFC931CD90DDFC508B56CD7C0DF6455DE869968AA34D1DFC10AA4856A0F1B`; evidence
remains NOT_RUN and there is no W2-C authority. The v0.6.9 exact-hash audit
returned PASS; its principal decision remains pending.

### W0-F v0.6.9 candidate — independent audit PASS, principal decision pending — 2026-10-20

The contract author added a deterministic cue-reference method: for each
finalized cue interval, select its arithmetic midpoint and round to 0.01 seconds
using decimal ROUND_HALF_UP; record both interval endpoints, unrounded midpoint
and scalar. Map A's cue-out scalar to `cueOutA` and B's cue-in scalar to
`cueInB`. After rounding, every clip must satisfy
`0 <= cueIn < cueOut <= duration`; otherwise mark the pair unresolved and
replace it before manifest freeze, with no replacement making fixture evidence
NOT_RUN. The method and invalid-pair handling are listed for principal
confirmation. The author reports W0-D/W0-E and all accepted thresholds,
formulas and decision rows are byte-identical. Candidate SHA-256 is
`C613F2C50A35BB1909DE10EF8E83104A5126DA8B710D60AF17D5767B56338618`.
Independent exact-hash audit returned PASS for the unchanged owner-accepted
thresholds/formulas and deterministic cue/cache/dropout methods. Principal
confirmation and pin/start decision are pending. Evidence remains NOT_RUN; the
candidate is unpinned and grants no W2-C authority.

### Principal review — 2026-10-20 — W0-F pinned; W2-C start approved

The independent principal reviewer reverified DAG v0.1.46b SHA-256
E6516728990B62F7B0F174BB1122E59C2760DE7A9BEB26834F642FD63B684FC4
and W0-DEF v0.6.9 SHA-256
C613F2C50A35BB1909DE10EF8E83104A5126DA8B710D60AF17D5767B56338618,
then issued PIN_W0_F_v0.6.9, CLOSE_W0_F, and START_W2_C.
The pin accepts the candidate measurement methods: BPM denominator/rounding
and consensus; cue interval adjudication, midpoint/scalar mapping and invalid
pair replacement; confidence consolidation/classification; fixed Windows and
WASAPI settings; fixture sample and memory workload; cache slot failure/status
handling; the 900-second dropout loop, capture alignment and scoring; and
Wilson confidence intervals. Owner-accepted H1/H2, the score formula, fixture
counts and accuracy/coverage/pair-false-positive thresholds remain unchanged.
This freezes the evidence protocol only; it does not claim code or benchmark,
fixture-run or native-listening results.

The W2-C worker must first verify the exact W0-A artifact at
E:\lalin-cr008-snapshots\20261020-61151edf-03: base
61151edf69c5d0e66acaa976c6be42ca4fb46a47, 51-entry source digest
a4425e59043a6bd0814c5873db0c1456ded42e9b01a34f8b6adbe4675ed23f7a,
and manifest checksum
b6612d546aaacd4b0faabdb5064e33770ea8d11e70d7e2090306f99918afe899.
Before its first implementation write, it must record the changed-path scope
and its independent pre-write confirmation. W2-C owns the isolated analysis
module, confidence model, fixtures and resource benchmarks. Benchmark,
fixture-run and native-listening evidence remain NOT_RUN and are required at
W2-C exit. Acceptance evidence must use Windows 11 26H2 x64 Home/Pro with
4 CPU cores, 8 GiB RAM and CPU-only; the available 6-core/32-GiB host is not
a substitute. No other wave start or closure is authorized by this review.
W1-B/C and W2-A/B remain blocked.

### W2-C worker pre-write gate and START_WAVE — 2026-10-20

The assigned worker completed a read-only pre-write verification against DAG
v0.1.47b SHA-256 CE52B77CDF78C59A1061619D8175BE276A0E46997CE389205852931B5F183661
and returned PASS before edits or tests. In isolated worktree
E:\lalin-cr008-worktrees\w2-medley, detached HEAD is
61151edf69c5d0e66acaa976c6be42ca4fb46a47. The worker independently verified
the 51-entry W0-A artifact at E:\lalin-cr008-snapshots\20261020-61151edf-03:
source digest a4425e59043a6bd0814c5873db0c1456ded42e9b01a34f8b6adbe4675ed23f7a,
manifest checksum b6612d546aaacd4b0faabdb5064e33770ea8d11e70d7e2090306f99918afe899,
all overlay byte lengths/hashes, and the exact equality between manifest paths
and worktree Git status (33 modified, 18 untracked, no staged paths). The worker
also verified pinned W0-DEF v0.6.9 SHA-256
C613F2C50A35BB1909DE10EF8E83104A5126DA8B710D60AF17D5767B56338618.

After this PASS, the principal reviewer’s exact-hash START_W2_C decision was
activated as START_WAVE. The implementation scope is limited to:
apps/play-desktop/src-tauri/src/smart_medley.rs;
apps/play-desktop/src-tauri/src/smart_medley_store.rs;
narrow command registration in apps/play-desktop/src-tauri/src/lib.rs;
apps/play-desktop/src-tauri/tests/smart_medley.rs and synthetic deterministic
fixtures under apps/play-desktop/src-tauri/tests/fixtures/smart-medley/;
and a reproducible harness under apps/play-desktop/benchmarks/smart-medley/.
Cargo.toml/Cargo.lock may change only if a decoder or DSP dependency is proven
necessary. Held-out media, labels and JSONL run records stay local under
E:\lalin-cr008-evidence\w2-c\ and must not enter source control. React/UI,
playback engine, queue, transition and audio integration are excluded from this
wave. The worker must report any scope change before editing it.

### W2-C review-authorized schema-ID extension — 2026-10-20

The W2-C Genesis cache round-trip test reproduced a blocker before cache logic:
the pinned GenesisBlock dependency rejects the existing
`library_store.rs` schema package because `package_id: "lalin-play-cr007-v1"`
is not a UUID. The independent principal reviewer returned
`ALLOW_NARROW_SCOPE` for this exact correction in the W2-C worktree only. The
worker must first re-confirm that the file matches the W0-A snapshot SHA-256
`E22E13E74902BCA2FCEC07CD5B84EA5FCF78F0F202D97A934765606E9DE8AD11`, then may
change only `package_id` to the stable schema-v1 UUID
`00000000-0000-4000-8000-000000000001`. This matches the primary W1-D store's
existing schema-v1 identity. Do not change namespace, schema/table contents,
schema version, previous version, or migration flow. An optional single
regression assertion may be added only in the existing test module of
`smart_medley_store.rs`; keep all cache tests. Do not run against persistent
AppData. If a pre-existing `lalin_play` registry with another valid package ID
is found, stop for owner review. Never overlay the W0-A snapshot's older
`library_store.rs` onto the primary checkout; integrate W2-C-owned changes on
top of the current W1-D source.

The reviewer requires a diff-scope check, fresh temporary-database open/reopen
and stable-ID assertion, all W2-C cache tests, `npm run check:native`, and
scoped Rust formatting. At primary integration, rerun the cache/native checks
against the current W1-D store and confirm its v1→v3 migration chain remains
intact. This scope exception does not close W2-C or waive its accepted-profile
benchmark, fixture, or listening evidence.

In the v0.1.49b state, the worker resumed after the scope review and confirmed
the permitted `library_store.rs` hash before changing its package ID. Benchmark,
fixture-run and native listening remain NOT_RUN. Closure still requires the accepted Windows 11 26H2
x64 Home/Pro minimum profile (4 cores/8 GiB/CPU-only), all metric/fixture gates,
and 12+6 native listening evidence; the current 6-core/32-GiB host is not a
substitute. No other wave start or closure is authorized.

### W2-C exact-patch review and REWORK gate — 2026-10-20

The independent principal reviewer checked the exact W2-C patch and returned
static verdict `REWORK`, wave disposition `BLOCKED`. The reviewer verified the
authorized 12-path boundary and found no network, playback, gain or queue side
effects; fixture data is synthetic. Required in-scope rework is:

1. In `smart_medley.rs`, a partial user cue override must not raise the joint
   cue confidence above an automatic endpoint that remains low-confidence.
   Preserve the accepted formula and thresholds; add a regression test proving
   the partial override still falls back under the cue confidence floor.
2. In the benchmark host gate and evidence schema, enforce the accepted Windows
   11 26H2 GA x64 Home/Pro profile, the pinned 26300 build family and current
   public update state; reject unaccepted editions/builds before timing records
   can claim `acceptedProfile: true`.
3. In timing JSONL/schema, include monotonic start/end values and cache key,
   invalidation and persistent-read-path details required by W0-DEF v0.6.9.
   Other protocol-required fields must be explicit, including not-applicable
   values where a timing-only record does not use them.
4. Add deterministic pair-level regression coverage for identical/relative/
   fifth/incompatible keys, equal BPM, exactly 3% tempo ratio, phase-aligned and
   half-beat cues, the exact 0.70 score boundary, below-threshold fallback and
   repeated queue occurrences, including stable ordering/serialization.

The rebuilt integration test binary was blocked before execution by Windows
Application Control (OS error 4551); the qualified-query cache fix is not
runtime-verified. `npm run check:native` was not run because it launches cargo
tests. The lib unit-test target also has four pre-existing missing `Track`
fields in out-of-scope `migration.rs`. Do not retry or bypass Application
Control. Timing, fixture acceptance and native listening remain NOT_RUN; no
W2-C close or W3 start is authorized. Rework stays inside the 12-path scope
and the reviewer-authorized one-value schema-ID exception.

### W2-C bounded rework dispatch R1 — 2026-10-20

The same W2-C worker may address the four exact-patch REWORK findings above in
the existing isolated worktree and existing 12-path scope. For the benchmark
profile check, the official Microsoft release record as of 2026-10-20 identifies
Windows 11 26H2 GA as build family 26300 and the current October cumulative
update as KB5127648 / build 26300.9711. Require Home/Pro, 26H2, x64, exactly
4 physical CPU cores, 8 to under 9 GiB RAM, build family 26300 and UBR at least
9711; record installed KB/build/update date. Recheck the official Microsoft
release page immediately before accepted-profile evidence. If the current
public update has advanced beyond this baseline, update the versioned harness
profile and obtain review before a benchmark run; never claim current from a
recent hotfix date alone. Do not add network calls to the analyzer or weaken
the accepted host requirement.

After rework, static review and runtime/acceptance gates remain separate. Do not
retry the Windows Application Control-blocked test binary. Rebuild/compile-only
checks are allowed; runtime cache verification must wait for an execution
environment where the binary is permitted. The accepted-profile benchmark,
80-pair fixture acceptance and 12+6 native listening remain NOT_RUN until
actually run and reviewed. No W2-C closure or W3 start is authorized by this
rework dispatch.

### W2-C R1 exact-patch review — 2026-10-20

The worker completed R1 in the isolated W2-C worktree. The independent exact-
patch reviewer verified all 12 supplied SHA-256 values and returned static
`PASS`; wave disposition remains `BLOCKED`. Against the W0-A snapshot, exactly
four existing paths changed (`Cargo.toml`, `Cargo.lock`, `src/lib.rs`, and
`src/library_store.rs`) and eight W2-C paths were added. `library_store.rs`
contains only the pre-approved schema-v1 `package_id` literal change; `lib.rs`
adds Smart Medley registration. The 22 generated permission-file modifications
observed in the worktree are preserved pre-existing state and outside this
patch.

The reviewer confirmed the R1 fixes: endpoint overrides retain confidence for
the automatic endpoint; deterministic synthetic pair regressions cover the
required score/fallback cases; timing evidence records monotonic values and
explicit uncontrolled OS file-cache state; and the launcher enforces the
accepted Windows minimum profile. Static review found no network, playback,
queue, or gain side effects. Scoped rustfmt, JSON/PowerShell parsing,
`cargo check --lib`, `cargo check --test smart_medley`, and
`cargo check --bin smart-medley-benchmark` pass. Broad `cargo check --tests`
still fails on four existing, out-of-scope `Track` initializer errors in
`migration.rs` (1271, 1341, 1401, 1416). Runtime execution remains blocked by
Windows Application Control (OS error 4551); do not retry or bypass it.

Exact reviewed patch hashes:

| Path (relative to `apps/play-desktop/src-tauri`) | SHA-256 |
|---|---|
| `Cargo.toml` | `ceb9f8cfb03eca022cecf0e0eb56e066a4bc549009f589fa60568b67a47e2643` |
| `Cargo.lock` | `156d0a147bde048315df5e30f8a0d1f5880d5676ef6e5c5d04c98c1ed7dea540` |
| `src/lib.rs` | `7164eb76d9a3a953a35c867dfdce271200c8e47e2085dcb873ea9671ec1fdf71` |
| `src/library_store.rs` | `70cb8ca9e8efd5f109cd288a3de6c3baec2de07bbcd7bf4f57430469e5d91758` |
| `src/smart_medley.rs` | `7a175da7e6263efa077133468533ad629b54e19ea365a4daca27d5bbd80e4abf` |
| `src/smart_medley_store.rs` | `da1bab6bb03fec2c83febc780784f518886dc27e6b2a3413a648d547791efacf` |
| `tests/smart_medley.rs` | `1945109a23e5a50e000a25a81269f3fc17d3af505cd81686181641e87203c66b` |
| `benchmarks/smart-medley/fixture/cases.json` | `6e5d1a1778ee5a71a011a465087411e5b692dadea15cc924f7cbfaab8c81beb4` |
| `benchmarks/smart-medley/main.rs` | `5699dbaee024665a9872e61d50e4dff1de9a672fbcb78e882706a30c51853877` |
| `benchmarks/smart-medley/run.ps1` | `5f89f1a4ac497324b96780c84c9dc165c29676850207bc88030fc074bfbb0d68` |
| `benchmarks/smart-medley/evidence.schema.json` | `f3963ca647fd7d68d650d1f592bbaf108b1b1772879f6236bbe057d9cf064e84` |
| `benchmarks/smart-medley/README.md` | `e125931ab5c26594b0e34fe8a8d1365156bb5a448323a0398898d253bda4ef8c` |

The accepted-profile benchmark, 80-pair fixture acceptance, runtime cache
verification, and 12+6 native listening remain NOT_RUN. Static PASS does not
authorize `CLOSE_W2_C` or `START_W3`. Any primary-checkout integration is a
separate integrator operation that must preserve the reviewed W1-D store and
does not satisfy W2-C acceptance.

### W2-C bounded integration-compatibility rework R2 — 2026-10-20

Before primary integration, an independent reviewer found the R1 adapter sends
Genesis mutations with `schema_version: 1`, while the current primary W1-D
store registers schema v3. Genesis rejects mismatches with
`REL_SCHEMA_VERSION_CONFLICT`; the shared `settings(id,value)` table does not
make a v1 mutation valid under v3. Reviewer authorizes a narrow fix in the
existing W2-C lane, limited to `smart_medley_store.rs` and its existing cache
round-trip test in `tests/smart_medley.rs`.

R2 must read `get_relational_schema("lalin_play")`, fail closed if the schema
is absent, and use the registered version for both save and clear. Add tests
covering version selection for v1 and v3 packages plus save/load/clear without
changing the registered version. Do not edit `library_store.rs`, schema
packages/migrations or other paths. The isolated W2-C worktree has a v1 store;
unless a genuine v3 fixture is built without changing the store, it cannot
claim runtime verification against the composed primary v3 schema. Runtime
cache verification remains blocked by Application Control. At dispatch, R2
granted no `CLOSE_W2_C` or `START_W3`; primary integration remained separately
gated on a follow-up exact review.

### W2-C primary composition and exact integration review — 2026-10-20

After R2 exact-patch PASS, the integrator composed W2-C into the primary
checkout without replacing W1-D's `library_store.rs`. The primary edits add
the Smart Medley benchmark target and dependencies in `Cargo.toml`, generated
dependency additions in `Cargo.lock`, Smart Medley module and command
registration in `lib.rs`, and the eight new W2-C source/test/fixture/benchmark
files. The primary `library_store.rs` remains at its captured W1-D hash. The
independent reviewer verified the exact integrated hashes and returned
`PASS`; the final `lib.rs` hash was rechecked after sorting the two new module
declarations. No other primary dirty paths were changed.

Compile-only checks on the composed primary pass: `cargo check --lib`,
`cargo check --test smart_medley`, and
`cargo check --bin smart-medley-benchmark`. Dependency resolution added 20
packages without upgrades. JSON and PowerShell parsing pass, and rustfmt passes
for the new analyzer/cache/benchmark Rust files. Checking the whole primary
`lib.rs` reports one pre-existing formatting difference in the existing
`app_data_directory` assignment; it was left untouched. `git diff --check` on
the tracked integration edits passes (Git reports its existing LF/CRLF
normalization notices).

| Primary path | SHA-256 |
|---|---|
| `apps/play-desktop/src-tauri/Cargo.toml` | `6372A6BE4E82862293BAAA081185B245ACF68FD6BE757972F7187CAF134EF065` |
| `apps/play-desktop/src-tauri/Cargo.lock` | `156D0A147BDE048315DF5E30F8A0D1F5880D5676EF6E5C5D04C98C1ED7DEA540` |
| `apps/play-desktop/src-tauri/src/lib.rs` | `DB397DD91B52D703E1C61D1D29C2FEDD62F0ED4E4AE4BDD24044A322FAF5F9C8` |
| `apps/play-desktop/src-tauri/src/library_store.rs` (unchanged W1-D) | `71CAC57C6D724D4A488137B1612D3524A183306EA37F1A96143A1AD4A77F3B7B` |
| `apps/play-desktop/src-tauri/src/smart_medley.rs` | `7A175DA7E6263EFA077133468533AD629B54E19EA365A4DACA27D5BBD80E4ABF` |
| `apps/play-desktop/src-tauri/src/smart_medley_store.rs` | `8FA9C3444A34C24618618CC4D0F69B1C1C6B92D79CB8D021B4B4CFB52127A16F` |
| `apps/play-desktop/src-tauri/tests/smart_medley.rs` | `A73A192ADED2ED233A11EC21D5BF48FC1F2BEB3A952582DCFE133F0A4FFADB44` |
| `apps/play-desktop/src-tauri/tests/fixtures/smart-medley/cases.json` | `6E5D1A1778EE5A71A011A465087411E5B692DADEA15CC924F7CBFAAB8C81BEB4` |
| `apps/play-desktop/benchmarks/smart-medley/main.rs` | `5699DBAEE024665A9872E61D50E4DFF1DE9A672FBCB78E882706A30C51853877` |
| `apps/play-desktop/benchmarks/smart-medley/run.ps1` | `5F89F1A4AC497324B96780C84C9DC165C29676850207BC88030FC074BFBB0D68` |
| `apps/play-desktop/benchmarks/smart-medley/evidence.schema.json` | `F3963CA647FD7D68D650D1F592BBAF108B1B1772879F6236BBE057D9CF064E84` |
| `apps/play-desktop/benchmarks/smart-medley/README.md` | `E125931AB5C26594B0E34FE8A8D1365156BB5A448323A0398898D253BDA4EF8C` |

This exact integration review is static only. Runtime verification against
the primary v3 database, the accepted-profile benchmark, 80-pair fixture
acceptance, and 12+6 native listening remain NOT_RUN. No `CLOSE_W2_C` or
`START_W3` is authorized.

### Owner response on runtime environment — 2026-10-20

The owner confirmed that only the current workstation is available; there is
no other physical machine or VM. Current workstation inventory: Windows 11 Pro
x64, 6 physical cores, and 31.96 GiB RAM. It does not match the accepted
Windows 11 26H2 Home/Pro x64 benchmark profile of 4 physical cores and 8 to
less than 9 GiB RAM. The earlier test-binary execution was denied by Windows
Application Control (OS error 4551). Do not retry or bypass that control, and
do not emulate the required profile by constraining this workstation. Runtime
v3 database behavior, accepted-profile timing, 80-pair fixture acceptance,
and 12+6 native listening remain NOT_RUN. W2-C stays BLOCKED; this response
does not authorize `CLOSE_W2_C` or `START_W3`.

### W0-C feasibility continuation — 2026-10-20

The owner directed that W2-C's unavailable runtime evidence be skipped for
now while other CR-008 work continues. This defers the W2-C evidence task; it
does not waive the accepted W2-C exit criteria or authorize W3.

A read-only inventory of the available workstation found Node 24.20.0 and npm
11.19.0, but no JDK, Android Studio, Gradle, adb, Xcode, Android SDK paths or
mobile project root under `apps/`. The current React Native setup guide says
the bare native workflow needs a JDK and Android Studio/SDK for Android,
recommends Node 22.11+ and JDK 17, and identifies Android SDK Platform 35 and
Build Tools 36.0.0 for its current example. It also says a Mac is required to
build native-code iOS apps. Apple's Xcode documentation confirms Xcode is
provided for supported macOS versions. These are current unpinned references,
not version-matched Lalin build evidence:

- React Native environment setup: <https://reactnative.dev/docs/next/set-up-your-environment>
- Apple Xcode system requirements: <https://developer.apple.com/xcode/system-requirements/>

Disposition at this audit: W0-C remained BLOCKED before the owner decision
recorded below. Android was not build-verified on this host; native iOS cannot
be built here. React Native and native adapter versions were unselected. No
tooling was installed and no W1-B/C or G1 start was authorized.

### Owner-approved mobile client split — 2026-10-20

The owner approved the product target split in CR-008 v0.5.0b:
responsive web remote for iOS Safari and Android Chrome; native iOS is deferred;
native Android Host is optional and requires a separate W0-C selection. W1-C is
Controller-only; Host grants, phone-file endpoints and streaming belong to W2-A
and require its dependency review plus explicit `START_W2_PHONE_FILES`. The PC
remains the playback/session authority. A phone and PC on the same reachable LAN
can use the remote while the PC has no Internet. The client must address the PC's
LAN IP or invited hostname; localhost/127.0.0.1 point back to whichever device
opened the URL. AirPlay may route phone audio only to an AirPlay-compatible
receiver; it does not implement Lalin queue control or PC dual-deck mixing.

This is a product-target decision, not a W0-C close or a wave START. The pinned
W0-B contract currently describes a native client: exact self-signed SPKI pin,
a phone-held P-256 key and device-only OS credential storage. The browser target
needs a separately reviewed way to preserve TLS identity and credential
protection; do not assume generic browser storage or HTTP on a private LAN meets
that contract. A non-local HTTP origin is not a secure context for browser APIs
such as Service Worker, so offline/PWA capability would also need trusted HTTPS.
No trust-all certificate override, bearer token on HTTP, WAN exposure or
credentialless mutation is authorized.

W0-B/C therefore require a jointly reviewed browser-profile amendment before
W1-B/C or G1 can start. The native-only candidate described in earlier DAG
revisions has been superseded by the browser-amended v0.4.10-draft recorded
below; that amendment is still not principal-accepted, and selected-device
TLS/CSP evidence is absent. Native Android toolchain and OS host evidence are
required only if that profile is selected; native iOS build evidence is not
required under the approved split.
iOS Safari is a remote-only W1-C client; any foreground file copy is W2-A gated,
and background phone-hosting is not promised. W0-E/W2-B still need a browser OAuth
and token-handling decision. W2-C remains deferred with all accepted evidence
criteria unwaived.

### Browser-first documentation package — candidate, 2026-10-20

The approved CR-008 browser direction now has three linked candidate documents: [ADR-006](ADR-006-LALIN-PLAY-BROWSER-FIRST-MOBILE-REMOTE.md), [System Integration Specification](LALIN_PLAY_MOBILE_REMOTE_SIS.md), and [Functional Flow Specification](../design/LALIN_PLAY_MOBILE_REMOTE_FUNCTIONAL_FLOW_SPEC.md). This DAG is the implementation plan; this documentation update is not a wave START.

At the 2026-10-20 browser-first documentation snapshot, the external W0-B/C candidate was v0.4.10-draft; that point-in-time pointer is superseded. The current external candidate is E:\lalin-cr008-contract-drafts\20261026-v7\W0-BC-draft.md v0.4.16-draft, SHA-256 0603F8637F4BD74AA66EAF014DEA221588BF1D221A240CDB0C73FA103240B5B9. The prior v0.4.9 security PASS does not approve this browser amendment. The owner accepts iPhone evidence for progression review only; full-contract principal acceptance and W0-C network/security evidence remain open.

Astra's review adds these planning constraints: the current flow opens the trusted origin before the page camera scans the PC's structured, expiring invite; the invite is a short-lived secret carrier but is not a URL containing that secret. IP mode requires manual per-PC CA installation/full trust; hostname mode still needs owner-controlled FQDN, local name resolution and certificate-lifecycle proof. The page-memory key requires re-pair after reload. Current candidate has no service-worker offline cache or background guarantee. Internet-off works only when the PC serves the page and the LAN route remains reachable; same SSID is not proof.

The exact document package remains candidate under the Lalin review gate. W0-B/C stay open until contract and document revisions are reconciled, independently reviewed and device/network evidence is recorded.

### Current readiness register — candidate v0.1.87b; exact contract and firewall-proposal reviews PASS; execution blocked by Windows elevation and retained copy; W0-C gates remain open — 2026-10-26

| Gate | Current state | Decision evidence / blocker | Owner |
|---|---|---|---|
| W0-A source snapshot | CLOSED | Reviewer verified base SHA 61151edf69c5d0e66acaa976c6be42ca4fb46a47; 51 source files match in the pinned snapshot and worker overlay; digest a4425e59043a6bd0814c5873db0c1456ded42e9b01a34f8b6adbe4675ed23f7a and manifest checksum verified. The worker independently confirmed the exact pre-write inputs; four existing primary W1-D target files matched the snapshot before integration, and seven other primary paths whose contents differed from the snapshot were preserved. | Integrator + reviewer |
| W0-B remote protocol contract | CLOSED for native profile on v0.4.3; browser amendment is current candidate v0.4.16-draft, not principal-accepted | Exact candidate E:\lalin-cr008-contract-drafts\20261026-v7\W0-BC-draft.md SHA-256 0603F8637F4BD74AA66EAF014DEA221588BF1D221A240CDB0C73FA103240B5B9. Astra PASSed exact document reconciliation on DAG v0.1.78b; this is not full-contract approval. The owner accepts the iPhone Safari probe for the next review checkpoint only; W0-C device evidence is scoped to iPhone, while Android remains in the product profile and its device/floor qualification is deferred to W1-C/product-release acceptance. Full-contract principal acceptance, network/isolation evidence and joint VG-0 remain open. No browser-profile closure or implementation START is claimed. | Architecture owner + contract author + principal reviewer |
| W0-C browser transport feasibility sublane | IMPLEMENTED — exact-source/static, host HTTPS/WSS and iPhone Safari plus Android Chrome capability/WSS probes PASS; owner accepts iPhone probe for progression checkpoint only; OPEN for selected-origin network/security evidence | 16-file source manifest E:\lalin-cr008-snapshots\20261020-w0c-browser-transport-feasibility\source-manifest.json SHA-256 b228de39751717e2dd1c96a63169116d1f666f977fa324ce92c9f3060016d7b7; Astra exact-source review PASS; package npm test 22/22 and build PASS. Current W0-B/C v0.4.16-draft SHA-256 0603F8637F4BD74AA66EAF014DEA221588BF1D221A240CDB0C73FA103240B5B9; selected-origin manifest SHA-256 2A57FBB0C38E7EA9AC6635807E67B06AADD17BAD6D19F67AAFAB3F25A354809C. Pairing, playback and product queue acceptance are not covered. | Feasibility worker + integrator + Astra reviewer |
| W0-C mobile platform/security | BLOCKED — the owner accepts the iPhone Safari probe as sufficient device evidence for this checkpoint; Android probe is supplemental PASS and Android device qualification is deferred to W1-C exit/release. The exact firewall proposal is reviewed PASS and owner-approved, but execution is blocked by this shell lacking an Administrator token. | Contract v0.4.16-draft remains not principal-accepted; proposal v0.3 SHA-256 `962D2F38806026C7F4C61ED403AA611CC6396A11D56333DD61652A450AAD084D`. Fresh preflights passed; `New-NetFirewallRule` returned Access is denied; rule count 0, listener 0, no pre-existing rules changed. A verified Node runtime copy remains at `C:\Users\suanr\AppData\Local\Lalin\W0C\20261026-isolated-node\node.exe`; the destination-absent guard now fails, and cleanup was rejected by tool safety policy. Do not reuse or overwrite the copy. Resume only after permitted exact cleanup or an independently reviewed recovery disposition. Internet-off/LAN-on, client isolation, iPhone CA removal, exact iOS/WebKit build, full-contract principal acceptance and joint VG-0 remain open. No W0-C closure or G1/W1 START. | Architecture owner + security reviewer + principal reviewer |
| W0-D media-store seam contract | CLOSED/FROZEN on v0.6.2 | Owner accepted D-Q1/D-Q2; verifier PASS and exact hash pinned; principal returned CLOSE_W0_D. Visibility-gated publication/reconciliation; no Genesis/cross-store atomicity claim. W1-D VG-1 and principal `CLOSE_W1_D` are complete for the local object-store/finalizer scope. | CR-007 storage owner + contract author + verifier + principal reviewer |
| W0-E YouTube policy | OPEN — owner decisions recorded; policy draft prepared but incomplete/unpublished | Owner approved E-Q1/E-Q3/E-Q5 in external W0-DEF v0.6.10-draft, SHA-256 `7176A9552462F1BFA7E0A311F50BD0652DAF2F95738AB1CB37C43B8233ABBAAA`; exact-candidate review PASS. Internal Terms/Privacy draft v0.2 SHA-256 `30C8BA8DE19C81296F50F1360EFC2C7DC300CD0F83D669FF16ED69C4B56A7E06` includes the seven required links and public-key/project-quota/key-removal disclosure, but remains unpublished and incomplete. Legal owner/contact, stable URLs, exact data inventory, selected-client key storage/restrictions/rotation and verified in-app removal, OAuth handling and consent evidence remain open. No YouTube API calls before policy/consent acceptance. | YouTube lane owner + policy owner + contract author + principal reviewer |
| W0-F Smart Medley contract | CLOSED/PINNED — v0.6.9 exact hash | Principal reviewer issued PIN_W0_F_v0.6.9 and CLOSE_W0_F after exact-hash audit PASS. Candidate method choices are frozen; owner-accepted H1/H2, score formula, fixture counts and thresholds are unchanged. This is protocol acceptance only. Benchmark/fixture/listening evidence remains NOT_RUN and is W2-C exit evidence. | Contract author + verifier + principal reviewer |
| W1-A audio and transition | CLOSED — `CLOSE_WAVE_HOLD` | Principal reviewer closed the nine-path scope after VG-1 #3 PASS. All nine primary-checkout file hashes match the reviewed worktree; primary `npm test` 16/102, `npm run build`, and scoped `git diff --check` pass. Native remains OS-blocked/NOT_RUN. This close does not authorize a successor. | Audio worker + verifier + principal reviewer + integrator |
| W1-B/C remote/mobile | BLOCKED | Wait for joint W0-B/C closure for the approved browser/native profiles, accepted VG-0 and lane-specific reviewer START. G1 is mandatory and needs W0-A, joint W0-B/C closure, accepted VG-0 and its own reviewer START. Browser W1-C is Controller-only; no Host/file endpoint is enabled there. Mutation/enrollment/rotation remain disabled until G1 PASS. | Remote/mobile owners + principal reviewer |
| W1-D PLAY-19 local media store | CLOSED — `CLOSE_W1_D` | Principal reviewer checked exact DAG v0.1.38b SHA-256 `8E4DE8BEC10212159865E1AD54CD03D23764E694E33A6A9FC812FBBF0511549B` and exact source hashes `71CAC57C6D724D4A488137B1612D3524A183306EA37F1A96143A1AD4A77F3B7B` / `8C855DD9A6B9E89D3BF1FE0790149FD2A526C8BE06CB22896C16A57926900EC4`. VG-1 and primary native `check:native` passed 54/54; scoped rustfmt passed. Reviewer accepted tested same-ID/content retirement scope and determined hash-wide retirement is not required. Limits: full-crate formatting differences in unchanged `lib.rs`/`migration.rs`, non-atomic legacy JSON/Genesis dual-write, power-loss NOT_RUN and transfer lifecycle limits deferred. W2-A remains BLOCKED by W1-B/C. | Storage worker + integrator + verifier + principal reviewer |
| W2-A phone files | BLOCKED | W1-D is closed; wait for W1-B/C closure, reviewed W0-D, PLAY-23 entry review and explicit `START_W2_PHONE_FILES`. No Host grant, sender/receiver endpoint or stream implementation starts before that gate. | Transfer owners |
| W2-B YouTube | BLOCKED | Wait for W1-B/C and W0-E closure. E-Q1/E-Q3/E-Q5 are owner-approved in W0-DEF v0.6.10-draft; the internal Terms/Privacy draft is incomplete and unpublished. Recorded consent, selected-client API-key provisioning/storage/restrictions/rotation, user-project quota disclosure and verified key removal, OAuth registration/token handling and deletion evidence remain open. Keep public API-key and private/unlisted OAuth paths distinct. No API calls or YouTube references entering playback/cache before consent and explicit local-track mapping. E-Q4 remains live-provider acceptance only. | YouTube/policy owners + principal reviewer |
| W2-C Smart Medley | DEFERRED / BLOCKED — exact primary integration static PASS; accepted runtime/acceptance gates unmet; no compliant alternate environment | R1 and R2 exact-hash reviews pass; the integrated primary patch preserves W1-D `library_store.rs` hash and uses the registered schema version for mutations. Primary `cargo check --lib`, `--test smart_medley`, and `--bin smart-medley-benchmark` pass; JSON/PowerShell parsing and scoped rustfmt pass. The owner asked to skip this evidence task for now while other work continues. The owner confirmed no other machine or VM is available. Current workstation is Windows 11 Pro x64, 6 physical cores, 31.96 GiB RAM, outside the accepted 4-core/8-to-<9-GiB benchmark profile. Test-binary execution was denied by Windows Application Control (OS error 4551); do not retry or bypass. Runtime v3 database behavior, accepted-profile benchmark, 80-pair fixture acceptance and native listening remain NOT_RUN. Deferral does not waive the accepted exit criteria. No `CLOSE_W2_C` or `START_W3`. | Analysis worker + verifier + principal reviewer |

Current disposition: The planning wave remains CLOSED with CLOSE_WAVE_HOLD based on the principal's earlier READY for v0.1.29b. W0-D is CLOSED/FROZEN on v0.6.2 with START_W1_STORAGE; W1-D is CLOSED with principal CLOSE_W1_D for exact DAG v0.1.38b hash 8E4DE8BEC10212159865E1AD54CD03D23764E694E33A6A9FC812FBBF0511549B, after VG-1 PASS and primary native 54/54. W0-A, the native-profile W0-B contract, W0-F and W1-A are closed; the owner-approved browser profile reopens W0-B/C for a jointly reviewed TLS identity and credential design. W0-C remains BLOCKED; the isolated browser transport harness passed exact-source review and scoped tests/build, the selected IP-mode certificate/key passed harness configuration validation, and host-local HTTPS/WSS runtime smoke passed with strict TLS verification and origin/Host rejection checks. The temporary feasibility listener was stopped after the iPhone and Android capability tests; a check at 2026-10-26T20:04:48+07:00 found no listener on port 4443. No firewall rule or Windows root-store trust was changed. The owner has since provided an iPhone 12 Pro Max Safari screenshot showing private-IP HTTPS page load, secure context and camera API available, permission granted with temporary tracks stopped, and a matching same-origin WSS nonce; this is capability-only evidence, not pairing or playback acceptance. The iPhone Safari and Android Chrome capability/WSS probes passed. Android floor support is not established, and the iOS/WebKit version was not recorded. Internet-off/LAN-on remains NOT_RUN; isolation remains open due to the broad inbound rule; Android CA removal is confirmed and iPhone CA removal is unverified. The feasibility sublane remains OPEN. A current firewall inspection found enabled TCP and UDP Allow rules for the harness node.exe on Public, Any local port and Any remote address; this broad scope is not LAN-only and was not changed by Codex. No remote mutation endpoint, enrollment or G1 start. Native Android toolchain evidence is also outstanding if Android Host is selected. W0-F v0.6.9 is pinned. W2-C R1/R2 and exact primary integration have independent static PASS, and the reviewed code is integrated in the local primary working tree with W1-D `library_store.rs` unchanged. W2-C evidence collection is DEFERRED at the owner's request, but criteria remain BLOCKED and unwaived because runtime verification against v3, accepted-profile benchmark, fixture acceptance and listening evidence are NOT_RUN. The owner confirmed no other physical machine or VM is available; the current Windows 11 Pro x64 workstation has 6 physical cores and 31.96 GiB RAM, outside the accepted 4-core/8-to-<9-GiB profile. The prior runtime attempt remains Windows Application Control-blocked (OS error 4551); do not retry or bypass. No W2-C close or W3 start is authorized. W0-E E-Q1/E-Q3/E-Q5 are owner-approved and recorded in W0-DEF v0.6.10-draft; an internal Terms/Privacy candidate exists but remains incomplete and unpublished. W0-E is OPEN for owner identity/contact, policy publication/consent and selected-client credential configuration. G1 remains mandatory but blocked on the jointly reviewed W0-B/C amendment, accepted VG-0 and its own explicit START. W1-B/C remain BLOCKED, so W2-A/B remain BLOCKED. No other successor start or closure was authorized.

### W0-E owner-decision integration — candidate v0.1.61b — 2026-10-20

The owner approved E-Q1, E-Q3 and E-Q5 on 2026-10-20 in external W0-DEF v0.6.10-draft (SHA-256 `7176A9552462F1BFA7E0A311F50BD0652DAF2F95738AB1CB37C43B8233ABBAAA`). Independent exact-candidate review returned PASS. This DAG revision is still a candidate pending its own independent review; the decision record is not policy publication, provider approval, W0-E closure or authority to start W2-B.

- **E-Q1 — public playlist authorization (accepted):** Each user supplies an extractable YouTube Data API v3 key for public playlist metadata. Without a configured key, keep the playlist as an external URL and do not enumerate it. Private/unlisted playlists require the user's OAuth grant through a public client, system browser, PKCE S256 and exact `youtube.readonly` scope; never fall back to an API key. Before W0-E closes, resolve selected-client key entry/storage, feasible API restrictions, quota/billing and rotation ownership. Do not bundle, commit, log, relay or proxy the key.
- **E-Q3 — relay owner isolation (accepted):** Random local `authorizationOwnerId` plus `pairBindingId` scopes each collection to its authorizing local profile and exactly one paired PC. Pairing reset, profile change or PC replacement requires explicit reauthorization; another phone/profile/PC and stale pairing epochs cannot access, refresh or delete the collection.
- **E-Q5 — lifecycle and deletion (accepted):** PC relay lease is 7 days; phone API Data refresh/delete is within 30 days; in-app OAuth revocation sends token revocation immediately and deletes Authorized Data ASAP within 7 days; Google Security-settings revocation deletes related API Data ASAP within 30 days. For an offline PC, keep a signed phone-side tombstone and apply it before displaying cached API metadata after reconnect; the lease bounds offline copies. Allow at most 3 transient attempts with 1s/5s/30s backoff.

**W0-E remains OPEN.** Before an explicit reviewer closure decision or W2-B start, all of these must be evidenced:

1. Publish stable, publicly accessible HTTPS Terms and Privacy Policy URLs. Terms must link YouTube Terms of Service and state that using the Lalin API client means agreeing to YouTube Terms. Before the first API call, the consent surface and published Privacy Policy must expose working links to all seven W0-DEF references: YouTube Terms of Service (`https://www.youtube.com/t/terms`), YouTube API Services Terms (`https://developers.google.com/youtube/terms/api-services-terms-of-service`), YouTube Developer Policies (`https://developers.google.com/youtube/terms/developer-policies`), Google Privacy Policy (`https://policies.google.com/privacy`), Google Account Security settings (`https://myaccount.google.com/security`), Google connected apps (`https://myaccount.google.com/linkedapps`), and the exact revocation page (`https://security.google.com/settings/security/permissions`). Privacy must identify the responsible owner and privacy contact; disclose YouTube API use, accessed/collected/stored/used/shared data and retention/deletion; explain in-app and Google-settings revocation; and disclose that each public-playlist user supplies an extractable key associated with their own Google Cloud project, API calls use that project's quota, and how to remove the key both from Lalin Play and from that Google Cloud project. Link the API Credentials page and key-management guidance for the user's key-removal path.
2. Record affirmative acceptance of the applicable policy version before any YouTube API feature or API call is available; preserve consent evidence and provide a usable revoke/delete path.
3. Review and evidence selected-client API-key provisioning/storage/restrictions, in-app key removal, quota-exhaustion behavior and the OAuth client registration, redirect, PKCE, token storage, refresh and deletion behavior. Browser OAuth/token handling must align with the jointly reviewed W0-B/C profile; do not assume browser OS secure storage.
4. Have the verifier and principal reviewer assess the exact frozen client and policy artifacts. Keep E-Q4 as a separate live-provider acceptance item; no provider approval is claimed.

Until those gates pass, make no YouTube API calls. YouTube audiovisual content remains prohibited from unauthorized download/import/backup/cache/offline playback. A reference remains non-playable until the user explicitly maps it to a local-owned track. W2-B remains BLOCKED by W1-B/C and W0-E.
### W0-E Terms/Privacy draft — candidate v0.1.64b — 2026-10-20

An internal-only W0-E Terms/Privacy working draft v0.2 is available at `E:\lalin-cr008-contract-drafts\20261020-v1\W0-E-TERMS-PRIVACY-v0.1-draft.md`, SHA-256 `30C8BA8DE19C81296F50F1360EFC2C7DC300CD0F83D669FF16ED69C4B56A7E06`. The revision adds the seven links required by W0-DEF and discloses the user-supplied key's extractability, Google Cloud project quota use and removal path, with official Google Cloud key-management references. It is not published and is not accepted as a policy or consent artifact. It keeps these required fields blocked: legal owner and privacy/support contact, stable public URLs, exact W2-B data-field inventory, selected-client API-key entry/storage/restrictions/rotation and verified in-app removal, OAuth registration/redirect/token storage, any additional processors/cookies/device storage, and implemented consent/revoke/delete evidence. No API calls or W2-B start are authorized by this draft.
An internal-only W0-E Terms/Privacy working draft v0.2 is available at `E:\lalin-cr008-contract-drafts\20261020-v1\W0-E-TERMS-PRIVACY-v0.1-draft.md`, SHA-256 `30C8BA8DE19C81296F50F1360EFC2C7DC300CD0F83D669FF16ED69C4B56A7E06`. The revision adds the seven links required by W0-DEF and discloses the user-supplied key's extractability, Google Cloud project quota use and removal path, with official Google Cloud key-management references. It is not published and is not accepted as a policy or consent artifact. It keeps these required fields blocked: legal owner and privacy/support contact, stable public URLs, exact W2-B data-field inventory, selected-client API-key entry/storage/restrictions/rotation and verified in-app removal, OAuth registration/redirect/token storage, any additional processors/cookies/device storage, and implemented consent/revoke/delete evidence. No API calls or W2-B start are authorized by this draft.

#### Independent exact-hash review — REWORK — 2026-10-20

The independent reviewer verified DAG v0.1.63b SHA-256 `469B6D2A73A60BE0DF81C16D863D9C981CEFB9F4C30030869F6DB0657D84D53A`, W0-E draft v0.2 SHA-256 `30C8BA8DE19C81296F50F1360EFC2C7DC300CD0F83D669FF16ED69C4B56A7E06`, and W0-DEF v0.6.10 SHA-256 `7176A9552462F1BFA7E0A311F50BD0652DAF2F95738AB1CB37C43B8233ABBAAA`. The policy's seven links and key/quota disclosure were consistent, but the current readiness register was stale: its heading named v0.1.62b and the W0-E row cited the superseded draft hash. This v0.1.64b candidate reconciles the readiness heading and register/hash. The reviewer authorized no W0-E closure or W2-B start; the current candidate requires a new exact-hash review.
### W0-C browser shell feasibility START_WAVE and pre-write gate — 2026-10-20

The independent reviewer returned `START_WAVE` for the bounded sublane
`W0-C-BROWSER-SHELL-FEASIBILITY` after reviewing DAG v0.1.58b SHA-256
`19E4041482B110DF111CD82F9B0E8C0D15562B90D4854AACEEA84E932632E200`, CR-008
v0.5.1b SHA-256
`B598C319D6CEFB56FCDD7D9D66BF62EE8E4AE72C54758A2F2D62C519A9E4C620`, and the
read-only browser feasibility audit. The approved path and scope are only
`apps/play-remote-web-spike/**`: a static responsive Controller shell with
mock, in-memory UI state. The spike may not import or integrate with
`apps/play-desktop` or Tauri, nor implement pairing, credentials, TLS/WSS,
gateway access, remote mutations, persistent storage, Host/file handling,
streaming, or audio integration.

Before the first source write, the worker confirmed the W0-A pre-write inputs:
base SHA `61151edf69c5d0e66acaa976c6be42ca4fb46a47`; snapshot
`E:\lalin-cr008-snapshots\20261020-61151edf-03`; 51 entries; source digest
`a4425e59043a6bd0814c5873db0c1456ded42e9b01a34f8b6adbe4675ed23f7a`; manifest
SHA-256 `b6612d546aaacd4b0faabdb5064e33770ea8d11e70d7e2090306f99918afe899`; all
51 overlay paths and byte lengths match the manifest; the target package path
does not exist; unrelated dirty paths remain outside this lane's scope.

The feasibility audit found the existing Play app is a Tauri desktop player
with native imports and local media URLs; it is not a reusable browser remote.
An isolated static package is the smallest clean proof. A local build or
emulated viewport does not prove real iOS Safari/Android Chrome support or set
their version floors. W0-C remains blocked on the browser TLS identity and
credential design, selected supported-browser floors, device evidence,
independent contract review, and joint W0-B/C re-review. This START did not
authorize W1-C, W1-B, G1, or any later wave.

The implementation completed within the authorized static-shell scope. The
reviewer returned `CLOSE_SPIKE` for `W0-C-BROWSER-SHELL-FEASIBILITY` only. The
reviewed eight-file source manifest SHA-256 is
`7811B1587B152E4A59362CBDADDB62A418FFB5C688DE454A73F8DC3DB7CAB54E`; source
inspection confirmed mock-only in-memory behavior and no network, persistence,
credential, audio, or device integration. `npm ci --ignore-scripts --no-audit
--no-fund` and `npm run build` passed; no tests were run. This sublane is
closed, but W0-C remains blocked. An independent review of browser contract
candidate v0.4.5-draft returned `REWORK` at SHA-256
`5FC3AAAA63E65A0E0116A14B51A898B3C517B78B48537214B7BF757DD6378072` for three
open issues: the local CA has broader trust and recovery implications; CSP
directives and the permitted WebSocket endpoint need a testable definition;
and invited-hostname scope must align with the IP-only origin and certificate
SAN or be explicitly narrowed. No W0-B/C closure, W1-C, G1 or later start is
authorized.

### W0-C browser TLS transport feasibility implementation — candidate v0.1.68b — 2026-10-20

Astra issued `START_WAVE` for the exact sublane against DAG v0.1.67b SHA-256 `66EAE0155FB246809769D42E41CBAA26BAE2CCA58EFD1D11E4E913C9FC3B55E7`; worker prewrite confirmation is recorded in `E:\lalin-cr008-snapshots\20261020-w0c-browser-transport-feasibility\prewrite-manifest.json` SHA-256 `7bea4949e33b4b71772a04e6da53ddedc8db0a9cfaed385e0fe14ce22e9b6080`.

The isolated package `apps/play-remote-tls-feasibility/**` serves a static ENG-default, ENG/TH capability page and an explicit-origin HTTPS/WSS nonce probe. Source review confirmed RFC1918 interface binding, explicit IP or owner-controlled public-FQDN mode, exact single SAN matching, strict same-origin routes/CSP, disabled persistence and product controls, finite WSS connection/deadline limits, and no certificate/trust-store modification. Final source manifest: `E:\lalin-cr008-snapshots\20261020-w0c-browser-transport-feasibility\source-manifest.json`, SHA-256 `b228de39751717e2dd1c96a63169116d1f666f977fa324ce92c9f3060016d7b7` (16 files).

Astra returned exact-source `PASS`. Independent package-scoped verification on Node v24.20.0 passed `npm test` 22/22, `npm run build` (6 JavaScript files and 3 static assets), and `npm ls ws --depth=0` with `ws@8.22.0`. The HTTPS/WSS listener was not started. Real iPhone Safari, Android Chrome, selected certificate trust, LAN reachability, Internet-off/LAN-on and isolation evidence remain NOT_RUN. This closes only the implementation/source-review portion; the feasibility sublane remains OPEN, W0-C remains BLOCKED, and G1/W1-B/W1-C/W2-A/B/W3 receive no START.

## Change history

| Version | Date | Status | Summary | Source |
|---|---|---|---|---|
| 0.1.81b | 2026-10-26 | candidate — exact contract review PASS; firewall scope proposal drafted; W0-C remains BLOCKED | Propose a temporary TCP/4443 LAN allow and disable only the two matching broad rules; leave all unrelated rules untouched; seek independent review before owner approval | Firewall audit A24F06FD2F4ED025E83926EE0485BDF39617673CA7E132F1B0E46DA48F688356 + exact proposal hash |
| 0.1.76b | 2026-10-26 | candidate — iPhone-only device evidence accepted for progression checkpoint; Android floor deferred to W1-C/product-release acceptance; network/security and principal gates remain OPEN | Reconcile active W0-C criteria and current disposition with the owner checkpoint; keep Android support and separate security/contract gates | Owner direction + exact-hash Astra review pending |
| 0.1.75b | 2026-10-26 | candidate — owner accepts iPhone-only device evidence for next review gate; W0-C remains BLOCKED | Reconcile iPhone-only device-evidence decision into the readiness register; preserve Android support scope and network/security/principal gates | Owner direction + exact-hash reviewer disposition pending |
| 0.1.74b | 2026-10-26 | candidate — Android Chrome capability/WSS PASS; W0-C remains BLOCKED | Record Android physical-device evidence, post-test Android CA removal and stopped test listener; retain LAN isolation and acceptance gates | Android Chrome UI evidence + CA removal screenshot + current manifest |
| 0.1.73b | 2026-10-26 | candidate — awaiting exact-hash review; iPhone Safari capability/WSS PASS; Android and network/security evidence open | Record owner-provided iPhone capability and WSS result with screenshot hash; reconcile effective Node firewall exception; retain W0-C and successor holds | iPhone screenshot + current firewall/manifest evidence |
| 0.1.72b | 2026-10-26 | candidate — awaiting exact-hash review; host-only HTTPS/WSS recheck PASS; mobile/LAN evidence and principal acceptance open | Record the 2026-10-26 endpoint/certificate recheck with pinned smoke artifacts and current preparation-manifest hash; preserve W0-C and successor-start holds | Host-runtime smoke + preparation manifest + listener/TLS recheck |
| 0.1.71b | 2026-10-21 | candidate — v0.1.70b exact-hash review REWORK corrected; host-local HTTPS/WSS smoke PASS; phone trust and LAN evidence open | Label the v0.1.69b manifest/listener statements as historical after the manifest path was updated in place; retain the current exact host smoke and all device/network/acceptance holds | Astra exact-hash REWORK on v0.1.70b + corrected historical references |
| 0.1.70b | 2026-10-21 | candidate — exact-hash review REWORK; host-local HTTPS/WSS smoke PASS, phone trust and LAN evidence open | Record strict host-side selected-IP HTTPS/WSS checks and smoke evidence; review found prior manifest/listener observations needed explicit historical labels; W0-C remained BLOCKED and no successor START was issued | Hashed host runtime smoke + Astra exact-hash REWORK |
| 0.1.69b | 2026-10-21 | candidate — W0-C IP/per-PC-CA selected; contract reviewed; certificate ready; live evidence and principal acceptance open | Record exact v0.4.14 contract review, owner-selected private-IP trust mode, bounded certificate preparation and current W0-C blockers; authorize no closure or successor start | Astra exact-candidate PASS + owner device/mode decisions + harness certificate validation |
| 0.1.68b | 2026-10-20 | candidate — W0-C transport harness implemented and exact-source/static PASS; live evidence NOT_RUN; sublane remains OPEN | Record Astra START, worker prewrite, exact source manifest/review, package verification and live-device/network limits; issue no successor START | Astra exact-source PASS + independent package-scoped checks |
| 0.1.67b | 2026-10-20 | candidate — browser feasibility sublane prepared; no implementation START | Separate W0-C HTTPS/WSS transport feasibility from W1 product pairing/queue acceptance; correct the stale readiness version and await an exact-scope reviewer START | Independent Astra exact-state review |
| 0.1.66b | 2026-10-20 | candidate — browser profile status reconciled; W0-B/C remains BLOCKED | Replace the stale native-only candidate statement with the v0.4.10 browser amendment status while preserving principal-review and device-evidence gates | Current external W0-B/C hash + Astra review |
| 0.1.65b | 2026-10-20 | candidate — browser-first docs integrated; W0-B/C remain BLOCKED | Add ADR-006, browser SIS and functional flows; reconcile v0.4.10 candidate status and Astra findings into W0-B/C acceptance without starting implementation | User request + Astra review + exact external draft hash |
| 0.1.64b | 2026-10-20 | candidate — readiness register reconciled after exact-hash REWORK; W0-E remains OPEN | Update stale readiness version and policy hash, record the review finding, and keep policy, consent, W0-E and W2-B blocked pending owner inputs and implementation evidence | Independent exact-hash review of v0.1.63b |
| 0.1.63b | 2026-10-20 | candidate — policy links and public-key disclosure reconciled; W0-E remains OPEN | Add all seven W0-DEF links, disclose client-extractable user key/project quota and key removal, and link official Google Cloud key-management guidance; keep policy, consent, W0-E and W2-B blocked pending owner inputs and implementation evidence | W0-DEF v0.6.10 exact requirements + official YouTube/Google Cloud documentation; independent DAG review REWORK |
| 0.1.62b | 2026-10-20 | candidate — W0-E decisions recorded; internal policy draft incomplete/unpublished | Add a policy working draft with owner/client/consent placeholders; keep W0-E and W2-B blocked and issue no API-call authority | Owner direction + official YouTube policy review; DAG review pending |
| 0.1.61b | 2026-10-20 | candidate — W0-E E-Q1/E-Q3/E-Q5 decisions recorded; W0-E remains OPEN | Integrate exact owner-approved contract decisions; preserve E-Q2, selected-client, W1-B/C and E-Q4 gates; authorize no API calls or W2-B start | Owner approval + exact-candidate review PASS; DAG review pending |
| 0.1.60b | 2026-10-20 | candidate — static browser-shell spike CLOSED; W0-B browser amendment REWORK and W0-C remain BLOCKED | Record exact sublane `CLOSE_SPIKE`, build evidence, and contract review findings while keeping TLS/credential design, device/browser-floor proof and all remote implementation lanes gated | Independent static-shell and browser-contract reviews |
| 0.1.59b | 2026-10-20 | candidate — W0-C remains BLOCKED; bounded browser-shell feasibility sublane START_WAVE | Record the independent reviewer start and worker pre-write verification for the inert isolated static-shell spike; keep TLS/credential design, browser-floor proof and all remote implementation lanes gated | Independent reviewer START_WAVE + worker W0-A pre-write confirmation |
| 0.1.58b | 2026-10-20 | candidate — prior revision review BLOCKED; current exact-hash review pending; W0-B/C browser amendment and W2 client-profile alignment remain open | Make W1-C Controller-only, gate Host/file transfer/stream to W2-A plus explicit START, condition native pinning on native-profile selection, and keep browser OAuth/token handling open under W0-E/W2-B | Owner approval in CR-008 v0.5.1b + independent re-review pending |
| 0.1.57b | 2026-10-20 | candidate — reviewer BLOCKED; W0-B/C browser amendment remains open | Record iOS Safari/Android Chrome remote split, defer native iOS and keep optional Android Host; preserve W2-C deferral and block successor starts pending browser TLS/credential review | Owner approval in CR-008 v0.5.0b + independent review verdict |
| 0.1.56b | 2026-10-20 | candidate — W2-C evidence deferred; W0-C remains blocked | Record owner direction to continue independent CR-008 work, read-only W0-C toolchain feasibility results and current official platform references; retain W2-C criteria and all reviewer start/close gates | Owner direction + workstation inventory + official React Native/Apple docs |
| 0.1.55b | 2026-10-20 | candidate — W1-D CLOSED; W0-F pinned; W2-C blocked with no alternate runtime environment | Record owner confirmation that no other machine or VM is available and current workstation is outside the accepted minimum profile; retain the Application Control block and all runtime/acceptance holds | Owner response + current workstation inventory |
| 0.1.54b | 2026-10-20 | candidate — W1-D CLOSED; W0-F pinned; W2-C integrated, evidence gates blocked | Record exact primary composition review PASS, preserve W1-D store hash, and retain runtime/accepted-profile/fixture/listening blockers | Integrator compile-only checks + independent exact-integration review |
| 0.1.53b | 2026-10-20 | candidate — W1-D CLOSED; W0-F pinned; W2-C R2 compatibility rework in progress | Record reviewer finding that schema-v1 mutations conflict with primary schema v3; authorize registered-version lookup in two W2-C-owned paths and keep integration/evidence gates blocked | Independent integration review |
| 0.1.52b | 2026-10-20 | candidate — W1-D CLOSED; W0-F pinned; W2-C static PASS, evidence gates blocked | Record R1 exact-hash static PASS and worker compile-only evidence; preserve runtime/accepted-profile/fixture/listening blockers and prohibit W2-C close or W3 start | Worker hash audit + independent exact-patch review |
| 0.1.51b | 2026-10-20 | candidate — W1-D CLOSED; W0-F pinned; W2-C blocked for bounded R1 rework | Dispatch four reviewer findings within the same W2-C scope; pin current Windows 11 profile enforcement baseline and retain all runtime/acceptance holds | Principal review + current official Microsoft release record |
| 0.1.50b | 2026-10-20 | candidate — W1-D CLOSED; W0-F pinned; W2-C blocked for rework | Record exact-patch REWORK findings, preserve runtime/acceptance NOT_RUN limits, and hold W2-C/W3 gates | Independent principal review |
| 0.1.49b | 2026-10-20 | candidate — W1-D CLOSED; W0-F pinned; W2-C in progress | Record the independent `ALLOW_NARROW_SCOPE` for a single stable schema-v1 package ID correction in the W2-C worktree, with hash recheck, temporary-DB regression gates, and no W1-D/primary-store overlay | Principal reviewer scope-extension decision |
| 0.1.48b | 2026-10-20 | candidate — W1-D CLOSED; W0-F pinned; W2-C in progress | Record the worker exact W0-A pre-write PASS and activate reviewer-authorized START_WAVE for the bounded native Smart Medley analysis scope | Worker pre-write verification + principal review |
| 0.1.47b | 2026-10-20 | candidate — W1-D CLOSED; W0-F pinned; W2-C start authorized | Record exact-hash principal approval to pin W0-F v0.6.9, close W0-F and authorize W2-C; preserve benchmark/listening NOT_RUN and require worker pre-write snapshot confirmation | Independent principal reviewer |
| 0.1.46b | 2026-10-20 | candidate — W1-D CLOSED; W0-F principal decision pending | Resolve the circular W2-C entry gate: pin the acceptance contract before START; collect benchmark/fixture/listening proof as W2-C exit evidence | Principal reviewer finding |
| 0.1.45b | 2026-10-20 | candidate — W1-D CLOSED; W0-F audit PASS, principal decision pending | Record exact-hash v0.6.9 audit PASS and unchanged accepted thresholds; preserve NOT_RUN evidence, unpinned contract and W2-C block pending principal confirmation | Independent W0-F auditor |
| 0.1.44b | 2026-10-20 | candidate — W1-D CLOSED; W0-F v0.6.9 audit pending | Record v0.6.8 exact-hash REWORK on cue scalar inputs/order and external v0.6.9 candidate; keep W2-C blocked pending audit and principal confirmation | Independent W0-F auditor + contract author |
| 0.1.43b | 2026-10-20 | candidate — W1-D CLOSED; W0-F v0.6.8 REWORK | Record exact-hash audit of v0.6.8, preserve accepted contract thresholds, and hold W2-C for deterministic cue scalar/ordering revision | Independent W0-F auditor |
| 0.1.42b | 2026-10-20 | candidate — W1-D CLOSED; W0-F v0.6.8 audit pending | Record v0.6.7 exact-hash REWORK and external v0.6.8 candidate that adds the omitted confirmation choice; keep W2-C blocked pending audit and principal decision | Independent auditor + contract author |
| 0.1.41b | 2026-10-20 | candidate — W1-D CLOSED; W0-F v0.6.7 REWORK | Record exact-hash audit confirming v0.6.7 fixes both protocol ambiguities while requiring the cache-miss status rule in the principal-confirmation list; keep W2-C blocked during bounded v0.6.8 revision | Independent W0-F auditor |
| 0.1.40b | 2026-10-20 | candidate — W1-D CLOSED; W0-F v0.6.7 audit pending | Record the external v0.6.7 candidate hash and bounded fixes for v0.6.6 audit findings; preserve all owner thresholds and keep W2-C blocked pending audit and principal confirmation | Contract author |
| 0.1.39b | 2026-10-20 | candidate — W1-D CLOSED; W0-F v0.6.6 REWORK | Record principal `CLOSE_W1_D` against exact v0.1.38b and source hashes; record the v0.6.6 exact-hash audit's two remaining ambiguities; preserve all successor blocks | Principal reviewer + W0-F auditor |
| 0.1.38b | 2026-10-20 | candidate — W1-D principal close pending; W0-F v0.6.5 REWORK | Record corrected W1-D retirement/reimport patch, independent VG-1 and primary 54/54 native evidence; record W0-F v0.6.5 audit REWORK and hold all successors | Storage worker + VG-1 + primary checks + contract audit |
| 0.1.37b | 2026-10-20 | candidate — W1-D REWORK; W0-F v0.6.5 audit pending | Pin candidate W0-DEF v0.6.5 hash with reviewer-defined measurement protocol; keep pin/evidence and W1-D close gates open | Principal reviewer + contract author |
| 0.1.36b | 2026-10-20 | candidate — W1-D REWORK; W0-F revised-candidate audit pending | Record principal acceptance of a reviewer-defined Smart Medley evidence protocol without pinning v0.6.4; preserve W1-D rework and all successor blocks | Principal reviewer |
| 0.1.35b | 2026-10-20 | candidate — W1-D REWORK; W0-F REWORK | Record principal rework decisions for catalog resurrection and reproducible Smart Medley methodology; keep all successor lanes blocked | Principal reviewer |
| 0.1.34b | 2026-10-20 | candidate — W1-D VG-1 PASS; principal close pending; W0-F audit PASS | Integrate the reviewed PLAY-19 local store/finalizer, record primary native verification and independent VG-1 result/limits; record audited W0-F v0.6.4 while preserving benchmark/listening and successor gates | Worker + VG-1 + W0-F audit + primary checks |
| 0.1.32b | 2026-10-20 | accepted — W1-D start authorized; pre-write hold | Record principal `CLOSE_W0_D` and `START_W1_STORAGE` for exact DAG/contract hashes; require worker confirmation of W0-A base/digest/manifest before writing; record accepted W0-F owner profile | Principal reviewer + owner response |
| 0.1.31b | 2026-10-20 | candidate — W0-D principal decision pending | Record owner acceptance of D-Q1/D-Q2, pin W0-DEF v0.6.2 hash and independent verifier PASS; await principal closure/START decision | Owner response + verifier |
| 0.1.30b | 2026-10-20 | planning wave CLOSED — `CLOSE_WAVE_HOLD` | Record principal READY disposition for the exact v0.1.29b SHA-256; preserve all implementation blocks and issue no START | Principal reviewer |
| 0.1.29b | 2026-10-20 | candidate | Clarify W0-D exit as visibility-gated receipt/recovery proof, removing residual atomic-publication wording; hold for principal confirmation | Principal follow-up review |
| 0.1.28b | 2026-10-20 | candidate | Correct principal review findings: mark G1 as mandatory/approved, align PLAY-19 finalization with the visibility-gated Genesis protocol, and represent both public API-key and OAuth playlist paths; hold for principal re-review | Principal reviewer |
| 0.1.27b | 2026-10-20 | candidate | Pin revised W0-BC v0.4.3 and W0-DEF v0.6.1 drafts with independent re-audit results; update readiness details; hold for principal review; keep every successor blocked | Independent security and contract re-audits |
| 0.1.26b | 2026-10-20 | candidate | Record principal dispositions for pinned W0-B/C and W0-D/E/F contracts; close W0-B, keep G1 mandatory but blocked, and preserve all successor holds | Independent verifier reports + principal reviewer |
| 0.1.25b | 2026-10-20 | candidate | Pin W0-B/C Draft v0.4.1 and W0-D/E/F Draft v0.5 for independent re-review; keep all successor starts blocked | Contract author reports + local SHA-256 |
| 0.1.24b | 2026-10-20 | candidate | Record W0-B/C security re-audit REWORK and add a proposed W1-B-L0/G1 durability gate pending principal review | Independent security audit |
| 0.1.23b | 2026-10-20 | candidate | Tighten W0-C and W1-B/C acceptance for platform feasibility, manual pin pairing, durable revoke and Host-scope reconciliation | Security audit findings |
| 0.1.22b | 2026-10-20 | candidate | Record principal BLOCKED/REWORK decisions for W0-D/E/F and return Draft 0.3 for bounded revision | Principal reviewer |
| 0.1.21b | 2026-10-20 | candidate | Record external W0-B/C Draft 0.3.0 and hold for independent security re-audit | Contract author report |
| 0.1.20b | 2026-10-20 | candidate | Record W1-A `CLOSE_WAVE_HOLD`, integrate the reviewed nine-path patch, and verify the primary checkout | Principal reviewer + integration checks |
| 0.1.19b | 2026-10-20 | candidate | Align W0-B/C readiness row with independent security REWORK and active external-only revision | Security review + author status |
| 0.1.18b | 2026-10-20 | candidate | Record third W1-A VG-1 PASS and hold for principal close decision | Independent verifier report |
| 0.1.17b | 2026-10-20 | candidate | Record independent VG-0 Draft 0.3 findings for W0-D/E/F and hold for principal review | Independent verifier report |
| 0.1.16b | 2026-10-20 | candidate | Record W1-A's second targeted test rework and hold for third independent VG-1 rerun | Worker report |
| 0.1.15b | 2026-10-20 | candidate | Record principal-reviewer REWORK for Smooth equal-power and duplicate queue-occurrence assertions | Second VG-1 + reviewer decision |
| 0.1.14b | 2026-10-20 | candidate | Record second W1-A VG-1 results and remaining equal-power/duplicate-occurrence test gaps | Independent verifier report |
| 0.1.13b | 2026-10-20 | candidate | Record W1-A reviewer-directed coverage rework and hold for independent VG-1 rerun | Worker report |
| 0.1.12b | 2026-10-20 | candidate | Record W0-B/C independent security REWORK findings; preserve all remote/mobile lane blocks | Security audit report |
| 0.1.11b | 2026-10-20 | candidate | Record independent W1-A VG-1 evidence and principal-reviewer REWORK; keep successors closed | Verifier report + principal reviewer |
| 0.1.10b | 2026-10-20 | candidate | Record independent W0-D/E/F REWORK findings; keep successor lanes blocked pending revised contract review | Principal reviewer static contract review |
| 0.1.9b | 2026-10-20 | candidate | Record worker pre-write confirmation and W1-A active after reviewer preserved START_W1_AUDIO | Worker verification + independent review |
| 0.1.8b | 2026-10-20 | candidate | Align frontmatter version with the v3-reviewed W0-A closure and W1-A pre-write gate | Ledger consistency check |
| 0.1.7b | 2026-10-20 | candidate | Record v3 W0-A closure and W1-A start authorization; keep worker confirmation as a pre-write gate | Independent review verdict |
| 0.1.6b | 2026-10-20 | candidate | Exclude the mutable execution ledger from source hashing, update the W1-A scope with baseline regressions, and record reviewer W0-A close plus W1-A authorization pending exact v3 digest confirmation | Independent review findings and VG-0 evidence |
| 0.1.5b | 2026-10-20 | candidate | Pin ordinal UTF-8 digest ordering, make worker confirmation lane-specific, and record baseline verification outcomes | Independent review findings and VG-0 evidence |
| 0.1.4b | 2026-10-20 | candidate | Record fourth BLOCKED verdict, remove YouTube gate bypass and list W0-D on the phone-file readiness row | Independent review findings |
| 0.1.3b | 2026-10-20 | candidate | Route YouTube lane through W1 remote review gate; record third BLOCKED review decision | Independent review finding |
| 0.1.2b | 2026-10-20 | candidate | Add Smart Medley gate and missing pairing/role/queue tests; separate start blockers from lane exit criteria | Independent review findings |
| 0.1.1b | 2026-10-20 | candidate | Add reviewer-required content-pinned snapshot, PLAY-19 adapter lane, pre-W2 protocol tests and explicit YouTube ownership | Independent review findings |
| 0.1.0b | 2026-10-20 | candidate | Add CR-008 wave DAG, dependency gates, parallel ownership, verifier evidence and independent review decisions | User-approved CR-008 |


### W0-C selected-IP transport readiness — candidate v0.1.69b — 2026-10-21

The owner selected private-IPv4/per-PC-CA mode and accepted manual full-device trust on the iPhone and Android test device, followed by CA removal after testing. For this trial the integrator chose `192.168.1.172` because it was the current Ethernet IPv4 assignment, and chose port `4443` after confirming it was unused; neither numeric endpoint is an owner-pinned address. Recheck the interface address before starting the listener. The owner identified the iPhone model as iPhone 12 Pro Max; OS/WebKit version is unknown. Android model, OS and Chrome version remain unrecorded; record them manually from device and browser version screens because the capability probe does not capture them. FQDN mode remains unselected and disabled.

External W0-B/C candidate v0.4.14-draft at `E:\lalin-cr008-contract-drafts\20261021-v4\W0-BC-draft.md` has SHA-256 `33F0B4ACD77507707FB8AD73ED5F1A8CBD807F7AEFB8A0AA0E8ADD4E43C61AB3`; Astra returned exact-candidate PASS against the prior DAG v0.1.68b. This is technical contract review only. At v0.1.69b, the non-secret certificate-preparation manifest at `E:\lalin-cr008-contract-drafts\20261021-v5\w0c-certificate-preparation.json` was recorded with historical SHA-256 `D9C106F774C9FFF5931F3B7742039D87C4C32ED5FAB8A8698958B0AD97BB6DC9`. The file was updated in place for subsequent runtime evidence; its SHA-256 at v0.1.71b was 7C5EF06FC2C595A4C49AAD668450424EC01B584A0E451F91E2265C6A0154E68D. That digest is historical. The v0.1.72b manifest SHA-256 was 2C1F70E74129D675B99938CF3205704E42B8E705930F9FDB470915BFCEAE3547; it was superseded by the current v0.1.73b manifest SHA-256 EEFA767F1983703F2D0AB0C4EEE09BEADBFD606901DDEECFB8F04763DB3508C2. The full-contract principal acceptance is not recorded and W0-B/C remain open.

A short-lived root CA was generated in the Windows current-user personal store; its private key is non-exportable, it expires at `2026-11-03T17:15:10Z`, and it is not installed in a Windows trusted-root store. Secure external artifacts include the public CA certificate/profile and a leaf TLS certificate/key; the directory ACL is limited to the current user, SYSTEM and Administrators. CA public SHA-256 is `3C52D4BDCB02C87295BD5711212675CE16B176CBCBACB5E0B876A7B12CD6184D`; leaf thumbprint is `090E7CD838508BDABEA2C7BA34502BDE23D99CC6`. The leaf SAN is exactly `IP Address=192.168.1.172`, with server-auth EKU, matching key, and validity from `2026-10-20T17:06:58Z` through `2026-10-30T17:16:56Z`. Actual harness `loadConfig` accepted the supplied paths and selected origin at `https://192.168.1.172:4443`.

At the 2026-10-21 v0.1.69b observation, no phone import or trust was reported; this is a historical status, and current phone trust is unverified. At that observation, the HTTPS/WSS listener had not started, no firewall rule had been changed, and no physical-device or network result was claimed. The listener statement is a point-in-time observation superseded by the v0.1.71b host-smoke section below. Phone trust, real device, LAN, Internet-off/LAN-on, isolation, post-test CA removal, full-contract principal acceptance and joint VG-0 remain outstanding; this historical candidate authorized no W0 closure, G1, W1-B/C or later START.

### W0-C host-side selected-IP runtime smoke — candidate v0.1.71b — 2026-10-21

The owner selected private-IPv4/per-PC-CA mode and accepted manual full-device trust on the iPhone and Android test device, followed by CA removal after testing. The owner identified the iPhone model as iPhone 12 Pro Max; iOS/WebKit version remains unknown. Android model, OS and Chrome version remain unknown and must be recorded from the devices during live testing. For this bounded host check, the integrator rechecked the current Ethernet address `192.168.1.172`, used the already-selected unused port `4443`, and started the feasibility harness bound exactly to that address. The listener is process 29480 using Node.js v24.20.0 at `https://192.168.1.172:4443`.

Host-local runtime smoke evidence is stored outside the repository under `C:\Users\suanr\AppData\Local\Lalin\W0C\20261021-41c3e21c`: `host-runtime-smoke.mjs` SHA-256 `F3905C8E995154655EA2F30E411E669C28F1AAE2483A8BCC63B3C43598EEF467`; output `host-runtime-smoke.json` SHA-256 `7C146E22F21D7433F5192650119219957D8700A006393B3A778B93EAB4A55E31`. The test supplied the CA as an explicit trust anchor and retained default TLS verification with a strict IP-SAN identity check; it did not install the CA in the Windows trusted-root store. HTTPS root and static assets returned 200; unknown path returned 404; mismatched Origin returned 403; mismatched Host returned 421. A same-origin WSS probe returned the matching nonce; an incorrect WSS Origin was rejected with 403. The response included the expected restrictive CSP and `no-store` cache policy.

No Lalin firewall rule was added or changed. This is a host-local runtime check and does not demonstrate access from an iPhone, Android device, or any other LAN client. As of the 2026-10-21 v0.1.71b check, no CA/profile/certificate transfer or installation was reported for either phone; this historical observation does not establish current phone trust, which remains unverified. Phone trust, actual iPhone Safari and Android Chrome behavior, LAN reachability, Internet-off/LAN-on, isolation and post-test trust removal remain NOT_RUN. Full-contract principal acceptance and joint VG-0 remain outstanding. W0-C stays BLOCKED and the feasibility sublane stays OPEN; this candidate authorizes no W0 closure, G1, W1-B/C or later START.

### W0-C host-side runtime recheck — candidate v0.1.72b — 2026-10-26

At 2026-10-26T11:33:48.212Z, the integrator rechecked the selected endpoint https://192.168.1.172:4443; the Ethernet address remained assigned to the host and TCP port 4443 was listening as process 23220 using Node.js v24.20.0. The existing leaf certificate still matched the exact IP SAN and was valid through 2026-10-30T17:16:56Z; the test CA remained valid through 2026-11-03T17:15:10Z. Harness configuration validation passed.

A repeat host-side smoke used default TLS verification, the CA as an explicit trust anchor, and a strict IP identity check. HTTPS root/app/CSS returned 200; an unknown path returned 404; mismatched Origin returned 403; mismatched Host returned 421. Same-origin WSS returned the matching nonce and wrong-Origin WSS was rejected with 403. The restrictive CSP and no-store cache policy were present. This confirms the harness still serves the selected origin from the host. It does not demonstrate access from either phone or another LAN client.

Evidence remains outside the repository under C:\Users\suanr\AppData\Local\Lalin\W0C\20261021-41c3e21c: host-runtime-smoke-20261026.mjs SHA-256 0518A7C518F5980BF7F8918D8AEEF1D4D96F59EA196AF67CC4F40D56A155EED4; result host-runtime-smoke-20261026.json SHA-256 D469E4D965E70B34B747BB97D1046D7E81CEB040E1E733216D28B35FF89B86FD. At the 2026-10-26T11:33:48.212Z host-recheck time, the non-secret preparation manifest SHA-256 was 2C1F70E74129D675B99938CF3205704E42B8E705930F9FDB470915BFCEAE3547; no phone result had been reported by then. It was updated after the subsequent iPhone screenshot, and its current v0.1.73b hash is EEFA767F1983703F2D0AB0C4EEE09BEADBFD606901DDEECFB8F04763DB3508C2. The CA was not installed in Windows trusted-root stores and no firewall rule was changed.

At the v0.1.72b host-recheck timestamp, no mobile result had been reported. The subsequent iPhone Safari result is recorded in v0.1.73b; Android Chrome/model/OS, Internet-off/LAN-on, isolation and post-test CA removal remain unverified. Record iOS and Android model/OS/browser versions at the time of test. Full-contract principal acceptance and joint VG-0 remain outstanding. W0-C stays BLOCKED; this candidate authorizes no W0 closure, G1, W1-B/C or later START.

### W0-C iPhone Safari capability and WSS result — candidate v0.1.73b — 2026-10-26

The owner-provided iPhone 12 Pro Max screenshot at 19:09 shows the test origin https://192.168.1.172:4443 loaded in Safari with Secure context Available and Camera API Available. Camera permission was granted after the user pressed the test button, and the page reports that temporary camera tracks were stopped. The same-origin WSS nonce probe reports “Secure transport passed. The nonce matched.” The iOS/WebKit version was not captured.

Screenshot evidence is at C:\Users\suanr\.codex\codex-remote-attachments\01a15346-2652-7cc1-837c-f82d90261eb7\3509F3D0-BE9B-4130-980B-B4043E022228\1-Photo-1.jpg, SHA-256 C1A463A4583F57409E86659D294521205CE2B4A120E570FCA04FC4A0ACDB6EDB. The external non-secret preparation manifest was updated to record this result; current SHA-256 EEFA767F1983703F2D0AB0C4EEE09BEADBFD606901DDEECFB8F04763DB3508C2. The result proves one real iPhone browser can reach the private-IP page and pass the capability/WSS probe. The test page explicitly does not pair a device or exercise remote commands, queue, audio, or file access.

A current Windows firewall inspection found enabled inbound rules for the harness Node executable: TCP and UDP, Action Allow, Public profile, LocalPort Any, RemoteAddress Any. Effective inbound defaults are Block, and no dedicated 4443 port rule was found. The integrator did not modify firewall rules. The broad Node allow is more permissive than the intended LAN-only test boundary; treat WAN/isolation acceptance as open until the rule scope is resolved and verified.

Android device/browser/version, Internet-off/LAN-on, isolation, post-test CA removal, full-contract principal acceptance and joint VG-0 remain unverified. W0-C stays BLOCKED; this candidate authorizes no W0 closure, G1, W1-B/C or later START.
### W0-C Android Chrome capability and WSS result — candidate v0.1.74b — 2026-10-26

The initial Android visit returned an empty response because no process was listening on port 4443. The isolated feasibility harness was restarted on the already-selected host address 192.168.1.172:4443; Android Chrome then loaded the page. This diagnosis is supported by the host listener check before restart, the successful phone connection after restart, and the captured capability/WSS results. The temporary harness ran as Node.js v24.20.0, process 49916, bound only to 192.168.1.172; it was stopped after testing, and a fresh host check found no listener on port 4443.

The Android test device was Samsung SM-A075F, Android 16, Chrome 155.0.8059.84. At https://192.168.1.172:4443, Secure context and Camera API were Available. Camera permission was granted for the test; the temporary camera tracks were stopped. The same-origin WSS nonce probe passed and the nonce matched. The page provides capability evidence only: pairing, remote commands, queue, audio, and file access were not tested.

Evidence is stored outside the repository under C:\Users\suanr\AppData\Local\Lalin\W0C\20261021-41c3e21c: origin/capability screenshot SHA-256 0CB8F8AD16559CF1E0D5A543E66F38F2EC53D221F4DB425D4EC80D64267F1083; camera-track/WSS screenshot SHA-256 AAA1C3A54EA06E3A49B916638D9D67A363C4AF4CDEBB442F25D3EEC302F8EB37; Android User-certificate list after removal SHA-256 38D166517EB4BFAC12C441AE0835D79C66A0D4C8CA92E16CB9C7658163CFF9E3. The installed CA fingerprint matched 3C52D4BDCB02C87295BD5711212675CE16B176CBCBACB5E0B876A7B12CD6184D before removal. Android shows an empty User certificate list afterward. The iPhone CA-removal state remains unverified.

After testing, the Wireless debugging toggle was tapped in Android Developer options. The ADB device disconnected immediately, and the subsequent adb devices -l check returned no devices. The post-toggle screen could not be captured, so the switch state is inferred from the disconnect rather than independently confirmed in the UI.

The external non-secret preparation manifest at E:\lalin-cr008-contract-drafts\20261021-v5\w0c-certificate-preparation.json now has SHA-256 2A57FBB0C38E7EA9AC6635807E67B06AADD17BAD6D19F67AAFAB3F25A354809C. It records Android capability/WSS PASS, CA removal, stopped listener and current firewall observation. No firewall rule was added, changed, or removed. Enabled Public-profile Node.js inbound TCP and UDP allow rules still specify LocalPort=Any and RemoteAddress=Any; this does not satisfy the intended isolated LAN-only boundary.

Both the iPhone Safari and Android Chrome capability/WSS probes now pass, and each phone reached the selected private-IP endpoint. Internet-off/LAN-on was not tested. Broader LAN isolation remains OPEN because of the broad firewall rules. Full-contract principal acceptance, iPhone CA-removal evidence, and joint VG-0 review also remain outstanding. Therefore W0-C stays BLOCKED and this candidate authorizes no W0 closure, G1, W1-B/C, or later START.
### Owner browser-device acceptance disposition — candidate v0.1.75b — 2026-10-26

The owner directed that a passing iPhone Safari test is sufficient device-browser evidence to proceed to the next review gate; Android testing is not a prerequisite for that decision. The Samsung Android test also passed and remains recorded as supplemental evidence. This is a W0-C progression decision only: Android Chrome remains in the product browser profile, and this disposition does not claim an Android support floor or waive the LAN-only security, Internet-off/LAN-on, CA-removal, full-contract principal-acceptance, or joint VG-0 gates.

The current candidate records this owner direction in the readiness register and preserves W0-C as BLOCKED pending exact-hash independent review of the revised gate. No W0-B/C closure, G1, W1-B/C, or later START is claimed or authorized by this documentation edit.
### W0-C active status reconciliation — candidate v0.1.76b — 2026-10-26

The owner accepts the passing iPhone Safari test as sufficient device evidence for this progression checkpoint. Android floor qualification is deferred to W1-C/product-release acceptance; Android Chrome remains in the product profile, and the supplemental Android 16/Chrome 155 pass does not establish a supported floor. The iPhone OS/WebKit version is also unknown, so no iOS floor is claimed.

The active W0-C exit row, feasibility sublane status, next-gate statement, and current disposition are reconciled to the latest evidence. Both physical-device capability/WSS probes passed. The temporary listener is stopped, Android CA removal is evidenced, and iPhone CA removal remains unverified. The broad Public-profile Node.js TCP/UDP inbound Allow Any-port/Any-remote rules remain unchanged; Internet-off/LAN-on is NOT_RUN. Full-contract principal acceptance, joint W0-B/C closure and VG-0 remain independent gates. This candidate permits only the exact-hash review of the progression checkpoint; it closes neither W0-C nor W0-B/C and starts no G1/W1 lane.
### W0-B/C contract and supporting-specification reconciliation — historical candidate v0.1.77b (superseded by v0.1.78b) — 2026-10-26

Astra returned PASS on exact DAG v0.1.76b for the owner-approved iPhone device-evidence progression checkpoint only. It explicitly kept W0-C/W0-B-C closure, G1, W1-B and W1-C BLOCKED. The owner accepts the iPhone 12 Pro Max Safari capability/WSS pass as enough to proceed to this exact-contract review. Android Chrome remains in the product browser profile; Android 16/Chrome 155 is supplemental evidence only. No iOS or Android minimum supported floor is established.

At the v0.1.77b review, the then-current W0-B/C candidate v0.4.15-draft was E:\lalin-cr008-contract-drafts\20261026-v6\W0-BC-draft.md, SHA-256 07EFF597A083CB97A4BC144154A76F7E6840D1E0B2297775FA8489572B734E10. It distinguishes the progression checkpoint from W0-C closure, records the iPhone/Android probe and Android CA removal, defers both browser-floor claims to W1-C/product-release acceptance, and keeps iPhone CA removal, network isolation, Internet-off/LAN-on and full-contract review open.

Supporting candidate revisions: ADR-006 v0.1.1c SHA-256 0910130E49C4053378DA4B045B8168D26A087E133A4C0D698678926427551015; SIS v0.1.2c SHA-256 A574DC2DA99892D3A3BE282A488A40E98C0EB28F9F59332235C4B43A9710B3FF; Functional Flow v0.1.2c SHA-256 1EC5BA9E3522C3E1DCF6CEA12F603091AC5C83EF59F77DC6695F5A50BDB8032E. Each remains a candidate pending exact-hash review with the contract.

No product implementation or mutation lane starts from this reconciliation. The active firewall Any-port/Any-remote rules remain unchanged; Internet-off/LAN-on is NOT_RUN; iPhone CA removal, exact full-contract principal acceptance and joint VG-0 remain open. The current candidate authorizes only exact-hash review of the reconciled documents.

### W0-B/C exact-document reconciliation after Astra REWORK — candidate v0.1.78b — 2026-10-26

Astra reviewed v0.1.77b and the exact v0.4.15/support-document hashes. It returned REWORK for two active inconsistencies: the contract required Android device evidence before W0-C closure despite deferring Android compatibility/floor qualification to W1-C, and ADR-006/SIS still recommended FQDN first despite the owner-selected IP/per-PC-CA mode. Astra confirmed iPhone progression-checkpoint PASS but kept W0-C, joint W0-B/C, G1, W1-B and W1-C BLOCKED.

The new external W0-B/C candidate v0.4.16-draft is E:\lalin-cr008-contract-drafts\20261026-v7\W0-BC-draft.md, SHA-256 0603F8637F4BD74AA66EAF014DEA221588BF1D221A240CDB0C73FA103240B5B9. It scopes W0-C selected-origin device validation to the designated iPhone Safari device, defers Android device/product-floor qualification to W1-C exit/release, and does not qualify the unselected FQDN mode. Supporting candidate hashes: ADR-006 v0.1.1d B11B0F32FF1BD3B6E061013806C5C43769BCA6373A1B337BE21914793AA72C29; SIS v0.1.2d 3D040E0F1772F38C728401255E8D9E242FF31CD37F5FE2308C556FB8B080B16A; Functional Flow v0.1.2d D63B0A5BA8D011D21B7F2CF3218D1C17CF71B53EDCFB354679076847B5D53DEA.

This reconciliation authorizes only a new exact-hash document review. It does not close W0-C or joint W0-B/C, authorize firewall changes, issue VG-0, or start G1/W1-B/W1-C. Public-profile Node Any/Any rules are unchanged; Internet-off/LAN-on remains NOT_RUN; iPhone CA removal, full-contract principal acceptance and joint VG-0 remain open.
### W0-B/C exact document reconciliation PASS — candidate v0.1.79b — 2026-10-26

Astra returned PASS on the exact document reconciliation set in DAG v0.1.78b. All six supplied hashes matched: DAG v0.1.78b CDA3084204F0D4183D35BE2BB244145809792226A9C3958EA1EFFD42B1E6E1C8; contract v0.4.16-draft 0603F8637F4BD74AA66EAF014DEA221588BF1D221A240CDB0C73FA103240B5B9; ADR-006 v0.1.1d B11B0F32FF1BD3B6E061013806C5C43769BCA6373A1B337BE21914793AA72C29; SIS v0.1.2d 3D040E0F1772F38C728401255E8D9E242FF31CD37F5FE2308C556FB8B080B16A; Functional Flow v0.1.2d D63B0A5BA8D011D21B7F2CF3218D1C17CF71B53EDCFB354679076847B5D53DEA; selected-origin manifest 2A57FBB0C38E7EA9AC6635807E67B06AADD17BAD6D19F67AAFAB3F25A354809C.

Astra confirms the owner-approved iPhone progression checkpoint and the iPhone-only W0-C selected-origin device scope. Android Chrome remains in the product profile; device compatibility/floor qualification is due before W1-C exit/release. The PASS is document reconciliation only. W0-C closure, joint W0-B/C closure, joint VG-0, G1 START, W1-B START and W1-C START remain BLOCKED.

Remaining evidence: public-profile Node TCP/UDP inbound Allow rules are still Any-port/Any-remote; network isolation is unproven; Internet-off/LAN-on is NOT_RUN; iPhone CA removal and selected-origin security evidence remain incomplete; exact iOS/WebKit build is unknown. Full-contract principal acceptance and joint VG-0 remain open. Next authorized work is bounded W0-C evidence and principal review; this record authorizes no firewall mutation, W0 closure or implementation START.

### W0-C read-only Windows network/firewall audit — candidate v0.1.80b — 2026-10-26

The read-only host audit is E:\lalin-cr008-contract-drafts\20261026-v7\w0c-windows-firewall-audit-20261026.json, SHA-256 A24F06FD2F4ED025E83926EE0485BDF39617673CA7E132F1B0E46DA48F688356. Ethernet is currently Public with 192.168.1.172/24, Internet connectivity and default gateway 192.168.1.1. The firewall profiles are enabled and default inbound action is Block. Ten enabled Public-profile Node.exe inbound Allow entries across five executable paths nevertheless apply TCP/UDP to LocalPort Any and RemoteAddress Any. The two rules matching the feasibility harness Node v24.20.0 executable are also Any/Any; no TCP/4443-specific allow exists. The 4443 listener is stopped. No firewall rule or network profile was changed.

This audit establishes the current blocker but not a fix or isolation result. Internet-off/LAN-on and client isolation remain NOT_RUN. Firewall changes are security-sensitive and outside this candidate's authorization; do not change or disable unrelated Codex, G-Maiden, AI Studio or Windows rules without an owner-approved exact scope. The next security step must first pin a least-privilege rule for the dedicated Lalin listener and assess its interaction with the active Public profile; principal acceptance and iPhone CA-removal evidence also remain open.


### W0-C temporary firewall scope proposal — candidate v0.1.81b — 2026-10-26

Exact proposal: E:\lalin-cr008-contract-drafts\20261026-v7\w0c-firewall-scope-proposal-20261026.md; SHA-256 666E3E6B99BF33C5572084F248C2573A3697E85C16C75BE41BC2D60D0A484F85. It rechecks current interface/IP/profile before action, snapshots and disables only the TCP and UDP Any/Any rules for the exact Node v24.20.0 harness executable, then adds one TCP allow for local 192.168.1.172:4443 from 192.168.1.0/24 on the Public profile. It adds no UDP rule and leaves the eight broad Node rules for four other executable paths and all other Windows/app rules untouched. The proposal explains why adding a narrow Allow without disabling the matching broad rules would not constrain that process, and includes a rollback that restores the exact two rules after stopping the listener.

Astra exact review is pending. No mutation has occurred and no owner approval for the firewall change is implied. The scoped rule would prove only the harness listener's tested LAN allow scope; Internet-off/LAN-on and client isolation require separate network setup and remain NOT_RUN. iPhone CA removal, exact iOS/WebKit build, full-contract principal acceptance, joint W0-B/C closure and VG-0 remain open. No G1/W1 START.

### W0-C isolated-runtime firewall proposal — candidate v0.1.82b — 2026-10-26

The v0.1.81b proposal received Astra REWORK: its `-Program` rules targeted a shared Node executable with unrelated processes; it had not established ActiveStore overlap/policy behavior; and it lacked exact ownership/rollback safeguards. It is superseded by the isolated-runtime proposal and must not be executed.

The new read-only preflight is `E:\lalin-cr008-contract-drafts\20261026-v7\w0c-isolated-runtime-preflight-20261026.json`, SHA-256 `B2536EACC559BFE3CEA1E0CF5B3913F1D83A06BE2FB59BF1BE971FB7D3244296`. It records Ethernet Up/Public at `192.168.1.172/24`, the source Node v24.20.0 SHA/signature, 29 processes using that shared path (including an unrelated loopback listener at 127.0.0.1:4200), absent isolated path/rule, absent listener on 4443, and no existing temporary rule name. The referenced ActiveStore snapshot SHA is `147C9D1BFE8E8E3EA470976DF9652C1B3F1667DCE74E87E01A829F8DAEA1330A`: eight relevant candidates, all Allow, no matching Block; seven `Program=Any` candidates are package-scoped and no un-packaged global `Program=Any` candidate was found. These are point-in-time observations; the proposal requires immediate preflight and abort-on-drift before any action.

Replacement proposal: `E:\lalin-cr008-contract-drafts\20261026-v7\w0c-firewall-scope-proposal-20261026-v2.md`; SHA-256 is recorded after hashing this exact file. It preserves all existing rules, copies the validly signed runtime to a unique W0-C path, and proposes one temporary TCP allow bound to that path, Ethernet, Public profile, `192.168.1.172:4443`, and remote `192.168.1.0/24`. It discloses that `/24` permits every LAN client to reach the capability-only harness, includes exact ActiveStore filter/owner-marker checks, and removes only artifacts created by the approved run. Astra exact-hash review is required next. No firewall change or runtime copy has been made.

The owner-approved iPhone capability/WSS result is sufficient to proceed through this security proposal review; Android is not a prerequisite for the W0-C iPhone device gate. Re-testing iPhone under the proposed isolated rule is required if the rule is later approved and applied, because the previous screenshot used the shared executable while its broader allow existed. Internet-off/LAN-on and router client isolation remain `NOT_RUN`; iPhone CA removal, exact iOS/WebKit build, full-contract principal acceptance and joint VG-0 remain open. W0-C, joint W0-B/C, G1 START, W1-B START and W1-C START remain BLOCKED.

Exact v0.2 proposal SHA-256: `5FFD949CB02F9B6C22143E92CDC6AFD6882C85D6B6ECDCFD584B1D11E31938A3`.

### W0-C firewall evidence provenance correction — candidate v0.1.83b — 2026-10-26

Astra paused the v0.1.82b exact-hash review and found that its proposal attributed the newer 110-rule count to the older ActiveStore file `w0c-active-store-preflight-20261026.json` (SHA-256 `147C9D1BFE8E8E3EA470976DF9652C1B3F1667DCE74E87E01A829F8DAEA1330A`). That older file was captured at 20:36 and reports 61 Public-profile enabled inbound rules (59 Allow, 2 Block); it also captured both TCP and UDP Any/Any rules for the shared Node path.

The newer isolated-runtime preflight `w0c-isolated-runtime-preflight-20261026.json` (SHA-256 `B2536EACC559BFE3CEA1E0CF5B3913F1D83A06BE2FB59BF1BE971FB7D3244296`) contains a separate Public-or-Any query at 20:39:23: 110 enabled inbound rules (107 Allow, 3 Block, all Local source). Its eight TCP-relevant candidates are seven package-scoped `Program=Any` Allows and one shared-Node-path TCP Any/Any Allow; zero matching Block and zero un-packaged global `Program=Any` candidates. The differing counts have distinct scope and must not be conflated. The shared Node path has 29 processes at this snapshot and remains unsuitable for a rule change.

Corrected proposal: `E:\lalin-cr008-contract-drafts\20261026-v7\w0c-firewall-scope-proposal-20261026-v3.md`; SHA-256 is recorded after hashing this exact file. This correction preserves all current ActiveStore details and keeps the isolated executable, one scoped TCP rule, exact run ownership and cleanup design. A fresh Astra review is required. No file copy or firewall/network change has occurred. W0-C and joint W0-B/C remain BLOCKED; no G1/W1 START.

Exact corrected proposal v0.3 SHA-256: `962D2F38806026C7F4C61ED403AA611CC6396A11D56333DD61652A450AAD084D`.

### Historical ActiveStore candidate-count erratum — candidate v0.1.84b — 2026-10-26

The v0.1.82b history entry incorrectly described seven package-scoped `Program=Any` candidates as if that count came from the older ActiveStore snapshot `147C9D1BFE8E8E3EA470976DF9652C1B3F1667DCE74E87E01A829F8DAEA1330A`. That 20:36 Public-only snapshot has six package-scoped `Program=Any` candidates plus the shared Node path's TCP and UDP Any/Any rules: eight candidates total, all Allow, with no matching Block. The seven-package-scoped count belongs to the later Public-or-Any TCP-relevant evidence embedded in preflight hash `B2536EACC559BFE3CEA1E0CF5B3913F1D83A06BE2FB59BF1BE971FB7D3244296`. The v0.3 proposal distinguishes these sources correctly; use its current evidence, not the superseded v0.1.82b summary. This erratum changes no gate disposition and authorizes no mutation.

### Correction to historical erratum — candidate v0.1.85b — 2026-10-26

Astra's exact review found the v0.1.84b erratum combined two separate arrays from historical ActiveStore snapshot `147C9D1BFE8E8E3EA470976DF9652C1B3F1667DCE74E87E01A829F8DAEA1330A`. The `relevantProgramOrAddressCandidates` array correctly contains seven package-scoped `Program=Any` rules plus one shared-Node TCP rule (eight candidates; no UDP candidate). The separate `targetSharedNodeBroadRules` array contains both shared-Node TCP and UDP rules. Therefore the v0.1.82b count statement was correct; do not apply the v0.1.84b claim of six package-scoped candidates. This correction is limited to historical evidence interpretation.

The separate issue in the v0.2 proposal was its attribution of the newer 110-rule Public-or-Any total to the older 61-rule Public-only snapshot; v0.3 corrected that provenance and remains unchanged at SHA-256 `962D2F38806026C7F4C61ED403AA611CC6396A11D56333DD61652A450AAD084D`. Astra's PASS still applies to that exact proposal for presentation to the owner. No firewall copy/rule action is authorized, and no W0-C or downstream gate status changes.

### W0-C approved firewall attempt blocked by Windows elevation — candidate v0.1.86b — 2026-10-26

The owner approved the exact v0.3 proposal (proposal SHA-256 `962D2F38806026C7F4C61ED403AA611CC6396A11D56333DD61652A450AAD084D`). Immediate preflight passed and was recorded at `E:\lalin-cr008-contract-drafts\20261026-v7\w0c-approved-execution-preflight-da774c41-4ca9-4115-ac04-464b9967a289.json`, SHA-256 `28F90002C999911D05E10219F771D25D350275D645FDB3F85C03F8809459ED6E`. The signed runtime copy was verified identical to the source (SHA-256 `5C976096E04E5C2C1F091938926234CC9FBEBFE9787DDD149351B3B0ECC707B5`) and recorded at `w0c-approved-execution-copy-da774c41-4ca9-4115-ac04-464b9967a289.json`, SHA-256 `78D7E34BEF695EC6BCCE96F34BD147AF4E441743C19006D6C9687C4B89989FAB`.

A second immediate ActiveStore preflight passed before rule creation at `w0c-approved-rule-preflight-da774c41-4ca9-4115-ac04-464b9967a289.json`, SHA-256 `34127C15F1FB1DDCC3B565CA2526CE5501030F36AB4F6964AE8EE1D0F2F079A0`: eight TCP-relevant candidates, no matching block, no un-packaged global `Program=Any` rule and no existing rule for the dedicated executable. `New-NetFirewallRule` then returned **Access is denied**. A fresh check confirms this PowerShell session has no Administrator token; the approved firewall rule was not created, no pre-existing rule was changed, and port 4443 has no listener.

The exact verified copy remains at `C:\Users\suanr\AppData\Local\Lalin\W0C\20261026-isolated-node\node.exe` with zero running processes. The cleanup command for this copy was rejected by tool safety policy before execution, so the file was retained. Outcome record: `E:\lalin-cr008-contract-drafts\20261026-v7\w0c-approved-execution-outcome-da774c41-4ca9-4115-ac04-464b9967a289.json`; its SHA-256 is recorded after hashing. Resume only from an authorized elevated Windows session and repeat every preflight; then create/verify the exact temporary rule, start the isolated harness, repeat the iPhone Safari probe, and clean up the owned copy/rule. Android remains unnecessary for the W0-C iPhone device gate. W0-C, joint W0-B/C, VG-0, G1 and W1-B/C remain BLOCKED; no gate disposition changed.
Execution outcome record SHA-256: `37A1642E8D3886D9D90202B8E11F907B2C4D045A8ACA9EA1F5E27BA57B36C8CC`.

### W0-C resume guard correction — candidate v0.1.87b — 2026-10-26

Astra reviewed v0.1.86b and identified that its resume sentence did not account for the verified runtime copy still occupying the proposal's required absent destination path. The current preflight therefore must stop before any copy or firewall action. The owner-approved firewall change remains valid, but the retained copy must not be silently reused or overwritten. Resume only after the exact copy and empty directory are removed through a permitted, ownership-verified cleanup, or after an independent reviewer approves a recovery plan that handles the already-existing path. Repeat all network, ActiveStore, signature, path and rule-name preflights immediately before any subsequent action.

Current readiness now points to the exact v0.3 proposal that Astra reviewed PASS and records the actual execution block: the current shell lacks an Administrator token, `New-NetFirewallRule` returned Access is denied, no rule/listener exists, and the cleanup command was rejected by tool safety policy. The approved temporary Firewall action has not succeeded. No gate disposition changes: W0-C, joint W0-B/C, VG-0 and G1/W1-B/C remain BLOCKED. No iPhone re-test under the scoped rule has occurred.
