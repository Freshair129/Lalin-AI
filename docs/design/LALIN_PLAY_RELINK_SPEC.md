---
version: "0.1.0b"
created_at: "2026-11-07T00:00:00+07:00,Claude"
last_update: "2026-11-07T00:00:00+07:00,Claude"
status: "beta"
superseded_by: null
attributes:
  domain: "lalin-play"
  doc_type: "implementation-specification"
  scope: "PLAY-08 relink of a missing or moved local media file while preserving every reference"
---

# Lalin Play — Relink Specification (PLAY-08)

## 1. Status and authority

- Requirement: [PRD](../product/PRD.md) PLAY-08 (approved 2026-09-20): a missing, moved
  or unsupported file shows its reason and lets the user pick a new file; the queue is
  never cleared as a whole. [ADR-004](../architecture/ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md)
  §Persistence: missing/moved files stay visible with a relink action.
- This document adds no new product scope. It fixes the implementation design so a coding
  agent can build PLAY-08 without guessing. Lead (agent) review on 2026-11-07; it is not an
  owner approval. Any behaviour outside §3 needs a CR under R5.
- Traceability: [LALIN_PLAY_TRACEABILITY.md](../validation/LALIN_PLAY_TRACEABILITY.md) PLAY-08.

## 2. Current model (facts this design relies on, branch `codex/lalin-play-cr006-008-wip`)

| Concern | Today |
|---|---|
| Track id (linked) | `id == path` = canonical absolute path (`library.rs` `track()`; `migration.rs` import) |
| Track id (managed / offline import) | `offline:<sha256>`; `path` = managed copy under `<appdata>/media`; `source_path` = original; `content_hash` = whole-file sha256 |
| Missing | computed, never stored: `!Path::new(path).is_file()` (`library_store.rs` `track_from_row`) and `!supported || !is_file` (`library::initialize`). For managed tracks it means the managed copy is gone |
| Favorites, play count, last played | columns on the `tracks` row (by id) |
| History | `play_history.track_id` |
| Retirement | `track_retirements(track_id, content_hash)`; a retired id must never come back |
| Smart Medley cache | `settings`, keyed by content hash + analyzer version |
| Playlists | localStorage `lalin-play:v1:playlists`, `trackIds: string[]` |
| Queue | localStorage `lalin-play:v1:queue`; each `MediaItem` holds `id`, `queueEntryId`, `url`, `sourcePath`; playback resolves by `id` through `resolve_media` |
| Missing UI | row subtitle `app.missingFile`; no action; raw Thai `resolve_media` errors are not mapped by `localizeError` |

## 3. Behaviour

### 3.1 Invariant

Relink changes **where** a track's media is read from. It never changes the track `id`.
Therefore playlists, queue occurrences (`queueEntryId`), favorites, play count, last played,
history rows and any in-flight Smart Medley pairing keyed by id remain valid with no migration.
After a relink of a linked track, `id` and `path` differ; `id` is an opaque identifier from then
on. No code may derive a path from a linked `id` after this change (audit `find_track_by_source`,
migration de-duplication and `resolve_media`, which must read `path`, never `id`).

### 3.2 Entry points

- **Full view:** a missing track row shows a `Relink…` button (also in the row context menu if one
  exists). It opens a native single-file picker (`tauri-plugin-dialog`, already a dependency),
  filtered to `MEDIA_EXTENSIONS`, starting in the parent of the last known `source_path` / `path`
  when that directory exists.
- **Playback error:** when `resolve_media` fails for the current item, the error banner offers the
  same `Relink…` action for that track id. Playback does not auto-advance past the failed item
  (existing behaviour) and the queue is unchanged.
- **Compact view:** no picker (CR-004 keeps Compact minimal). It shows the localized error and the
  hint to relink from Full.
- Unsupported codec / extension: same banner; `Relink…` is offered, because the fix is choosing a
  different file.

### 3.3 Native command

`relink_track(app: AppHandle, id: String, path: String, accept_different_content: bool) -> Result<Track, String>`

Steps, all-or-nothing:

1. Load the row by `id`. Errors: unknown id; id present in `track_retirements`.
2. Validate `path` with the **same** rules as handoff `validate_media_file`: non-empty, ≤ 4096 bytes,
   no NUL, no UNC / `//` / device namespace, absolute, canonicalizes, local drive per
   `is_local_canonical_path`, regular file, extension in `MEDIA_EXTENSIONS`. Move that function (and
   the duplicated `local_windows_drive_root`) into one shared module used by handoff, migration-safe
   checks where equivalent, and relink. Behaviour of existing callers must not change.
