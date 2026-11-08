// @req PLAY-15 — Catalog persistence delegates to the GenesisBlockDB adapter.
// @req PLAY-18 — Offline source metadata and favorites are exposed to the player.
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    thread,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use walkdir::WalkDir;

pub const MEDIA_EXTENSIONS: &[&str] = &[
    "mp3", "wav", "flac", "ogg", "opus", "m4a", "aac", "aif", "aiff", "wma", "mp4", "webm",
];
pub const MAX_TRACKS: usize = 10_000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    #[default]
    Audio,
    Video,
}

pub fn media_kind(path: &Path) -> MediaKind {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("mp4" | "webm") => MediaKind::Video,
        _ => MediaKind::Audio,
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    #[serde(default)]
    pub kind: MediaKind,
    pub id: String,
    pub path: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<f64>,
    #[serde(default)]
    pub missing: bool,
    #[serde(default = "default_user_source")]
    pub source_kind: String,
    #[serde(default = "default_linked_storage")]
    pub storage_kind: String,
    #[serde(default)]
    pub source_path: Option<String>,
    #[serde(default)]
    pub content_hash: Option<String>,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub play_count: u64,
    #[serde(default)]
    pub last_played_at: Option<i64>,
}

fn default_user_source() -> String {
    "user".into()
}

fn default_linked_storage() -> String {
    "linked".into()
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Library {
    pub version: u32,
    pub tracks: Vec<Track>,
}

pub struct LibraryState(pub Mutex<Library>, pub PathBuf);

const LIBRARY_WORKER_STACK_BYTES: usize = 16 * 1024 * 1024;

pub(crate) fn run_library_worker<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    thread::Builder::new()
        .name("lalin-play-library".into())
        .stack_size(LIBRARY_WORKER_STACK_BYTES)
        .spawn(work)
        .map_err(|error| format!("เปิด worker ของคลังไม่สำเร็จ: {error}"))?
        .join()
        .map_err(|_| "worker ของคลังหยุดทำงานผิดปกติ".to_string())?
}

pub(crate) async fn run_library_worker_async<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || run_library_worker(work))
        .await
        .map_err(|error| error.to_string())?
}

pub fn supported(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| MEDIA_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn selected_files(roots: &[PathBuf]) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    let mut seen = HashSet::new();
    for root in roots {
        let canonical =
            fs::canonicalize(root).map_err(|e| format!("เปิด {} ไม่ได้: {e}", root.display()))?;
        for entry in WalkDir::new(&canonical)
            .follow_links(false)
            .max_depth(32)
            .max_open(16)
        {
            let entry = entry.map_err(|e| format!("อ่านโฟลเดอร์ไม่ได้: {e}"))?;
            if !entry.file_type().is_file() || !supported(entry.path()) {
                continue;
            }
            let path = fs::canonicalize(entry.path()).map_err(|e| e.to_string())?;
            if !path.starts_with(&canonical) {
                return Err("ไฟล์อยู่นอกขอบเขตที่เลือก".into());
            }
            if seen.insert(path.clone()) {
                files.push(path);
            }
            if files.len() > MAX_TRACKS {
                return Err("เลือกได้ครั้งละไม่เกิน 10,000 ไฟล์ กรุณาเลือกโฟลเดอร์ย่อย".into());
            }
        }
    }
    files.sort();
    Ok(files)
}

pub fn track(path: &Path) -> Track {
    let name = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let tagged = lofty::read_from_path(path).ok();
    let tag = tagged
        .as_ref()
        .and_then(|file| file.primary_tag().or_else(|| file.first_tag()));
    Track {
        kind: media_kind(path),
        id: path.to_string_lossy().to_string(),
        path: path.to_string_lossy().to_string(),
        title: tag
            .and_then(|tag| tag.title())
            .map(|v| v.into_owned())
            .filter(|v| !v.trim().is_empty())
            .unwrap_or(name),
        artist: tag.and_then(|tag| tag.artist()).map(|v| v.into_owned()),
        album: tag.and_then(|tag| tag.album()).map(|v| v.into_owned()),
        duration: tagged
            .as_ref()
            .map(|file| file.properties().duration().as_secs_f64()),
        missing: false,
        source_kind: "user".into(),
        storage_kind: "linked".into(),
        source_path: None,
        content_hash: None,
        favorite: false,
        play_count: 0,
        last_played_at: None,
    }
}

