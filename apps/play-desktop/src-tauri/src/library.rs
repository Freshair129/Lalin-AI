use lofty::file::{AudioFile, TaggedFileExt};
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};
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

#[derive(Clone, Debug, Serialize, Deserialize)]
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
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Library {
    pub version: u32,
    pub tracks: Vec<Track>,
}

pub struct LibraryState(pub Mutex<Library>);

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
    }
}

pub fn data_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory.join("library-v1.json"))
}

pub fn save_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
    fs::rename(&temporary, path).map_err(|e| e.to_string())
}

pub fn initialize(app: &AppHandle) -> Result<Library, String> {
    crate::migration::restore_library_before_ui(app)?;
    let path = data_path(app)?;
    if !path.exists() {
        return Ok(Library {
            version: 1,
            tracks: Vec::new(),
        });
    }
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 16 * 1024 * 1024 {
        return Err("คลังมีขนาดเกินขอบเขตที่รองรับ; เก็บไฟล์เดิมไว้โดยไม่เขียนทับ".into());
    }
    let mut library: Library = serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("อ่านคลังเดิมไม่ได้; ไม่เขียนทับข้อมูล: {e}"))?;
    if library.version != 1 || library.tracks.len() > MAX_TRACKS {
        return Err("เวอร์ชันคลังไม่รองรับ".into());
    }
    for item in &mut library.tracks {
        let path = Path::new(&item.path);
        item.kind = media_kind(path);
        item.missing = !supported(path)
            || !path.is_file()
            || fs::canonicalize(path).ok().as_deref() != Some(path);
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
    let imported: Vec<Track> = paths.iter().map(|path| track(path)).collect();
    let state = app.state::<LibraryState>();
    let mut library = state.0.lock().map_err(|e| e.to_string())?;
    crate::migration::ensure_no_active_journal(&app)?;
    let mut next = library.clone();
    for item in &imported {
        if let Some(existing) = next
            .tracks
            .iter_mut()
            .find(|existing| existing.id == item.id)
        {
            *existing = item.clone();
        } else {
            next.tracks.push(item.clone());
        }
    }
    if next.tracks.len() > MAX_TRACKS {
        return Err("คลังรองรับไม่เกิน 10,000 ไฟล์ในรุ่นนี้".into());
    }
    for path in &paths {
        app.asset_protocol_scope()
            .allow_file(path)
            .map_err(|e| e.to_string())?;
    }
    save_json(&data_path(app)?, &next)?;
    *library = next;
    app.emit("play-library-changed", ())
        .map_err(|e| e.to_string())?;
    Ok(imported)
}

#[tauri::command]
pub fn get_library(state: tauri::State<'_, LibraryState>) -> Result<Library, String> {
    let mut library = state.0.lock().map_err(|e| e.to_string())?.clone();
    for item in &mut library.tracks {
        item.missing = !Path::new(&item.path).is_file();
    }
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
    save_json(&data_path(&app)?, &next)?;
    *library = next;
    // ลบเฉพาะรายการในคลัง ไม่แตะไฟล์จริงหรือคิวที่กำลังเล่น
    Ok(())
}

#[tauri::command]
pub fn resolve_media(app: AppHandle, id: String) -> Result<String, String> {
    let state = app.state::<LibraryState>();
    let library = state.0.lock().map_err(|e| e.to_string())?;
    let item = library
        .tracks
        .iter()
        .find(|item| item.id == id)
        .ok_or("ไฟล์นี้ไม่อยู่ในคลังที่อนุญาต กรุณาเลือกไฟล์เพิ่มอีกครั้ง")?;
    let path = Path::new(&item.path);
    let actual = fs::canonicalize(path).map_err(|_| "ไม่พบไฟล์นี้ กรุณาเพิ่มไฟล์จากตำแหน่งใหม่")?;
    if actual != path || !actual.is_file() || !supported(&actual) {
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
