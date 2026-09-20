---
version: "0.1.0b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-09-20T22:40:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "architecture"
  doc_type: "interface-specification"
  scope: "Observed standalone contracts and proposed Studio IPC/data migration"
---

# Lalin Play — runtime, integration and migration contract

Parent: [ADR-004 §§4–6](ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md),
[PRD §4.9](../product/PRD.md#49-lalin-play--standalone-local-media-player-approved).
Peers: [legacy Studio delivery](LALIN_PLAY_COMMAND_DELIVERY_PLAN.md),
[handoff](LALIN_PLAY_SEPARATION_HANDOFF.md), [traceability](../validation/LALIN_PLAY_TRACEABILITY.md).
Current facts below are read from `f5a6681`. Sections 2–4 are **candidate design,
NOT_IMPLEMENTED**; review before code. Risk HIGH for eventual IPC/data implementation.
This document adds no executable schema, pipe, migration UI or permission.

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

## 3. Proposed opt-in migration envelope v1 (review required)

This is distinct from native library JSON and internal WebView keys. Proposed
export: UTF-8 JSON ≤16 MiB, format `lalin-play-migration`, `schemaVersion:1`,
`exportId` UUID, `createdAt` ISO timestamp, `sourceApp` and `sourceVersion`,
`queue`, `eq`, and `unresolved` list. No executable content, asset URLs, auth tokens,
cover blobs, volume autoplay commands or raw WebView profile data.

| Section | Proposed validation / import semantics |
|---|---|
| queue | ≤10,000 entries `{entryId, localPath, title?, kind?}`; preserve duplicates and order; selected `currentEntryId` optional; repeat off/one/all and boolean shuffle |
| eq | enabled boolean; finite preamp and 10 gains in −12..12 dB; fixed frequency order from playback contract; ≤100 custom presets, unique nonempty names ≤120 chars |
| unresolved | original entry ID, display label and reason only; stale HTTP references are never guessed into paths |
| provenance | Exact exported source version/commit where available; unknown provenance explicitly marked, not invented |

The old Studio exporter must resolve legitimate local references before export;
the new importer revalidates and previews readable/unresolved counts before any
mutation. Users may explicitly choose to import resolvable entries and preserve
the unresolved report; no silent item loss. Selected unresolved current item
results in no active selection. Always finish idle, never autoplay.

Proposed import mode: explicit **replace queue/EQ**, not implicit merge. Library
adds validated media references without deleting existing catalog items. Playlist
migration and full-profile copying are out of scope. Unknown schema, duplicate
entry IDs, nonfinite/out-of-range EQ, malformed or oversized data rejects before
mutation. Re-import of the same export ID is detected and requires confirmation.

## 4. Transaction, recovery and completion gates (not implemented)

1. Parse/validate/preview without changing current state; allow cancel.
2. On explicit confirmation, stop active playback, snapshot queue/EQ/catalog and
   persist a recovery journal in Play-owned app data before applying anything.
3. Journal contains transaction ID, old/new values and committed marker. Apply
   native catalog and UI stores as a coordinated operation; never claim that
   multiple localStorage writes plus catalog rename are already atomic.
4. Set committed marker only after all writes acknowledged. Crash before that
   marker restores the previous snapshot on next launch; crash after it uses
   the new state. Recovery failure preserves journal/backups and blocks another
   import with an actionable error, not a default-empty overwrite.
5. Keep old Studio state/media untouched. Explicit undo restores the last import
   snapshot; do not delete user files or unrelated profile folders. Backup retention
   and exact journal implementation need review together with storage design.

Exit tests (**NOT_RUN**): cancel no-op, invalid version/size/EQ/path, unresolved
selection, duplicate entries and repeated import, disk-full/write failure, crash
at each phase, journal recovery/undo, retained old Studio startup and no autoplay.
Candidate schema/code parity tests must exist before declaring S2 data complete.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-20 | candidate | Separate observed local API/storage from proposed bounded IPC and opt-in transactional migration | based on f5a6681 | LALIN |
