use crate::library::{self, Library, LibraryState, MediaKind, Track};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const MAX_MIGRATION_BYTES: usize = 16 * 1024 * 1024;
const MAX_JOURNAL_BYTES: u64 = 72 * 1024 * 1024;
const MAX_HISTORY: usize = 1_000;
const FORMAT: &str = "lalin-play-migration";
const FREQUENCIES: [u32; 10] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum TransactionAction {
    #[default]
    Import,
    Undo,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RepeatMode {
    Off,
    One,
    All,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MigrationEntry {
    pub entry_id: String,
    pub local_path: String,
    pub title: Option<String>,
    pub kind: Option<MediaKind>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MigrationQueue {
    pub items: Vec<MigrationEntry>,
    pub current_entry_id: Option<String>,
    pub repeat_mode: RepeatMode,
    pub shuffle: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MigrationBand {
    pub frequency: u32,
    pub gain: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MigrationPreset {
    pub name: String,
    pub preamp: f64,
    pub gains: Vec<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MigrationEq {
    pub enabled: bool,
    pub preamp: f64,
    pub bands: Vec<MigrationBand>,
    pub current_preset: String,
    pub custom_presets: Vec<MigrationPreset>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnresolvedItem {
    pub entry_id: String,
    pub display_label: String,
    pub reason: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MigrationEnvelope {
    pub format: String,
    pub schema_version: u32,
    pub export_id: String,
    pub created_at: String,
    pub source_app: String,
    pub source_version: String,
    pub source_commit: Option<String>,
    pub queue: MigrationQueue,
    pub eq: MigrationEq,
    pub unresolved: Vec<UnresolvedItem>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlannedQueueItem {
    pub entry_id: String,
    pub track: Track,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueuePlan {
    pub items: Vec<PlannedQueueItem>,
    pub current_entry_id: Option<String>,
    pub repeat_mode: RepeatMode,
    pub shuffle: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MigrationPreview {
    pub export_id: String,
    pub plan: QueuePlan,
    pub eq: MigrationEq,
    pub unresolved: Vec<UnresolvedItem>,
    pub already_imported: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transaction_id: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Phase {
    Prepared,
    Applied,
    Committed,
    Acknowledged,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    version: u32,
    transaction_id: String,
    export_id: String,
    #[serde(default)]
    action: TransactionAction,
    phase: Phase,
    ready_to_ack: bool,
    old_library: Library,
    new_library: Library,
    old_queue_raw: Option<String>,
    old_eq_raw: Option<String>,
    old_resume_raw: Option<String>,
    #[serde(default)]
    restore_raw_storage: bool,
    #[serde(default)]
    new_queue_raw: Option<String>,
    #[serde(default)]
    new_eq_raw: Option<String>,
    #[serde(default)]
    new_resume_raw: Option<String>,
    #[serde(default)]
    undo_source_transaction_id: Option<String>,
    plan: QueuePlan,
    eq: MigrationEq,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UndoSnapshot {
    version: u32,
    transaction_id: String,
    export_id: String,
    old_library: Library,
    new_library: Library,
    old_queue_raw: Option<String>,
    old_eq_raw: Option<String>,
    old_resume_raw: Option<String>,
    plan: QueuePlan,
    eq: MigrationEq,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImportHistory {
    version: u32,
    export_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationRecovery {
    pub transaction_id: String,
    pub committed: bool,
    pub old_queue_raw: Option<String>,
    pub old_eq_raw: Option<String>,
    pub old_resume_raw: Option<String>,
    pub restore_raw_storage: bool,
    pub new_queue_raw: Option<String>,
    pub new_eq_raw: Option<String>,
    pub new_resume_raw: Option<String>,
    pub plan: QueuePlan,
    pub eq: MigrationEq,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoStatus {
    pub available: bool,
    pub reason: Option<String>,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory)
}

fn journal_path(directory: &Path) -> PathBuf {
    directory.join("play-migration-journal-v1.json")
}

fn history_path(directory: &Path) -> PathBuf {
    directory.join("play-migration-history-v1.json")
}

fn undo_snapshot_path(directory: &Path) -> PathBuf {
    directory.join("play-migration-undo-v1.json")
}

fn library_file_path(directory: &Path) -> PathBuf {
    directory.join("library-v1.json")
}

fn save_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, bytes).map_err(|_| "บันทึกไฟล์ recovery ไม่สำเร็จ".to_string())?;
    fs::rename(&temporary, path).map_err(|_| "แทนที่ไฟล์ recovery ไม่สำเร็จ".to_string())
}

fn save_journal(directory: &Path, journal: &Journal) -> Result<(), String> {
    let bytes = serde_json::to_vec(journal).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_JOURNAL_BYTES {
        return Err("migration recovery journal exceeds the supported size".into());
    }
    save_json(&journal_path(directory), journal)
}

fn mark_journal_committed(directory: &Path, journal: &mut Journal) -> Result<(), String> {
    if journal.phase != Phase::Applied {
        return Err("migration transaction is not applied".into());
    }
    journal.phase = Phase::Committed;
    if let Err(error) = save_journal(directory, journal) {
        journal.phase = Phase::Applied;
        return Err(error);
    }
    Ok(())
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path, max_bytes: u64) -> Result<T, String> {
    let metadata = fs::metadata(path).map_err(|_| "อ่านไฟล์ recovery ไม่สำเร็จ".to_string())?;
    if metadata.len() > max_bytes {
        return Err("ไฟล์ recovery มีขนาดเกินขอบเขตที่รองรับ".into());
    }
    let bytes = fs::read(path).map_err(|_| "อ่านไฟล์ recovery ไม่สำเร็จ".to_string())?;
    serde_json::from_slice(&bytes).map_err(|_| "ข้อมูล recovery เสียหาย; เก็บไฟล์ไว้โดยไม่เขียนทับ".into())
}

fn load_journal(directory: &Path) -> Result<Option<Journal>, String> {
    let path = journal_path(directory);
    if !path.exists() {
        return Ok(None);
    }
    let journal: Journal = read_json(&path, MAX_JOURNAL_BYTES)?;
    if journal.version != 1 || !is_uuid(&journal.transaction_id) || !is_uuid(&journal.export_id) {
        return Err("เวอร์ชันหรือ ID ใน recovery journal ไม่รองรับ".into());
    }
    Ok(Some(journal))
}

fn load_history(directory: &Path) -> Result<ImportHistory, String> {
    let path = history_path(directory);
    if !path.exists() {
        return Ok(ImportHistory {
            version: 1,
            export_ids: Vec::new(),
        });
    }
    let history: ImportHistory = read_json(&path, 1024 * 1024)?;
    if history.version != 1
        || history.export_ids.len() > MAX_HISTORY
        || !history.export_ids.iter().all(|id| is_uuid(id))
    {
        return Err("เวอร์ชันหรือข้อมูล migration history ไม่รองรับ".into());
    }
    Ok(history)
}

fn load_undo_snapshot(directory: &Path) -> Result<Option<UndoSnapshot>, String> {
    let path = undo_snapshot_path(directory);
    if !path.exists() {
        return Ok(None);
    }
    let snapshot: UndoSnapshot = read_json(&path, MAX_JOURNAL_BYTES)?;
    if snapshot.version != 1
        || !is_uuid(&snapshot.transaction_id)
        || !is_uuid(&snapshot.export_id)
        || serde_json::to_vec(&snapshot.old_library)
            .map_err(|e| e.to_string())?
            .len()
            > MAX_MIGRATION_BYTES
        || serde_json::to_vec(&snapshot.new_library)
            .map_err(|e| e.to_string())?
            .len()
            > MAX_MIGRATION_BYTES
    {
        return Err("เวอร์ชันหรือข้อมูล undo snapshot ไม่รองรับ; เก็บไฟล์ไว้โดยไม่เขียนทับ".into());
    }
    Ok(Some(snapshot))
}

fn save_undo_snapshot(directory: &Path, journal: &Journal) -> Result<(), String> {
    let snapshot = UndoSnapshot {
        version: 1,
        transaction_id: journal.transaction_id.clone(),
        export_id: journal.export_id.clone(),
        old_library: journal.old_library.clone(),
        new_library: journal.new_library.clone(),
        old_queue_raw: journal.old_queue_raw.clone(),
        old_eq_raw: journal.old_eq_raw.clone(),
        old_resume_raw: journal.old_resume_raw.clone(),
        plan: journal.plan.clone(),
        eq: journal.eq.clone(),
    };
    let bytes = serde_json::to_vec(&snapshot).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_JOURNAL_BYTES {
        return Err("migration undo snapshot exceeds the supported size".into());
    }
    save_json(&undo_snapshot_path(directory), &snapshot)
}

fn record_import_commit(directory: &Path, journal: &Journal) -> Result<(), String> {
    if journal.action != TransactionAction::Import
        || (journal.phase != Phase::Committed && journal.phase != Phase::Acknowledged)
    {
        return Err("migration import is not committed".into());
    }
    save_undo_snapshot(directory, journal)?;
    let mut history = load_history(directory)?;
    if !history.export_ids.contains(&journal.export_id) {
        history.export_ids.push(journal.export_id.clone());
        if history.export_ids.len() > MAX_HISTORY {
            history.export_ids.remove(0);
        }
        save_json(&history_path(directory), &history)?;
    }
    Ok(())
}

fn remove_undo_snapshot_for(directory: &Path, transaction_id: &str) -> Result<(), String> {
    let Some(snapshot) = load_undo_snapshot(directory)? else {
        return Ok(());
    };
    if snapshot.transaction_id == transaction_id {
        fs::remove_file(undo_snapshot_path(directory))
            .map_err(|_| "ล้าง undo snapshot ไม่สำเร็จ; restart Lalin Play".to_string())?;
    }
    Ok(())
}

fn finalize_acknowledged_journal(directory: &Path, journal: &Journal) -> Result<(), String> {
    if journal.phase != Phase::Acknowledged {
        return Err("migration transaction is not acknowledged".into());
    }
    if journal.ready_to_ack {
        return Ok(());
    }
    match journal.action {
        TransactionAction::Import => record_import_commit(directory, journal),
        TransactionAction::Undo => {
            if let Some(source_id) = &journal.undo_source_transaction_id {
                remove_undo_snapshot_for(directory, source_id)?;
            }
            Ok(())
        }
    }
}

fn parse_envelope(raw_json: &str) -> Result<MigrationEnvelope, String> {
    if raw_json.as_bytes().len() > MAX_MIGRATION_BYTES {
        return Err("ไฟล์ migration มีขนาดเกิน 16 MiB".into());
    }
    let envelope: MigrationEnvelope = serde_json::from_str(raw_json)
        .map_err(|_| "รูปแบบ migration ไม่ถูกต้องหรือมี field ที่ไม่รองรับ".to_string())?;
    validate_envelope(&envelope)?;
    Ok(envelope)
}

fn apply_journal_to_library(
    directory: &Path,
    current: &mut Library,
    journal: &mut Journal,
) -> Result<(), String> {
    if journal.phase != Phase::Prepared {
        return Err("migration transaction is not prepared".into());
    }
    save_json(&library_file_path(directory), &journal.new_library)?;
    journal.phase = Phase::Applied;
    if let Err(error) = save_journal(directory, journal) {
        if save_json(&library_file_path(directory), &journal.old_library).is_ok() {
            *current = journal.old_library.clone();
        }
        return Err(error);
    }
    *current = journal.new_library.clone();
    Ok(())
}

fn restore_journal_library(
    directory: &Path,
    current: &mut Library,
    journal: &mut Journal,
    committed: bool,
) -> Result<(), String> {
    let target = if committed {
        journal.new_library.clone()
    } else {
        journal.old_library.clone()
    };
    save_json(&library_file_path(directory), &target)?;
    *current = target;
    journal.ready_to_ack = !committed;
    save_journal(directory, journal)
}

fn validate_envelope(envelope: &MigrationEnvelope) -> Result<(), String> {
    if envelope.format != FORMAT
        || envelope.schema_version != 1
        || !is_uuid(&envelope.export_id)
        || !valid_iso_timestamp(&envelope.created_at)
        || envelope.source_app != "lalin-studio"
        || !valid_text(&envelope.source_version, 128)
        || envelope
            .source_commit
            .as_ref()
            .is_some_and(|value| !valid_text(value, 128))
    {
        return Err("ข้อมูลหัวไฟล์ migration ไม่ถูกต้องหรือไม่รองรับ".into());
    }
    if envelope.queue.items.len() > library::MAX_TRACKS
        || envelope.unresolved.len() > library::MAX_TRACKS
        || envelope.queue.items.len() + envelope.unresolved.len() > library::MAX_TRACKS
    {
        return Err("จำนวนรายการ migration เกิน 10,000 รายการ".into());
    }
    let mut ids = HashSet::new();
    for entry in &envelope.queue.items {
        if !is_uuid(&entry.entry_id)
            || !ids.insert(entry.entry_id.as_str())
            || !valid_text(&entry.local_path, 32_768)
            || entry.local_path.contains('\0')
            || !is_local_import_path(&entry.local_path)
        {
            return Err("พบ queue entry ID หรือ local path ที่ไม่ถูกต้อง".into());
        }
        let input = Path::new(&entry.local_path);
        if !library::supported(input) {
            return Err("migration มีนามสกุลไฟล์ที่ Lalin Play ไม่รองรับ".into());
        }
        let expected = library::media_kind(input);
        if entry.kind.is_some_and(|kind| kind != expected)
            || entry
                .title
                .as_ref()
                .is_some_and(|title| !valid_text(title, 512))
        {
            return Err("ชนิดหรือชื่อสื่อใน migration ไม่ถูกต้อง".into());
        }
    }
    for item in &envelope.unresolved {
        if !is_uuid(&item.entry_id)
            || !ids.insert(item.entry_id.as_str())
            || !valid_text(&item.display_label, 512)
            || !valid_text(&item.reason, 256)
        {
            return Err("พบรายการ unresolved ที่ไม่ถูกต้องหรือ entry ID ซ้ำ".into());
        }
    }
    if envelope
        .queue
        .current_entry_id
        .as_ref()
        .is_some_and(|id| !ids.contains(id.as_str()))
    {
        return Err("รายการปัจจุบันไม่มีอยู่ใน migration".into());
    }
    validate_eq(&envelope.eq)
}

fn validate_eq(eq: &MigrationEq) -> Result<(), String> {
    if !valid_gain(eq.preamp)
        || !valid_text(&eq.current_preset, 120)
        || eq.bands.len() != FREQUENCIES.len()
        || eq.custom_presets.len() > 100
    {
        return Err("ข้อมูล EQ ใน migration ไม่ถูกต้อง".into());
    }
    for (index, band) in eq.bands.iter().enumerate() {
        if band.frequency != FREQUENCIES[index] || !valid_gain(band.gain) {
            return Err("จำนวน ลำดับ หรือค่า gain ของ EQ ไม่ถูกต้อง".into());
        }
    }
    let mut names = HashSet::new();
    for preset in &eq.custom_presets {
        if !valid_text(&preset.name, 120)
            || preset.name.trim().is_empty()
            || !names.insert(preset.name.as_str())
            || !valid_gain(preset.preamp)
            || preset.gains.len() != FREQUENCIES.len()
            || !preset.gains.iter().all(|gain| valid_gain(*gain))
        {
            return Err("มี custom EQ preset ที่ไม่ถูกต้องหรือชื่อซ้ำ".into());
        }
    }
    Ok(())
}

fn build_preview(
    envelope: &MigrationEnvelope,
    existing: &Library,
    already_imported: bool,
) -> Result<(MigrationPreview, Library), String> {
    let mut unresolved = envelope.unresolved.clone();
    let mut items = Vec::new();
    let mut new_library = existing.clone();
    for entry in &envelope.queue.items {
        let input_path = Path::new(&entry.local_path);
        let canonical = match fs::canonicalize(input_path) {
            Ok(path) => path,
            Err(_) => {
                unresolved.push(UnresolvedItem {
                    entry_id: entry.entry_id.clone(),
                    display_label: entry
                        .title
                        .clone()
                        .unwrap_or_else(|| file_label(input_path)),
                    reason: "Local file is missing or unavailable".into(),
                });
                continue;
            }
        };
        if !is_local_absolute(&canonical) {
            return Err("migration path resolves outside local storage".into());
        }
        let metadata = fs::metadata(&canonical)
            .map_err(|_| "local media metadata is unavailable".to_string())?;
        if !metadata.is_file() || !library::supported(&canonical) {
            unresolved.push(UnresolvedItem {
                entry_id: entry.entry_id.clone(),
                display_label: entry
                    .title
                    .clone()
                    .unwrap_or_else(|| file_label(&canonical)),
                reason: "Local path is not a supported regular media file".into(),
            });
            continue;
        }
        let canonical_text = canonical.to_string_lossy().into_owned();
        let mut track = new_library
            .tracks
            .iter()
            .find(|item| item.id == canonical_text || item.path == canonical_text)
            .cloned()
            .unwrap_or_else(|| library::track(&canonical));
        track.id = canonical_text.clone();
        track.path = canonical_text;
        track.kind = library::media_kind(&canonical);
        track.missing = false;
        if let Some(title) = &entry.title {
            track.title = title.clone();
        }
        if !new_library
            .tracks
            .iter()
            .any(|item| item.id == track.id || item.path == track.path)
        {
            new_library.tracks.push(track.clone());
        }
        items.push(PlannedQueueItem {
            entry_id: entry.entry_id.clone(),
            track,
        });
    }
    if new_library.tracks.len() > library::MAX_TRACKS {
        return Err("คลังรองรับไม่เกิน 10,000 ไฟล์ในรุ่นนี้".into());
    }
    if serde_json::to_vec(&new_library)
        .map_err(|e| e.to_string())?
        .len()
        > MAX_MIGRATION_BYTES
    {
        return Err("คลังหลัง migration มีขนาดเกิน 16 MiB".into());
    }
    let preview = MigrationPreview {
        export_id: envelope.export_id.clone(),
        plan: QueuePlan {
            items,
            current_entry_id: envelope.queue.current_entry_id.clone(),
            repeat_mode: envelope.queue.repeat_mode,
            shuffle: envelope.queue.shuffle,
        },
        eq: envelope.eq.clone(),
        unresolved,
        already_imported,
        transaction_id: None,
    };
    Ok((preview, new_library))
}

fn file_label(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Local media")
        .chars()
        .take(512)
        .collect()
}

fn library_matches_snapshot(current: &Library, expected: &Library) -> Result<bool, String> {
    Ok(serde_json::to_value(current).map_err(|e| e.to_string())?
        == serde_json::to_value(expected).map_err(|e| e.to_string())?)
}

fn undo_journal(
    snapshot: &UndoSnapshot,
    current: &Library,
    transaction_id: String,
    old_queue_raw: Option<String>,
    old_eq_raw: Option<String>,
    old_resume_raw: Option<String>,
) -> Journal {
    Journal {
        version: 1,
        transaction_id,
        export_id: snapshot.export_id.clone(),
        action: TransactionAction::Undo,
        phase: Phase::Prepared,
        ready_to_ack: false,
        old_library: current.clone(),
        new_library: snapshot.old_library.clone(),
        old_queue_raw,
        old_eq_raw,
        old_resume_raw,
        restore_raw_storage: true,
        new_queue_raw: snapshot.old_queue_raw.clone(),
        new_eq_raw: snapshot.old_eq_raw.clone(),
        new_resume_raw: snapshot.old_resume_raw.clone(),
        undo_source_transaction_id: Some(snapshot.transaction_id.clone()),
        plan: snapshot.plan.clone(),
        eq: snapshot.eq.clone(),
    }
}

#[tauri::command]
pub fn get_play_migration_undo_status(
    app: AppHandle,
    state: tauri::State<'_, LibraryState>,
) -> Result<UndoStatus, String> {
    let directory = data_dir(&app)?;
    if let Some(journal) = load_journal(&directory)? {
        if journal.phase == Phase::Acknowledged {
            finalize_acknowledged_journal(&directory, &journal)?;
            fs::remove_file(journal_path(&directory)).map_err(|_| {
                "ล้าง migration recovery journal ไม่สำเร็จ; restart Lalin Play".to_string()
            })?;
        } else {
            return Ok(UndoStatus {
                available: false,
                reason: Some("กำลังกู้คืน migration ที่ค้างอยู่; restart Lalin Play ก่อน".into()),
            });
        }
    }
    let Some(snapshot) = load_undo_snapshot(&directory)? else {
        return Ok(UndoStatus {
            available: false,
            reason: None,
        });
    };
    let current = state.0.lock().map_err(|e| e.to_string())?;
    if !library_matches_snapshot(&current, &snapshot.new_library)? {
        return Ok(UndoStatus {
            available: false,
            reason: Some("คลังเปลี่ยนหลัง migration จึงปิดการย้อนกลับเพื่อรักษาการแก้ไขล่าสุด".into()),
        });
    }
    Ok(UndoStatus {
        available: true,
        reason: None,
    })
}

#[tauri::command]
pub fn prepare_undo_play_migration(
    app: AppHandle,
    state: tauri::State<'_, LibraryState>,
    transaction_id: String,
    old_queue_raw: Option<String>,
    old_eq_raw: Option<String>,
    old_resume_raw: Option<String>,
) -> Result<MigrationRecovery, String> {
    if !is_uuid(&transaction_id) {
        return Err("transaction ID ไม่ถูกต้อง".into());
    }
    if old_queue_raw
        .as_ref()
        .is_some_and(|value| value.len() > MAX_MIGRATION_BYTES)
        || old_eq_raw
            .as_ref()
            .is_some_and(|value| value.len() > 1024 * 1024)
        || old_resume_raw
            .as_ref()
            .is_some_and(|value| value.len() > 64)
    {
        return Err("ข้อมูลเดิมเกินขนาด recovery ที่รองรับ".into());
    }
    let directory = data_dir(&app)?;
    match load_journal(&directory)? {
        Some(journal) if journal.phase == Phase::Acknowledged => {
            finalize_acknowledged_journal(&directory, &journal)?;
            fs::remove_file(journal_path(&directory)).map_err(|_| {
                "ล้าง migration recovery journal ไม่สำเร็จ; restart Lalin Play".to_string()
            })?;
        }
        Some(_) => {
            return Err("มี migration recovery ค้างอยู่ กรุณา restart Lalin Play ก่อนย้อนกลับ".into())
        }
        None => {}
    }
    let snapshot = load_undo_snapshot(&directory)?.ok_or("ไม่มี migration ล่าสุดที่ย้อนกลับได้")?;
    let current = state.0.lock().map_err(|e| e.to_string())?;
    if !library_matches_snapshot(&current, &snapshot.new_library)? {
        return Err("คลังเปลี่ยนหลัง migration จึงไม่ย้อนกลับเพื่อรักษาการแก้ไขล่าสุด".into());
    }
    let journal = undo_journal(
        &snapshot,
        &current,
        transaction_id,
        old_queue_raw,
        old_eq_raw,
        old_resume_raw,
    );
    save_journal(&directory, &journal)?;
    Ok(recovery_from(journal, false))
}

#[tauri::command]
pub fn preview_play_migration(
    app: AppHandle,
    state: tauri::State<'_, LibraryState>,
    raw_json: String,
) -> Result<MigrationPreview, String> {
    let envelope = parse_envelope(&raw_json)?;
    let directory = data_dir(&app)?;
    let history = load_history(&directory)?;
    let existing = state.0.lock().map_err(|e| e.to_string())?.clone();
    build_preview(
        &envelope,
        &existing,
        history.export_ids.contains(&envelope.export_id),
    )
    .map(|(preview, _)| preview)
}

#[tauri::command]
pub fn prepare_play_migration(
    app: AppHandle,
    state: tauri::State<'_, LibraryState>,
    raw_json: String,
    transaction_id: String,
    old_queue_raw: Option<String>,
    old_eq_raw: Option<String>,
    old_resume_raw: Option<String>,
    allow_repeat: bool,
) -> Result<MigrationPreview, String> {
    if !is_uuid(&transaction_id) {
        return Err("transaction ID ไม่ถูกต้อง".into());
    }
    if old_queue_raw
        .as_ref()
        .is_some_and(|value| value.len() > MAX_MIGRATION_BYTES)
        || old_eq_raw
            .as_ref()
            .is_some_and(|value| value.len() > 1024 * 1024)
        || old_resume_raw
            .as_ref()
            .is_some_and(|value| value.len() > 64)
    {
        return Err("ข้อมูลเดิมเกินขนาด recovery ที่รองรับ".into());
    }
    let envelope = parse_envelope(&raw_json)?;
    let directory = data_dir(&app)?;
    let state_guard = state.0.lock().map_err(|e| e.to_string())?;
    let history = load_history(&directory)?;
    let already_imported = history.export_ids.contains(&envelope.export_id);
    if already_imported && !allow_repeat {
        return Err("export นี้เคยนำเข้าแล้ว กรุณายืนยันการนำเข้าซ้ำใน preview".into());
    }
    let (mut preview, new_library) = build_preview(&envelope, &state_guard, already_imported)?;
    match load_journal(&directory)? {
        Some(journal) if journal.phase == Phase::Acknowledged => {
            finalize_acknowledged_journal(&directory, &journal)?;
            fs::remove_file(journal_path(&directory))
                .map_err(|_| "ล้าง migration recovery journal ไม่สำเร็จ; restart Play".to_string())?;
        }
        Some(journal) if journal.phase == Phase::Committed => {
            return Err(
                "มี migration ที่ commit แล้วรอการยืนยัน recovery; restart Lalin Play ก่อนนำเข้าอีกครั้ง"
                    .into(),
            )
        }
        Some(_) => {
            return Err("มี migration recovery ค้างอยู่ กรุณา restart Lalin Play ก่อนนำเข้าอีกครั้ง".into())
        }
        None => {}
    }
    let old_library = state_guard.clone();
    let journal = Journal {
        version: 1,
        transaction_id: transaction_id.clone(),
        export_id: envelope.export_id.clone(),
        action: TransactionAction::Import,
        phase: Phase::Prepared,
        ready_to_ack: false,
        old_library,
        new_library,
        old_queue_raw,
        old_eq_raw,
        old_resume_raw,
        restore_raw_storage: false,
        new_queue_raw: None,
        new_eq_raw: None,
        new_resume_raw: None,
        undo_source_transaction_id: None,
        plan: preview.plan.clone(),
        eq: preview.eq.clone(),
    };
    save_journal(&directory, &journal)?;
    preview.transaction_id = Some(transaction_id);
    Ok(preview)
}

#[tauri::command]
pub fn apply_play_migration(
    app: AppHandle,
    state: tauri::State<'_, LibraryState>,
    transaction_id: String,
) -> Result<(), String> {
    let directory = data_dir(&app)?;
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    let mut journal = journal_for_transaction(&directory, &transaction_id)?;
    apply_journal_to_library(&directory, &mut current, &mut journal)
}

#[tauri::command]
pub fn commit_play_migration(app: AppHandle, transaction_id: String) -> Result<(), String> {
    let directory = data_dir(&app)?;
    let mut journal = journal_for_transaction(&directory, &transaction_id)?;
    mark_journal_committed(&directory, &mut journal)?;
    match journal.action {
        TransactionAction::Import => record_import_commit(&directory, &journal)?,
        TransactionAction::Undo => {}
    }
    Ok(())
}

#[tauri::command]
pub fn rollback_play_migration(
    app: AppHandle,
    state: tauri::State<'_, LibraryState>,
    transaction_id: String,
) -> Result<MigrationRecovery, String> {
    let directory = data_dir(&app)?;
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    let mut journal = journal_for_transaction(&directory, &transaction_id)?;
    if journal.phase == Phase::Committed {
        return Err("committed migration cannot be rolled back".into());
    }
    restore_journal_library(&directory, &mut current, &mut journal, false)?;
    Ok(recovery_from(journal, false))
}

#[tauri::command]
pub fn recover_play_migration(
    app: AppHandle,
    state: tauri::State<'_, LibraryState>,
) -> Result<Option<MigrationRecovery>, String> {
    let directory = data_dir(&app)?;
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    let Some(mut journal) = load_journal(&directory)? else {
        return Ok(None);
    };
    if journal.phase == Phase::Acknowledged {
        finalize_acknowledged_journal(&directory, &journal)?;
        fs::remove_file(journal_path(&directory))
            .map_err(|_| "ล้าง migration recovery journal ไม่สำเร็จ; restart Play".to_string())?;
        return Ok(None);
    }
    let committed = journal.phase == Phase::Committed;
    restore_journal_library(&directory, &mut current, &mut journal, committed)?;
    if committed && journal.action == TransactionAction::Import {
        record_import_commit(&directory, &journal)?;
    }
    Ok(Some(recovery_from(journal, committed)))
}

#[tauri::command]
pub fn ack_play_migration(app: AppHandle, transaction_id: String) -> Result<(), String> {
    let directory = data_dir(&app)?;
    let mut journal = journal_for_transaction(&directory, &transaction_id)?;
    if journal.phase != Phase::Committed && !journal.ready_to_ack {
        return Err("migration recovery has not been applied".into());
    }
    if journal.phase == Phase::Committed {
        match journal.action {
            TransactionAction::Import => record_import_commit(&directory, &journal)?,
            TransactionAction::Undo => {
                if let Some(source_id) = &journal.undo_source_transaction_id {
                    remove_undo_snapshot_for(&directory, source_id)?;
                }
            }
        }
    }
    journal.ready_to_ack = journal.phase != Phase::Committed;
    journal.phase = Phase::Acknowledged;
    save_journal(&directory, &journal)?;
    finalize_acknowledged_journal(&directory, &journal)?;
    fs::remove_file(journal_path(&directory))
        .map_err(|_| "ล้าง migration recovery journal ไม่สำเร็จ; restart Play".to_string())?;
    Ok(())
}

fn recovery_from(journal: Journal, committed: bool) -> MigrationRecovery {
    MigrationRecovery {
        transaction_id: journal.transaction_id,
        committed,
        old_queue_raw: journal.old_queue_raw,
        old_eq_raw: journal.old_eq_raw,
        old_resume_raw: journal.old_resume_raw,
        restore_raw_storage: journal.restore_raw_storage,
        new_queue_raw: journal.new_queue_raw,
        new_eq_raw: journal.new_eq_raw,
        new_resume_raw: journal.new_resume_raw,
        plan: journal.plan,
        eq: journal.eq,
    }
}

fn journal_for_transaction(directory: &Path, transaction_id: &str) -> Result<Journal, String> {
    let journal = load_journal(directory)?.ok_or("migration recovery journal not found")?;
    if journal.transaction_id != transaction_id {
        return Err("migration transaction ID does not match recovery journal".into());
    }
    Ok(journal)
}

pub fn ensure_no_active_journal(app: &AppHandle) -> Result<(), String> {
    let directory = data_dir(app)?;
    if let Some(journal) = load_journal(&directory)? {
        if journal.phase == Phase::Acknowledged {
            finalize_acknowledged_journal(&directory, &journal)?;
            fs::remove_file(journal_path(&directory)).map_err(|_| {
                "ล้าง migration recovery journal ไม่สำเร็จ; restart Lalin Play".to_string()
            })?;
            return Ok(());
        }
        return Err("Play migration recovery is pending; finish recovery or restart Play before changing the library".into());
    }
    Ok(())
}

fn restore_library_before_ui_from_directory(directory: &Path) -> Result<(), String> {
    let Some(mut journal) = load_journal(&directory)? else {
        return Ok(());
    };
    if journal.phase == Phase::Acknowledged {
        finalize_acknowledged_journal(directory, &journal)?;
        fs::remove_file(journal_path(directory)).map_err(|_| {
            "ล้าง migration recovery journal ไม่สำเร็จ; restart Lalin Play".to_string()
        })?;
        return Ok(());
    }
    let target = if journal.phase == Phase::Committed {
        journal.new_library.clone()
    } else {
        journal.old_library.clone()
    };
    save_json(&library_file_path(&directory), &target)?;
    if journal.phase != Phase::Committed {
        journal.ready_to_ack = true;
        save_journal(&directory, &journal)?;
    } else if journal.action == TransactionAction::Import {
        record_import_commit(directory, &journal)?;
    }
    Ok(())
}

pub fn restore_library_before_ui(app: &AppHandle) -> Result<(), String> {
    let directory = data_dir(app)?;
    restore_library_before_ui_from_directory(&directory)
}

fn is_local_absolute(path: &Path) -> bool {
    #[cfg(windows)]
    {
        if !path.is_absolute() {
            return false;
        }
        let Some(root) = local_windows_drive_root(&path.to_string_lossy()) else {
            return false;
        };
        let wide = root.encode_utf16().chain([0]).collect::<Vec<_>>();
        let drive_type =
            unsafe { windows_sys::Win32::Storage::FileSystem::GetDriveTypeW(wide.as_ptr()) };
        is_local_windows_drive_type(drive_type)
    }
    #[cfg(not(windows))]
    {
        path.is_absolute() && !path.as_os_str().to_string_lossy().starts_with("//")
    }
}

#[cfg(any(windows, test))]
fn local_windows_drive_root(value: &str) -> Option<String> {
    let normalized = value.replace('/', "\\");
    let path = normalized.strip_prefix("\\\\?\\").unwrap_or(&normalized);
    let bytes = path.as_bytes();
    (bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'\\')
        .then(|| path[..3].to_string())
}

// Win32 GetDriveTypeW return values; only local media drive kinds are accepted.
#[cfg(test)]
const DRIVE_UNKNOWN: u32 = 0;
#[cfg(test)]
const DRIVE_NO_ROOT_DIR: u32 = 1;
#[cfg(any(windows, test))]
const DRIVE_REMOVABLE: u32 = 2;
#[cfg(any(windows, test))]
const DRIVE_FIXED: u32 = 3;
#[cfg(test)]
const DRIVE_REMOTE: u32 = 4;
#[cfg(any(windows, test))]
const DRIVE_CDROM: u32 = 5;
#[cfg(any(windows, test))]
const DRIVE_RAMDISK: u32 = 6;

#[cfg(any(windows, test))]
fn is_local_windows_drive_type(drive_type: u32) -> bool {
    matches!(
        drive_type,
        DRIVE_REMOVABLE | DRIVE_FIXED | DRIVE_CDROM | DRIVE_RAMDISK
    )
}

fn is_local_import_path(value: &str) -> bool {
    if value.starts_with("\\\\") || value.starts_with("//") {
        return false;
    }
    is_local_absolute(Path::new(value))
}

fn valid_text(value: &str, max_chars: usize) -> bool {
    !value.is_empty() && value.chars().count() <= max_chars && !value.contains('\0')
}

fn valid_gain(value: f64) -> bool {
    value.is_finite() && (-12.0..=12.0).contains(&value)
}

fn is_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && [8, 13, 18, 23].iter().all(|index| bytes[*index] == b'-')
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| [8, 13, 18, 23].contains(&index) || byte.is_ascii_hexdigit())
        && matches!(bytes[14], b'1'..=b'5')
        && matches!(bytes[19].to_ascii_lowercase(), b'8'..=b'b')
}

fn valid_iso_timestamp(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 24
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'.'
        || bytes[23] != b'Z'
    {
        return false;
    }
    if !bytes
        .iter()
        .enumerate()
        .all(|(index, byte)| [4, 7, 10, 13, 16, 19, 23].contains(&index) || byte.is_ascii_digit())
    {
        return false;
    }
    let number = |range: std::ops::Range<usize>| value[range].parse::<u32>().ok();
    let (Some(year), Some(month), Some(day), Some(hour), Some(minute), Some(second)) = (
        number(0..4),
        number(5..7),
        number(8..10),
        number(11..13),
        number(14..16),
        number(17..19),
    ) else {
        return false;
    };
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => 0,
    };
    day >= 1 && day <= days && hour < 24 && minute < 60 && second < 60
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn fixture_envelope(path: &Path) -> MigrationEnvelope {
        let path_text = path.to_string_lossy().into_owned();
        MigrationEnvelope {
            format: FORMAT.into(),
            schema_version: 1,
            export_id: "00000000-0000-4000-8000-000000000001".into(),
            created_at: "2026-09-25T10:00:00.000Z".into(),
            source_app: "lalin-studio".into(),
            source_version: "0.1.1".into(),
            source_commit: None,
            queue: MigrationQueue {
                items: vec![
                    MigrationEntry {
                        entry_id: "00000000-0000-4000-8000-000000000002".into(),
                        local_path: path_text.clone(),
                        title: Some("one".into()),
                        kind: Some(MediaKind::Audio),
                    },
                    MigrationEntry {
                        entry_id: "00000000-0000-4000-8000-000000000003".into(),
                        local_path: path_text,
                        title: Some("one again".into()),
                        kind: Some(MediaKind::Audio),
                    },
                ],
                current_entry_id: Some("00000000-0000-4000-8000-000000000003".into()),
                repeat_mode: RepeatMode::All,
                shuffle: true,
            },
            eq: MigrationEq {
                enabled: true,
                preamp: -2.0,
                bands: FREQUENCIES
                    .iter()
                    .map(|frequency| MigrationBand {
                        frequency: *frequency,
                        gain: 0.0,
                    })
                    .collect(),
                current_preset: "Warm".into(),
                custom_presets: vec![MigrationPreset {
                    name: "Warm".into(),
                    preamp: -1.0,
                    gains: vec![1.0; 10],
                }],
            },
            unresolved: Vec::new(),
        }
    }

    #[test]
    fn validates_bounds_and_rejects_ambiguous_envelopes() {
        let directory = tempfile::tempdir().unwrap();
        let media = directory.path().join("one.wav");
        fs::File::create(&media)
            .unwrap()
            .write_all(b"fixture")
            .unwrap();
        let valid = fixture_envelope(&media);
        validate_envelope(&valid).unwrap();

        let mut duplicate = valid.clone();
        duplicate.queue.items[1].entry_id = duplicate.queue.items[0].entry_id.clone();
        assert!(validate_envelope(&duplicate).is_err());

        let mut bad_eq = valid.clone();
        bad_eq.eq.bands[0].gain = f64::NAN;
        assert!(validate_envelope(&bad_eq).is_err());

        let mut unsupported = valid;
        unsupported.queue.items[0].local_path = "https://example.test/one.wav".into();
        assert!(validate_envelope(&unsupported).is_err());
    }

    #[test]
    fn preview_keeps_duplicate_order_and_lists_missing_media_without_writes() {
        let directory = tempfile::tempdir().unwrap();
        let media = directory.path().join("one.wav");
        fs::File::create(&media)
            .unwrap()
            .write_all(b"fixture")
            .unwrap();
        let mut envelope = fixture_envelope(&media);
        let old = Library {
            version: 1,
            tracks: Vec::new(),
        };
        let (preview, next) = build_preview(&envelope, &old, false).unwrap();
        assert_eq!(preview.plan.items.len(), 2);
        assert_eq!(
            preview.plan.items[0].track.id,
            preview.plan.items[1].track.id
        );
        assert_eq!(
            preview.plan.items[1].entry_id.as_str(),
            envelope.queue.current_entry_id.as_deref().unwrap()
        );
        assert_eq!(next.tracks.len(), 1);
        assert_eq!(old.tracks.len(), 0);

        envelope.queue.items[0].local_path = directory
            .path()
            .join("missing.wav")
            .to_string_lossy()
            .into_owned();
        let (preview, _) = build_preview(&envelope, &old, false).unwrap();
        assert_eq!(preview.plan.items.len(), 1);
        assert_eq!(preview.unresolved.len(), 1);
        assert_eq!(
            preview.plan.current_entry_id,
            envelope.queue.current_entry_id
        );
    }

    #[test]
    fn journal_recovers_catalog_before_ui_and_acknowledges_rollback() {
        let directory = tempfile::tempdir().unwrap();
        let journal_file = journal_path(directory.path());
        let old = Library {
            version: 1,
            tracks: Vec::new(),
        };
        let added = Library {
            version: 1,
            tracks: vec![Track {
                kind: MediaKind::Audio,
                id: "id".into(),
                path: "path".into(),
                title: "track".into(),
                artist: None,
                album: None,
                duration: None,
                missing: false,
            }],
        };
        let journal = Journal {
            version: 1,
            transaction_id: "00000000-0000-4000-8000-000000000010".into(),
            export_id: "00000000-0000-4000-8000-000000000001".into(),
            action: TransactionAction::Import,
            phase: Phase::Prepared,
            ready_to_ack: false,
            old_library: old.clone(),
            new_library: added,
            old_queue_raw: Some("old queue".into()),
            old_eq_raw: Some("old eq".into()),
            old_resume_raw: Some("false".into()),
            restore_raw_storage: false,
            new_queue_raw: None,
            new_eq_raw: None,
            new_resume_raw: None,
            undo_source_transaction_id: None,
            plan: QueuePlan {
                items: Vec::new(),
                current_entry_id: None,
                repeat_mode: RepeatMode::Off,
                shuffle: false,
            },
            eq: fixture_envelope(Path::new("C:\\fixture.wav")).eq,
        };
        save_json(&library_file_path(directory.path()), &old).unwrap();
        save_json(&journal_file, &journal).unwrap();
        let mut current = old.clone();
        let mut active = load_journal(directory.path()).unwrap().unwrap();
        apply_journal_to_library(directory.path(), &mut current, &mut active).unwrap();
        assert_eq!(active.phase, Phase::Applied);
        assert_eq!(current.tracks.len(), 1);
        let applied: Library = read_json(
            &library_file_path(directory.path()),
            MAX_MIGRATION_BYTES as u64,
        )
        .unwrap();
        assert_eq!(applied.tracks.len(), 1);

        restore_journal_library(directory.path(), &mut current, &mut active, false).unwrap();
        assert!(active.ready_to_ack);
        assert_eq!(current.tracks.len(), 0);
        let restored: Library = read_json(
            &library_file_path(directory.path()),
            MAX_MIGRATION_BYTES as u64,
        )
        .unwrap();
        assert_eq!(restored.tracks.len(), 0);
        assert_eq!(active.old_queue_raw.as_deref(), Some("old queue"));
        assert_eq!(active.old_resume_raw.as_deref(), Some("false"));
    }

    fn fixture_libraries() -> (Library, Library) {
        let old = Library {
            version: 1,
            tracks: Vec::new(),
        };
        let new = Library {
            version: 1,
            tracks: vec![Track {
                kind: MediaKind::Audio,
                id: "fixture-id".into(),
                path: "C:\\fixture.wav".into(),
                title: "fixture track".into(),
                artist: None,
                album: None,
                duration: None,
                missing: false,
            }],
        };
        (old, new)
    }

    fn fixture_journal(old_library: &Library, new_library: &Library, phase: Phase) -> Journal {
        Journal {
            version: 1,
            transaction_id: "00000000-0000-4000-8000-000000000010".into(),
            export_id: "00000000-0000-4000-8000-000000000001".into(),
            action: TransactionAction::Import,
            phase,
            ready_to_ack: false,
            old_library: old_library.clone(),
            new_library: new_library.clone(),
            old_queue_raw: Some("old queue".into()),
            old_eq_raw: Some("old eq".into()),
            old_resume_raw: Some("false".into()),
            restore_raw_storage: false,
            new_queue_raw: None,
            new_eq_raw: None,
            new_resume_raw: None,
            undo_source_transaction_id: None,
            plan: QueuePlan {
                items: Vec::new(),
                current_entry_id: None,
                repeat_mode: RepeatMode::Off,
                shuffle: false,
            },
            eq: fixture_envelope(Path::new("C:\\fixture.wav")).eq,
        }
    }

    fn assert_library_file(directory: &Path, expected: &Library) {
        let actual: Library =
            read_json(&library_file_path(directory), MAX_MIGRATION_BYTES as u64).unwrap();
        assert_eq!(
            serde_json::to_value(actual).unwrap(),
            serde_json::to_value(expected).unwrap()
        );
    }

    #[test]
    fn committed_import_can_be_undone_without_deleting_source_media() {
        let directory = tempfile::tempdir().unwrap();
        let retained_media = directory.path().join("retained.wav");
        let imported_media = directory.path().join("imported.wav");
        fs::write(&retained_media, b"retained source media").unwrap();
        fs::write(&imported_media, b"imported source media").unwrap();
        let old = Library {
            version: 1,
            tracks: vec![Track {
                kind: MediaKind::Audio,
                id: retained_media.to_string_lossy().into_owned(),
                path: retained_media.to_string_lossy().into_owned(),
                title: "Retained".into(),
                artist: None,
                album: None,
                duration: None,
                missing: false,
            }],
        };
        let new = Library {
            version: 1,
            tracks: [
                old.tracks[0].clone(),
                Track {
                    kind: MediaKind::Audio,
                    id: imported_media.to_string_lossy().into_owned(),
                    path: imported_media.to_string_lossy().into_owned(),
                    title: "Imported".into(),
                    artist: None,
                    album: None,
                    duration: None,
                    missing: false,
                },
            ]
            .into(),
        };
        let mut current = old.clone();
        save_json(&library_file_path(directory.path()), &old).unwrap();
        let mut import = fixture_journal(&old, &new, Phase::Prepared);
        import.old_queue_raw = Some("previous queue raw".into());
        import.old_eq_raw = Some("previous EQ raw".into());
        import.old_resume_raw = Some("false".into());
        save_journal(directory.path(), &import).unwrap();
        apply_journal_to_library(directory.path(), &mut current, &mut import).unwrap();
        mark_journal_committed(directory.path(), &mut import).unwrap();
        record_import_commit(directory.path(), &import).unwrap();
        assert!(library_matches_snapshot(&current, &new).unwrap());
        let snapshot = load_undo_snapshot(directory.path()).unwrap().unwrap();

        import.phase = Phase::Acknowledged;
        finalize_acknowledged_journal(directory.path(), &import).unwrap();
        fs::remove_file(journal_path(directory.path())).unwrap();

        let mut undo = undo_journal(
            &snapshot,
            &current,
            "00000000-0000-4000-8000-000000000099".into(),
            Some("imported queue raw".into()),
            Some("imported EQ raw".into()),
            Some("true".into()),
        );
        save_journal(directory.path(), &undo).unwrap();
        apply_journal_to_library(directory.path(), &mut current, &mut undo).unwrap();
        assert!(library_matches_snapshot(&current, &old).unwrap());
        mark_journal_committed(directory.path(), &mut undo).unwrap();
        restore_journal_library(directory.path(), &mut current, &mut undo, true).unwrap();
        let recovery = recovery_from(undo.clone(), true);
        assert!(recovery.restore_raw_storage);
        assert_eq!(
            recovery.new_queue_raw.as_deref(),
            Some("previous queue raw")
        );
        assert_eq!(recovery.new_eq_raw.as_deref(), Some("previous EQ raw"));
        assert_eq!(recovery.new_resume_raw.as_deref(), Some("false"));

        undo.phase = Phase::Acknowledged;
        finalize_acknowledged_journal(directory.path(), &undo).unwrap();
        assert!(load_undo_snapshot(directory.path()).unwrap().is_none());
        assert!(retained_media.is_file());
        assert!(imported_media.is_file());
        assert_library_file(directory.path(), &old);
    }

    #[test]
    fn undo_is_disabled_after_a_catalog_change() {
        let (_, imported) = fixture_libraries();
        let mut changed = imported.clone();
        changed.tracks[0].title = "Changed by user".into();
        assert!(!library_matches_snapshot(&changed, &imported).unwrap());
    }

    #[test]
    fn startup_reconciles_each_durable_journal_phase_before_ui() {
        let (old, new) = fixture_libraries();
        let cases = [
            (Phase::Prepared, old.clone(), old.clone()),
            (Phase::Applied, new.clone(), old.clone()),
            (Phase::Committed, old.clone(), new.clone()),
            (Phase::Acknowledged, new.clone(), new.clone()),
        ];

        for (phase, library_on_disk, expected_library) in cases {
            let directory = tempfile::tempdir().unwrap();
            let journal = fixture_journal(&old, &new, phase);
            save_json(&library_file_path(directory.path()), &library_on_disk).unwrap();
            save_journal(directory.path(), &journal).unwrap();

            restore_library_before_ui_from_directory(directory.path()).unwrap();

            assert_library_file(directory.path(), &expected_library);
            if phase == Phase::Acknowledged {
                assert!(load_journal(directory.path()).unwrap().is_none());
            } else {
                let recovered = load_journal(directory.path()).unwrap().unwrap();
                assert_eq!(recovered.phase, phase);
                assert_eq!(
                    recovered.ready_to_ack,
                    matches!(phase, Phase::Prepared | Phase::Applied)
                );
            }
        }
    }

    #[test]
    fn apply_catalog_write_failure_keeps_prepared_state() {
        let directory = tempfile::tempdir().unwrap();
        let (old, new) = fixture_libraries();
        let mut current = old.clone();
        let mut journal = fixture_journal(&old, &new, Phase::Prepared);
        save_json(&library_file_path(directory.path()), &old).unwrap();
        save_journal(directory.path(), &journal).unwrap();
        fs::create_dir(library_file_path(directory.path()).with_extension("json.tmp")).unwrap();

        assert!(apply_journal_to_library(directory.path(), &mut current, &mut journal).is_err());

        assert_library_file(directory.path(), &old);
        assert_eq!(
            serde_json::to_value(current).unwrap(),
            serde_json::to_value(old).unwrap()
        );
        assert_eq!(
            load_journal(directory.path()).unwrap().unwrap().phase,
            Phase::Prepared
        );
    }

    #[test]
    fn failed_applied_marker_write_restores_catalog_and_keeps_prepared_journal() {
        let directory = tempfile::tempdir().unwrap();
        let (old, new) = fixture_libraries();
        let mut current = old.clone();
        let mut journal = fixture_journal(&old, &new, Phase::Prepared);
        save_json(&library_file_path(directory.path()), &old).unwrap();
        save_journal(directory.path(), &journal).unwrap();
        fs::create_dir(journal_path(directory.path()).with_extension("json.tmp")).unwrap();

        assert!(apply_journal_to_library(directory.path(), &mut current, &mut journal).is_err());

        assert_library_file(directory.path(), &old);
        assert_eq!(
            serde_json::to_value(current).unwrap(),
            serde_json::to_value(old).unwrap()
        );
        assert_eq!(journal.phase, Phase::Applied);
        assert_eq!(
            load_journal(directory.path()).unwrap().unwrap().phase,
            Phase::Prepared
        );
    }

    #[test]
    fn failed_commit_marker_remains_applied_and_startup_rolls_back() {
        let directory = tempfile::tempdir().unwrap();
        let (old, new) = fixture_libraries();
        let mut journal = fixture_journal(&old, &new, Phase::Applied);
        save_json(&library_file_path(directory.path()), &new).unwrap();
        save_journal(directory.path(), &journal).unwrap();
        let blocked_journal_temp = journal_path(directory.path()).with_extension("json.tmp");
        fs::create_dir(&blocked_journal_temp).unwrap();

        assert!(mark_journal_committed(directory.path(), &mut journal).is_err());
        assert_eq!(journal.phase, Phase::Applied);
        assert_eq!(
            load_journal(directory.path()).unwrap().unwrap().phase,
            Phase::Applied
        );

        fs::remove_dir(blocked_journal_temp).unwrap();
        restore_library_before_ui_from_directory(directory.path()).unwrap();
        assert_library_file(directory.path(), &old);
        assert!(
            load_journal(directory.path())
                .unwrap()
                .unwrap()
                .ready_to_ack
        );
    }

    #[test]
    fn failed_rollback_catalog_write_retains_applied_journal_for_restart() {
        let directory = tempfile::tempdir().unwrap();
        let (old, new) = fixture_libraries();
        let mut current = old.clone();
        let mut journal = fixture_journal(&old, &new, Phase::Prepared);
        save_json(&library_file_path(directory.path()), &old).unwrap();
        save_journal(directory.path(), &journal).unwrap();
        apply_journal_to_library(directory.path(), &mut current, &mut journal).unwrap();
        fs::create_dir(library_file_path(directory.path()).with_extension("json.tmp")).unwrap();

        assert!(
            restore_journal_library(directory.path(), &mut current, &mut journal, false).is_err()
        );

        assert_library_file(directory.path(), &new);
        assert_eq!(
            load_journal(directory.path()).unwrap().unwrap().phase,
            Phase::Applied
        );
        assert!(
            !load_journal(directory.path())
                .unwrap()
                .unwrap()
                .ready_to_ack
        );
    }

    #[test]
    fn startup_catalog_write_failure_retains_journal_and_retries_safely() {
        let directory = tempfile::tempdir().unwrap();
        let (old, new) = fixture_libraries();
        let journal = fixture_journal(&old, &new, Phase::Applied);
        save_json(&library_file_path(directory.path()), &new).unwrap();
        save_journal(directory.path(), &journal).unwrap();
        let blocked_library_temp = library_file_path(directory.path()).with_extension("json.tmp");
        fs::create_dir(&blocked_library_temp).unwrap();

        assert!(restore_library_before_ui_from_directory(directory.path()).is_err());
        assert_library_file(directory.path(), &new);
        assert_eq!(
            load_journal(directory.path()).unwrap().unwrap().phase,
            Phase::Applied
        );

        fs::remove_dir(blocked_library_temp).unwrap();
        restore_library_before_ui_from_directory(directory.path()).unwrap();
        assert_library_file(directory.path(), &old);
        assert!(
            load_journal(directory.path())
                .unwrap()
                .unwrap()
                .ready_to_ack
        );
    }

    #[test]
    fn failed_ready_to_ack_write_is_recovered_before_ui() {
        let directory = tempfile::tempdir().unwrap();
        let (old, new) = fixture_libraries();
        let mut current = old.clone();
        let mut journal = fixture_journal(&old, &new, Phase::Prepared);
        save_json(&library_file_path(directory.path()), &old).unwrap();
        save_journal(directory.path(), &journal).unwrap();
        apply_journal_to_library(directory.path(), &mut current, &mut journal).unwrap();
        let blocked_journal_temp = journal_path(directory.path()).with_extension("json.tmp");
        fs::create_dir(&blocked_journal_temp).unwrap();

        assert!(
            restore_journal_library(directory.path(), &mut current, &mut journal, false).is_err()
        );
        assert_library_file(directory.path(), &old);
        let persisted = load_journal(directory.path()).unwrap().unwrap();
        assert_eq!(persisted.phase, Phase::Applied);
        assert!(!persisted.ready_to_ack);

        fs::remove_dir(blocked_journal_temp).unwrap();
        restore_library_before_ui_from_directory(directory.path()).unwrap();
        assert!(
            load_journal(directory.path())
                .unwrap()
                .unwrap()
                .ready_to_ack
        );
    }

    #[test]
    fn timestamps_and_uuid_values_are_strict() {
        assert!(valid_iso_timestamp("2026-09-25T10:00:00.000Z"));
        assert!(!valid_iso_timestamp("2026-02-30T10:00:00.000Z"));
        assert!(is_uuid("00000000-0000-4000-8000-000000000001"));
        assert!(!is_uuid("00000000-0000-0000-0000-000000000001"));
    }

    #[test]
    fn local_import_paths_reject_relative_and_device_namespace_paths() {
        assert!(!is_local_import_path("Music\\track.wav"));
        assert!(!is_local_import_path("\\\\?\\C:\\Music\\track.wav"));
        #[cfg(windows)]
        assert!(is_local_import_path("C:\\Music\\track.wav"));
        #[cfg(not(windows))]
        assert!(is_local_import_path("/music/track.wav"));
    }

    #[test]
    fn windows_drive_type_classifier_accepts_local_and_rejects_remote_or_unknown() {
        assert!(is_local_windows_drive_type(DRIVE_FIXED));
        assert!(is_local_windows_drive_type(DRIVE_REMOVABLE));
        assert!(is_local_windows_drive_type(DRIVE_CDROM));
        assert!(is_local_windows_drive_type(DRIVE_RAMDISK));
        assert!(!is_local_windows_drive_type(DRIVE_REMOTE));
        assert!(!is_local_windows_drive_type(DRIVE_UNKNOWN));
        assert!(!is_local_windows_drive_type(DRIVE_NO_ROOT_DIR));
        assert!(!is_local_windows_drive_type(7));
    }

    #[test]
    fn windows_drive_root_parser_rejects_network_and_device_namespaces() {
        assert_eq!(
            local_windows_drive_root(r"Z:\Music\track.wav").as_deref(),
            Some("Z:\\")
        );
        assert_eq!(
            local_windows_drive_root(r"\\?\C:\Music\track.wav").as_deref(),
            Some("C:\\")
        );
        assert!(local_windows_drive_root(r"\\server\share\track.wav").is_none());
        assert!(local_windows_drive_root(r"\\?\UNC\server\share\track.wav").is_none());
        assert!(local_windows_drive_root(r"\\.\PhysicalDrive0").is_none());
    }
}
