// @req PLAY-19 — Local media bytes publish as verified immutable content-addressed objects.
// @req PLAY-19 — A publication receipt is the visibility commit marker for complete Genesis catalog sets.
// @tested apps/play-desktop/src-tauri/src/library_store.rs — publication visibility and recovery tests

use crate::library::Track;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use uuid::Uuid;

#[cfg(test)]
use std::cell::Cell;

pub(crate) const CHUNK_SIZE_BYTES: usize = 4 * 1024 * 1024;
pub(crate) const MAX_OBJECT_BYTES: u64 = 1024 * 1024 * 1024;
pub(crate) const MAX_STAGING_BYTES: u64 = 2 * 1024 * 1024 * 1024;
pub(crate) const MAX_STAGING_SESSIONS: usize = 2;
pub(crate) const PUBLICATION_PREPARING: &str = "PREPARING";

static STAGING_LOCK: Mutex<()> = Mutex::new(());
static JOURNAL_LOCK: Mutex<()> = Mutex::new(());
static LIBRARY_DIRECTORIES: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();

#[cfg(test)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ReceiptAppendFailpoint {
    BeforeDurableWrite,
    AfterDurableWriteBeforeReadback,
}

#[cfg(test)]
thread_local! {
    static NEXT_RECEIPT_APPEND_FAILPOINT: Cell<Option<ReceiptAppendFailpoint>> = const { Cell::new(None) };
}

#[cfg(test)]
pub(crate) fn inject_receipt_append_failpoint(failpoint: ReceiptAppendFailpoint) {
    NEXT_RECEIPT_APPEND_FAILPOINT.with(|slot| slot.set(Some(failpoint)));
}