pub fn sha256_bytes(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn app_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = crate::play_app_data_dir(app)?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory)
}

#[cfg(test)]
pub fn save_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
    fs::rename(&temporary, path).map_err(|e| e.to_string())
}

pub fn initialize(app: &AppHandle) -> Result<Library, String> {
    crate::migration::restore_library_before_ui(app)?;
    let directory = app_data_directory(app)?;
    let mut library = crate::library_store::initialize_catalog(&directory)?;
    for item in &mut library.tracks {
        let path = Path::new(&item.path);
        item.kind = media_kind(path);
        item.missing = !supported(path) || !path.is_file();
        if !item.missing {
            app.asset_protocol_scope()
                .allow_file(path)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(library)
}

pub(crate) fn repair_imported_managed_track<F>(
    directory: &Path,
    source: &Path,
    publication_id: &str,
    hash: &str,
    allow_file: F,
) -> Result<Option<Track>, String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    let Some(damaged) = crate::library_store::find_damaged_track_by_hash(directory, hash)? else {
        return Ok(None);
    };
    crate::local_media_store::discard_uncommitted_stage(directory, publication_id)?;
    crate::library_store::restore_managed_track(
        directory,
        &damaged.id,
        &source.to_string_lossy(),
        allow_file,
    )
    .map(Some)
}

pub fn import_selected(app: &AppHandle, roots: Vec<PathBuf>) -> Result<Vec<Track>, String> {
    let paths = selected_files(&roots)?;
    if paths.is_empty() {
        return Err("ไม่พบไฟล์เสียงหรือวิดีโอที่รองรับในรายการที่เลือก".into());
    }
    let state = app.state::<LibraryState>();
    let mut library = state.0.lock().map_err(|e| e.to_string())?;
    crate::migration::ensure_no_active_journal(&app)?;
    let directory = state.1.clone();
    let imported = import_selected_paths(&mut library, &directory, paths, |path| {
        app.asset_protocol_scope()
            .allow_file(path)
            .map_err(|error| error.to_string())
    })?;
    app.emit("play-library-changed", ())
        .map_err(|e| e.to_string())?;
    Ok(imported)
}

fn import_selected_paths<F>(
    library: &mut Library,
    directory: &Path,
    paths: Vec<PathBuf>,
    mut allow_file: F,
) -> Result<Vec<Track>, String>
where
    F: FnMut(&Path) -> Result<(), String>,
{
    if paths.is_empty() {
        return Err("ไม่พบไฟล์เสียงหรือวิดีโอที่รองรับในรายการที่เลือก".into());
    }
    let mut next = library.clone();
    if next.tracks.len().saturating_add(paths.len()) > MAX_TRACKS {
        let mut seen_hashes = HashSet::new();
        let mut additions = 0usize;
        for source in &paths {
            let hash = crate::media_validation::sha256_file(source)?;
            if !seen_hashes.insert(hash.clone()) {
                continue;
            }
            let source_path = source.to_string_lossy().to_string();
            let exists_in_memory = next.tracks.iter().any(|candidate| {
                candidate.path == source_path
                    || candidate.source_path.as_deref() == Some(source_path.as_str())
                    || candidate.content_hash.as_deref() == Some(hash.as_str())
            });
            if exists_in_memory
                || crate::library_store::find_track_by_source(directory, &source_path)?.is_some()
                || crate::library_store::find_track_by_hash(directory, &hash)?.is_some()
                || crate::library_store::find_damaged_track_by_hash(directory, &hash)?.is_some()
            {
                continue;
            }
            additions = additions.saturating_add(1);
        }
        if next.tracks.len().saturating_add(additions) > MAX_TRACKS {
            return Err("คลังรองรับไม่เกิน 10,000 ไฟล์ในรุ่นนี้".into());
        }
    }
    let mut imported = Vec::with_capacity(paths.len());
    for source in &paths {
        let mut item = track(source);
        let source_path = source.to_string_lossy().to_string();
        let publication_id =
            crate::local_media_store::publication_id_for_import(&source_path, source)?;
        let staged =
            crate::local_media_store::stage_local_file(directory, &publication_id, source)?;
        let hash = staged.manifest.whole_sha256.clone();
        let existing = next
            .tracks
            .iter()
            .find(|candidate| {
                candidate.path == source_path
                    || candidate.source_path.as_deref() == Some(source_path.as_str())
                    || candidate.content_hash.as_deref() == Some(hash.as_str())
            })
            .cloned()
            .or(crate::library_store::find_track_by_source(
                directory,
                &source_path,
            )?)
            .or(crate::library_store::find_track_by_hash(directory, &hash)?);
        if let Some(repaired) =
            repair_imported_managed_track(directory, source, &publication_id, &hash, |path| {
                allow_file(path).map_err(|_| "recovery:write-failed".to_string())
            })?
        {
            if let Some(row) = next.tracks.iter_mut().find(|row| row.id == repaired.id) {
                *row = repaired.clone();
            } else {
                next.tracks.push(repaired.clone());
            }
            imported.push(repaired);
            continue;
        }
        if existing.as_ref().is_some_and(|candidate| {
            candidate.storage_kind == "managed"
                && candidate.content_hash.as_deref() == Some(hash.as_str())
        }) {
            crate::local_media_store::discard_uncommitted_stage(directory, &publication_id)?;
            let existing = existing.expect("checked as present");
            if let Some(row) = next.tracks.iter_mut().find(|row| row.id == existing.id) {
                *row = existing.clone();
            }
            imported.push(existing);
            continue;
        }
        if let Some(existing) = &existing {
            item.id = existing.id.clone();
            item.favorite = existing.favorite;
            item.play_count = existing.play_count;
            item.last_played_at = existing.last_played_at;
        } else {
            item.id = format!("offline:{hash}");
        }
        let object_receipt = crate::local_media_store::finalize_object(directory, &staged)?;
        item.path = directory
            .join(&object_receipt.relative_path)
            .to_string_lossy()
            .to_string();
        item.source_path = Some(source_path);
        item.content_hash = Some(hash);
        item.storage_kind = "managed".into();
        item.source_kind = "user".into();
        item.missing = false;
        let prepared =
            crate::local_media_store::prepare_publication(directory, object_receipt, item)?;
        let item = crate::library_store::publish_prepared(directory, &prepared)?;
        allow_file(Path::new(&item.path))?;
        if let Some(existing) = next.tracks.iter_mut().find(|row| row.id == item.id) {
            *existing = item.clone();
        } else {
            if next.tracks.len() >= MAX_TRACKS {
                return Err("คลังรองรับไม่เกิน 10,000 ไฟล์ในรุ่นนี้".into());
            }
            next.tracks.push(item.clone());
        }
        imported.push(item);
    }
    *library = next;
    Ok(imported)
}

#[tauri::command]
pub async fn get_library(app: AppHandle) -> Result<Library, String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        let library = crate::library_store::read_catalog(&state.1)?;
        *state.0.lock().map_err(|e| e.to_string())? = library.clone();
        Ok(library)
    })
    .await
}