3. Hash the new file (whole-file sha256, same helper as import).
4. Duplicate guard: if another live track (different id) already has this canonical path as
   `path`/`source_path`, or (managed only) this `content_hash`, return an error naming that track's
   title. v1 never merges two tracks.
5. Content check: if the row has a `content_hash` and it differs from the new hash, require
   `accept_different_content == true`; otherwise return the dedicated error code (§3.5). Linked rows
   without a stored hash skip this check and store the new hash.
6. Apply:
   - **Linked:** update `media_path` (absolute), `source_path` (= new canonical path) and
     `content_hash` on the same row in one relational mutation batch.
   - **Managed:** stage and publish a new managed copy through the existing
     `publish_prepared` pipeline (generation/publication rules unchanged) bound to the **existing id**;
     on success update `source_path` and `content_hash`; on any failure the old row stays exactly as it
     was and no partial managed file becomes visible. Do not write into `<appdata>/media` outside that
     pipeline.
7. Allow the new path in the asset-protocol scope (same mechanism `library::initialize` uses for
   present tracks).
8. Return the updated `Track` (`missing == false`).

Metadata (title/artist/album/duration) is refreshed from the new file only when the stored value is
empty; user-visible names never silently change.

### 3.4 Frontend

- `native.ts`: `relinkTrack(id, path, acceptDifferentContent)` wrapper.
- `usePlaybackStore`: action `applyRelinkedTrack(track)` replaces `url` and `sourcePath` (via the
  existing `mediaItem()` mapping) for **every** queue occurrence with that `id`, keeps every
  `queueEntryId`, order and current index, then persists the queue. If the relinked track is the
  current item and playback had failed on it, it stays paused at position 0 (no autoplay).
- Library state: replace the track in place by id; playlists need no change.
- Different-content flow: on the §3.5 error code, show a confirm dialog ("The selected file has
  different content. Use it anyway?") and retry with `accept_different_content = true`.
- i18n: add en + th keys for the button, picker title, success notice, the confirm dialog and each
  §3.5 error; also map the four existing raw Thai `resolve_media` messages into `localizeError` so
  English UI shows English. Keep en/th key parity (`i18n.test.tsx`).

### 3.5 Errors (stable codes; UI localizes by code prefix)

`relink:unknown-track`, `relink:retired-track`, `relink:invalid-path`, `relink:not-local`,
`relink:not-a-file`, `relink:unsupported-type`, `relink:duplicate:<title>`,
`relink:different-content`, `relink:publish-failed`.

### 3.6 Out of scope (v1)

Folder/bulk relink and automatic search for moved files; merging duplicates; network/UNC media;
relink from Compact; changing Studio's player.

## 4. Registration checklist

A new command must be added in all four places: `src-tauri/build.rs` `AppManifest::commands`,
`lib.rs` `generate_handler!`, `capabilities/main.json` (`allow-relink-track`) and the generated
`permissions/autogenerated/relink_track.toml`. Also fix the existing gap: `analyze_smart_medley_pair`
is in `generate_handler!` but missing from `build.rs` and `main.json`.

## 5. Acceptance tests

Rust (`library_store.rs` / `library.rs` tests):

1. Linked relink keeps `id`, favorite, play_count, last_played_at and `play_history` rows; `missing`
   becomes false; `resolve_media(id)` returns the new canonical path.
2. Managed relink with matching hash republishes under the same id; `resolve_media` stays inside
   `<appdata>/media`.
3. Hash mismatch without the flag → `relink:different-content` and the row is byte-for-byte unchanged;
   with the flag → succeeds and `content_hash` updates.
4. Rejections: relative, UNC, `//`, device namespace, directory, unsupported extension, retired id,
   unknown id, duplicate path/hash — each leaves the database unchanged.
5. Injected failure during the managed publish leaves the old row and no visible partial file.

TypeScript (vitest):

6. Missing row in Full shows `Relink…`; after a mocked success the row is no longer missing, the
   queue keeps length, order, current index and every `queueEntryId`, and playlists are untouched.
7. `applyRelinkedTrack` updates `url`/`sourcePath` of all duplicate occurrences and persists.
8. Different-content error triggers the confirm path and the retry flag.
9. Compact shows the localized hint and no picker.
10. en/th key parity; `localizeError` maps the `relink:*` codes and the existing Thai
    `resolve_media` messages.

Native/manual (record as NOT_RUN until done): relink a file moved to another local drive in the
running app; confirm the queued item then plays.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-11-07 | beta | Define PLAY-08 relink design: stable ids, shared path validation, linked/managed update rules, queue patching, error codes, registration and acceptance tests | working tree | Claude |
