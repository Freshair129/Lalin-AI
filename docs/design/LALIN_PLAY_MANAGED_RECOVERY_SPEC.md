---
version: "0.1.2b"
created_at: "2026-11-07T00:00:00+07:00,Claude"
last_update: "2026-11-07T00:00:00+07:00,Claude"
status: "beta"
superseded_by: null
attributes:
  domain: "lalin-play"
  doc_type: "implementation-specification"
  scope: "PLAY-08-M recovery of a managed (offline-imported) track whose stored object is missing or corrupt"
---

# Lalin Play — Managed Object Recovery Specification (PLAY-08-M)

## 1. Status and authority

- In scope for v1.0 by the owner-approved [Play v1.0 release scope](../product/LALIN_PLAY_V1_RELEASE_SCOPE.md) §2 (PLAY-08 row). Requirement: [PRD](../product/PRD.md) PLAY-08 — a missing file shows its reason and lets the user pick a file again without clearing the queue.
- **Does not amend the frozen W0-D media-store contract (v0.6.2, CLOSED/FROZEN, see [CR-008 DAG](../architecture/LALIN_PLAY_CR008_EXECUTION_DAG.md) register row "W0-D").** The visibility predicate (`managed_row_is_visible` in `apps/play-desktop/src-tauri/src/library_store.rs`), publication journals, receipts and Genesis rows keep their current semantics. This spec only adds (a) a read-only diagnostic listing and (b) restoration of identical object bytes at the existing content address. If implementation finds that either requires changing the predicate, a receipt or a journal, stop: that needs an owner-approved W0-D amendment.
- Lead (agent) design, 2026-11-07; owner may review in issue #47. Companion: [relink spec](LALIN_PLAY_RELINK_SPEC.md) (linked tracks).

## 2. Facts relied on

| Fact | Where |
|---|---|
| Managed objects are content-addressed: `media/objects/sha256/<prefix>/<hash>.<ext>` | `local_media_store.rs` (`canonical_object_path_matches`) |
| A managed row is hidden when: no `publication_id`; publication retired; publication journal missing; no or invalid commit receipt; `verify_prepared_object` fails (object missing/size/hash mismatch); or the row set conflicts | `library_store.rs` `managed_row_is_visible` |
| Hidden rows are absent from `read_catalog`, so the UI cannot show or relink them | `get_library` → `read_catalog` |
| `import_selected` returns an existing managed row unchanged when the hash matches (no repair) | `library.rs` `import_selected` |
| Playlists and queue reference the track id; history/favorites live on the row | relink spec §2 |

## 3. Behaviour

### 3.1 Recoverable vs not recoverable

Only one hidden class is recoverable: a **committed** publication (journal present, receipt present and checksum-valid, not retired, row set consistent) whose object fails `verify_prepared_object` because the object file is **missing** or its bytes **do not match** the receipt. Every other hidden class stays hidden and is not listed (incomplete/uncommitted/retired/conflicting publications belong to the W0-D reconciliation path).

### 3.2 Diagnostic listing (read-only)

New command `list_damaged_tracks(app) -> Vec<DamagedTrack>` where `DamagedTrack { id, title, artist, album, content_hash, ext, reason: "missing" | "corrupt", source_path }`. It evaluates the same checks as the predicate (shared helper; the predicate itself is unchanged) and returns only §3.1 rows. It never mutates anything and never makes the row playable.

### 3.3 Restore

New command `restore_managed_track(app, id, path) -> Track`:

1. Reject unless `id` is a §3.1 row (`recovery:not-recoverable`).
2. Validate `path` with `media_validation` (same rules as relink): local, absolute, regular file, supported extension (`recovery:invalid-path` / `recovery:not-local` / `recovery:unsupported-type`).
3. Hash the file (`media_validation::sha256_file`); it must equal the row's `content_hash`, else `recovery:content-mismatch` (the UI then offers "Import as a new track", which is a normal import with a new id).
4. If a corrupt object exists at the canonical path, move it to `media/quarantine/<hash>.<ext>.<unix-ms>` (never delete). Failure → `recovery:write-failed` with nothing else changed.
5. Write the bytes to the canonical object path using the existing staging/finalize mechanism (`stage_local_file` + `finalize_object`, then `discard_uncommitted_stage` for the temporary publication), or an equivalent atomic temp-file + rename into the canonical path if finalize would create a new publication. **No Genesis row, publication journal or receipt is written.**
6. Re-run the predicate for the row; it must now be visible, else roll back the object write (restore the quarantined file if one was moved) and return `recovery:verify-failed`.
7. Allow the canonical path in the asset-protocol scope; return the visible `Track`.

### 3.4 Re-import repair

In `import_selected`, when the matched existing managed row (same hash) is a §3.1 row, perform the §3.3 steps 4–7 with the selected file instead of returning the row unchanged, so the existing UI hint "add the file again" also repairs it.

