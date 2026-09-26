---
version: "0.2.4b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-09-26T20:50:38+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "interface-specification"
  scope: "Observed standalone contracts, approved S2 migration and proposed Studio IPC"
---

# Lalin Play — runtime, integration and migration contract

Parent: [ADR-004 §§4–6](ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md),
[PRD §4.9](../product/PRD.md#49-lalin-play--standalone-local-media-player-approved).
Peers: [legacy Studio delivery](LALIN_PLAY_COMMAND_DELIVERY_PLAN.md),
[handoff](LALIN_PLAY_SEPARATION_HANDOFF.md), [traceability](../validation/LALIN_PLAY_TRACEABILITY.md).
Current facts below are read from `f5a6681`. Section 2 remains a **candidate**;
the user approved the S2 opt-in data migration in §§3–4 on 2026-09-25. The
migration is **HIGH risk** and implementation is limited to the envelope and
recovery behavior below. This approval does not approve Studio IPC or repository
export.

## 1. Current standalone boundary (implemented)

Source root `apps/play-desktop`. Local bundled UI only, native window label `main`.
`src-tauri/build.rs` and `capabilities/main.json` allow these native commands:

| Command | Input → result | Semantics |
|---|---|---|
| `get_library` | none → `{version:1, tracks:Track[]}` | Snapshot; refreshes missing-file flags for returned tracks |
| `select_media` | `{folder:boolean}` → `Track[]` | Native picker; cancel returns empty selection result; imports only selected supported files |
| `remove_library_track` | `{id:string}` → void | Removes catalog entry, not source media or current queue |
| `resolve_media` | `{id:string}` → canonical path string | Catalog membership, existence, extension and canonical path checked again before per-file asset grant |
| `set_surface` | `{compact:boolean, video?:boolean}` → void | Layout window sizing; no media ownership transfer |
| `get_compact_fullscreen` | none → boolean | Reads actual native fullscreen state |
| `set_compact_fullscreen` | `{enabled:boolean}` → boolean | Compact-only native transition, snapshot/restore; errors reject |
| `set_tv` | `{enabled:boolean}` → void | Existing presentation toggle, separate from Compact fullscreen |
| `quit_play` | none → process exit | Explicit Quit, unlike native X which hides to tray |

Errors reject the invoke with a message. Native drag/drop feeds the same importer;
`play-library-changed` triggers UI refresh and `play-import-error` reports failure.
There is no external Studio pipe or CLI file-forwarding contract in this build.
Current `Track`: `id`, `path`, `title` strings; nullable `artist`, `album`,
`duration`; `kind` audio/video (legacy missing kind reclassified); `missing` boolean.
IDs currently derive from canonical paths, not portable IDs or authorization tokens.

| Storage | Current shape and boundary |
|---|---|
| Native app-data `library-v1.json` | `{version:1, tracks:Track[]}`; ≤10,000 tracks, read limit 16 MiB; corrupt/unsupported catalog fails without replacing it |
| `lalin-play:v1:playlists` | `{version:1, playlists:[{id,name,trackIds}]}`; reader limits 200 lists, name 1–120 chars, ≤10,000 IDs/list |
| `lalin-play:v1:queue` | Raw `PlaybackQueue` object; `items`, `currentIndex`, `repeatMode`, `shuffle`; **no version field inside payload** |
| `lalin-play:v1:eq` | Raw `PlaybackEQ`; enabled, preamp, bands, currentPreset, customPresets; **no version field inside payload** |
| `lalin-play:v1:resume` | String `true` opts in to queue restoration; startup does not autoplay |
| Window bounds/fullscreen snapshot | Process-local memory, not persisted across app restarts |

Queue/EQ load catches malformed JSON and uses defaults; it is not a strict
versioned import validator. These internal stores are **not** an approved portable
migration format. Do not instruct users to copy Studio WebView databases or edit
these keys to migrate. Playback and previews re-resolve catalog IDs through native.

## 2. Proposed Studio wire contract v1 (review required)

```mermaid
sequenceDiagram
  participant S as Studio native sender
  participant P as Play native receiver
  participant O as Sole playback owner
  S->>P: Connect with same-logon access checks
  P-->>S: READY (protocolVersion, ownerSession)
  S->>P: COMMAND (requestId, ownerSession, action, file)
  P->>O: Validate file, enqueue FIFO command
  O-->>P: Applied or rejected + revision
  P-->>S: ACK + STATE
  Note over S,P: Lost ACK -> query request status; never blind replay
```

Proposed framing: UTF-8 JSON, 4-byte unsigned little-endian length prefix;
maximum 1 MiB/frame checked before allocation. Protocol name `lalin-play`,
`protocolVersion:1`; unknown versions reject without side effects. Integers must
be finite safe integers; reject malformed frames/unknown message types/extra
action fields. These limits and names are proposals, not existing API compatibility.

| Message | Required fields / allowed values |
|---|---|
| READY | `protocol`, `protocolVersion`, `ownerSession` (new opaque UUID per owner lifetime), `capabilities` containing supported actions |
| COMMAND | `requestId` UUID, `ownerSession`, `action`: `play` / `play-next` / `add-to-queue`; `file`: `{path,title?}`; local canonical absolute path, title ≤512 characters |
| ACK | matching request/session; `result`: `applied` or `rejected`; monotonic `revision`; `errorCode?` and human-readable message on rejection |
| STATE | session/revision; now-playing identity, state, position, duration, volume, muted, EQ and queue snapshot; no credentials or remote URL token |
| QUERY_REQUEST | session + requestId → cached ACK and current STATE, or `unknown` |
| GET_STATE | current session → bounded STATE |

Only three handoff mutations initially; internal DTOs are not exposed wholesale
as arbitrary actions. `play` selects/plays, `play-next` inserts after current,
`add-to-queue` appends without starting playback. ACK `applied` means the command
was applied to owner state, **not proof of audible output**; later decoder failure
appears in STATE. Full snapshots over the frame cap return `snapshot_too_large`
without truncating or applying another command; incremental/paged protocol needs
a separately reviewed revision if required.

Security and lifecycle requirements retained from ADR-004:

- Pipe name derived by native code from app/protocol identity and logon identity,
  never a UI-supplied arbitrary name. Exact Win32 construction and ACL must be
  reviewed/tested before implementation; do not publish a guessed SDDL string.
- Explicit same-logon restriction, remote-client rejection and peer verification;
  reject a conflicting/untrusted pre-existing endpoint. Same-user malicious code
  is not claimed to be isolated by this design.
- Sender resolves authorized workspace/upload/output references while backend
  is available; receiver revalidates local regular files. Reject remote URLs,
  UNC/network paths for initial local-only handoff, device paths and directory
  payloads. Never execute a shell or infer a path from a title/pack ID.
- File grants apply only to the explicit handoff item; source survives Studio/API
  shutdown. Missing receiver reports install/configuration guidance; no fallback
  second engine. `LALIN_PLAY_EXECUTABLE` is explicit developer configuration,
  not implemented automatic discovery.
- Proposed FIFO queue cap 128 pending requests; reject excess as `busy`, do not
  drop/reorder silently. Record at most 1,024 request outcomes per owner session;
  after eviction, QUERY returns `unknown` and sender must not automatically replay.
- Duplicate ID with same payload returns original outcome without a second
  application; duplicate ID with different payload rejects `request_conflict`.
  Wrong/new owner session requires reconciliation and explicit user action before
  resubmitting an uncertain old command. Disconnect does not undo accepted work.
- Proposed 10-second connect/ACK deadline reports delivery unknown, not “failed
  so retry”. Serialize actual owner mutations and revision updates. Cancellation
  before acceptance does not imply rollback after acceptance.
- Keep raw paths out of routine logs; log request ID/status and a redacted file
  label. No keys/cookies/profile data on the wire or in captured diagnostics.

Exit tests (all **NOT_RUN**): cold/warm launch; FIFO burst; duplicate payload/
conflicting duplicate; ACK loss; restart and expired request history; oversized/
malformed/version-mismatch frames; different logon/remote client/endpoint spoof;
path escape/missing file; Studio/API exit during playback; unchanged Cast launcher.

## 3. Approved S2 opt-in migration envelope v1

This is distinct from native library JSON and internal WebView keys. Export is
UTF-8 JSON ≤16 MiB, format `lalin-play-migration`, `schemaVersion:1`, `exportId`
UUID, ISO `createdAt`, `sourceApp` (`lalin-studio`), `sourceVersion`
(`unknown` when unavailable), nullable `sourceCommit`, `queue`, `eq`, and an
`unresolved` list. It contains no executable content, asset URLs, auth tokens,
cover blobs, volume/autoplay commands or WebView profile data. Studio reads the
live Play store only; it does not open the WebView profile.

| Section | Validation / import semantics |
|---|---|
| queue | ≤10,000 ordered items `{entryId, localPath, title?, kind?}`; preserve duplicate tracks; nullable `currentEntryId`; `repeatMode` off/one/all; boolean `shuffle` |
| eq | `enabled`, finite `preamp`, 10 ordered `{frequency,gain}` bands in −12..12 dB, `currentPreset`, and ≤100 custom presets as an array of `{name,preamp,gains}` with unique nonempty names ≤120 chars |
| unresolved | Unique `entryId`, display label and reason only; stale HTTP, upload IDs and relative references are never guessed into paths |
| provenance | `sourceVersion` and nullable `sourceCommit`; unavailable values are explicitly `unknown` / `null` |

The Studio exporter emits an item path only when the live queue item has a
supported, absolute local `sourcePath`; all other items are listed in
`unresolved`. Standalone revalidates file paths natively (regular local files;
no UNC/network, device or relative paths), then previews readable/unresolved
counts and labels before any mutation. On Windows, mapped drive roots are
classified with `GetDriveTypeW`: fixed, removable, CD-ROM and RAM-disk drives
are accepted; remote, unknown, no-root and unrecognized drive types fail closed.
The user can cancel or explicitly import
resolvable entries while retaining the unresolved report. A selected unresolved
current item maps to no active selection. Successful import enables queue restore
for the next launch because the user explicitly opted into queue migration; the
player remains stopped and never autoplays.

Import mode is explicit **replace queue/EQ**. The library adds validated media
references by canonical path without deleting existing catalog items. Playlist
migration and full-profile copying are out of scope. Unknown schema or fields,
duplicate entry IDs, invalid local paths, nonfinite/out-of-range EQ, malformed or
oversized data reject before mutation. Re-import of an export ID is detected and
requires a separate explicit confirmation.

## 4. Approved S2 transaction and recovery

1. Parse, validate, resolve and preview without changing queue/EQ/library; allow cancel.
2. On confirmation, stop playback and atomically persist a Play-owned journal
   containing transaction/export IDs, prior/new catalog snapshots, exact prior
   queue/EQ/resume storage values, normalized new queue/EQ, and phase.
3. Persist new queue, EQ and resume choice, then atomically replace the native
   catalog. Mark the journal committed only after both WebView storage writes and
   the native catalog write acknowledge success. These separate stores are
   coordinated by recovery; they are not represented as one filesystem write.
4. Startup checks the journal before React creates the playback store. An
   uncommitted transaction restores the previous catalog and exact WebView values;
   a committed transaction reapplies the new values. Keep the journal until WebView
   storage restoration is acknowledged. Recovery failure retains it and blocks
   another import with an actionable error; never initialize defaults over it.
5. After a committed import, retain one Play-owned snapshot of the prior queue,
   EQ, resume flag and catalog. The user can explicitly undo that import through
   the same journaled transaction; disable undo if the Play catalog changed since
   import. Undo restores the prior state and never deletes source media, Studio
   state or unrelated profile folders.

Exit tests: cancel no-op; invalid version/size/fields/EQ/path; unresolved
selection; duplicate queue entries and export IDs; write failure at each phase;
restart recovery before store initialization; apply→undo queue/EQ/catalog parity;
undo-disabled-after-catalog-change; retained Studio state; and no autoplay.
S2 queue/EQ migration and bounded undo are implemented locally; schema parity,
focused rollback/undo tests, synthetic native restart-phase coverage and selected write-failure tests
are recorded in [S2 migration evidence](../validation/LALIN_PLAY_S2_MIGRATION.md).
Process-crash restart recovery, power-loss durability, remaining native write
failures (including journal creation and import-history persistence), and an
actual Studio-to-Play transfer remain unverified. Named-pipe Studio handoff and
media relink remain separate gates.

Implementation boundary: Studio export reads the live Play store in the running
Studio app. Standalone import reads/writes its own active `localStorage` through
the application runtime and stores its journal/library under Play app data. It
does not open, copy, parse or edit either product's WebView profile files.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.2.4b | 2026-09-26 | beta | Reject mapped network drives in S2 native file validation and record deterministic drive-type coverage | based on 1d30d44 | Codex |
| 0.2.3b | 2026-09-26 | beta | Add explicit journaled last-import undo and report its safety gate | based on 58f6b67 | Codex |
| 0.2.2b | 2026-09-25 | beta | Record synthetic native restart-phase and selected write-failure evidence with remaining gates | based on 411d2ed | LALIN |
| 0.2.1b | 2026-09-25 | beta | Record local S2 exporter/importer, journal recovery and focused evidence limits | based on 411d2ed | LALIN |
| 0.2.0b | 2026-09-25 | beta | Approve S2 queue/EQ migration envelope and journal recovery; keep Studio IPC candidate | based on 411d2ed | LALIN |
| 0.1.0b | 2026-09-20 | candidate | Separate observed local API/storage from proposed bounded IPC and opt-in transactional migration | based on f5a6681 | LALIN |