#[cfg(test)]
fn trip_receipt_append_failpoint(failpoint: ReceiptAppendFailpoint) -> Result<(), String> {
    NEXT_RECEIPT_APPEND_FAILPOINT.with(|slot| {
        if slot.get() == Some(failpoint) {
            slot.set(None);
            let reason = match failpoint {
                ReceiptAppendFailpoint::BeforeDurableWrite => "before durable write",
                ReceiptAppendFailpoint::AfterDurableWriteBeforeReadback => {
                    "after durable write before readback"
                }
            };
            Err(format!("INJECTED_RECEIPT_APPEND_FAILURE: {reason}"))
        } else {
            Ok(())
        }
    })
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StageManifestV1 {
    pub version: u32,
    pub publication_id: String,
    pub object_key: String,
    pub total_bytes: u64,
    pub chunk_size_bytes: u64,
    pub extension: String,
    pub chunk_sha256: Vec<String>,
    pub whole_sha256: String,
    pub checksum: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FinalizedObjectReceiptV1 {
    pub version: u32,
    pub publication_id: String,
    pub object_key: String,
    pub relative_path: String,
    pub whole_sha256: String,
    pub byte_length: u64,
    pub manifest_digest: String,
    pub receipt_digest: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublicationIndexEntryV1 {
    pub index_name: String,
    pub key: String,
    pub row_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlannedCatalogRowV1 {
    pub row_id: String,
    pub row_digest: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CatalogPlanV1 {
    pub version: u32,
    pub publication_id: String,
    pub manifest_digest: String,
    pub object_receipt_digest: String,
    pub object_key: String,
    pub whole_sha256: String,
    pub byte_length: u64,
    pub expected_row_count: u32,
    pub expected_index_count: u32,
    pub expected_rows: Vec<PlannedCatalogRowV1>,
    pub expected_indexes: Vec<PublicationIndexEntryV1>,
    pub row_set_digest: String,
    pub index_set_digest: String,
    pub plan_digest: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublicationCommitReceiptV1 {
    pub version: u32,
    pub publication_id: String,
    pub plan_digest: String,
    pub object_receipt_digest: String,
    pub expected_row_set_digest: String,
    pub expected_index_set_digest: String,
    pub object_key: String,
    pub whole_sha256: String,
    pub byte_length: u64,
    pub state: String,
    pub checksum: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreparedPublicationV1 {
    pub plan: CatalogPlanV1,
    pub object_receipt: FinalizedObjectReceiptV1,
    pub track: Track,
    pub publication: PublicationFieldsV1,
    pub commit_receipt: Option<PublicationCommitReceiptV1>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublicationFieldsV1 {
    pub publication_id: String,
    pub plan_digest: String,
    pub state: String,
    pub row_digest: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct StageManifestPayloadV1 {
    version: u32,
    publication_id: String,
    object_key: String,
    total_bytes: u64,
    chunk_size_bytes: u64,
    extension: String,
    chunk_sha256: Vec<String>,
    whole_sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ObjectReceiptPayloadV1 {
    version: u32,
    publication_id: String,
    object_key: String,
    relative_path: String,
    whole_sha256: String,
    byte_length: u64,
    manifest_digest: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct CatalogPlanPayloadV1 {
    version: u32,
    publication_id: String,
    manifest_digest: String,
    object_receipt_digest: String,
    object_key: String,
    whole_sha256: String,
    byte_length: u64,
    expected_row_count: u32,
    expected_index_count: u32,
    expected_rows: Vec<PlannedCatalogRowV1>,
    expected_indexes: Vec<PublicationIndexEntryV1>,
    row_set_digest: String,
    index_set_digest: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct CommitReceiptPayloadV1 {
    version: u32,
    publication_id: String,
    plan_digest: String,
    object_receipt_digest: String,
    expected_row_set_digest: String,
    expected_index_set_digest: String,
    object_key: String,
    whole_sha256: String,
    byte_length: u64,
    state: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum PublicationEventV1 {
    Prepared {
        plan: CatalogPlanV1,
        object_receipt: FinalizedObjectReceiptV1,
        track: Track,
        publication: PublicationFieldsV1,
    },
    CommitReceipt {
        receipt: PublicationCommitReceiptV1,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct JournalLineV1 {
    version: u32,
    sequence: u64,
    publication_id: String,
    event: PublicationEventV1,
    checksum: String,
}

#[derive(Debug)]
struct JournalRead {
    events: Vec<PublicationEventV1>,
    valid_bytes: u64,
    torn_tail: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct StagedMediaV1 {
    pub manifest: StageManifestV1,
    pub manifest_digest: String,
}

pub(crate) fn remember_library_directory(directory: &Path) -> Result<(), String> {
    let path = if directory.exists() {
        fs::canonicalize(directory).map_err(|error| error.to_string())?
    } else {
        directory.to_path_buf()
    };
    LIBRARY_DIRECTORIES
        .get_or_init(|| Mutex::new(HashSet::new()))
        .lock()
        .map_err(|error| error.to_string())?
        .insert(path);
    Ok(())
}

fn known_library_directories() -> Result<Vec<PathBuf>, String> {
    let mut directories = LIBRARY_DIRECTORIES
        .get_or_init(|| Mutex::new(HashSet::new()))
        .lock()
        .map_err(|error| error.to_string())?
        .iter()
        .cloned()
        .collect::<Vec<_>>();
    directories.sort();
    Ok(directories)
}

pub(crate) fn stage_local_file(
    directory: &Path,
    publication_id: &str,
    source: &Path,
) -> Result<StagedMediaV1, String> {
    remember_library_directory(directory)?;
    let _guard = STAGING_LOCK.lock().map_err(|error| error.to_string())?;
    validate_publication_id(publication_id)?;
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|value| valid_extension(value))
        .ok_or_else(|| "นามสกุลไฟล์สื่อไม่รองรับ".to_string())?;
    let metadata = fs::metadata(source).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_OBJECT_BYTES {
        return Err("ไฟล์ต้องมีขนาดมากกว่า 0 ไบต์และไม่เกิน 1 GiB".into());
    }

    let (chunk_hashes, whole_hash, measured_bytes) = hash_source_chunks(source)?;
    if measured_bytes != metadata.len() || measured_bytes == 0 || measured_bytes > MAX_OBJECT_BYTES
    {
        return Err("ไฟล์เปลี่ยนระหว่างเตรียม import หรือเกินขนาดที่รองรับ".into());
    }
    let object_key = whole_hash.clone();
    let payload = StageManifestPayloadV1 {
        version: 1,
        publication_id: publication_id.into(),
        object_key,
        total_bytes: measured_bytes,
        chunk_size_bytes: CHUNK_SIZE_BYTES as u64,
        extension,
        chunk_sha256: chunk_hashes,
        whole_sha256: whole_hash,
    };
    let checksum = digest_serializable(&payload)?;
    let manifest = StageManifestV1 {
        version: payload.version,
        publication_id: payload.publication_id.clone(),
        object_key: payload.object_key.clone(),
        total_bytes: payload.total_bytes,
        chunk_size_bytes: payload.chunk_size_bytes,
        extension: payload.extension.clone(),
        chunk_sha256: payload.chunk_sha256.clone(),
        whole_sha256: payload.whole_sha256.clone(),
        checksum,
    };
    validate_manifest(&manifest)?;
    reserve_staging(directory, &manifest)?;
    let stage_dir = stage_directory(directory, publication_id);
    fs::create_dir_all(&stage_dir).map_err(|error| error.to_string())?;
    write_manifest(&stage_dir, &manifest)?;

    let mut input = File::open(source).map_err(|error| error.to_string())?;
    let mut whole = Sha256::new();
    let mut buffer = vec![0u8; CHUNK_SIZE_BYTES];
    let mut index = 0usize;
    let mut staged_bytes = 0u64;
    loop {
        let mut filled = 0usize;
        while filled < buffer.len() {
            let read = input
                .read(&mut buffer[filled..])
                .map_err(|error| error.to_string())?;
            if read == 0 {
                break;
            }
            filled += read;
        }
        if filled == 0 {
            break;
        }
        let chunk = &buffer[..filled];
        staged_bytes = staged_bytes
            .checked_add(filled as u64)
            .ok_or_else(|| "ขนาดไฟล์เกินขอบเขต".to_string())?;
        whole.update(chunk);
        let expected = manifest
            .chunk_sha256
            .get(index)
            .ok_or_else(|| "ไฟล์เปลี่ยนระหว่างเตรียม import".to_string())?;
        put_chunk_under_staging_lock(directory, publication_id, index, chunk, expected)?;
        index += 1;
    }
    if index != manifest.chunk_sha256.len()
        || staged_bytes != manifest.total_bytes
        || hex(&whole.finalize()) != manifest.whole_sha256
    {
        return Err("ไฟล์เปลี่ยนระหว่างเตรียม import; ไม่มีเพลงถูกเผยแพร่".into());
    }
    Ok(StagedMediaV1 {
        manifest_digest: digest_serializable(&payload)?,
        manifest,
    })
}

pub(crate) fn put_chunk(
    directory: &Path,
    publication_id: &str,
    index: usize,
    bytes: &[u8],
    declared_sha256: &str,
) -> Result<(), String> {
    let _guard = STAGING_LOCK.lock().map_err(|error| error.to_string())?;
    put_chunk_under_staging_lock(directory, publication_id, index, bytes, declared_sha256)
}

fn put_chunk_under_staging_lock(
    directory: &Path,
    publication_id: &str,
    index: usize,
    bytes: &[u8],
    declared_sha256: &str,
) -> Result<(), String> {
    validate_publication_id(publication_id)?;
    let manifest = load_stage_manifest(directory, publication_id)?;
    let expected = expected_chunk_bytes(&manifest, index)?;
    if bytes.len() != expected {
        return Err("ความยาว chunk ไม่ตรงกับ manifest".into());
    }
    let actual_hash = sha256(bytes);
    let planned_hash = manifest
        .chunk_sha256
        .get(index)
        .ok_or_else(|| "หมายเลข chunk อยู่นอกขอบเขต".to_string())?;
    if declared_sha256 != planned_hash || actual_hash != *planned_hash {
        return Err("CHUNK_HASH_MISMATCH".into());
    }

    let stage_dir = stage_directory(directory, publication_id);
    let path = stage_dir.join(chunk_name(index));
    if path.exists() {
        let existing = fs::read(&path).map_err(|error| error.to_string())?;
        if existing == bytes && sha256(&existing) == *planned_hash {
            return Ok(());
        }
        if existing.len() == expected && sha256(&existing) == *planned_hash {
            return Err("CHUNK_CONFLICT".into());
        }
        let quarantine =
            stage_dir.join(format!("{}.corrupt-{}", chunk_name(index), Uuid::new_v4()));
        fs::rename(&path, quarantine).map_err(|error| error.to_string())?;
    }

    let temporary = stage_dir.join(format!(".chunk-{index:06}-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        output.write_all(bytes).map_err(|error| error.to_string())?;
        output.sync_all().map_err(|error| error.to_string())?;
        drop(output);
        fs::rename(&temporary, &path).map_err(|error| error.to_string())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub(crate) fn stage_status(directory: &Path, publication_id: &str) -> Result<Vec<usize>, String> {
    let manifest = load_stage_manifest(directory, publication_id)?;
    let stage_dir = stage_directory(directory, publication_id);
    let mut missing = Vec::new();
    for index in 0..manifest.chunk_sha256.len() {
        if !chunk_is_valid(&stage_dir, &manifest, index)? {
            missing.push(index);
        }
    }
    Ok(missing)
}

pub(crate) fn finalize_object(
    directory: &Path,
    staged: &StagedMediaV1,
) -> Result<FinalizedObjectReceiptV1, String> {
    validate_manifest(&staged.manifest)?;
    if staged.manifest_digest != manifest_payload_digest(&staged.manifest)? {
        return Err("STAGING_MANIFEST_CONFLICT".into());
    }
    if !stage_status(directory, &staged.manifest.publication_id)?.is_empty() {
        return Err("CHUNKS_MISSING".into());
    }
    let stage_dir = stage_directory(directory, &staged.manifest.publication_id);
    let temp = stage_dir.join(format!(".finalize-{}.tmp", Uuid::new_v4()));
    let object_dir = object_directory(directory, &staged.manifest.whole_sha256);
    fs::create_dir_all(&object_dir).map_err(|error| error.to_string())?;
    let relative = format!(
        "media/objects/sha256/{}/{}.{}",
        &staged.manifest.whole_sha256[..2],
        staged.manifest.whole_sha256,
        staged.manifest.extension
    );
    let destination = directory.join(&relative);
    let result = (|| {
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|error| error.to_string())?;
        let mut whole = Sha256::new();
        let mut total = 0u64;
        for index in 0..staged.manifest.chunk_sha256.len() {
            let path = stage_dir.join(chunk_name(index));
            let mut input = File::open(&path).map_err(|error| error.to_string())?;
            let mut chunk = Vec::with_capacity(expected_chunk_bytes(&staged.manifest, index)?);
            input
                .read_to_end(&mut chunk)
                .map_err(|error| error.to_string())?;
            let expected_hash = &staged.manifest.chunk_sha256[index];
            if chunk.len() != expected_chunk_bytes(&staged.manifest, index)?
                || sha256(&chunk) != *expected_hash
            {
                return Err("CHUNK_HASH_MISMATCH".into());
            }
            total = total
                .checked_add(chunk.len() as u64)
                .ok_or("ขนาดไฟล์เกินขอบเขต")?;
            whole.update(&chunk);
            output
                .write_all(&chunk)
                .map_err(|error| error.to_string())?;
        }
        output.sync_all().map_err(|error| error.to_string())?;
        drop(output);
        let whole_hash = hex(&whole.finalize());
        if total != staged.manifest.total_bytes || whole_hash != staged.manifest.whole_sha256 {
            return Err("WHOLE_FILE_HASH_MISMATCH".into());
        }
        if destination.exists() {
            verify_object_file(&destination, &staged.manifest.whole_sha256, total)?;
            fs::remove_file(&temp).map_err(|error| error.to_string())?;
        } else {
            match fs::rename(&temp, &destination) {
                Ok(()) => {}
                Err(error) if destination.exists() => {
                    verify_object_file(&destination, &staged.manifest.whole_sha256, total)?;
                    fs::remove_file(&temp).map_err(|cleanup| cleanup.to_string())?;
                    let _ = error;
                }
                Err(error) => return Err(error.to_string()),
            }
        }
        verify_object_file(&destination, &staged.manifest.whole_sha256, total)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
        return Err(result.unwrap_err());
    }

    let payload = ObjectReceiptPayloadV1 {
        version: 1,
        publication_id: staged.manifest.publication_id.clone(),
        object_key: staged.manifest.object_key.clone(),
        relative_path: relative,
        whole_sha256: staged.manifest.whole_sha256.clone(),
        byte_length: staged.manifest.total_bytes,
        manifest_digest: staged.manifest_digest.clone(),
    };
    let receipt = FinalizedObjectReceiptV1 {
        version: payload.version,
        publication_id: payload.publication_id.clone(),
        object_key: payload.object_key.clone(),
        relative_path: payload.relative_path.clone(),
        whole_sha256: payload.whole_sha256.clone(),
        byte_length: payload.byte_length,
        manifest_digest: payload.manifest_digest.clone(),
        receipt_digest: digest_serializable(&payload)?,
    };
    verify_object_receipt(directory, &receipt)?;
    Ok(receipt)
}

pub(crate) fn prepare_publication(
    directory: &Path,
    object_receipt: FinalizedObjectReceiptV1,
    mut track: Track,
) -> Result<PreparedPublicationV1, String> {
    validate_publication_id(&object_receipt.publication_id)?;
    verify_object_receipt(directory, &object_receipt)?;
    if track.content_hash.as_deref() != Some(object_receipt.whole_sha256.as_str()) {
        return Err("CATALOG_OBJECT_HASH_MISMATCH".into());
    }
    track.path = directory
        .join(&object_receipt.relative_path)
        .to_string_lossy()
        .to_string();
    track.storage_kind = "managed".into();
    track.content_hash = Some(object_receipt.whole_sha256.clone());
    track.missing = false;
    let row_digest = track_row_digest(
        &track,
        &object_receipt.relative_path,
        &object_receipt.publication_id,
    )?;
    let expected_rows = vec![PlannedCatalogRowV1 {
        row_id: track.id.clone(),
        row_digest: row_digest.clone(),
    }];
    let mut expected_indexes = vec![
        PublicationIndexEntryV1 {
            index_name: "tracks_publication_idx".into(),
            key: object_receipt.publication_id.clone(),
            row_id: track.id.clone(),
        },
        PublicationIndexEntryV1 {
            index_name: "tracks_hash_idx".into(),
            key: object_receipt.whole_sha256.clone(),
            row_id: track.id.clone(),
        },
    ];
    expected_indexes.sort_by(|left, right| {
        (&left.index_name, &left.key, &left.row_id).cmp(&(
            &right.index_name,
            &right.key,
            &right.row_id,
        ))
    });
    let row_set_digest = digest_serializable(&expected_rows)?;
    let index_set_digest = digest_serializable(&expected_indexes)?;
    let expected_row_count = u32::try_from(expected_rows.len())
        .map_err(|_| "catalog row count exceeds supported range")?;
    let expected_index_count = u32::try_from(expected_indexes.len())
        .map_err(|_| "catalog index count exceeds supported range")?;
    let payload = CatalogPlanPayloadV1 {
        version: 1,
        publication_id: object_receipt.publication_id.clone(),
        manifest_digest: object_receipt.manifest_digest.clone(),
        object_receipt_digest: object_receipt.receipt_digest.clone(),
        object_key: object_receipt.object_key.clone(),
        whole_sha256: object_receipt.whole_sha256.clone(),
        byte_length: object_receipt.byte_length,
        expected_row_count,
        expected_index_count,
        expected_rows: expected_rows.clone(),
        expected_indexes: expected_indexes.clone(),
        row_set_digest: row_set_digest.clone(),
        index_set_digest: index_set_digest.clone(),
    };
    let plan_digest = digest_serializable(&payload)?;
    let publication = PublicationFieldsV1 {
        publication_id: object_receipt.publication_id.clone(),
        plan_digest: plan_digest.clone(),
        state: PUBLICATION_PREPARING.into(),
        row_digest,
    };
    let plan = CatalogPlanV1 {
        version: payload.version,
        publication_id: payload.publication_id.clone(),
        manifest_digest: payload.manifest_digest.clone(),
        object_receipt_digest: payload.object_receipt_digest.clone(),
        object_key: payload.object_key.clone(),
        whole_sha256: payload.whole_sha256.clone(),
        byte_length: payload.byte_length,
        expected_row_count: payload.expected_row_count,
        expected_index_count: payload.expected_index_count,
        expected_rows,
        expected_indexes,
        row_set_digest,
        index_set_digest,
        plan_digest,
    };
    let prepared = PreparedPublicationV1 {
        plan,
        object_receipt,
        track,
        publication,
        commit_receipt: None,
    };
    append_event(
        directory,
        &prepared.plan.publication_id,
        PublicationEventV1::Prepared {
            plan: prepared.plan.clone(),
            object_receipt: prepared.object_receipt.clone(),
            track: prepared.track.clone(),
            publication: prepared.publication.clone(),
        },
    )?;
    Ok(prepared)
}

pub(crate) fn load_publication(
    directory: &Path,
    publication_id: &str,
) -> Result<Option<PreparedPublicationV1>, String> {
    validate_publication_id(publication_id)?;
    let journal = match read_journal(directory, publication_id)? {
        Some(journal) => journal,
        None => return Ok(None),
    };
    let mut prepared = None;
    let mut receipt = None;
    for event in journal.events {
        match event {
            PublicationEventV1::Prepared {
                plan,
                object_receipt,
                track,
                publication,
            } => {
                if prepared.is_some() {
                    return Err("PUBLICATION_JOURNAL_CONFLICT".into());
                }
                if plan.publication_id != publication_id
                    || object_receipt.publication_id != publication_id
                    || publication.publication_id != publication_id
                    || publication.plan_digest != plan.plan_digest
                    || publication.state != PUBLICATION_PREPARING
                {
                    return Err("PUBLICATION_JOURNAL_IDENTITY_MISMATCH".into());
                }
                validate_plan(&plan, &object_receipt, &track, &publication)?;
                prepared = Some((plan, object_receipt, track, publication));
            }
            PublicationEventV1::CommitReceipt { receipt: candidate } => {
                if prepared.is_none() || receipt.is_some() {
                    return Err("PUBLICATION_JOURNAL_ORDER_CONFLICT".into());
                }
                validate_commit_receipt(&candidate)?;
                receipt = Some(candidate);
            }
        }
    }
    let Some((plan, object_receipt, track, publication)) = prepared else {
        return Ok(None);
    };
    if let Some(committed) = &receipt {
        if committed.publication_id != plan.publication_id
            || committed.plan_digest != plan.plan_digest
            || committed.object_receipt_digest != object_receipt.receipt_digest
            || committed.expected_row_set_digest != plan.row_set_digest
            || committed.expected_index_set_digest != plan.index_set_digest
        {
            return Err("PUBLICATION_RECEIPT_CONFLICT".into());
        }
    }
    Ok(Some(PreparedPublicationV1 {
        plan,
        object_receipt,
        track,
        publication,
        commit_receipt: receipt,
    }))
}

pub(crate) fn commit_receipt(
    directory: &Path,
    prepared: &PreparedPublicationV1,
) -> Result<PublicationCommitReceiptV1, String> {
    let receipt = make_commit_receipt(&prepared.plan, &prepared.object_receipt)?;
    append_event(
        directory,
        &prepared.plan.publication_id,
        PublicationEventV1::CommitReceipt {
            receipt: receipt.clone(),
        },
    )?;
    let readback = load_publication(directory, &prepared.plan.publication_id)?
        .ok_or_else(|| "PUBLICATION_RECEIPT_READBACK_MISSING".to_string())?;
    if readback.commit_receipt.as_ref() != Some(&receipt) {
        return Err("PUBLICATION_RECEIPT_READBACK_MISMATCH".into());
    }
    Ok(receipt)
}

pub(crate) fn verify_prepared_object(
    directory: &Path,
    prepared: &PreparedPublicationV1,
) -> Result<(), String> {
    validate_plan(
        &prepared.plan,
        &prepared.object_receipt,
        &prepared.track,
        &prepared.publication,
    )?;
    verify_object_receipt(directory, &prepared.object_receipt)
}

pub(crate) fn verify_object_receipt(
    directory: &Path,
    receipt: &FinalizedObjectReceiptV1,
) -> Result<(), String> {
    validate_object_receipt(receipt)?;
    let relative = Path::new(&receipt.relative_path);
    if relative.is_absolute()
        || relative.components().any(|part| {
            matches!(
                part,
                std::path::Component::ParentDir | std::path::Component::Prefix(_)
            )
        })
        || !relative.starts_with("media")
    {
        return Err("OBJECT_PATH_INVALID".into());
    }
    let object_path = directory.join(relative);
    verify_object_file(&object_path, &receipt.whole_sha256, receipt.byte_length)
}

pub(crate) fn validate_row(
    directory: &Path,
    prepared: &PreparedPublicationV1,
    row: &Value,
) -> Result<(), String> {
    let expected = &prepared.plan.expected_rows[0];
    if row.get("id").and_then(Value::as_str) != Some(expected.row_id.as_str())
        || row.get("publication_id").and_then(Value::as_str)
            != Some(prepared.publication.publication_id.as_str())
        || row.get("publication_state").and_then(Value::as_str)
            != Some(prepared.publication.state.as_str())
        || row.get("publication_plan_digest").and_then(Value::as_str)
            != Some(prepared.publication.plan_digest.as_str())
        || row.get("publication_row_digest").and_then(Value::as_str)
            != Some(prepared.publication.row_digest.as_str())
    {
        return Err("GENESIS_PUBLICATION_ROW_MISMATCH".into());
    }
    let media_path = row
        .get("media_path")
        .and_then(Value::as_str)
        .ok_or_else(|| "GENESIS_MEDIA_PATH_MISSING".to_string())?;
    let mut track = prepared.track.clone();
    track.path = directory
        .join(Path::new(media_path))
        .to_string_lossy()
        .to_string();
    let digest = track_row_digest(&track, media_path, &prepared.publication.publication_id)?;
    if digest != expected.row_digest
        || row.get("content_hash").and_then(Value::as_str)
            != Some(prepared.plan.whole_sha256.as_str())
        || row.get("storage_kind").and_then(Value::as_str) != Some("managed")
    {
        return Err("GENESIS_PUBLICATION_PAYLOAD_MISMATCH".into());
    }
    Ok(())
}

pub(crate) fn visible_row_digest(_directory: &Path, row: &Value) -> Result<String, String> {
    let row_track = Track {
        kind: if row.get("kind").and_then(Value::as_str) == Some("video") {
            crate::library::MediaKind::Video
        } else {
            crate::library::MediaKind::Audio
        },
        id: row
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        path: row
            .get("media_path")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        title: row
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        artist: row.get("artist").and_then(Value::as_str).map(str::to_owned),
        album: row.get("album").and_then(Value::as_str).map(str::to_owned),
        duration: row.get("duration").and_then(Value::as_f64),
        missing: false,
        source_kind: row
            .get("source_kind")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        storage_kind: row
            .get("storage_kind")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        source_path: row
            .get("source_path")
            .and_then(Value::as_str)
            .map(str::to_owned),
        content_hash: row
            .get("content_hash")
            .and_then(Value::as_str)
            .map(str::to_owned),
        favorite: row
            .get("favorite")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        play_count: row.get("play_count").and_then(Value::as_u64).unwrap_or(0),
        last_played_at: row.get("last_played_at").and_then(Value::as_i64),
    };
    let media_path = row
        .get("media_path")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let publication_id = row
        .get("publication_id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    track_row_digest(&row_track, media_path, publication_id)
}

pub(crate) fn index_entries_match(
    prepared: &PreparedPublicationV1,
    rows_by_publication: &[Value],
    rows_by_hash: &[Value],
) -> bool {
    if rows_by_publication.len() != prepared.plan.expected_rows.len() {
        return false;
    }
    let expected_ids = prepared
        .plan
        .expected_rows
        .iter()
        .map(|row| row.row_id.as_str())
        .collect::<Vec<_>>();
    let publication_ids = rows_by_publication
        .iter()
        .filter_map(|row| row.get("id").and_then(Value::as_str))
        .collect::<Vec<_>>();
    expected_ids.iter().all(|id| publication_ids.contains(id))
        && prepared
            .plan
            .expected_indexes
            .iter()
            .all(|entry| match entry.index_name.as_str() {
                "tracks_publication_idx" => {
                    entry.key == prepared.plan.publication_id
                        && rows_by_publication.iter().any(|row| {
                            row.get("id").and_then(Value::as_str) == Some(entry.row_id.as_str())
                        })
                }
                "tracks_hash_idx" => {
                    entry.key == prepared.plan.whole_sha256
                        && rows_by_hash.iter().any(|row| {
                            row.get("id").and_then(Value::as_str) == Some(entry.row_id.as_str())
                        })
                }
                _ => false,
            })
}

pub(crate) fn discard_stage_after_commit(
    directory: &Path,
    publication_id: &str,
) -> Result<(), String> {
    validate_publication_id(publication_id)?;
    let Some(prepared) = load_publication(directory, publication_id)? else {
        return Err("PUBLICATION_JOURNAL_MISSING".into());
    };
    if prepared.commit_receipt.is_none() {
        return Err("PUBLICATION_NOT_COMMITTED".into());
    }
    let path = stage_directory(directory, publication_id);
    if path.exists() {
        fs::remove_dir_all(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn publication_id_for_import(
    source_path: &str,
    source: &Path,
) -> Result<String, String> {
    let (_, whole_hash, _) = hash_source_chunks(source)?;
    let identity = sha256(format!("{source_path}\0{whole_hash}").as_bytes());
    let prefix = format!("import-{identity}");
    let generation_prefix = format!("{prefix}-");
    let mut resumable = Vec::new();
    for directory in known_library_directories()? {
        if !directory.is_dir() {
            continue;
        }
        for publication_id in publication_ids(&directory)? {
            if publication_id != prefix && !publication_id.starts_with(&generation_prefix) {
                continue;
            }
            if crate::library_store::publication_is_retired_at(&directory, &publication_id)? {
                continue;
            }
            if let Some(prepared) = load_publication(&directory, &publication_id)? {
                if prepared.commit_receipt.is_none()
                    && prepared.plan.whole_sha256 == whole_hash
                    && prepared.track.source_path.as_deref() == Some(source_path)
                {
                    resumable.push(publication_id);
                }
            } else if load_stage_manifest(&directory, &publication_id)
                .is_ok_and(|manifest| manifest.whole_sha256 == whole_hash)
            {
                resumable.push(publication_id);
            }
        }
    }
    resumable.sort();
    if let Some(publication_id) = resumable.into_iter().next() {
        return Ok(publication_id);
    }

    // Fresh generations avoid colliding with retired, committed journals while
    // the scan above preserves IDs for interrupted staging or preparation.
    Ok(format!("{generation_prefix}{}", Uuid::new_v4().simple()))
}

pub(crate) fn publication_id_for_legacy_track(track_id: &str) -> String {
    format!("legacy-{}", sha256(track_id.as_bytes()))
}

pub(crate) fn retirement_id_for_track(track_id: &str) -> String {
    format!(
        "retired-{}",
        sha256(format!("track-retirement-v1\0{track_id}").as_bytes())
    )
}

pub(crate) fn receipt_checksum_is_valid(receipt: &PublicationCommitReceiptV1) -> bool {
    validate_commit_receipt(receipt).is_ok()
}

fn make_commit_receipt(
    plan: &CatalogPlanV1,
    object: &FinalizedObjectReceiptV1,
) -> Result<PublicationCommitReceiptV1, String> {
    let payload = CommitReceiptPayloadV1 {
        version: 1,
        publication_id: plan.publication_id.clone(),
        plan_digest: plan.plan_digest.clone(),
        object_receipt_digest: object.receipt_digest.clone(),
        expected_row_set_digest: plan.row_set_digest.clone(),
        expected_index_set_digest: plan.index_set_digest.clone(),
        object_key: object.object_key.clone(),
        whole_sha256: object.whole_sha256.clone(),
        byte_length: object.byte_length,
        state: "COMMITTED".into(),
    };
    Ok(PublicationCommitReceiptV1 {
        version: payload.version,
        publication_id: payload.publication_id.clone(),
        plan_digest: payload.plan_digest.clone(),
        object_receipt_digest: payload.object_receipt_digest.clone(),
        expected_row_set_digest: payload.expected_row_set_digest.clone(),
        expected_index_set_digest: payload.expected_index_set_digest.clone(),
        object_key: payload.object_key.clone(),
        whole_sha256: payload.whole_sha256.clone(),
        byte_length: payload.byte_length,
        state: payload.state.clone(),
        checksum: digest_serializable(&payload)?,
    })
}

fn validate_commit_receipt(receipt: &PublicationCommitReceiptV1) -> Result<(), String> {
    if receipt.version != 1
        || receipt.state != "COMMITTED"
        || !is_lower_sha256(&receipt.plan_digest)
        || !is_lower_sha256(&receipt.object_receipt_digest)
        || !is_lower_sha256(&receipt.expected_row_set_digest)
        || !is_lower_sha256(&receipt.expected_index_set_digest)
        || !is_lower_sha256(&receipt.whole_sha256)
        || !is_lower_sha256(&receipt.checksum)
    {
        return Err("PUBLICATION_RECEIPT_INVALID".into());
    }
    let payload = CommitReceiptPayloadV1 {
        version: receipt.version,
        publication_id: receipt.publication_id.clone(),
        plan_digest: receipt.plan_digest.clone(),
        object_receipt_digest: receipt.object_receipt_digest.clone(),
        expected_row_set_digest: receipt.expected_row_set_digest.clone(),
        expected_index_set_digest: receipt.expected_index_set_digest.clone(),
        object_key: receipt.object_key.clone(),
        whole_sha256: receipt.whole_sha256.clone(),
        byte_length: receipt.byte_length,
        state: receipt.state.clone(),
    };
    if digest_serializable(&payload)? != receipt.checksum {
        return Err("PUBLICATION_RECEIPT_CHECKSUM_MISMATCH".into());
    }
    Ok(())
}

fn validate_plan(
    plan: &CatalogPlanV1,
    object: &FinalizedObjectReceiptV1,
    track: &Track,
    publication: &PublicationFieldsV1,
) -> Result<(), String> {
    if plan.version != 1
        || plan.publication_id != object.publication_id
        || plan.manifest_digest != object.manifest_digest
        || plan.object_receipt_digest != object.receipt_digest
        || plan.object_key != object.object_key
        || plan.whole_sha256 != object.whole_sha256
        || plan.byte_length != object.byte_length
        || plan.expected_rows.len() != 1
        || usize::try_from(plan.expected_row_count).ok() != Some(plan.expected_rows.len())
        || usize::try_from(plan.expected_index_count).ok() != Some(plan.expected_indexes.len())
        || plan.expected_rows[0].row_id != track.id
        || plan.expected_indexes.len() != 2
        || publication.publication_id != plan.publication_id
        || publication.plan_digest != plan.plan_digest
        || publication.state != PUBLICATION_PREPARING
    {
        return Err("CATALOG_PLAN_MISMATCH".into());
    }
    let payload = CatalogPlanPayloadV1 {
        version: plan.version,
        publication_id: plan.publication_id.clone(),
        manifest_digest: plan.manifest_digest.clone(),
        object_receipt_digest: plan.object_receipt_digest.clone(),
        object_key: plan.object_key.clone(),
        whole_sha256: plan.whole_sha256.clone(),
        byte_length: plan.byte_length,
        expected_row_count: plan.expected_row_count,
        expected_index_count: plan.expected_index_count,
        expected_rows: plan.expected_rows.clone(),
        expected_indexes: plan.expected_indexes.clone(),
        row_set_digest: plan.row_set_digest.clone(),
        index_set_digest: plan.index_set_digest.clone(),
    };
    if digest_serializable(&payload)? != plan.plan_digest
        || digest_serializable(&plan.expected_rows)? != plan.row_set_digest
        || digest_serializable(&plan.expected_indexes)? != plan.index_set_digest
        || track_row_digest(track, &object.relative_path, &plan.publication_id)?
            != plan.expected_rows[0].row_digest
        || publication.row_digest != plan.expected_rows[0].row_digest
    {
        return Err("CATALOG_PLAN_DIGEST_MISMATCH".into());
    }
    validate_object_receipt(object)
}

fn validate_object_receipt(receipt: &FinalizedObjectReceiptV1) -> Result<(), String> {
    validate_publication_id(&receipt.publication_id)?;
    let payload = ObjectReceiptPayloadV1 {
        version: receipt.version,
        publication_id: receipt.publication_id.clone(),
        object_key: receipt.object_key.clone(),
        relative_path: receipt.relative_path.clone(),
        whole_sha256: receipt.whole_sha256.clone(),
        byte_length: receipt.byte_length,
        manifest_digest: receipt.manifest_digest.clone(),
    };
    if receipt.version != 1
        || receipt.object_key != receipt.whole_sha256
        || !is_lower_sha256(&receipt.whole_sha256)
        || !is_lower_sha256(&receipt.manifest_digest)
        || !is_lower_sha256(&receipt.receipt_digest)
        || receipt.byte_length == 0
        || receipt.byte_length > MAX_OBJECT_BYTES
        || !canonical_object_path_matches(&receipt.relative_path, &receipt.whole_sha256)
        || digest_serializable(&payload)? != receipt.receipt_digest
    {
        return Err("FINALIZED_OBJECT_RECEIPT_INVALID".into());
    }
    Ok(())
}

fn canonical_object_path_matches(relative_path: &str, whole_sha256: &str) -> bool {
    let normalized = relative_path.replace('\\', "/");
    let Some(file_name) = normalized.rsplit('/').next() else {
        return false;
    };
    let Some(extension) = file_name
        .strip_prefix(&format!("{whole_sha256}."))
        .filter(|extension| valid_extension(extension))
    else {
        return false;
    };
    normalized
        == format!(
            "media/objects/sha256/{}/{}.{}",
            &whole_sha256[..2],
            whole_sha256,
            extension
        )
}

fn track_row_digest(
    track: &Track,
    relative_media_path: &str,
    publication_id: &str,
) -> Result<String, String> {
    let payload = json!({
        "id": track.id,
        "media_path": relative_media_path.replace('\\', "/"),
        "title": track.title,
        "artist": track.artist,
        "album": track.album,
        "duration": track.duration,
        "kind": if matches!(track.kind, crate::library::MediaKind::Video) { "video" } else { "audio" },
        "source_kind": track.source_kind,
        "storage_kind": "managed",
        "source_path": track.source_path,
        "content_hash": track.content_hash,
        "publication_id": publication_id,
    });
    digest_serializable(&payload)
}

fn append_event(
    directory: &Path,
    publication_id: &str,
    event: PublicationEventV1,
) -> Result<(), String> {
    validate_publication_id(publication_id)?;
    let _guard = JOURNAL_LOCK.lock().map_err(|error| error.to_string())?;
    let journal_path = journal_path(directory, publication_id);
    let parent = journal_path
        .parent()
        .ok_or_else(|| "PUBLICATION_JOURNAL_PATH_INVALID".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut existing = read_journal(directory, publication_id)?.unwrap_or(JournalRead {
        events: Vec::new(),
        valid_bytes: 0,
        torn_tail: false,
    });
    #[cfg(test)]
    let is_commit_receipt = matches!(&event, PublicationEventV1::CommitReceipt { .. });
    match &event {
        PublicationEventV1::Prepared { .. } => {
            if let Some(previous) = existing
                .events
                .iter()
                .find(|candidate| matches!(candidate, PublicationEventV1::Prepared { .. }))
            {
                if previous == &event {
                    return Ok(());
                }
                return Err("PUBLICATION_PLAN_CONFLICT".into());
            }
            if !existing.events.is_empty() {
                return Err("PUBLICATION_JOURNAL_ORDER_CONFLICT".into());
            }
        }
        PublicationEventV1::CommitReceipt { receipt } => {
            validate_commit_receipt(receipt)?;
            let Some(PublicationEventV1::Prepared {
                plan,
                object_receipt,
                ..
            }) = existing.events.first()
            else {
                return Err("PUBLICATION_PLAN_MISSING".into());
            };
            if receipt.publication_id != publication_id
                || receipt.plan_digest != plan.plan_digest
                || receipt.object_receipt_digest != object_receipt.receipt_digest
                || receipt.expected_row_set_digest != plan.row_set_digest
                || receipt.expected_index_set_digest != plan.index_set_digest
            {
                return Err("PUBLICATION_RECEIPT_CONFLICT".into());
            }
            if let Some(previous) = existing
                .events
                .iter()
                .find(|candidate| matches!(candidate, PublicationEventV1::CommitReceipt { .. }))
            {
                if previous == &event {
                    return Ok(());
                }
                return Err("PUBLICATION_RECEIPT_CONFLICT".into());
            }
        }
    }
    let line = make_journal_line((existing.events.len() + 1) as u64, publication_id, event)?;
    if existing.torn_tail && journal_path.exists() {
        let file = OpenOptions::new()
            .write(true)
            .open(&journal_path)
            .map_err(|error| error.to_string())?;
        file.set_len(existing.valid_bytes)
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }
    let encoded = serde_json::to_vec(&line).map_err(|error| error.to_string())?;
    #[cfg(test)]
    if is_commit_receipt {
        trip_receipt_append_failpoint(ReceiptAppendFailpoint::BeforeDurableWrite)?;
    }
    let mut output = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&journal_path)
        .map_err(|error| error.to_string())?;
    output
        .write_all(&encoded)
        .map_err(|error| error.to_string())?;
    output.write_all(b"\n").map_err(|error| error.to_string())?;
    output.sync_all().map_err(|error| error.to_string())?;
    drop(output);
    #[cfg(test)]
    if is_commit_receipt {
        trip_receipt_append_failpoint(ReceiptAppendFailpoint::AfterDurableWriteBeforeReadback)?;
    }
    existing = read_journal(directory, publication_id)?
        .ok_or_else(|| "PUBLICATION_JOURNAL_READBACK_MISSING".to_string())?;
    if existing.events.last() != Some(&line.event) {
        return Err("PUBLICATION_JOURNAL_READBACK_MISMATCH".into());
    }
    Ok(())
}

fn make_journal_line(
    sequence: u64,
    publication_id: &str,
    event: PublicationEventV1,
) -> Result<JournalLineV1, String> {
    let checksum = digest_serializable(&json!({
        "version": 1,
        "sequence": sequence,
        "publicationId": publication_id,
        "event": event,
    }))?;
    Ok(JournalLineV1 {
        version: 1,
        sequence,
        publication_id: publication_id.into(),
        event,
        checksum,
    })
}

fn read_journal(directory: &Path, publication_id: &str) -> Result<Option<JournalRead>, String> {
    let path = journal_path(directory, publication_id);
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let mut events = Vec::new();
    let mut valid_bytes = 0usize;
    let mut start = 0usize;
    while start < bytes.len() {
        let line_end = bytes[start..]
            .iter()
            .position(|byte| *byte == b'\n')
            .map(|offset| start + offset);
        let terminated = line_end.is_some();
        let end = line_end.unwrap_or(bytes.len());
        let line_bytes = &bytes[start..end];
        if line_bytes.is_empty() {
            if terminated {
                return Err("PUBLICATION_JOURNAL_EMPTY_RECORD".into());
            }
            break;
        }
        let parsed = serde_json::from_slice::<JournalLineV1>(line_bytes);
        let record = match parsed {
            Ok(record) => record,
            Err(_) if !terminated => {
                return Ok(Some(JournalRead {
                    events,
                    valid_bytes: valid_bytes as u64,
                    torn_tail: true,
                }));
            }
            Err(error) => return Err(format!("PUBLICATION_JOURNAL_CORRUPT: {error}")),
        };
        if record.version != 1
            || record.sequence != (events.len() + 1) as u64
            || record.publication_id != publication_id
        {
            return Err("PUBLICATION_JOURNAL_SEQUENCE_CONFLICT".into());
        }
        let expected_checksum = digest_serializable(&json!({
            "version": record.version,
            "sequence": record.sequence,
            "publicationId": &record.publication_id,
            "event": &record.event,
        }))?;
        if expected_checksum != record.checksum {
            if !terminated && end == bytes.len() {
                return Ok(Some(JournalRead {
                    events,
                    valid_bytes: valid_bytes as u64,
                    torn_tail: true,
                }));
            }
            return Err("PUBLICATION_JOURNAL_CHECKSUM_MISMATCH".into());
        }
        events.push(record.event);
        valid_bytes = if terminated { end + 1 } else { end };
        start = if terminated { end + 1 } else { end };
    }
    Ok(Some(JournalRead {
        events,
        valid_bytes: valid_bytes as u64,
        torn_tail: false,
    }))
}

fn write_manifest(stage_dir: &Path, manifest: &StageManifestV1) -> Result<(), String> {
    let path = stage_dir.join("manifest.json");
    if path.exists() {
        let existing = load_manifest_file(&path)?;
        if existing == *manifest {
            return Ok(());
        }
        return Err("STAGING_MANIFEST_CONFLICT".into());
    }
    let bytes = serde_json::to_vec(manifest).map_err(|error| error.to_string())?;
    write_new_atomic(&path, &bytes)
}

fn load_stage_manifest(directory: &Path, publication_id: &str) -> Result<StageManifestV1, String> {
    validate_publication_id(publication_id)?;
    let path = stage_directory(directory, publication_id).join("manifest.json");
    let manifest = load_manifest_file(&path)?;
    validate_manifest(&manifest)?;
    if manifest.publication_id != publication_id {
        return Err("STAGING_MANIFEST_IDENTITY_MISMATCH".into());
    }
    Ok(manifest)
}

fn load_manifest_file(path: &Path) -> Result<StageManifestV1, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

fn validate_manifest(manifest: &StageManifestV1) -> Result<(), String> {
    validate_publication_id(&manifest.publication_id)?;
    let payload = StageManifestPayloadV1 {
        version: manifest.version,
        publication_id: manifest.publication_id.clone(),
        object_key: manifest.object_key.clone(),
        total_bytes: manifest.total_bytes,
        chunk_size_bytes: manifest.chunk_size_bytes,
        extension: manifest.extension.clone(),
        chunk_sha256: manifest.chunk_sha256.clone(),
        whole_sha256: manifest.whole_sha256.clone(),
    };
    let expected_chunks = manifest
        .total_bytes
        .div_ceil(manifest.chunk_size_bytes.max(1)) as usize;
    if manifest.version != 1
        || manifest.total_bytes == 0
        || manifest.total_bytes > MAX_OBJECT_BYTES
        || manifest.chunk_size_bytes != CHUNK_SIZE_BYTES as u64
        || !valid_extension(&manifest.extension)
        || !is_lower_sha256(&manifest.whole_sha256)
        || manifest.object_key != manifest.whole_sha256
        || manifest.chunk_sha256.len() != expected_chunks
        || manifest
            .chunk_sha256
            .iter()
            .any(|hash| !is_lower_sha256(hash))
        || digest_serializable(&payload)? != manifest.checksum
    {
        return Err("STAGING_MANIFEST_INVALID".into());
    }
    Ok(())
}

fn manifest_payload_digest(manifest: &StageManifestV1) -> Result<String, String> {
    let payload = StageManifestPayloadV1 {
        version: manifest.version,
        publication_id: manifest.publication_id.clone(),
        object_key: manifest.object_key.clone(),
        total_bytes: manifest.total_bytes,
        chunk_size_bytes: manifest.chunk_size_bytes,
        extension: manifest.extension.clone(),
        chunk_sha256: manifest.chunk_sha256.clone(),
        whole_sha256: manifest.whole_sha256.clone(),
    };
    digest_serializable(&payload)
}

fn reserve_staging(directory: &Path, requested: &StageManifestV1) -> Result<(), String> {
    let root = staging_root(directory);
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let mut reserved = 0u64;
    let mut sessions = 0usize;
    for entry in fs::read_dir(&root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            continue;
        }
        let manifest_path = entry.path().join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }
        let manifest = load_manifest_file(&manifest_path)?;
        validate_manifest(&manifest)?;
        if manifest.publication_id == requested.publication_id {
            continue;
        }
        reserved = reserved
            .checked_add(manifest.total_bytes)
            .ok_or_else(|| "STAGING_QUOTA_FULL".to_string())?;
        sessions += 1;
    }
    if sessions >= MAX_STAGING_SESSIONS
        || reserved
            .checked_add(requested.total_bytes)
            .is_none_or(|bytes| bytes > MAX_STAGING_BYTES)
    {
        return Err("STAGING_QUOTA_FULL".into());
    }
    Ok(())
}

fn hash_source_chunks(source: &Path) -> Result<(Vec<String>, String, u64), String> {
    let mut input = File::open(source).map_err(|error| error.to_string())?;
    let mut buffer = vec![0u8; CHUNK_SIZE_BYTES];
    let mut chunks = Vec::new();
    let mut whole = Sha256::new();
    let mut total = 0u64;
    loop {
        let mut filled = 0usize;
        while filled < buffer.len() {
            let read = input
                .read(&mut buffer[filled..])
                .map_err(|error| error.to_string())?;
            if read == 0 {
                break;
            }
            filled += read;
        }
        if filled == 0 {
            break;
        }
        let chunk = &buffer[..filled];
        total = total.checked_add(filled as u64).ok_or("ขนาดไฟล์เกินขอบเขต")?;
        if total > MAX_OBJECT_BYTES {
            return Err("ไฟล์ต้องไม่เกิน 1 GiB".into());
        }
        whole.update(chunk);
        chunks.push(sha256(chunk));
    }
    Ok((chunks, hex(&whole.finalize()), total))
}

fn chunk_is_valid(
    stage_dir: &Path,
    manifest: &StageManifestV1,
    index: usize,
) -> Result<bool, String> {
    let expected_length = expected_chunk_bytes(manifest, index)?;
    let path = stage_dir.join(chunk_name(index));
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.to_string()),
    };
    Ok(bytes.len() == expected_length
        && manifest
            .chunk_sha256
            .get(index)
            .is_some_and(|expected| sha256(&bytes) == *expected))
}

fn expected_chunk_bytes(manifest: &StageManifestV1, index: usize) -> Result<usize, String> {
    if index >= manifest.chunk_sha256.len() {
        return Err("CHUNK_OUT_OF_RANGE".into());
    }
    let offset = (index as u64)
        .checked_mul(manifest.chunk_size_bytes)
        .ok_or_else(|| "CHUNK_OUT_OF_RANGE".to_string())?;
    let remaining = manifest
        .total_bytes
        .checked_sub(offset)
        .ok_or_else(|| "CHUNK_OUT_OF_RANGE".to_string())?;
    Ok(remaining.min(manifest.chunk_size_bytes) as usize)
}

fn verify_object_file(path: &Path, expected_hash: &str, expected_bytes: u64) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() != expected_bytes {
        return Err("OBJECT_LENGTH_MISMATCH".into());
    }
    let mut input = File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 1024 * 1024];
    loop {
        let count = input.read(&mut buffer).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    if hex(&hasher.finalize()) != expected_hash {
        return Err("OBJECT_HASH_MISMATCH".into());
    }
    Ok(())
}

fn object_directory(directory: &Path, hash: &str) -> PathBuf {
    directory
        .join("media")
        .join("objects")
        .join("sha256")
        .join(&hash[..2])
}

fn stage_directory(directory: &Path, publication_id: &str) -> PathBuf {
    staging_root(directory).join(safe_id(publication_id))
}

fn staging_root(directory: &Path) -> PathBuf {
    directory.join("media").join("staging")
}

fn journal_path(directory: &Path, publication_id: &str) -> PathBuf {
    directory
        .join("media")
        .join("publications")
        .join(safe_id(publication_id))
        .join("journal.jsonl")
}

fn safe_id(publication_id: &str) -> String {
    sha256(publication_id.as_bytes())
}

pub(crate) fn publication_ids(directory: &Path) -> Result<Vec<String>, String> {
    let mut ids = std::collections::HashSet::new();
    let staging = staging_root(directory);
    if let Ok(entries) = fs::read_dir(&staging) {
        for entry in entries {
            let entry = entry.map_err(|error| error.to_string())?;
            if !entry
                .file_type()
                .map_err(|error| error.to_string())?
                .is_dir()
            {
                continue;
            }
            let manifest_path = entry.path().join("manifest.json");
            if manifest_path.exists() {
                let manifest = load_manifest_file(&manifest_path)?;
                validate_manifest(&manifest)?;
                if entry.path() != stage_directory(directory, &manifest.publication_id) {
                    return Err("STAGING_MANIFEST_PATH_IDENTITY_MISMATCH".into());
                }
                ids.insert(manifest.publication_id);
            }
        }
    }
    let root = directory.join("media").join("publications");
    match fs::read_dir(&root) {
        Ok(entries) => {
            for entry in entries {
                let entry = entry.map_err(|error| error.to_string())?;
                if !entry
                    .file_type()
                    .map_err(|error| error.to_string())?
                    .is_dir()
                {
                    continue;
                }
                let path = entry.path().join("journal.jsonl");
                let Ok(bytes) = fs::read(&path) else {
                    continue;
                };
                let Some(line) = bytes
                    .split(|byte| *byte == b'\n')
                    .find(|line| !line.is_empty())
                else {
                    continue;
                };
                let Ok(record) = serde_json::from_slice::<JournalLineV1>(line) else {
                    // A torn first record has no prepared catalog row to publish.
                    // If its stage remains, the validated manifest above has its ID.
                    continue;
                };
                validate_publication_id(&record.publication_id)?;
                if journal_path(directory, &record.publication_id) != path {
                    return Err("PUBLICATION_JOURNAL_PATH_IDENTITY_MISMATCH".into());
                }
                ids.insert(record.publication_id);
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    let mut ids = ids.into_iter().collect::<Vec<_>>();
    ids.sort();
    Ok(ids)
}

pub(crate) fn discard_uncommitted_stage(
    directory: &Path,
    publication_id: &str,
) -> Result<(), String> {
    validate_publication_id(publication_id)?;
    if read_journal(directory, publication_id)?.is_some() {
        return Err("PUBLICATION_ALREADY_JOURNALED".into());
    }
    let stage = stage_directory(directory, publication_id);
    if stage.exists() {
        fs::remove_dir_all(stage).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn chunk_name(index: usize) -> String {
    format!("chunk-{index:06}.bin")
}

fn valid_extension(extension: &str) -> bool {
    !extension.is_empty()
        && extension.len() <= 8
        && extension
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
}

fn validate_publication_id(publication_id: &str) -> Result<(), String> {
    if publication_id.is_empty()
        || publication_id.len() > 128
        || !publication_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("PUBLICATION_ID_INVALID".into());
    }
    Ok(())
}

fn is_lower_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn digest_serializable(value: &impl Serialize) -> Result<String, String> {
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    Ok(sha256(&bytes))
}

fn sha256(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn write_new_atomic(destination: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = destination.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        output.write_all(bytes).map_err(|error| error.to_string())?;
        output.sync_all().map_err(|error| error.to_string())?;
        drop(output);
        fs::rename(&temporary, destination).map_err(|error| error.to_string())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    fn fixture_manifest(publication_id: &str, bytes: &[u8]) -> StageManifestV1 {
        let whole_sha256 = sha256(bytes);
        let chunk_sha256 = vec![sha256(bytes)];
        let payload = StageManifestPayloadV1 {
            version: 1,
            publication_id: publication_id.into(),
            object_key: whole_sha256.clone(),
            total_bytes: bytes.len() as u64,
            chunk_size_bytes: CHUNK_SIZE_BYTES as u64,
            extension: "mp3".into(),
            chunk_sha256,
            whole_sha256: whole_sha256.clone(),
        };
        StageManifestV1 {
            version: payload.version,
            publication_id: payload.publication_id.clone(),
            object_key: payload.object_key.clone(),
            total_bytes: payload.total_bytes,
            chunk_size_bytes: payload.chunk_size_bytes,
            extension: payload.extension.clone(),
            chunk_sha256: payload.chunk_sha256.clone(),
            whole_sha256: payload.whole_sha256.clone(),
            checksum: digest_serializable(&payload).unwrap(),
        }
    }

    #[test]
    fn chunk_hash_mismatch_is_rejected_and_identical_duplicate_is_idempotent() {
        let root = tempdir().unwrap();
        let publication_id = Uuid::new_v4().to_string();
        let bytes = b"verified media bytes";
        let manifest = fixture_manifest(&publication_id, bytes);
        let stage_dir = stage_directory(root.path(), &publication_id);
        fs::create_dir_all(&stage_dir).unwrap();
        write_manifest(&stage_dir, &manifest).unwrap();

        assert!(put_chunk(root.path(), &publication_id, 0, b"wrong", &sha256(bytes)).is_err());
        put_chunk(root.path(), &publication_id, 0, bytes, &sha256(bytes)).unwrap();
        put_chunk(root.path(), &publication_id, 0, bytes, &sha256(bytes)).unwrap();
        assert!(stage_status(root.path(), &publication_id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn missing_or_corrupt_chunks_remain_hidden_and_can_be_resumed() {
        let root = tempdir().unwrap();
        let publication_id = Uuid::new_v4().to_string();
        let bytes = b"one complete staged object";
        let manifest = fixture_manifest(&publication_id, bytes);
        let stage_dir = stage_directory(root.path(), &publication_id);
        fs::create_dir_all(&stage_dir).unwrap();
        write_manifest(&stage_dir, &manifest).unwrap();
        assert_eq!(stage_status(root.path(), &publication_id).unwrap(), vec![0]);
        assert!(finalize_object(
            root.path(),
            &StagedMediaV1 {
                manifest: manifest.clone(),
                manifest_digest: manifest_payload_digest(&manifest).unwrap(),
            }
        )
        .is_err());

        let chunk_path = stage_dir.join(chunk_name(0));
        fs::write(&chunk_path, b"truncated").unwrap();
        assert_eq!(stage_status(root.path(), &publication_id).unwrap(), vec![0]);
        put_chunk(root.path(), &publication_id, 0, bytes, &sha256(bytes)).unwrap();
        assert!(stage_status(root.path(), &publication_id)
            .unwrap()
            .is_empty());
        let receipt = finalize_object(
            root.path(),
            &StagedMediaV1 {
                manifest: manifest.clone(),
                manifest_digest: manifest_payload_digest(&manifest).unwrap(),
            },
        )
        .unwrap();
        verify_object_receipt(root.path(), &receipt).unwrap();
    }

    #[test]
    fn same_hash_object_is_verified_and_never_overwritten_when_corrupt() {
        let root = tempdir().unwrap();
        let publication_id = Uuid::new_v4().to_string();
        let bytes = b"immutable bytes";
        let manifest = fixture_manifest(&publication_id, bytes);
        let stage_dir = stage_directory(root.path(), &publication_id);
        fs::create_dir_all(&stage_dir).unwrap();
        write_manifest(&stage_dir, &manifest).unwrap();
        put_chunk(root.path(), &publication_id, 0, bytes, &sha256(bytes)).unwrap();
        let staged = StagedMediaV1 {
            manifest: manifest.clone(),
            manifest_digest: manifest_payload_digest(&manifest).unwrap(),
        };
        let receipt = finalize_object(root.path(), &staged).unwrap();
        let object_path = root.path().join(&receipt.relative_path);
        let mut file = OpenOptions::new().write(true).open(&object_path).unwrap();
        file.write_all(b"corrupt bytes!!").unwrap();
        file.sync_all().unwrap();
        drop(file);
        assert_eq!(
            verify_object_receipt(root.path(), &receipt).unwrap_err(),
            "OBJECT_HASH_MISMATCH"
        );
        assert!(finalize_object(root.path(), &staged).is_err());
        assert_eq!(fs::read(object_path).unwrap(), b"corrupt bytes!!");
    }

    #[test]
    fn atomic_write_rename_failure_cleans_temporary_file_and_preserves_destination() {
        let root = tempdir().unwrap();
        let destination = root.path().join("blocked.json");
        fs::create_dir(&destination).unwrap();
        fs::write(destination.join("sentinel"), b"keep").unwrap();

        assert!(write_new_atomic(&destination, b"replacement").is_err());
        assert_eq!(fs::read(destination.join("sentinel")).unwrap(), b"keep");
        let entries = fs::read_dir(root.path())
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            entries.len(),
            1,
            "failed atomic write must remove its temporary file"
        );
    }

    #[test]
    fn explicit_reimports_receive_distinct_publication_generations_for_same_content() {
        let root = tempdir().unwrap();
        let source = root.path().join("same.mp3");
        fs::write(&source, b"same content across explicit imports").unwrap();
        let source_path = source.to_string_lossy().to_string();

        let first = publication_id_for_import(&source_path, &source).unwrap();
        let second = publication_id_for_import(&source_path, &source).unwrap();

        assert_ne!(first, second);
        assert!(first.starts_with("import-"));
        assert!(second.starts_with("import-"));
        validate_publication_id(&first).unwrap();
        validate_publication_id(&second).unwrap();
    }

    #[test]
    fn interrupted_import_retry_reuses_uncommitted_generation() {
        let root = tempdir().unwrap();
        remember_library_directory(root.path()).unwrap();
        let source = root.path().join("retry.mp3");
        fs::write(&source, b"resume the same pending import").unwrap();
        let source_path = source.to_string_lossy().to_string();
        let first_id = publication_id_for_import(&source_path, &source).unwrap();

        let staged = stage_local_file(root.path(), &first_id, &source).unwrap();
        let retry_after_staging = publication_id_for_import(&source_path, &source).unwrap();
        assert_eq!(retry_after_staging, first_id);

        let object = finalize_object(root.path(), &staged).unwrap();
        let track = Track {
            kind: crate::library::MediaKind::Audio,
            id: format!("offline:{}", object.whole_sha256),
            path: root
                .path()
                .join(&object.relative_path)
                .to_string_lossy()
                .to_string(),
            title: "retry fixture".into(),
            artist: Some("tester".into()),
            album: None,
            duration: Some(2.0),
            missing: false,
            source_kind: "user".into(),
            storage_kind: "managed".into(),
            source_path: Some(source_path.clone()),
            content_hash: Some(object.whole_sha256.clone()),
            favorite: false,
            play_count: 0,
            last_played_at: None,
        };
        let prepared = prepare_publication(root.path(), object, track).unwrap();
        assert!(prepared.commit_receipt.is_none());

        let retry_after_prepare = publication_id_for_import(&source_path, &source).unwrap();
        assert_eq!(retry_after_prepare, first_id);
        assert!(load_publication(root.path(), &first_id)
            .unwrap()
            .is_some_and(|loaded| loaded.commit_receipt.is_none()));
    }

    #[test]
    fn torn_journal_tail_is_hidden_then_same_commit_retry_is_idempotent() {
        let root = tempdir().unwrap();
        let publication_id = Uuid::new_v4().to_string();
        let bytes = b"prepared media";
        let manifest = fixture_manifest(&publication_id, bytes);
        let stage_dir = stage_directory(root.path(), &publication_id);
        fs::create_dir_all(&stage_dir).unwrap();
        write_manifest(&stage_dir, &manifest).unwrap();
        put_chunk(root.path(), &publication_id, 0, bytes, &sha256(bytes)).unwrap();
        let staged = StagedMediaV1 {
            manifest: manifest.clone(),
            manifest_digest: manifest_payload_digest(&manifest).unwrap(),
        };
        let object = finalize_object(root.path(), &staged).unwrap();
        let track = Track {
            kind: crate::library::MediaKind::Audio,
            id: format!("offline:{}", object.whole_sha256),
            path: String::new(),
            title: "fixture".into(),
            artist: None,
            album: None,
            duration: None,
            missing: false,
            source_kind: "user".into(),
            storage_kind: "managed".into(),
            source_path: Some("fixture.mp3".into()),
            content_hash: Some(object.whole_sha256.clone()),
            favorite: false,
            play_count: 0,
            last_played_at: None,
        };
        let prepared = prepare_publication(root.path(), object, track.clone()).unwrap();
        let journal = journal_path(root.path(), &publication_id);
        let mut append = OpenOptions::new().append(true).open(&journal).unwrap();
        append.write_all(b"{\"version\":1,\"sequence\":2").unwrap();
        append.sync_all().unwrap();
        drop(append);
        assert!(load_publication(root.path(), &publication_id)
            .unwrap()
            .unwrap()
            .commit_receipt
            .is_none());
        let receipt = commit_receipt(root.path(), &prepared).unwrap();
        assert_eq!(commit_receipt(root.path(), &prepared).unwrap(), receipt);
        let loaded = load_publication(root.path(), &publication_id)
            .unwrap()
            .unwrap();
        assert_eq!(loaded.track.id, track.id);
        assert_eq!(loaded.commit_receipt, Some(receipt));
    }

    #[test]
    fn manifest_digest_and_safe_names_are_required() {
        let root = tempdir().unwrap();
        let empty = root.path().join("empty.mp3");
        fs::write(&empty, []).unwrap();
        assert!(stage_local_file(root.path(), &Uuid::new_v4().to_string(), &empty).is_err());
        assert!(validate_publication_id("../escape").is_err());
        assert!(!valid_extension("../mp3"));
        let mut invalid = fixture_manifest("valid-id", b"x");
        invalid.total_bytes += 1;
        assert!(validate_manifest(&invalid).is_err());
    }

    #[test]
    fn staging_manifest_must_live_under_its_hashed_publication_directory() {
        let root = tempdir().unwrap();
        let stage_dir = staging_root(root.path()).join(safe_id("directory-id"));
        fs::create_dir_all(&stage_dir).unwrap();
        let manifest = fixture_manifest("different-id", b"media");
        write_manifest(&stage_dir, &manifest).unwrap();

        assert_eq!(
            publication_ids(root.path()).unwrap_err(),
            "STAGING_MANIFEST_PATH_IDENTITY_MISMATCH"
        );
    }

    #[test]
    fn finalized_object_receipt_requires_the_canonical_content_addressed_path() {
        let root = tempdir().unwrap();
        let publication_id = Uuid::new_v4().to_string();
        let bytes = b"canonical object bytes";
        let manifest = fixture_manifest(&publication_id, bytes);
        let stage_dir = stage_directory(root.path(), &publication_id);
        fs::create_dir_all(&stage_dir).unwrap();
        write_manifest(&stage_dir, &manifest).unwrap();
        put_chunk(root.path(), &publication_id, 0, bytes, &sha256(bytes)).unwrap();
        let staged = StagedMediaV1 {
            manifest: manifest.clone(),
            manifest_digest: manifest_payload_digest(&manifest).unwrap(),
        };
        let mut receipt = finalize_object(root.path(), &staged).unwrap();
        receipt.relative_path = format!("media/other/{}.mp3", receipt.whole_sha256);
        let payload = ObjectReceiptPayloadV1 {
            version: receipt.version,
            publication_id: receipt.publication_id.clone(),
            object_key: receipt.object_key.clone(),
            relative_path: receipt.relative_path.clone(),
            whole_sha256: receipt.whole_sha256.clone(),
            byte_length: receipt.byte_length,
            manifest_digest: receipt.manifest_digest.clone(),
        };
        receipt.receipt_digest = digest_serializable(&payload).unwrap();

        assert_eq!(
            validate_object_receipt(&receipt).unwrap_err(),
            "FINALIZED_OBJECT_RECEIPT_INVALID"
        );
    }
}