#[tauri::command]
pub async fn select_media(
    app: AppHandle,
    folder: bool,
    path: Option<String>,
) -> Result<Vec<Track>, String> {
    if let Some(path) = path {
        return run_library_worker_async(move || {
            let selected = crate::media_validation::validate_media_file(&path)
                .map_err(|error| error.relink_code())?;
            import_selected(&app, vec![selected])
        })
        .await;
    }

    let dialog_app = app.clone();
    let selected_paths =
        tauri::async_runtime::spawn_blocking(move || -> Result<Option<Vec<PathBuf>>, String> {
            let selected = if folder {
                dialog_app
                    .dialog()
                    .file()
                    .set_title("เพิ่มโฟลเดอร์สื่อ — อ่านไฟล์เท่านั้น")
                    .blocking_pick_folder()
                    .map(|file| vec![file])
            } else {
                dialog_app
                    .dialog()
                    .file()
                    .set_title("เพิ่มไฟล์ใน Lalin Play")
                    .add_filter("Audio / Video", MEDIA_EXTENSIONS)
                    .blocking_pick_files()
            };
            let Some(files) = selected else {
                return Ok(None);
            };
            let paths = files
                .into_iter()
                .map(|file| file.into_path().map_err(|e| e.to_string()))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Some(paths))
        })
        .await
        .map_err(|error| error.to_string())??;

    let Some(paths) = selected_paths else {
        return Ok(Vec::new());
    };
    run_library_worker_async(move || import_selected(&app, paths)).await
}

