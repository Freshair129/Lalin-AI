---
version: "0.1.2b"
created_at: "2026-09-20T22:40:00+07:00,LALIN,f5a6681"
last_update: "2026-09-26T05:25:06+07:00,Codex"
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
Current standalone facts below use `f5a6681` as their pinned source snapshot.
Section 2 is the approved S3 Windows wire contract and has a local implementation
in the current working tree; focused automated checks pass, while a live Studio–Play
process-pair/audio run remains unverified. Sections 3–4 remain candidate migration
design and require separate approval before code. Risk HIGH for IPC/data changes.

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

## 2. Studio wire contract v1 (approved S3; local implementation)

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

Framing: UTF-8 JSON, 4-byte unsigned little-endian length prefix;
maximum 1 MiB/frame checked before allocation. Protocol name `lalin-play`,
`protocolVersion:1`; unknown versions reject without side effects. Integers must
be finite safe integers; reject malformed frames/unknown message types/extra
action fields. They define the approved local S3 v1 protocol; compatibility with
an independent exported Play repository remains unverified.

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

Security and lifecycle implementation status:

- Pipe name derives in native code from app/protocol identity and the current
  logon SID, never from a UI-supplied name. Play creates a protected DACL for
  that SID and enables `PIPE_REJECT_REMOTE_CLIENTS`; Studio verifies the server
  process image and session, and Play impersonates/checks the client SID.
  Local tests verify DACL creation and the remote-rejection flag; live
  cross-session and endpoint-spoof attempts remain unverified.
- A conflicting first-instance endpoint is rejected. Same-user malicious code
  is not claimed to be isolated by this design.
- Sender resolves authorized workspace/upload/output references while backend
  is available; sender and receiver canonicalize and revalidate local regular
  files. Reject remote URLs and UNC/network/device roots both before and after
  resolution, including a reparse point resolving to an extended UNC path.
  On Windows, `GetDriveTypeW` must classify the canonical drive root as fixed,
  removable, CD-ROM or RAM disk; remote, unknown and invalid drive types fail
  closed. Receiver checks both conditions before granting to the asset scope.
  Never execute a shell or infer a path from a title/pack ID.
- File grants apply only to the explicit handoff item; source survives Studio/API
  shutdown. Missing receiver reports install/configuration guidance; no fallback
  second engine. Studio's existing playback actions remain on the Studio owner;
  separate standalone actions opt into this handoff. `LALIN_PLAY_EXECUTABLE` is
  the developer override; Studio also checks the Windows App Paths registration,
  whose installer setup remains unverified.
- Studio's explicit standalone handoff actions keep an in-memory FIFO capped at
  128 commands and reject overflow visibly. A native sender mutex and one pipe
  request at a time preserve that order. Play records at most 1,024 request
  outcomes per owner session; after eviction, QUERY returns `unknown` and sender
  must not automatically replay.
- Duplicate ID with same payload returns original outcome without a second
  application; duplicate ID with different payload rejects `request_conflict`.
  Wrong/new owner session requires reconciliation and explicit user action before
  resubmitting an uncertain old command. Disconnect does not undo accepted work.
- Play waits up to 10 seconds for owner ACK; Studio allows 12 seconds for a pipe
  response. A cold launch waits up to 10 seconds for the endpoint. Unknown
  delivery triggers same-ID QUERY and remains blocked if the ACK/STATE pair is
  still unavailable. Serialize owner mutations and revision updates.
- Keep raw paths out of routine logs; log request ID/status and a redacted file
  label. No keys/cookies/profile data on the wire or in captured diagnostics.

Focused local tests now cover cold/warm launch decisions, one-launch timeout,
Studio FIFO ordering, payload, canonical-root and drive-type validation,
duplicate/conflicting IDs, owner-session query checks, bounded history/snapshots,
protected same-logon DACL creation and the remote-client-rejection flag. Drive
classification is tested with fixed, remote, unknown and invalid values; no
mapped-drive runtime case was exercised. The ACL test does not attempt an
unauthorized connection. Live cross-process delivery, ACK-loss under process
interruption, cross-session/spoof attempts, Studio/API exit during active playback,
audible parity and Cast regression remain **NOT VERIFIED**.

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
| 0.1.2b | 2026-09-26 | candidate | Require canonical local paths and known local drive types on both handoff sides; keep runtime gates open | uncommitted | Codex |
| 0.1.1b | 2026-09-25 | candidate | Record approved S3 named-pipe contract and local implementation evidence; leave migration design gated | uncommitted | Codex |
| 0.1.0b | 2026-09-20 | candidate | Separate observed local API/storage from proposed bounded IPC and opt-in transactional migration | based on f5a6681 | LALIN |
