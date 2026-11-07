// @req PLAY-15 — GenesisBlockDB owns the relational catalog and settings.
// @req PLAY-17 — Cache settings and eviction metadata stay in GenesisBlockDB.
// @req PLAY-20 — Genesis graph/vector indexes are derived from this catalog.
// @tested apps/play-desktop/src-tauri/src/library.rs — legacy migration and catalog paths
use crate::library::{Library, Track, MAX_TRACKS};
use genesis_block_native::{
    OpenOptions, RelationalColumn, RelationalColumnType, RelationalIndex, RelationalMutationBatch,
    RelationalMutationKind, RelationalQuery, RelationalRowMutation, RelationalSchemaPackage,
    RelationalTable, Storage,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

#[cfg(test)]
use std::cell::Cell;

const LEGACY_FILE: &str = "library-v1.json";
const NAMESPACE: &str = "lalin_play";
const SCHEMA_VERSION: u32 = 3;
const RELATIONAL_QUERY_PAGE_SIZE: u32 = 1000;
const MAX_CACHE_QUOTA: u64 = 100 * 1024 * 1024 * 1024;
const DEFAULT_CACHE_QUOTA: u64 = 2 * 1024 * 1024 * 1024;
const TRACK_COLUMNS: &[&str] = &[
    "id",
    "media_path",
    "title",
    "artist",
    "album",
    "duration",
    "kind",
    "source_kind",
    "storage_kind",
    "source_path",
    "content_hash",
    "favorite",
    "play_count",
    "last_played_at",
    "publication_id",
    "publication_plan_digest",
    "publication_state",
    "publication_row_digest",
];
static DATABASES: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<Storage>>>>> = OnceLock::new();

#[cfg(test)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PublicationFailpoint {
    AfterGenesisReadbackBeforeReceipt,
}

#[cfg(test)]
thread_local! {
    static NEXT_PUBLICATION_FAILPOINT: Cell<Option<PublicationFailpoint>> = const { Cell::new(None) };
}

#[cfg(test)]
fn inject_publication_failpoint(failpoint: PublicationFailpoint) {
    NEXT_PUBLICATION_FAILPOINT.with(|slot| slot.set(Some(failpoint)));
}

#[cfg(test)]
fn trip_publication_failpoint(failpoint: PublicationFailpoint) -> Result<(), String> {
    NEXT_PUBLICATION_FAILPOINT.with(|slot| {
        if slot.get() == Some(failpoint) {
            slot.set(None);
            Err("INJECTED_AFTER_GENESIS_READBACK_BEFORE_RECEIPT".into())
        } else {
            Ok(())
        }
    })
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeLink {
    pub id: String,
    pub url: String,
    pub title: String,
    pub added_at: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheSettings {
    pub enabled: bool,
    pub quota_bytes: u64,
    pub used_bytes: u64,
    pub authorized_sources: u32,
}

fn databases() -> &'static Mutex<HashMap<PathBuf, Arc<Mutex<Storage>>>> {
    DATABASES.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(test)]
fn forget_database(directory: &Path) {
    let root = fs::canonicalize(directory.join("genesis-play")).unwrap();
    databases().lock().unwrap().remove(&root);
}

pub fn open_database(directory: &Path) -> Result<Arc<Mutex<Storage>>, String> {
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    crate::local_media_store::remember_library_directory(directory)?;
    let root = directory.join("genesis-play");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let root = fs::canonicalize(root).map_err(|error| error.to_string())?;
    let mut opened = databases().lock().map_err(|error| error.to_string())?;
    if let Some(database) = opened.get(&root) {
        return Ok(Arc::clone(database));
    }
    let storage = Storage::open(OpenOptions {
        path: root.to_string_lossy().to_string(),
        page_cache_mb: Some(32),
        read_only: Some(false),
        vector_dim: Some(256),
        retention: Some("frontier_only".into()),
    })
    .map_err(|error| format!("เปิด GenesisBlockDB ไม่สำเร็จ: {error}"))?;
    let registered = storage
        .get_relational_schema(NAMESPACE)
        .map_err(|error| format!("อ่าน schema ของ Lalin Play ไม่สำเร็จ: {error}"))?;
    match registered.map(|package| package.schema_version) {
        None => {
            storage
                .register_relational_schema(schema_package_v1())
                .map_err(|error| format!("ลงทะเบียน schema รุ่นแรกของ Lalin Play ไม่สำเร็จ: {error}"))?;
            storage
                .register_relational_schema(schema_package_v2())
                .map_err(|error| format!("อัปเกรด schema ของ Lalin Play ไม่สำเร็จ: {error}"))?;
            storage
                .register_relational_schema(schema_package())
                .map_err(|error| format!("อัปเกรด schema ของ Lalin Play ไม่สำเร็จ: {error}"))?;
        }
        Some(1) => {
            storage
                .register_relational_schema(schema_package_v2())
                .map_err(|error| format!("อัปเกรด schema ของ Lalin Play ไม่สำเร็จ: {error}"))?;
            storage
                .register_relational_schema(schema_package())
                .map_err(|error| format!("อัปเกรด schema ของ Lalin Play ไม่สำเร็จ: {error}"))?;
        }
        Some(2) | Some(SCHEMA_VERSION) => {
            storage
                .register_relational_schema(schema_package())
                .map_err(|error| format!("อัปเกรด schema ของ Lalin Play ไม่สำเร็จ: {error}"))?;
        }
        Some(version) => return Err(format!("schema ของ Lalin Play รุ่น {version} ไม่รองรับ")),
    }
    let database = Arc::new(Mutex::new(storage));
    opened.insert(root, Arc::clone(&database));
    Ok(database)
}

fn column(name: &str, column_type: RelationalColumnType, nullable: bool) -> RelationalColumn {
    RelationalColumn {
        name: name.into(),
        column_type,
        nullable,
        default: None,
    }
}

fn table(
    name: &str,
    columns: Vec<RelationalColumn>,
    indexes: Vec<RelationalIndex>,
) -> RelationalTable {
    RelationalTable {
        name: name.into(),
        columns,
        primary_key: vec!["id".into()],
        foreign_keys: vec![],
        indexes,
    }
}

fn index(name: &str, columns: &[&str], unique: bool) -> RelationalIndex {
    RelationalIndex {
        name: name.into(),
        columns: columns.iter().map(|column| (*column).into()).collect(),
        unique,
    }
}

fn schema_package_v1() -> RelationalSchemaPackage {
    schema_package_for_version(1)
}

fn schema_package_v2() -> RelationalSchemaPackage {
    schema_package_for_version(2)
}

fn schema_package() -> RelationalSchemaPackage {
    schema_package_for_version(SCHEMA_VERSION)
}

fn schema_package_for_version(version: u32) -> RelationalSchemaPackage {
    use RelationalColumnType::{Boolean, Integer, Real, Text};
    let mut track_columns = vec![
        column("id", Text, false),
        column("media_path", Text, false),
        column("title", Text, false),
        column("artist", Text, true),
        column("album", Text, true),
        column("duration", Real, true),
        column("kind", Text, false),
        column("source_kind", Text, false),
        column("storage_kind", Text, false),
        column("source_path", Text, true),
        column("content_hash", Text, true),
        column("favorite", Boolean, false),
        column("play_count", Integer, false),
        column("last_played_at", Integer, true),
    ];
    let mut track_indexes = vec![
        index("tracks_hash_idx", &["content_hash"], false),
        index("tracks_last_played_idx", &["last_played_at"], false),
    ];
    if version >= 2 {
        track_columns.extend([
            column("publication_id", Text, true),
            column("publication_plan_digest", Text, true),
            column("publication_state", Text, true),
            column("publication_row_digest", Text, true),
        ]);
        track_indexes.push(index("tracks_publication_idx", &["publication_id"], false));
    }
    let mut tables = vec![
        table("tracks", track_columns, track_indexes),
        table(
            "play_history",
            vec![
                column("id", Text, false),
                column("track_id", Text, false),
                column("played_at", Integer, false),
            ],
            vec![index(
                "history_track_time_idx",
                &["track_id", "played_at"],
                false,
            )],
        ),
        table(
            "youtube_links",
            vec![
                column("id", Text, false),
                column("url", Text, false),
                column("title", Text, false),
                column("added_at", Integer, false),
            ],
            vec![index("youtube_url_idx", &["url"], true)],
        ),
        table(
            "cache_entries",
            vec![
                column("id", Text, false),
                column("relative_path", Text, false),
                column("size_bytes", Integer, false),
                column("last_accessed_at", Integer, false),
                column("pinned", Boolean, false),
                column("source_kind", Text, false),
            ],
            vec![index(
                "cache_lru_idx",
                &["pinned", "last_accessed_at"],
                false,
            )],
        ),
        table(
            "settings",
            vec![column("id", Text, false), column("value", Text, false)],
            vec![],
        ),
    ];
    if version >= 3 {
        tables.push(table(
            "track_retirements",
            vec![
                column("id", Text, false),
                column("track_id", Text, false),
                column("content_hash", Text, true),
                column("retired_at", Integer, false),
            ],
            vec![index("track_retirement_track_idx", &["track_id"], false)],
        ));
    }
    RelationalSchemaPackage {
        namespace: NAMESPACE.into(),
        schema_version: version,
        previous_version: if version == 1 {
            None
        } else {
            Some(version - 1)
        },
        package_id: format!("00000000-0000-4000-8000-00000000000{version}"),
        schema_hash: String::new(),
        tables,
        named_queries: vec![],
    }
}

fn query_rows(
    database: &Storage,
    table: &str,
    columns: &[&str],
    filters: Vec<genesis_block_native::RelationalFilter>,
    limit: u32,
) -> Result<Vec<Value>, String> {
    if limit == 0 {
        return Err("relational query limit must be positive".into());
    }
    if limit <= RELATIONAL_QUERY_PAGE_SIZE {
        return query_rows_at_offset(database, table, columns, filters, limit, 0);
    }

    let mut rows = Vec::new();
    let mut offset = 0u32;
    while rows.len() < limit as usize {
        let page_limit =
            (limit as usize - rows.len()).min(RELATIONAL_QUERY_PAGE_SIZE as usize) as u32;
        let page = query_rows_at_offset(
            database,
            table,
            columns,
            filters.clone(),
            page_limit,
            offset,
        )?;
        let page_len = page.len() as u32;
        rows.extend(page);
        offset = offset
            .checked_add(page_len)
            .ok_or_else(|| "relational query offset overflow".to_string())?;
        if page_len < page_limit {
            return Ok(rows);
        }
    }

    let overflow = query_rows_at_offset(database, table, columns, filters, 1, offset)?;
    if !overflow.is_empty() {
        return Err(format!(
            "relational query exceeds the supported row limit of {limit}"
        ));
    }
    Ok(rows)
}

fn query_rows_at_offset(
    database: &Storage,
    table: &str,
    columns: &[&str],
    filters: Vec<genesis_block_native::RelationalFilter>,
    limit: u32,
    offset: u32,
) -> Result<Vec<Value>, String> {
    let qualified_columns = columns
        .iter()
        .map(|column| format!("{table}.{column}"))
        .collect::<Vec<_>>();
    let qualified_filters = filters
        .into_iter()
        .map(|mut filter| {
            if !filter.column.contains('.') {
                filter.column = format!("{table}.{}", filter.column);
            }
            filter
        })
        .collect();
    database
        .query_relational(RelationalQuery {
            namespace: NAMESPACE.into(),
            table: table.into(),
            columns: qualified_columns.clone(),
            joins: vec![],
            filters: qualified_filters,
            limit: Some(limit),
            offset: Some(offset),
        })
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|row| {
            let values = row
                .as_object()
                .ok_or_else(|| "GenesisBlockDB returned a non-object relational row".to_string())?;
            let normalized = columns
                .iter()
                .zip(qualified_columns.iter())
                .filter_map(|(column, qualified)| {
                    values
                        .get(qualified)
                        .cloned()
                        .map(|value| ((*column).to_string(), value))
                })
                .collect::<serde_json::Map<_, _>>();
            Ok(Value::Object(normalized))
        })
        .collect()
}

