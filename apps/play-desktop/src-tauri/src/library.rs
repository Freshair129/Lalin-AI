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

pub fn import_selected(app: &AppHandle, roots: Vec<PathBuf>) -> Result<Vec<Track>, String> {
    let paths = selected_files(&roots)?;
    if paths.is_empty() {
        return Err("ไม่พบไฟล์เสียงหรือวิดีโอที่รองรับในรายการที่เลือก".into());
    }
    let state = app.state::<LibraryState>();
    let mut library = state.0.lock().map_err(|e| e.to_string())?;
    crate::migration::ensure_no_active_journal(&app)?;
    let mut next = library.clone();
    let directory = state.1.clone();
    if next.tracks.len().saturating_add(paths.len()) > MAX_TRACKS {
        return Err("คลังรองรับไม่เกิน 10,000 ไฟล์ในรุ่นนี้".into());
    }
    let mut imported = Vec::with_capacity(paths.len());
    for source in &paths {
        let mut item = track(source);
        let source_path = source.to_string_lossy().to_string();
        let publication_id =
            crate::local_media_store::publication_id_for_import(&source_path, source)?;
        let staged =
            crate::local_media_store::stage_local_file(&directory, &publication_id, source)?;
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
                &directory,
                &source_path,
            )?)
            .or(crate::library_store::find_track_by_hash(&directory, &hash)?);
        if existing.as_ref().is_some_and(|candidate| {
            candidate.storage_kind == "managed"
                && candidate.content_hash.as_deref() == Some(hash.as_str())
        }) {
            crate::local_media_store::discard_uncommitted_stage(&directory, &publication_id)?;
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
        let object_receipt = crate::local_media_store::finalize_object(&directory, &staged)?;
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
            crate::local_media_store::prepare_publication(&directory, object_receipt, item)?;
        let item = crate::library_store::publish_prepared(&directory, &prepared)?;
        app.asset_protocol_scope()
            .allow_file(Path::new(&item.path))
            .map_err(|e| e.to_string())?;
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
    app.emit("play-library-changed", ())
        .map_err(|e| e.to_string())?;
    Ok(imported)
}

#[tauri::command]
pub fn get_library(state: tauri::State<'_, LibraryState>) -> Result<Library, String> {
    let library = crate::library_store::read_catalog(&state.1)?;
    *state.0.lock().map_err(|e| e.to_string())? = library.clone();
    Ok(library)
}

#[tauri::command]
pub async fn select_media(app: AppHandle, folder: bool) -> Result<Vec<Track>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected = if folder {
            app.dialog()
                .file()
                .set_title("เพิ่มโฟลเดอร์สื่อ — อ่านไฟล์เท่านั้น")
                .blocking_pick_folder()
                .map(|file| vec![file])
        } else {
            app.dialog()
                .file()
                .set_title("เพิ่มไฟล์ใน Lalin Play")
                .add_filter("Audio / Video", MEDIA_EXTENSIONS)
                .blocking_pick_files()
        };
        let Some(files) = selected else {
            return Ok(Vec::new());
        };
        let paths = files
            .into_iter()
            .map(|file| file.into_path().map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        import_selected(&app, paths)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn remove_library_track(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<LibraryState>();
    let mut library = state.0.lock().map_err(|e| e.to_string())?;
    crate::migration::ensure_no_active_journal(&app)?;
    let mut next = library.clone();
    next.tracks.retain(|item| item.id != id);
    crate::library_store::remove_track(&state.1, &id)?;
    *library = next;
    // ลบเฉพาะ catalog row ใน GenesisBlockDB; source media และ offline bytes ไม่ถูกลบ
    Ok(())
}

#[tauri::command]
pub fn set_track_favorite(
    state: tauri::State<'_, LibraryState>,
    id: String,
    favorite: bool,
) -> Result<(), String> {
    crate::library_store::set_favorite(&state.1, &id, favorite)?;
    let mut library = state.0.lock().map_err(|e| e.to_string())?;
    let item = library
        .tracks
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or("ไม่พบเพลงนี้ในคลัง")?;
    item.favorite = favorite;
    Ok(())
}

#[tauri::command]
pub fn record_listen(state: tauri::State<'_, LibraryState>, id: String) -> Result<i64, String> {
    crate::library_store::record_listen(&state.1, &id)
}

#[tauri::command]
pub fn list_youtube_links(
    state: tauri::State<'_, LibraryState>,
) -> Result<Vec<crate::library_store::YoutubeLink>, String> {
    crate::library_store::youtube_links(&state.1)
}

#[tauri::command]
pub fn add_youtube_link(
    state: tauri::State<'_, LibraryState>,
    url: String,
    title: String,
) -> Result<crate::library_store::YoutubeLink, String> {
    crate::library_store::add_youtube_link(&state.1, &url, &title)
}

#[tauri::command]
pub fn remove_youtube_link(
    state: tauri::State<'_, LibraryState>,
    id: String,
) -> Result<(), String> {
    crate::library_store::remove_youtube_link(&state.1, &id)
}

#[tauri::command]
pub fn open_youtube_link(app: AppHandle, id: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let directory = app_data_directory(&app)?;
    let url = crate::library_store::youtube_link_url(&directory, &id)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_cache_settings(
    state: tauri::State<'_, LibraryState>,
) -> Result<crate::library_store::CacheSettings, String> {
    crate::library_store::cache_settings(&state.1)
}

#[tauri::command]
pub fn set_cache_settings(
    state: tauri::State<'_, LibraryState>,
    enabled: bool,
    quota_bytes: u64,
) -> Result<crate::library_store::CacheSettings, String> {
    crate::library_store::update_cache_settings(&state.1, enabled, quota_bytes)
}

#[tauri::command]
pub fn resolve_media(app: AppHandle, id: String) -> Result<String, String> {
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
}

#[cfg(test)]
mod tests {
    use super::*;

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