#[tauri::command]
pub async fn list_damaged_tracks(
    app: AppHandle,
) -> Result<Vec<crate::library_store::DamagedTrack>, String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        crate::library_store::list_damaged_tracks(&state.1)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn select_relink_file(app: AppHandle, id: String) -> Result<Option<String>, String> {
    let directory = app.state::<LibraryState>().1.clone();
    let parent_directory = run_library_worker_async(move || {
        let track = crate::library_store::track_for_relink(&directory, &id)?;
        Ok(track
            .source_path
            .as_deref()
            .and_then(|path| Path::new(path).parent())
            .filter(|path| path.is_dir())
            .map(Path::to_path_buf)
            .or_else(|| {
                Path::new(&track.path)
                    .parent()
                    .filter(|path| path.is_dir())
                    .map(Path::to_path_buf)
            }))
    })
    .await?;

    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app
            .dialog()
            .file()
            .set_title("เลือกไฟล์ใหม่เพื่อเชื่อมเพลง")
            .add_filter("Audio / Video", MEDIA_EXTENSIONS);
        if let Some(directory) = parent_directory {
            dialog = dialog.set_directory(directory);
        }
        let Some(selected) = dialog.blocking_pick_file() else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|_| "relink:invalid-path")?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| "relink:write-failed".to_string())?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn select_restore_file(app: AppHandle, id: String) -> Result<Option<String>, String> {
    let directory = app.state::<LibraryState>().1.clone();
    let parent_directory = run_library_worker_async(move || {
        let damaged = crate::library_store::damaged_track_for_id(&directory, &id)?
            .ok_or("recovery:not-recoverable")?;
        Ok(damaged
            .source_path
            .as_deref()
            .and_then(|path| Path::new(path).parent())
            .filter(|path| path.is_dir())
            .map(Path::to_path_buf))
    })
    .await?;

    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app
            .dialog()
            .file()
            .set_title("เลือกไฟล์เดิมเพื่อกู้คืนเพลงออฟไลน์")
            .add_filter("Audio / Video", MEDIA_EXTENSIONS);
        if let Some(directory) = parent_directory {
            dialog = dialog.set_directory(directory);
        }
        let Some(selected) = dialog.blocking_pick_file() else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|_| "recovery:invalid-path")?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| "recovery:write-failed".to_string())?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn restore_managed_track(
    app: AppHandle,
    id: String,
    path: String,
) -> Result<Track, String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        let mut library = state.0.lock().map_err(|_| "recovery:write-failed")?;
        crate::migration::ensure_no_active_journal(&app).map_err(|_| "recovery:write-failed")?;
        let track = crate::library_store::restore_managed_track(&state.1, &id, &path, |path| {
            app.asset_protocol_scope()
                .allow_file(path)
                .map_err(|_| "recovery:write-failed".to_string())
        })?;
        if let Some(existing) = library.tracks.iter_mut().find(|track| track.id == id) {
            *existing = track.clone();
        } else {
            library.tracks.push(track.clone());
        }
        let _ = app.emit("play-library-changed", ());
        Ok(track)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn relink_track(
    app: AppHandle,
    id: String,
    path: String,
    accept_different_content: bool,
) -> Result<Track, String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        let mut library = state.0.lock().map_err(|_| "relink:write-failed")?;
        crate::migration::ensure_no_active_journal(&app).map_err(|_| "relink:write-failed")?;
        let track = crate::library_store::relink_track(
            &state.1,
            &id,
            &path,
            accept_different_content,
            crate::media_validation::sha256_file,
            |path| {
                app.asset_protocol_scope()
                    .allow_file(path)
                    .map_err(|error| error.to_string())
            },
        )?;
        if let Some(existing) = library.tracks.iter_mut().find(|item| item.id == id) {
            *existing = track.clone();
        } else {
            library.tracks.push(track.clone());
        }
        Ok(track)
    })
    .await
}