### 3.5 UI

- Full view: when `list_damaged_tracks` is non-empty, a notice "N offline files need repair" opens a **Repair** panel listing them (title, reason, original source path) with `Restore from file…` (native picker via a `select_restore_file(app, id)` command modelled on `select_relink_file`, starting in the source path's folder when it exists).
- Queue entries whose id is a damaged track keep their position; playing them shows the existing missing-file error plus a link to the Repair panel. Nothing is removed from the queue or playlists.
- Compact: localized hint only. en/th strings for every label and `recovery:*` code.

### 3.6 Out of scope

Recovering incomplete/uncommitted/retired/conflicting publications; recovering without the identical bytes; any W0-D predicate, receipt or journal change; RustFS/remote objects.

## 4. Registration

`list_damaged_tracks`, `select_restore_file`, `restore_managed_track` in `build.rs`, `generate_handler!`, `capabilities/main.json`, and generated permission TOMLs.

## 5. Acceptance tests

Automated acceptance: **PASS** (2026-11-07); native owner acceptance: **NOT_RUN**.

Rust: (1) committed publication + deleted object → listed as `missing`; restore with identical bytes → visible, same id/favorite/play_count/history, no new Genesis rows or journal entries (assert row/journal snapshots unchanged); (2) corrupted object → listed as `corrupt`; restore quarantines the old bytes and repairs; (3) different bytes → `recovery:content-mismatch`, nothing written; (4) uncommitted/retired publication → not listed and `recovery:not-recoverable`; (5) injected failure after quarantine → original bytes restored, row still hidden; (6) `import_selected` of identical bytes repairs a damaged row; (7) predicate behaviour for all non-recoverable classes unchanged (existing visibility tests still pass).
TypeScript: Repair notice and panel; restore success updates library and leaves queue/playlists unchanged; mismatch shows "Import as new track"; Compact hint; en/th parity.
Native/manual (owner, P1.6): delete a managed object on disk, restart, repair from the original file, play it.

## 6. Implementation and test-round evidence (2026-11-07)

PLAY-08-M implementation is present on `codex/lalin-play-managed-recovery` (code
baseline `33eb1ba`); the automated test round is **PASS**. Native owner acceptance
P1.6 is NOT_RUN. No release acceptance is implied.

- Rust items 1-5: `recovery_missing_preserves_rows_history_and_journals`,
  `recovery_corrupt_quarantines_original_and_restores_bytes`,
  `recovery_mismatch_writes_nothing`,
  `recovery_uncommitted_and_retired_are_ineligible`, and
  `recovery_failure_after_quarantine_restores_original`. Item 1 snapshots every
  table and column in the registered Play Genesis schema and all publication
  journals, including their receipt records.
- Rust item 6: `reimport_repairs_damaged_managed_row_without_changing_records`
  exercises the extracted repair branch called by `import_selected`, with its
  original staged hash and publication id, and checks identity, history, all
  Genesis rows, journal bytes and restored object bytes.
- Rust item 7: `recovery_excludes_every_nonrecoverable_hidden_class_without_writes`
  covers no publication id, retired publication, missing journal, no receipt,
  invalid receipt checksum and row-set conflict. It snapshots the registered
  relational tables and media files/directories around listing and restore.
  Existing visibility tests also passed, including
  `conflicting_partial_genesis_row_stays_hidden_and_requires_reconciliation`,
  `failure_after_genesis_readback_before_receipt_stays_hidden_then_startup_reconciles`,
  and `removed_publication_stays_absent_after_restart_without_deleting_object_bytes`.
- TypeScript: `shows repair panel and restores without changing queue or playlists`,
  `offers import as a new track on recovery mismatch`, `shows the compact recovery hint`,
  `provides every recovery label in both locales`, and `localizes every recovery error
  in English and Thai` use mocked IPC. The mismatch test checks the offer with cancel.
- Local run: Vitest 16 files/110 passed; `tsc --noEmit` and `cargo fmt --check`
  passed; Cargo `--offline --locked --lib --tests`: 87 unit passed, 6 ignored,
  3 integration passed, 0 failed; doc-tests not run.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.2b | 2026-11-07 | beta | Complete re-import, non-recoverable matrix and full Genesis snapshot automated evidence; native acceptance remains open | working tree | Codex |
| 0.1.1b | 2026-11-07 | beta | Record implemented recovery and partial automated test evidence; retain re-import, full visibility matrix and native acceptance gaps | working tree | Codex |
| 0.1.0b | 2026-11-07 | beta | Define PLAY-08-M managed-object recovery without amending frozen W0-D: read-only damaged listing, identical-bytes restore at the content address, re-import repair, UI and tests | working tree | Claude |