fn mutation(
    table: &str,
    kind: RelationalMutationKind,
    values: Value,
    key: Option<Value>,
) -> RelationalRowMutation {
    RelationalRowMutation {
        table: table.into(),
        kind,
        values,
        key,
    }
}

fn apply(database: &Storage, operations: Vec<RelationalRowMutation>) -> Result<(), String> {
    for chunk in operations.chunks(1000) {
        if chunk.is_empty() {
            continue;
        }
        database
            .apply_relational_batch(RelationalMutationBatch {
                mutation_id: Uuid::new_v4().to_string(),
                namespace: NAMESPACE.into(),
                schema_version: SCHEMA_VERSION,
                operations: chunk.to_vec(),
            })
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn stored_media_path(directory: &Path, track: &Track) -> Result<String, String> {
    if track.storage_kind != "managed" {
        return Ok(track.path.clone());
    }
    let relative = Path::new(&track.path)
        .strip_prefix(directory)
        .map_err(|_| "ตำแหน่ง offline อยู่นอกโฟลเดอร์ข้อมูลของ Lalin Play".to_string())?;
    if relative
        .components()
        .any(|part| matches!(part, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("ตำแหน่งไฟล์ offline ไม่ถูกต้อง".into());
    }
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn track_values(directory: &Path, track: &Track) -> Result<Value, String> {
    let play_count = i64::try_from(track.play_count).map_err(|_| "จำนวนครั้งที่ฟังเกินขอบเขตที่รองรับ")?;
    Ok(json!({
        "id": track.id,
        "media_path": stored_media_path(directory, track)?,
        "title": track.title,
        "artist": track.artist,
        "album": track.album,
        "duration": track.duration,
        "kind": if matches!(track.kind, crate::library::MediaKind::Video) { "video" } else { "audio" },
        "source_kind": track.source_kind,
        "storage_kind": track.storage_kind,
        "source_path": track.source_path,
        "content_hash": track.content_hash,
        "favorite": track.favorite,
        "play_count": play_count,
        "last_played_at": track.last_played_at,
        "publication_id": null,
        "publication_plan_digest": null,
        "publication_state": null,
        "publication_row_digest": null,
    }))
}

fn track_values_with_publication(
    directory: &Path,
    track: &Track,
    publication: &crate::local_media_store::PublicationFieldsV1,
) -> Result<Value, String> {
    let mut values = track_values(directory, track)?;
    let object = values
        .as_object_mut()
        .ok_or_else(|| "catalog row is not an object".to_string())?;
    object.insert("publication_id".into(), json!(publication.publication_id));
    object.insert(
        "publication_plan_digest".into(),
        json!(publication.plan_digest),
    );
    object.insert("publication_state".into(), json!(publication.state));
    object.insert(
        "publication_row_digest".into(),
        json!(publication.row_digest),
    );
    Ok(values)
}

fn track_values_preserving_publication(
    database: &Storage,
    directory: &Path,
    track: &Track,
) -> Result<Value, String> {
    let mut values = track_values(directory, track)?;
    let rows = query_rows(
        database,
        "tracks",
        TRACK_COLUMNS,
        vec![genesis_block_native::RelationalFilter::equal(
            "id",
            Value::String(track.id.clone()),
        )],
        1,
    )?;
    if let (Some(existing), Some(target)) = (rows.first(), values.as_object_mut()) {
        let keeps_published_content = track.storage_kind == "managed"
            && existing.get("storage_kind").and_then(Value::as_str) == Some("managed")
            && existing.get("content_hash").and_then(Value::as_str)
                == track.content_hash.as_deref()
            && existing
                .get("publication_id")
                .and_then(Value::as_str)
                .is_some();
        if keeps_published_content {
            for column in [
                "media_path",
                "title",
                "artist",
                "album",
                "duration",
                "kind",
                "source_kind",
                "storage_kind",
                "source_path",
                "content_hash",
                "publication_id",
                "publication_plan_digest",
                "publication_state",
                "publication_row_digest",
            ] {
                if let Some(value) = existing.get(column) {
                    target.insert(column.into(), value.clone());
                }
            }
        }
    }
    Ok(values)
}

fn publication_is_retired(database: &Storage, publication_id: &str) -> Result<bool, String> {
    Ok(!query_rows(
        database,
        "track_retirements",
        &["id"],
        vec![genesis_block_native::RelationalFilter::equal(
            "id",
            Value::String(publication_id.into()),
        )],
        1,
    )?
    .is_empty())
}

pub(crate) fn publication_is_retired_at(
    directory: &Path,
    publication_id: &str,
) -> Result<bool, String> {
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    publication_is_retired(&database, publication_id)
}

fn track_is_retired(database: &Storage, track_id: &str) -> Result<bool, String> {
    Ok(!query_rows(
        database,
        "track_retirements",
        &["id"],
        vec![genesis_block_native::RelationalFilter::equal(
            "track_id",
            Value::String(track_id.into()),
        )],
        1,
    )?
    .is_empty())
}

fn active_managed_publication_for_track(
    database: &Storage,
    track_id: &str,
) -> Result<Option<Value>, String> {
    let rows = query_rows(
        database,
        "tracks",
        &["id", "storage_kind", "content_hash", "publication_id"],
        vec![genesis_block_native::RelationalFilter::equal(
            "id",
            Value::String(track_id.into()),
        )],
        1,
    )?;
    let Some(row) = rows.into_iter().next() else {
        return Ok(None);
    };
    if row.get("storage_kind").and_then(Value::as_str) != Some("managed") {
        return Ok(None);
    }
    let Some(publication_id) = row.get("publication_id").and_then(Value::as_str) else {
        return Ok(None);
    };
    if publication_is_retired(database, publication_id)? {
        return Ok(None);
    }
    Ok(Some(row))
}

fn retirement_mutations_for_row(row: &Value) -> Vec<RelationalRowMutation> {
    if row.get("storage_kind").and_then(Value::as_str) != Some("managed") {
        return Vec::new();
    }
    let Some(track_id) = row.get("id").and_then(Value::as_str) else {
        return Vec::new();
    };
    let content_hash = row.get("content_hash").and_then(Value::as_str);
    let publication_id = row
        .get("publication_id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(|| crate::local_media_store::publication_id_for_legacy_track(track_id));
    let mut retirement_ids = vec![publication_id];
    let track_retirement_id = crate::local_media_store::retirement_id_for_track(track_id);
    if !retirement_ids.contains(&track_retirement_id) {
        retirement_ids.push(track_retirement_id);
    }
    retirement_ids
        .into_iter()
        .map(|retirement_id| {
            mutation(
                "track_retirements",
                RelationalMutationKind::Upsert,
                json!({
                    "id": retirement_id,
                    "track_id": track_id,
                    "content_hash": content_hash,
                    "retired_at": now_millis(),
                }),
                None,
            )
        })
        .collect()
}

fn row_string(row: &Value, key: &str) -> Result<String, String> {
    row.get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("GenesisBlockDB row missing text field {key}"))
}

fn row_optional_string(row: &Value, key: &str) -> Option<String> {
    row.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn track_from_row(directory: &Path, row: &Value) -> Result<Track, String> {
    let storage_kind = row_string(row, "storage_kind")?;
    let media_path = row_string(row, "media_path")?;
    let path = if storage_kind == "managed" {
        checked_managed_path(directory, &media_path)?
            .to_string_lossy()
            .to_string()
    } else {
        media_path
    };
    let kind = if row.get("kind").and_then(Value::as_str) == Some("video") {
        crate::library::MediaKind::Video
    } else {
        crate::library::MediaKind::Audio
    };
    Ok(Track {
        kind,
        id: row_string(row, "id")?,
        missing: !Path::new(&path).is_file(),
        path,
        title: row_string(row, "title")?,
        artist: row_optional_string(row, "artist"),
        album: row_optional_string(row, "album"),
        duration: row.get("duration").and_then(Value::as_f64),
        source_kind: row_string(row, "source_kind")?,
        storage_kind,
        source_path: row_optional_string(row, "source_path"),
        content_hash: row_optional_string(row, "content_hash"),
        favorite: row
            .get("favorite")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        play_count: row.get("play_count").and_then(Value::as_u64).unwrap_or(0),
        last_played_at: row.get("last_played_at").and_then(Value::as_i64),
    })
}

fn raw_track_rows(database: &Storage) -> Result<Vec<Value>, String> {
    query_rows(database, "tracks", TRACK_COLUMNS, vec![], MAX_TRACKS as u32)
}

fn managed_row_is_visible(
    database: &Storage,
    directory: &Path,
    row: &Value,
) -> Result<bool, String> {
    if row.get("storage_kind").and_then(Value::as_str) != Some("managed") {
        return Ok(true);
    }
    let Some(publication_id) = row.get("publication_id").and_then(Value::as_str) else {
        return Ok(false);
    };
    if publication_is_retired(database, publication_id)? {
        return Ok(false);
    }
    let Some(prepared) = crate::local_media_store::load_publication(directory, publication_id)?
    else {
        return Ok(false);
    };
    let Some(receipt) = prepared.commit_receipt.as_ref() else {
        return Ok(false);
    };
    if !crate::local_media_store::receipt_checksum_is_valid(receipt)
        || crate::local_media_store::verify_prepared_object(directory, &prepared).is_err()
    {
        return Ok(false);
    }
    let publication_rows = query_rows(
        database,
        "tracks",
        TRACK_COLUMNS,
        vec![genesis_block_native::RelationalFilter::equal(
            "publication_id",
            Value::String(publication_id.into()),
        )],
        MAX_TRACKS as u32,
    )?;
    let hash_rows = query_rows(
        database,
        "tracks",
        TRACK_COLUMNS,
        vec![genesis_block_native::RelationalFilter::equal(
            "content_hash",
            Value::String(prepared.plan.whole_sha256.clone()),
        )],
        MAX_TRACKS as u32,
    )?;
    if !crate::local_media_store::index_entries_match(&prepared, &publication_rows, &hash_rows) {
        return Ok(false);
    }
    for expected in &prepared.plan.expected_rows {
        let Some(planned_row) = publication_rows.iter().find(|candidate| {
            candidate.get("id").and_then(Value::as_str) == Some(expected.row_id.as_str())
        }) else {
            return Ok(false);
        };
        let row_digest = match crate::local_media_store::visible_row_digest(directory, planned_row)
        {
            Ok(digest) => digest,
            Err(_) => return Ok(false),
        };
        if crate::local_media_store::validate_row(directory, &prepared, planned_row).is_err()
            || row_digest != expected.row_digest
        {
            return Ok(false);
        }
    }
    Ok(publication_rows.len() == prepared.plan.expected_rows.len())
}

fn read_catalog_from(database: &Storage, directory: &Path) -> Result<Library, String> {
    let rows = raw_track_rows(database)?;
    let mut tracks = rows
        .iter()
        .filter_map(
            |row| match managed_row_is_visible(database, directory, row) {
                Ok(true) => Some(Ok(row)),
                Ok(false) => None,
                Err(error) => Some(Err(error)),
            },
        )
        .map(|row| track_from_row(directory, row?))
        .collect::<Result<Vec<_>, _>>()?;
    tracks.sort_by(|left, right| {
        left.title
            .to_lowercase()
            .cmp(&right.title.to_lowercase())
            .then(left.id.cmp(&right.id))
    });
    Ok(Library { version: 1, tracks })
}

fn setting(database: &Storage, key: &str) -> Result<Option<String>, String> {
    let rows = query_rows(
        database,
        "settings",
        &["id", "value"],
        vec![genesis_block_native::RelationalFilter::equal(
            "id",
            Value::String(key.into()),
        )],
        1,
    )?;
    Ok(rows
        .first()
        .and_then(|row| row.get("value").and_then(Value::as_str))
        .map(str::to_owned))
}

fn set_setting(database: &Storage, key: &str, value: &str) -> Result<(), String> {
    apply(
        database,
        vec![mutation(
            "settings",
            RelationalMutationKind::Upsert,
            json!({ "id": key, "value": value }),
            None,
        )],
    )
}

pub fn initialize_catalog(directory: &Path) -> Result<Library, String> {
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    let imported = setting(&database, "legacy_catalog_imported")?.as_deref() == Some("true");
    if !imported {
        let legacy_path = directory.join(LEGACY_FILE);
        if legacy_path.exists() {
            if fs::metadata(&legacy_path)
                .map_err(|error| error.to_string())?
                .len()
                > 16 * 1024 * 1024
            {
                return Err("คลังเดิมมีขนาดเกินขอบเขตที่รองรับ; เก็บไฟล์เดิมไว้โดยไม่เขียนทับ".into());
            }
            let legacy: Library =
                serde_json::from_slice(&fs::read(&legacy_path).map_err(|error| error.to_string())?)
                    .map_err(|error| format!("อ่านคลังเดิมไม่ได้; ไม่เขียนทับข้อมูล: {error}"))?;
            if legacy.version != 1 || legacy.tracks.len() > MAX_TRACKS {
                return Err("รุ่นหรือจำนวนรายการในคลังเดิมไม่รองรับ; เก็บไฟล์เดิมไว้โดยไม่เขียนทับ".into());
            }
            if !legacy.tracks.is_empty() {
                replace_catalog_in_storage(&database, directory, &legacy)?;
            }
        }
        set_setting(&database, "legacy_catalog_imported", "true")?;
    }
    if setting(&database, "cache_enabled")?.is_none() {
        set_setting(&database, "cache_enabled", "true")?;
    }
    if setting(&database, "cache_quota_bytes")?.is_none() {
        set_setting(
            &database,
            "cache_quota_bytes",
            &DEFAULT_CACHE_QUOTA.to_string(),
        )?;
    }
    reconcile_publications_locked(&database, directory)?;
    migrate_unpublished_managed_rows(&database, directory)?;
    reconcile_publications_locked(&database, directory)?;
    read_catalog_from(&database, directory)
}

pub fn replace_catalog(directory: &Path, library: &Library) -> Result<(), String> {
    if library.tracks.len() > MAX_TRACKS {
        return Err("คลังรองรับไม่เกิน 10,000 ไฟล์ในรุ่นนี้".into());
    }
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    replace_catalog_in_storage(&database, directory, library)?;
    set_setting(&database, "legacy_catalog_imported", "true")
}

fn replace_catalog_in_storage(
    database: &Storage,
    directory: &Path,
    library: &Library,
) -> Result<(), String> {
    let existing = raw_track_rows(database)?;
    let mut replacement_tracks = Vec::new();
    let mut protected_active_ids = HashSet::new();
    for track in &library.tracks {
        if track_is_retired(database, &track.id)? {
            match active_managed_publication_for_track(database, &track.id)? {
                Some(active)
                    if track.storage_kind == "managed"
                        && track.content_hash.as_deref()
                            == active.get("content_hash").and_then(Value::as_str) =>
                {
                    replacement_tracks.push(track);
                }
                Some(_) => {
                    protected_active_ids.insert(track.id.as_str());
                }
                None => {}
            }
        } else {
            replacement_tracks.push(track);
        }
    }
    let desired_by_id = replacement_tracks
        .iter()
        .map(|track| (track.id.as_str(), *track))
        .collect::<HashMap<_, _>>();
    let desired = replacement_tracks
        .iter()
        .map(|track| track.id.as_str())
        .chain(protected_active_ids.iter().copied())
        .collect::<HashSet<_>>();
    let retirements = existing
        .iter()
        .filter(|row| row.get("storage_kind").and_then(Value::as_str) == Some("managed"))
        .filter(|row| {
            let Some(id) = row.get("id").and_then(Value::as_str) else {
                return false;
            };
            if protected_active_ids.contains(id) {
                return false;
            }
            desired_by_id.get(id).map_or(true, |track| {
                track.storage_kind != "managed"
                    || track.content_hash.as_deref()
                        != row.get("content_hash").and_then(Value::as_str)
            })
        })
        .flat_map(retirement_mutations_for_row)
        .collect::<Vec<_>>();
    if !retirements.is_empty() {
        apply(database, retirements)?;
    }
    let mut deletes = existing
        .iter()
        .filter_map(|row| row.get("id").and_then(Value::as_str))
        .filter(|id| !desired.contains(id) && !protected_active_ids.contains(id))
        .map(|id| {
            mutation(
                "tracks",
                RelationalMutationKind::Delete,
                Value::Null,
                Some(json!({ "id": id })),
            )
        })
        .collect::<Vec<_>>();
    let mut upserts = replacement_tracks
        .iter()
        .map(|track| {
            Ok(mutation(
                "tracks",
                RelationalMutationKind::Upsert,
                track_values_preserving_publication(database, directory, track)?,
                None,
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;
    upserts.append(&mut deletes);
    apply(database, upserts)
}

pub fn read_catalog(directory: &Path) -> Result<Library, String> {
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    read_catalog_from(&database, directory)
}

pub fn publish_prepared(
    directory: &Path,
    prepared: &crate::local_media_store::PreparedPublicationV1,
) -> Result<Track, String> {
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    publish_prepared_locked(&database, directory, prepared)
}

fn reconcile_publications_locked(database: &Storage, directory: &Path) -> Result<(), String> {
    for publication_id in crate::local_media_store::publication_ids(directory)? {
        if publication_is_retired(database, &publication_id)? {
            continue;
        }
        let Some(prepared) =
            crate::local_media_store::load_publication(directory, &publication_id)?
        else {
            continue;
        };
        publish_prepared_locked(database, directory, &prepared)?;
    }
    Ok(())
}

fn migrate_unpublished_managed_rows(database: &Storage, directory: &Path) -> Result<(), String> {
    for row in raw_track_rows(database)? {
        if row.get("storage_kind").and_then(Value::as_str) != Some("managed")
            || row.get("publication_id").and_then(Value::as_str).is_some()
        {
            continue;
        }
        let track_id = row_string(&row, "id")?;
        if track_is_retired(database, &track_id)? {
            continue;
        }
        let mut track = track_from_row(directory, &row)?;
        let source = PathBuf::from(&track.path);
        if !source.is_file() {
            continue;
        }
        let publication_id = crate::local_media_store::publication_id_for_legacy_track(&track.id);
        let staged =
            crate::local_media_store::stage_local_file(directory, &publication_id, &source)?;
        let object_receipt = crate::local_media_store::finalize_object(directory, &staged)?;
        track.path = directory
            .join(&object_receipt.relative_path)
            .to_string_lossy()
            .to_string();
        track.content_hash = Some(object_receipt.whole_sha256.clone());
        track.missing = false;
        let prepared =
            crate::local_media_store::prepare_publication(directory, object_receipt, track)?;
        publish_prepared_locked(database, directory, &prepared)?;
    }
    Ok(())
}

fn publish_prepared_locked(
    database: &Storage,
    directory: &Path,
    prepared: &crate::local_media_store::PreparedPublicationV1,
) -> Result<Track, String> {
    if publication_is_retired(database, &prepared.plan.publication_id)? {
        return Err("PUBLICATION_RETIRED".into());
    }
    crate::local_media_store::verify_prepared_object(directory, prepared)?;
    let journal_state =
        crate::local_media_store::load_publication(directory, &prepared.plan.publication_id)?
            .ok_or_else(|| "PUBLICATION_JOURNAL_MISSING".to_string())?;
    if journal_state.plan != prepared.plan
        || journal_state.object_receipt != prepared.object_receipt
        || journal_state.publication != prepared.publication
    {
        return Err(
            "RECONCILIATION_REQUIRED: publication plan differs from durable journal".into(),
        );
    }

    let publication_rows = query_rows(
        database,
        "tracks",
        TRACK_COLUMNS,
        vec![genesis_block_native::RelationalFilter::equal(
            "publication_id",
            Value::String(prepared.plan.publication_id.clone()),
        )],
        MAX_TRACKS as u32,
    )?;
    if publication_rows.len() > prepared.plan.expected_rows.len() {
        return Err("RECONCILIATION_REQUIRED: unexpected Genesis rows for publication".into());
    }
    for row in &publication_rows {
        if crate::local_media_store::validate_row(directory, prepared, row).is_err() {
            return Err("RECONCILIATION_REQUIRED: conflicting Genesis publication row".into());
        }
    }

    let expected = &prepared.plan.expected_rows[0];
    let current_by_id = query_rows(
        database,
        "tracks",
        TRACK_COLUMNS,
        vec![genesis_block_native::RelationalFilter::equal(
            "id",
            Value::String(expected.row_id.clone()),
        )],
        1,
    )?;
    if let Some(current) = current_by_id.first() {
        let current_publication = current.get("publication_id").and_then(Value::as_str);
        if current_publication == Some(prepared.plan.publication_id.as_str()) {
            crate::local_media_store::validate_row(directory, prepared, current)
                .map_err(|_| "RECONCILIATION_REQUIRED: conflicting Genesis publication row")?;
        } else if current_publication.is_some() {
            return Err(
                "RECONCILIATION_REQUIRED: catalog row belongs to another publication".into(),
            );
        } else {
            apply(
                database,
                vec![mutation(
                    "tracks",
                    RelationalMutationKind::Upsert,
                    track_values_with_publication(
                        directory,
                        &prepared.track,
                        &prepared.publication,
                    )?,
                    None,
                )],
            )?;
        }
    } else {
        apply(
            database,
            vec![mutation(
                "tracks",
                RelationalMutationKind::Upsert,
                track_values_with_publication(directory, &prepared.track, &prepared.publication)?,
                None,
            )],
        )?;
    }

    let rows_by_publication = query_rows(
        database,
        "tracks",
        TRACK_COLUMNS,
        vec![genesis_block_native::RelationalFilter::equal(
            "publication_id",
            Value::String(prepared.plan.publication_id.clone()),
        )],
        MAX_TRACKS as u32,
    )?;
    let rows_by_hash = query_rows(
        database,
        "tracks",
        TRACK_COLUMNS,
        vec![genesis_block_native::RelationalFilter::equal(
            "content_hash",
            Value::String(prepared.plan.whole_sha256.clone()),
        )],
        MAX_TRACKS as u32,
    )?;
    if rows_by_publication.len() != prepared.plan.expected_rows.len()
        || !crate::local_media_store::index_entries_match(
            prepared,
            &rows_by_publication,
            &rows_by_hash,
        )
    {
        return Err("RECONCILIATION_REQUIRED: Genesis publication readback is incomplete".into());
    }
    for planned in &prepared.plan.expected_rows {
        let row = rows_by_publication
            .iter()
            .find(|row| row.get("id").and_then(Value::as_str) == Some(planned.row_id.as_str()))
            .ok_or_else(|| "RECONCILIATION_REQUIRED: planned Genesis row is missing".to_string())?;
        crate::local_media_store::validate_row(directory, prepared, row)
            .map_err(|_| "RECONCILIATION_REQUIRED: Genesis row readback mismatch")?;
        let row_digest = crate::local_media_store::visible_row_digest(directory, row)
            .map_err(|_| "RECONCILIATION_REQUIRED: Genesis row digest unreadable")?;
        if row_digest != planned.row_digest {
            return Err("RECONCILIATION_REQUIRED: Genesis row digest mismatch".into());
        }
    }

    #[cfg(test)]
    trip_publication_failpoint(PublicationFailpoint::AfterGenesisReadbackBeforeReceipt)?;

    if journal_state.commit_receipt.is_none() {
        crate::local_media_store::commit_receipt(directory, prepared)?;
    } else if !crate::local_media_store::receipt_checksum_is_valid(
        journal_state
            .commit_receipt
            .as_ref()
            .expect("checked above"),
    ) {
        return Err("RECONCILIATION_REQUIRED: durable receipt checksum invalid".into());
    }

    let readback = query_rows(
        database,
        "tracks",
        TRACK_COLUMNS,
        vec![genesis_block_native::RelationalFilter::equal(
            "publication_id",
            Value::String(prepared.plan.publication_id.clone()),
        )],
        MAX_TRACKS as u32,
    )?;
    if readback.len() != prepared.plan.expected_rows.len()
        || !readback
            .iter()
            .all(|row| managed_row_is_visible(database, directory, row).unwrap_or(false))
    {
        return Err("RECONCILIATION_REQUIRED: committed catalog visibility readback failed".into());
    }
    crate::local_media_store::discard_stage_after_commit(directory, &prepared.plan.publication_id)?;
    track_from_row(directory, &readback[0])
}

fn checked_managed_path(directory: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
        || !path.starts_with("media")
    {
        return Err("ตำแหน่งไฟล์ในคลัง offline ไม่ถูกต้อง".into());
    }
    let media_root = directory.join("media");
    let absolute = directory.join(path);
    if !absolute.starts_with(media_root) {
        return Err("ตำแหน่งไฟล์ในคลัง offline อยู่นอกขอบเขต".into());
    }
    Ok(absolute)
}

pub fn add_track(directory: &Path, track: &Track) -> Result<(), String> {
    if track.storage_kind == "managed" {
        return Err("managed media requires a verified publication receipt".into());
    }
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    apply(
        &database,
        vec![mutation(
            "tracks",
            RelationalMutationKind::Upsert,
            track_values(directory, track)?,
            None,
        )],
    )
}

pub fn remove_track(directory: &Path, id: &str) -> Result<(), String> {
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    let rows = query_rows(
        &database,
        "tracks",
        TRACK_COLUMNS,
        vec![genesis_block_native::RelationalFilter::equal(
            "id",
            Value::String(id.into()),
        )],
        1,
    )?;
    let mut operations = rows
        .first()
        .map(retirement_mutations_for_row)
        .unwrap_or_default();
    operations.push(mutation(
        "tracks",
        RelationalMutationKind::Delete,
        Value::Null,
        Some(json!({ "id": id })),
    ));
    apply(&database, operations)
}

pub fn set_favorite(directory: &Path, id: &str, favorite: bool) -> Result<(), String> {
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    let mut track = read_catalog_from(&database, directory)?
        .tracks
        .into_iter()
        .find(|track| track.id == id)
        .ok_or("ไม่พบเพลงนี้ในคลัง")?;
    track.favorite = favorite;
    apply(
        &database,
        vec![mutation(
            "tracks",
            RelationalMutationKind::Upsert,
            track_values_preserving_publication(&database, directory, &track)?,
            None,
        )],
    )
}

pub fn record_listen(directory: &Path, id: &str) -> Result<i64, String> {
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    let mut track = read_catalog_from(&database, directory)?
        .tracks
        .into_iter()
        .find(|track| track.id == id)
        .ok_or("ไม่พบเพลงนี้ในคลัง")?;
    let played_at = now_millis();
    track.play_count = track.play_count.saturating_add(1);
    track.last_played_at = Some(played_at);
    apply(
        &database,
        vec![
            mutation(
                "tracks",
                RelationalMutationKind::Upsert,
                track_values_preserving_publication(&database, directory, &track)?,
                None,
            ),
            mutation(
                "play_history",
                RelationalMutationKind::Insert,
                json!({ "id": Uuid::new_v4().to_string(), "track_id": id, "played_at": played_at }),
                None,
            ),
        ],
    )?;
    Ok(played_at)
}

fn find_track(directory: &Path, column: &str, value: &str) -> Result<Option<Track>, String> {
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    let library = read_catalog_from(&database, directory)?;
    Ok(library.tracks.into_iter().find(|track| match column {
        "content_hash" => track.content_hash.as_deref() == Some(value),
        "source_path" => track.source_path.as_deref() == Some(value),
        "media_path" => track.path == value,
        _ => false,
    }))
}

pub fn find_track_by_hash(directory: &Path, hash: &str) -> Result<Option<Track>, String> {
    find_track(directory, "content_hash", hash)
}

pub fn find_track_by_source(directory: &Path, source_path: &str) -> Result<Option<Track>, String> {
    find_track(directory, "source_path", source_path)?.map_or_else(
        || find_track(directory, "media_path", source_path),
        |track| Ok(Some(track)),
    )
}

fn rows_as_youtube(rows: &[Value]) -> Result<Vec<YoutubeLink>, String> {
    rows.iter()
        .map(|row| {
            Ok(YoutubeLink {
                id: row_string(row, "id")?,
                url: row_string(row, "url")?,
                title: row_string(row, "title")?,
                added_at: row
                    .get("added_at")
                    .and_then(Value::as_i64)
                    .unwrap_or_default(),
            })
        })
        .collect()
}

pub fn youtube_links(directory: &Path) -> Result<Vec<YoutubeLink>, String> {
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    let rows = query_rows(
        &database,
        "youtube_links",
        &["id", "url", "title", "added_at"],
        vec![],
        MAX_TRACKS as u32,
    )?;
    let mut items = rows_as_youtube(&rows)?;
    items.sort_by(|left, right| right.added_at.cmp(&left.added_at));
    Ok(items)
}

pub fn add_youtube_link(directory: &Path, url: &str, title: &str) -> Result<YoutubeLink, String> {
    let url = url.trim();
    let title = title.trim();
    if url.len() > 2_048 || title.len() > 240 || title.is_empty() {
        return Err("ลิงก์หรือชื่อรายการยาวเกินขอบเขตที่รองรับ".into());
    }
    if !is_official_youtube_url(url) {
        return Err("รับเฉพาะ HTTPS URL จาก youtube.com หรือ youtu.be อย่างเป็นทางการ".into());
    }
    let link = YoutubeLink {
        id: format!("youtube:{}", crate::library::sha256_bytes(url.as_bytes())),
        url: url.into(),
        title: title.into(),
        added_at: now_millis(),
    };
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    apply(
        &database,
        vec![mutation(
            "youtube_links",
            RelationalMutationKind::Upsert,
            json!({ "id": link.id, "url": link.url, "title": link.title, "added_at": link.added_at }),
            None,
        )],
    )?;
    Ok(link)
}

fn is_official_youtube_url(url: &str) -> bool {
    if url.chars().any(char::is_whitespace) {
        return false;
    }
    let Some((scheme, rest)) = url.split_once("://") else {
        return false;
    };
    if !scheme.eq_ignore_ascii_case("https") {
        return false;
    }
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    let host = authority.to_ascii_lowercase();
    if !matches!(
        host.as_str(),
        "youtube.com"
            | "www.youtube.com"
            | "m.youtube.com"
            | "music.youtube.com"
            | "youtu.be"
            | "www.youtu.be"
    ) {
        return false;
    }
    let suffix = &rest[authority.len()..];
    !suffix.to_ascii_lowercase().starts_with("/redirect")
}

pub fn youtube_link_url(directory: &Path, id: &str) -> Result<String, String> {
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    let rows = query_rows(
        &database,
        "youtube_links",
        &["id", "url"],
        vec![genesis_block_native::RelationalFilter::equal(
            "id",
            Value::String(id.into()),
        )],
        1,
    )?;
    rows.first()
        .and_then(|row| row.get("url").and_then(Value::as_str))
        .map(str::to_owned)
        .ok_or_else(|| "ไม่พบ YouTube link นี้ในคลัง".into())
}

pub fn remove_youtube_link(directory: &Path, id: &str) -> Result<(), String> {
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    apply(
        &database,
        vec![mutation(
            "youtube_links",
            RelationalMutationKind::Delete,
            Value::Null,
            Some(json!({ "id": id })),
        )],
    )
}

pub fn cache_settings(directory: &Path) -> Result<CacheSettings, String> {
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    let enabled = setting(&database, "cache_enabled")?.as_deref() == Some("true");
    let quota_bytes = setting(&database, "cache_quota_bytes")?
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(DEFAULT_CACHE_QUOTA)
        .min(MAX_CACHE_QUOTA);
    let cache_rows = query_rows(&database, "cache_entries", &["size_bytes"], vec![], 10_000)?;
    let used_bytes = cache_rows
        .iter()
        .filter_map(|row| row.get("size_bytes").and_then(Value::as_u64))
        .sum();
    let authorized_sources = read_catalog_from(&database, directory)?
        .tracks
        .iter()
        .filter(|track| track.source_kind == "authorized")
        .count() as u32;
    Ok(CacheSettings {
        enabled,
        quota_bytes,
        used_bytes,
        authorized_sources,
    })
}

pub fn update_cache_settings(
    directory: &Path,
    enabled: bool,
    quota_bytes: u64,
) -> Result<CacheSettings, String> {
    if !(64 * 1024 * 1024..=MAX_CACHE_QUOTA).contains(&quota_bytes) {
        return Err("Cache quota ต้องอยู่ระหว่าง 64 MiB ถึง 100 GiB".into());
    }
    let database = open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    set_setting(
        &database,
        "cache_enabled",
        if enabled { "true" } else { "false" },
    )?;
    set_setting(&database, "cache_quota_bytes", &quota_bytes.to_string())?;
    evict_to_quota(&database, directory, quota_bytes)?;
    drop(database);
    cache_settings(directory)
}

fn evict_to_quota(database: &Storage, directory: &Path, quota_bytes: u64) -> Result<(), String> {
    let rows = query_rows(
        database,
        "cache_entries",
        &[
            "id",
            "relative_path",
            "size_bytes",
            "pinned",
            "source_kind",
            "last_accessed_at",
        ],
        vec![],
        10_000,
    )?;
    let mut entries = rows
        .into_iter()
        .filter(|row| {
            row.get("pinned").and_then(Value::as_bool) != Some(true)
                && row.get("source_kind").and_then(Value::as_str) == Some("authorized")
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|row| {
        row.get("last_accessed_at")
            .and_then(Value::as_i64)
            .unwrap_or_default()
    });
    let mut used = entries
        .iter()
        .filter_map(|row| row.get("size_bytes").and_then(Value::as_u64))
        .sum::<u64>();
    for row in entries {
        if used <= quota_bytes {
            break;
        }
        let id = row_string(&row, "id")?;
        let relative = row_string(&row, "relative_path")?;
        let path = checked_cache_path(directory, &relative)?;
        let size = row
            .get("size_bytes")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        if path.is_file() {
            fs::remove_file(&path).map_err(|error| error.to_string())?;
        }
        apply(
            database,
            vec![mutation(
                "cache_entries",
                RelationalMutationKind::Delete,
                Value::Null,
                Some(json!({ "id": id })),
            )],
        )?;
        used = used.saturating_sub(size);
    }
    Ok(())
}

fn checked_cache_path(directory: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
        || !path.starts_with("cache")
    {
        return Err("ตำแหน่ง cache ไม่ถูกต้อง".into());
    }
    Ok(directory.join(path))
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn prepared_fixture(directory: &Path) -> crate::local_media_store::PreparedPublicationV1 {
        let source = directory.join("fixture.mp3");
        fs::write(&source, b"a complete immutable audio object").unwrap();
        let publication_id = format!("test-{}", Uuid::new_v4().simple());
        let staged =
            crate::local_media_store::stage_local_file(directory, &publication_id, &source)
                .unwrap();
        let object = crate::local_media_store::finalize_object(directory, &staged).unwrap();
        let track = Track {
            kind: crate::library::MediaKind::Audio,
            id: format!("offline:{}", object.whole_sha256),
            path: String::new(),
            title: "fixture".into(),
            artist: Some("tester".into()),
            album: None,
            duration: Some(2.0),
            missing: false,
            source_kind: "user".into(),
            storage_kind: "managed".into(),
            source_path: Some(source.to_string_lossy().to_string()),
            content_hash: Some(object.whole_sha256.clone()),
            favorite: false,
            play_count: 0,
            last_played_at: None,
        };
        crate::local_media_store::prepare_publication(directory, object, track).unwrap()
    }

    fn prepared_import_fixture(
        directory: &Path,
        source: &Path,
        publication_id: &str,
    ) -> crate::local_media_store::PreparedPublicationV1 {
        let staged =
            crate::local_media_store::stage_local_file(directory, publication_id, source).unwrap();
        let object = crate::local_media_store::finalize_object(directory, &staged).unwrap();
        let track = Track {
            kind: crate::library::MediaKind::Audio,
            id: format!("offline:{}", object.whole_sha256),
            path: directory
                .join(&object.relative_path)
                .to_string_lossy()
                .to_string(),
            title: "same-file import".into(),
            artist: Some("tester".into()),
            album: None,
            duration: Some(2.0),
            missing: false,
            source_kind: "user".into(),
            storage_kind: "managed".into(),
            source_path: Some(source.to_string_lossy().to_string()),
            content_hash: Some(object.whole_sha256.clone()),
            favorite: false,
            play_count: 0,
            last_played_at: None,
        };
        crate::local_media_store::prepare_publication(directory, object, track).unwrap()
    }

    #[test]
    fn new_database_registers_v1_then_upgrades_to_v3() {
        let directory = tempdir().unwrap();
        let root = directory.path().join("genesis-play");
        fs::create_dir_all(&root).unwrap();
        let storage = Storage::open(OpenOptions {
            path: root.to_string_lossy().to_string(),
            page_cache_mb: Some(32),
            read_only: Some(false),
            vector_dim: Some(256),
            retention: Some("frontier_only".into()),
        })
        .unwrap();
        storage
            .register_relational_schema(schema_package_v1())
            .unwrap();
        drop(storage);

        let database = open_database(directory.path()).unwrap();
        let database = database.lock().unwrap();
        assert_eq!(
            database
                .get_relational_schema(NAMESPACE)
                .unwrap()
                .unwrap()
                .schema_version,
            3
        );
    }

    #[test]
    fn existing_v2_database_upgrades_to_a_writable_retirement_schema() {
        let directory = tempdir().unwrap();
        let root = directory.path().join("genesis-play");
        fs::create_dir_all(&root).unwrap();
        let storage = Storage::open(OpenOptions {
            path: root.to_string_lossy().to_string(),
            page_cache_mb: Some(32),
            read_only: Some(false),
            vector_dim: Some(256),
            retention: Some("frontier_only".into()),
        })
        .unwrap();
        storage
            .register_relational_schema(schema_package_v1())
            .unwrap();
        storage
            .register_relational_schema(schema_package_v2())
            .unwrap();
        drop(storage);

        let database = open_database(directory.path()).unwrap();
        let database = database.lock().unwrap();
        assert_eq!(
            database
                .get_relational_schema(NAMESPACE)
                .unwrap()
                .unwrap()
                .schema_version,
            3
        );
        apply(
            &database,
            vec![mutation(
                "track_retirements",
                RelationalMutationKind::Upsert,
                json!({
                    "id": "retired-publication",
                    "track_id": "track:1",
                    "content_hash": Value::Null,
                    "retired_at": now_millis(),
                }),
                None,
            )],
        )
        .unwrap();
        assert!(publication_is_retired(&database, "retired-publication").unwrap());
    }

    #[test]
    fn removed_publication_stays_absent_after_restart_without_deleting_object_bytes() {
        let directory = tempdir().unwrap();
        let prepared = prepared_fixture(directory.path());
        let object_path = directory
            .path()
            .join(&prepared.object_receipt.relative_path);
        let track = publish_prepared(directory.path(), &prepared).unwrap();
        assert_eq!(track.id, prepared.track.id);
        assert!(object_path.is_file());

        remove_track(directory.path(), &track.id).unwrap();
        assert!(read_catalog(directory.path()).unwrap().tracks.is_empty());
        assert!(
            object_path.is_file(),
            "retiring a track preserves its object"
        );
        assert!(publication_is_retired(
            &open_database(directory.path()).unwrap().lock().unwrap(),
            &prepared.plan.publication_id,
        )
        .unwrap());
        assert_eq!(
            publish_prepared(directory.path(), &prepared).unwrap_err(),
            "PUBLICATION_RETIRED"
        );

        forget_database(directory.path());
        let recovered = initialize_catalog(directory.path()).unwrap();
        assert!(recovered.tracks.is_empty());
        assert!(object_path.is_file());
        let journal = crate::local_media_store::load_publication(
            directory.path(),
            &prepared.plan.publication_id,
        )
        .unwrap()
        .unwrap();
        assert!(journal.commit_receipt.is_some());
    }

    #[test]
    fn same_file_reimport_uses_a_new_generation_and_becomes_visible() {
        let directory = tempdir().unwrap();
        let source = directory.path().join("repeat.mp3");
        fs::write(&source, b"same media bytes after removal").unwrap();
        let source_path = source.to_string_lossy().to_string();
        let old_id =
            crate::local_media_store::publication_id_for_import(&source_path, &source).unwrap();
        let old = prepared_import_fixture(directory.path(), &source, &old_id);
        let removed = publish_prepared(directory.path(), &old).unwrap();
        remove_track(directory.path(), &removed.id).unwrap();
        assert!(read_catalog(directory.path()).unwrap().tracks.is_empty());

        let new_id =
            crate::local_media_store::publication_id_for_import(&source_path, &source).unwrap();
        assert_ne!(old_id, new_id);
        let fresh = prepared_import_fixture(directory.path(), &source, &new_id);
        let reimported = publish_prepared(directory.path(), &fresh).unwrap();

        assert_eq!(reimported.id, removed.id);
        replace_catalog(
            directory.path(),
            &Library {
                version: 1,
                tracks: vec![reimported.clone()],
            },
        )
        .unwrap();
        let visible = read_catalog(directory.path()).unwrap();
        assert_eq!(visible.tracks.len(), 1);
        assert_eq!(visible.tracks[0].id, reimported.id);
        assert!(publication_is_retired(
            &open_database(directory.path()).unwrap().lock().unwrap(),
            &old_id,
        )
        .unwrap());
        assert!(!publication_is_retired(
            &open_database(directory.path()).unwrap().lock().unwrap(),
            &new_id,
        )
        .unwrap());
    }

    #[test]
    fn replace_catalog_retirement_survives_restart_and_reconciliation() {
        let directory = tempdir().unwrap();
        let prepared = prepared_fixture(directory.path());
        let object_path = directory
            .path()
            .join(&prepared.object_receipt.relative_path);
        publish_prepared(directory.path(), &prepared).unwrap();

        replace_catalog(
            directory.path(),
            &Library {
                version: 1,
                tracks: Vec::new(),
            },
        )
        .unwrap();
        assert!(read_catalog(directory.path()).unwrap().tracks.is_empty());
        assert!(object_path.is_file());

        forget_database(directory.path());
        assert!(initialize_catalog(directory.path())
            .unwrap()
            .tracks
            .is_empty());
        assert!(object_path.is_file());
        assert!(publication_is_retired(
            &open_database(directory.path()).unwrap().lock().unwrap(),
            &prepared.plan.publication_id,
        )
        .unwrap());
    }

    #[test]
    fn stale_catalog_replacement_cannot_restore_retired_track_id() {
        let directory = tempdir().unwrap();
        let prepared = prepared_fixture(directory.path());
        let object_path = directory
            .path()
            .join(&prepared.object_receipt.relative_path);
        let published = publish_prepared(directory.path(), &prepared).unwrap();
        remove_track(directory.path(), &published.id).unwrap();
        assert!(read_catalog(directory.path()).unwrap().tracks.is_empty());

        replace_catalog(
            directory.path(),
            &Library {
                version: 1,
                tracks: vec![published.clone()],
            },
        )
        .unwrap();
        assert!(read_catalog(directory.path()).unwrap().tracks.is_empty());
        assert!(
            raw_track_rows(&open_database(directory.path()).unwrap().lock().unwrap())
                .unwrap()
                .is_empty()
        );
        assert!(object_path.is_file());

        forget_database(directory.path());
        assert!(initialize_catalog(directory.path())
            .unwrap()
            .tracks
            .is_empty());
        assert!(object_path.is_file());
    }

    #[test]
    fn legacy_catalog_migration_does_not_resurrect_retired_publication() {
        let directory = tempdir().unwrap();
        let prepared = prepared_fixture(directory.path());
        let object_path = directory
            .path()
            .join(&prepared.object_receipt.relative_path);
        let published = publish_prepared(directory.path(), &prepared).unwrap();
        remove_track(directory.path(), &published.id).unwrap();
        fs::write(
            directory.path().join(LEGACY_FILE),
            serde_json::to_vec(&Library {
                version: 1,
                tracks: vec![published.clone()],
            })
            .unwrap(),
        )
        .unwrap();

        let migrated = initialize_catalog(directory.path()).unwrap();
        assert!(migrated.tracks.is_empty());
        assert!(object_path.is_file());
        assert!(publication_is_retired(
            &open_database(directory.path()).unwrap().lock().unwrap(),
            &prepared.plan.publication_id,
        )
        .unwrap());

        forget_database(directory.path());
        let restarted = initialize_catalog(directory.path()).unwrap();
        assert!(restarted.tracks.is_empty());
        assert!(object_path.is_file());
    }

    #[test]
    fn partial_genesis_row_is_hidden_then_recovered_after_database_restart() {
        let directory = tempdir().unwrap();
        let prepared = prepared_fixture(directory.path());
        let database = open_database(directory.path()).unwrap();
        {
            let database = database.lock().unwrap();
            apply(
                &database,
                vec![mutation(
                    "tracks",
                    RelationalMutationKind::Upsert,
                    track_values_with_publication(
                        directory.path(),
                        &prepared.track,
                        &prepared.publication,
                    )
                    .unwrap(),
                    None,
                )],
            )
            .unwrap();
            assert!(read_catalog_from(&database, directory.path())
                .unwrap()
                .tracks
                .is_empty());
        }
        drop(database);
        forget_database(directory.path());

        let recovered = initialize_catalog(directory.path()).unwrap();
        assert_eq!(recovered.tracks.len(), 1);
        assert_eq!(recovered.tracks[0].id, prepared.track.id);
        let journal = crate::local_media_store::load_publication(
            directory.path(),
            &prepared.plan.publication_id,
        )
        .unwrap()
        .unwrap();
        assert!(journal.commit_receipt.is_some());
        crate::local_media_store::verify_prepared_object(directory.path(), &journal).unwrap();
    }

    #[test]
    fn failure_after_genesis_readback_before_receipt_stays_hidden_then_startup_reconciles() {
        let directory = tempdir().unwrap();
        let prepared = prepared_fixture(directory.path());
        inject_publication_failpoint(PublicationFailpoint::AfterGenesisReadbackBeforeReceipt);

        let error = publish_prepared(directory.path(), &prepared).unwrap_err();
        assert_eq!(error, "INJECTED_AFTER_GENESIS_READBACK_BEFORE_RECEIPT");
        assert!(read_catalog(directory.path()).unwrap().tracks.is_empty());
        let journal = crate::local_media_store::load_publication(
            directory.path(),
            &prepared.plan.publication_id,
        )
        .unwrap()
        .unwrap();
        assert!(journal.commit_receipt.is_none());

        let recovered = initialize_catalog(directory.path()).unwrap();
        assert_eq!(recovered.tracks.len(), 1);
        assert_eq!(recovered.tracks[0].id, prepared.track.id);
        let committed = crate::local_media_store::load_publication(
            directory.path(),
            &prepared.plan.publication_id,
        )
        .unwrap()
        .unwrap();
        let receipt = committed.commit_receipt.unwrap();
        assert_eq!(
            publish_prepared(directory.path(), &prepared).unwrap().id,
            prepared.track.id
        );
        assert_eq!(
            crate::local_media_store::load_publication(
                directory.path(),
                &prepared.plan.publication_id
            )
            .unwrap()
            .unwrap()
            .commit_receipt,
            Some(receipt)
        );
    }

    #[test]
    fn receipt_append_failure_stays_hidden_then_same_id_retry_reconciles() {
        let directory = tempdir().unwrap();
        let prepared = prepared_fixture(directory.path());
        crate::local_media_store::inject_receipt_append_failpoint(
            crate::local_media_store::ReceiptAppendFailpoint::BeforeDurableWrite,
        );

        let error = publish_prepared(directory.path(), &prepared).unwrap_err();
        assert!(error.contains("INJECTED_RECEIPT_APPEND_FAILURE: before durable write"));
        assert!(read_catalog(directory.path()).unwrap().tracks.is_empty());
        assert!(crate::local_media_store::load_publication(
            directory.path(),
            &prepared.plan.publication_id
        )
        .unwrap()
        .unwrap()
        .commit_receipt
        .is_none());

        assert_eq!(
            publish_prepared(directory.path(), &prepared).unwrap().id,
            prepared.track.id
        );
        let visible = read_catalog(directory.path()).unwrap();
        assert_eq!(visible.tracks.len(), 1);
        assert_eq!(visible.tracks[0].id, prepared.track.id);
        assert!(crate::local_media_store::load_publication(
            directory.path(),
            &prepared.plan.publication_id
        )
        .unwrap()
        .unwrap()
        .commit_receipt
        .is_some());
    }

    #[test]
    fn durable_receipt_with_ambiguous_append_readback_is_visible_and_retry_is_idempotent() {
        let directory = tempdir().unwrap();
        let prepared = prepared_fixture(directory.path());
        crate::local_media_store::inject_receipt_append_failpoint(
            crate::local_media_store::ReceiptAppendFailpoint::AfterDurableWriteBeforeReadback,
        );

        let error = publish_prepared(directory.path(), &prepared).unwrap_err();
        assert!(
            error.contains("INJECTED_RECEIPT_APPEND_FAILURE: after durable write before readback")
        );
        let committed = crate::local_media_store::load_publication(
            directory.path(),
            &prepared.plan.publication_id,
        )
        .unwrap()
        .unwrap();
        let receipt = committed
            .commit_receipt
            .expect("durable receipt survives caller ambiguity");
        let visible = read_catalog(directory.path()).unwrap();
        assert_eq!(visible.tracks.len(), 1);
        assert_eq!(visible.tracks[0].id, prepared.track.id);

        assert_eq!(
            publish_prepared(directory.path(), &prepared).unwrap().id,
            prepared.track.id
        );
        let recovered = initialize_catalog(directory.path()).unwrap();
        assert_eq!(recovered.tracks.len(), 1);
        assert_eq!(recovered.tracks[0].id, prepared.track.id);
        assert_eq!(
            crate::local_media_store::load_publication(
                directory.path(),
                &prepared.plan.publication_id
            )
            .unwrap()
            .unwrap()
            .commit_receipt,
            Some(receipt)
        );
    }

    #[test]
    fn conflicting_partial_genesis_row_stays_hidden_and_requires_reconciliation() {
        let directory = tempdir().unwrap();
        let prepared = prepared_fixture(directory.path());
        let database = open_database(directory.path()).unwrap();
        let database = database.lock().unwrap();
        let mut values =
            track_values_with_publication(directory.path(), &prepared.track, &prepared.publication)
                .unwrap();
        values["title"] = Value::String("conflicting title".into());
        apply(
            &database,
            vec![mutation(
                "tracks",
                RelationalMutationKind::Upsert,
                values,
                None,
            )],
        )
        .unwrap();

        assert!(read_catalog_from(&database, directory.path())
            .unwrap()
            .tracks
            .is_empty());
        let error = reconcile_publications_locked(&database, directory.path()).unwrap_err();
        assert!(error.contains("RECONCILIATION_REQUIRED"));
        assert!(crate::local_media_store::load_publication(
            directory.path(),
            &prepared.plan.publication_id
        )
        .unwrap()
        .unwrap()
        .commit_receipt
        .is_none());
    }

    #[test]
    fn committed_rows_keep_visibility_after_favorite_and_listen_updates() {
        let directory = tempdir().unwrap();
        let prepared = prepared_fixture(directory.path());
        let track = publish_prepared(directory.path(), &prepared).unwrap();
        assert_eq!(track.id, prepared.track.id);
        set_favorite(directory.path(), &track.id, true).unwrap();
        record_listen(directory.path(), &track.id).unwrap();
        let library = read_catalog(directory.path()).unwrap();
        assert_eq!(library.tracks.len(), 1);
        assert!(library.tracks[0].favorite);
        assert_eq!(library.tracks[0].play_count, 1);
    }
}