#[tauri::command]
pub async fn remove_library_track(app: AppHandle, id: String) -> Result<(), String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        let mut library = state.0.lock().map_err(|e| e.to_string())?;
        crate::migration::ensure_no_active_journal(&app)?;
        let mut next = library.clone();
        next.tracks.retain(|item| item.id != id);
        crate::library_store::remove_track(&state.1, &id)?;
        *library = next;
        // ลบเฉพาะ catalog row ใน GenesisBlockDB; source media และ offline bytes ไม่ถูกลบ
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn set_track_favorite(app: AppHandle, id: String, favorite: bool) -> Result<(), String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        crate::library_store::set_favorite(&state.1, &id, favorite)?;
        let mut library = state.0.lock().map_err(|e| e.to_string())?;
        let item = library
            .tracks
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or("ไม่พบเพลงนี้ในคลัง")?;
        item.favorite = favorite;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn record_listen(app: AppHandle, id: String) -> Result<i64, String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        crate::library_store::record_listen(&state.1, &id)
    })
    .await
}

#[tauri::command]
pub async fn list_youtube_links(
    app: AppHandle,
) -> Result<Vec<crate::library_store::YoutubeLink>, String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        crate::library_store::youtube_links(&state.1)
    })
    .await
}

#[tauri::command]
pub async fn add_youtube_link(
    app: AppHandle,
    url: String,
    title: String,
) -> Result<crate::library_store::YoutubeLink, String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        crate::library_store::add_youtube_link(&state.1, &url, &title)
    })
    .await
}

#[tauri::command]
pub async fn remove_youtube_link(app: AppHandle, id: String) -> Result<(), String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        crate::library_store::remove_youtube_link(&state.1, &id)
    })
    .await
}

#[tauri::command]
pub async fn open_youtube_link(app: AppHandle, id: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let lookup_app = app.clone();
    let url = run_library_worker_async(move || {
        let directory = app_data_directory(&lookup_app)?;
        crate::library_store::youtube_link_url(&directory, &id)
    })
    .await?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_cache_settings(
    app: AppHandle,
) -> Result<crate::library_store::CacheSettings, String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        crate::library_store::cache_settings(&state.1)
    })
    .await
}

#[tauri::command]
pub async fn set_cache_settings(
    app: AppHandle,
    enabled: bool,
    quota_bytes: u64,
) -> Result<crate::library_store::CacheSettings, String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        crate::library_store::update_cache_settings(&state.1, enabled, quota_bytes)
    })
    .await
}

