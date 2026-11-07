use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

use crate::library::MEDIA_EXTENSIONS;
use sha2::{Digest, Sha256};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum MediaFileValidationError {
    InvalidPath,
    ForbiddenNamespace,
    NotFound,
    NotLocal,
    NotAFile,
    UnsupportedType,
}

impl MediaFileValidationError {
    pub(crate) fn handoff_message(self) -> &'static str {
        match self {
            Self::InvalidPath | Self::ForbiddenNamespace => "invalid_file_path",
            Self::NotFound => "ไม่พบไฟล์ที่ Studio ส่งมา",
            Self::NotLocal => "ไฟล์ที่ Studio ส่งมาต้องอยู่บน local drive",
            Self::NotAFile => "ไฟล์ที่ส่งมาไม่ใช่ไฟล์ปกติ",
            Self::UnsupportedType => "ชนิดไฟล์นี้ Lalin Play ยังไม่รองรับ",
        }
    }

    pub(crate) fn relink_code(self) -> &'static str {
        match self {
            Self::InvalidPath => "relink:invalid-path",
            Self::ForbiddenNamespace | Self::NotLocal => "relink:not-local",
            Self::NotFound | Self::NotAFile => "relink:not-a-file",
            Self::UnsupportedType => "relink:unsupported-type",
        }
    }
}

pub(crate) fn validate_media_file(path: &str) -> Result<PathBuf, MediaFileValidationError> {
    if path.is_empty() || path.len() > 4096 || path.contains('\0') {
        return Err(MediaFileValidationError::InvalidPath);
    }
    if (path.starts_with("\\\\") && local_windows_drive_root(path).is_none())
        || path.starts_with("//")
    {
        return Err(MediaFileValidationError::ForbiddenNamespace);
    }
    let candidate = Path::new(path);
    if !candidate.is_absolute() {
        return Err(MediaFileValidationError::InvalidPath);
    }
    let canonical =
        std::fs::canonicalize(candidate).map_err(|_| MediaFileValidationError::NotFound)?;
    if !is_local_absolute(&canonical) {
        return Err(MediaFileValidationError::NotLocal);
    }
    if !canonical.is_file() {
        return Err(MediaFileValidationError::NotAFile);
    }
    let extension = canonical
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !MEDIA_EXTENSIONS.contains(&extension.as_str()) {
        return Err(MediaFileValidationError::UnsupportedType);
    }
    Ok(canonical)
}

pub(crate) fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

pub(crate) fn is_local_absolute(path: &Path) -> bool {
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

pub(crate) fn is_local_import_path(value: &str) -> bool {
    if value.starts_with("\\\\") || value.starts_with("//") {
        return false;
    }
    is_local_absolute(Path::new(value))
}

pub(crate) fn local_windows_drive_root(value: &str) -> Option<String> {
    let normalized = value.replace('/', "\\");
    let path = normalized.strip_prefix("\\\\?\\").unwrap_or(&normalized);
    let bytes = path.as_bytes();
    (bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'\\')
        .then(|| path[..3].to_string())
}

#[cfg(test)]
pub(crate) const DRIVE_UNKNOWN: u32 = 0;
#[cfg(test)]
pub(crate) const DRIVE_NO_ROOT_DIR: u32 = 1;
#[cfg(test)]
pub(crate) const DRIVE_REMOTE: u32 = 4;
#[cfg(any(windows, test))]
pub(crate) const DRIVE_REMOVABLE: u32 = 2;
#[cfg(any(windows, test))]
pub(crate) const DRIVE_FIXED: u32 = 3;
#[cfg(any(windows, test))]
pub(crate) const DRIVE_CDROM: u32 = 5;
#[cfg(any(windows, test))]
pub(crate) const DRIVE_RAMDISK: u32 = 6;

#[cfg(any(windows, test))]
pub(crate) fn is_local_windows_drive_type(drive_type: u32) -> bool {
    matches!(
        drive_type,
        DRIVE_REMOVABLE | DRIVE_FIXED | DRIVE_CDROM | DRIVE_RAMDISK
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn sha256_matches_import_whole_sha256() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("fixture.wav");
        std::fs::write(&source, b"hash parity fixture\0with binary bytes").unwrap();
        let staged =
            crate::local_media_store::stage_local_file(directory.path(), "hash-parity", &source)
                .unwrap();
        assert_eq!(
            super::sha256_file(&source).unwrap(),
            staged.manifest.whole_sha256
        );
    }
}