#[tauri::command]
pub async fn resolve_media(app: AppHandle, id: String) -> Result<String, String> {
    run_library_worker_async(move || {
        let state = app.state::<LibraryState>();
        let library = crate::library_store::read_catalog(&state.1)?;
        let item = library
            .tracks
            .iter()
            .find(|item| item.id == id)
            .ok_or("ไฟล์นี้ไม่อยู่ในคลังที่อนุญาต กรุณาเลือกไฟล์เพิ่มอีกครั้ง")?;
        let path = Path::new(&item.path);
        let actual = fs::canonicalize(path).map_err(|_| "ไม่พบไฟล์นี้ กรุณาเพิ่มไฟล์จากตำแหน่งใหม่")?;
        if !actual.is_file() || !supported(&actual) {
            return Err("ไฟล์เปลี่ยนตำแหน่งหรืออยู่นอกขอบเขตที่เลือก กรุณาเลือกไฟล์อีกครั้ง".into());
        }
        if item.storage_kind == "managed" {
            let root = fs::canonicalize(state.1.join("media")).map_err(|_| "ไม่พบคลัง offline")?;
            if !actual.starts_with(root) {
                return Err("ไฟล์ offline อยู่นอกคลังที่จัดการโดย Lalin Play".into());
            }
        } else if actual != path {
            return Err("ไฟล์เปลี่ยนตำแหน่งหรืออยู่นอกขอบเขตที่เลือก กรุณาเลือกไฟล์อีกครั้ง".into());
        }
        app.asset_protocol_scope()
            .allow_file(&actual)
            .map_err(|e| e.to_string())?;
        Ok(item.path.clone())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generated_wav(seed: u32) -> Vec<u8> {
        let mut samples = vec![0u8; 512];
        samples[..4].copy_from_slice(&seed.to_le_bytes());
        let mut wav = Vec::with_capacity(44 + samples.len());
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36u32 + samples.len() as u32).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&16_000u32.to_le_bytes());
        wav.extend_from_slice(&32_000u32.to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&(samples.len() as u32).to_le_bytes());
        wav.extend_from_slice(&samples);
        wav
    }

    fn on_one_mib_stack<T, F>(work: F) -> T
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        std::thread::Builder::new()
            .name("lalin-play-one-mib-regression".into())
            .stack_size(1 << 20)
            .spawn(work)
            .unwrap()
            .join()
            .expect("1 MiB caller thread must complete")
    }

    fn import_and_reopen_from_worker(root: PathBuf) -> Result<(usize, usize), String> {
        run_library_worker(move || {
            let mut library = crate::library_store::initialize_catalog(&root)?;
            let source_directory = root.join("generated");
            fs::create_dir_all(&source_directory).map_err(|error| error.to_string())?;
            let source = source_directory.join("generated.wav");
            fs::write(&source, generated_wav(1)).map_err(|error| error.to_string())?;
            let paths = selected_files(&[source_directory])?;
            let imported = import_selected_paths(&mut library, &root, paths, |_| Ok(()))?;
            let imported_count = imported.len();

            crate::library_store::forget_database(&root);
            let reopened = crate::library_store::initialize_catalog(&root)?;
            Ok((imported_count, reopened.tracks.len()))
        })
    }

    fn reopen_many_catalog_rows_from_worker(
        root: PathBuf,
        row_count: usize,
    ) -> Result<usize, String> {
        run_library_worker(move || {
            let _ = crate::library_store::initialize_catalog(&root)?;
            let tracks = (0..row_count)
                .map(|index| Track {
                    kind: MediaKind::Audio,
                    id: format!("linked:{index:04}"),
                    path: format!("C:\\Music\\track-{index:04}.wav"),
                    title: format!("Track {index:04}"),
                    artist: None,
                    album: None,
                    duration: Some(1.0),
                    missing: true,
                    source_kind: "user".into(),
                    storage_kind: "linked".into(),
                    source_path: None,
                    content_hash: None,
                    favorite: false,
                    play_count: 0,
                    last_played_at: None,
                })
                .collect();
            crate::library_store::replace_catalog(&root, &Library { version: 1, tracks })?;

            crate::library_store::forget_database(&root);
            let reopened = crate::library_store::initialize_catalog(&root)?;
            Ok(reopened.tracks.len())
        })
    }

    // The 1 MiB caller mirrors the original native main thread. Genesis and
    // library work must cross the same explicit 16 MiB worker boundary used by
    // setup and Tauri commands. Cargo test still uses its test profile and omits
    // release GUI/event-loop frames; the PE guard checks the linked reserve.
    #[test]
    fn one_mib_caller_boot_imports_generated_wav_and_reopens() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().to_path_buf();
        let counts = on_one_mib_stack(move || import_and_reopen_from_worker(root)).unwrap();
        assert_eq!(counts, (1, 1));
    }

    #[test]
    fn one_mib_caller_reopens_after_five_hundred_catalog_rows() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().to_path_buf();
        let row_count =
            on_one_mib_stack(move || reopen_many_catalog_rows_from_worker(root, 500)).unwrap();
        assert_eq!(row_count, 500);
    }

    #[test]
    fn video_selection_is_case_insensitive_and_does_not_admit_other_files() {
        let folder = tempfile::tempdir().unwrap();
        for name in [
            "ภาพ 1.MP4",
            "ภาพ 2.webm",
            "音.wav",
            "private.txt",
            "not-supported.mkv",
        ] {
            fs::write(folder.path().join(name), b"fixture").unwrap();
        }
        let files = selected_files(&[folder.path().to_path_buf()]).unwrap();
        assert_eq!(files.len(), 3);
        assert_eq!(
            files
                .iter()
                .filter(|path| media_kind(path) == MediaKind::Video)
                .count(),
            2
        );
        assert!(!supported(&folder.path().join("private.txt")));
    }

    #[test]
    fn old_catalog_without_kind_remains_readable_and_can_be_classified() {
        let old = r#"{"version":1,"tracks":[{"id":"old","path":"C:\\clip.MP4","title":"old","artist":null,"album":null,"duration":null}]}"#;
        let mut library: Library = serde_json::from_str(old).unwrap();
        let item = &mut library.tracks[0];
        item.kind = media_kind(Path::new(&item.path));
        assert_eq!(item.kind, MediaKind::Video);
        assert_eq!(library.version, 1);
    }

    #[test]
    fn selected_folder_is_bounded_deduplicated_and_read_only() {
        let selected = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let audio = selected.path().join("เพลง local.wav");
        fs::write(&audio, b"fixture").unwrap();
        fs::write(selected.path().join("secret.txt"), b"not audio").unwrap();
        fs::write(other.path().join("outside.wav"), b"outside").unwrap();
        let files = selected_files(&[selected.path().to_path_buf(), audio.clone()]).unwrap();
        assert_eq!(files, vec![fs::canonicalize(&audio).unwrap()]);
        assert_eq!(fs::read(audio).unwrap(), b"fixture");
    }

    #[test]
    fn missing_selection_is_an_error_not_an_empty_import() {
        let folder = tempfile::tempdir().unwrap();
        assert!(selected_files(&[folder.path().join("missing.wav")]).is_err());
    }

    #[test]
    fn save_replaces_only_catalog_and_never_source_media() {
        let directory = tempfile::tempdir().unwrap();
        let audio = directory.path().join("keep.wav");
        fs::write(&audio, b"keep").unwrap();
        let path = directory.path().join("library.json");
        save_json(
            &path,
            &Library {
                version: 1,
                tracks: vec![track(&audio)],
            },
        )
        .unwrap();
        save_json(
            &path,
            &Library {
                version: 1,
                tracks: vec![],
            },
        )
        .unwrap();
        let saved: Library = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        assert!(saved.tracks.is_empty());
        assert_eq!(fs::read(audio).unwrap(), b"keep");
    }
}
