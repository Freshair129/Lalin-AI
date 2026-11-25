//! CR-009 Scope A: bridge Play's EQ curve to a user-installed Equalizer APO.
//!
//! Play never installs APO and never touches audio itself. It owns exactly one
//! include file (`lalin-play.txt`) inside APO's config folder plus one
//! `Include:` line in `config.txt`. APO's installer normally lets Users write its
//! config folder, so setup runs in-process. Only when that fails does it fall
//! back to an elevated copy of this executable (`--system-eq-helper`), which
//! also grants the current user Modify on the include file.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const INCLUDE_FILE: &str = "lalin-play.txt";
pub const BACKUP_FILE: &str = "config.lalin-play-backup.txt";
const INCLUDE_LINE: &str = "Include: lalin-play.txt";
const HEADER: &str = "# Managed by Lalin Play (CR-009). Changes made here are overwritten.\r\n";
const FREQUENCIES: [u32; 10] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const BAND_Q: f64 = 1.4;
const HELPER_FLAG: &str = "--system-eq-helper";
const HELPER_LOG: &str = "lalin-play-system-eq-helper.log";

fn helper_log_path() -> PathBuf {
    std::env::temp_dir().join(HELPER_LOG)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SystemEqStatus {
    /// Equalizer APO's config folder was found.
    pub installed: bool,
    pub config_dir: Option<String>,
    /// `config.txt` includes our file and the file exists.
    pub linked: bool,
    /// The current user can rewrite the include file without elevation.
    pub writable: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemEqCurve {
    pub enabled: bool,
    pub preamp: f64,
    pub gains: Vec<f64>,
}

fn clamp_gain(value: f64) -> f64 {
    if !value.is_finite() {
        return 0.0;
    }
    (value.clamp(-12.0, 12.0) * 10.0).round() / 10.0
}

/// Renders the APO include file. APO has no limiter, so the preamp never sits
/// above minus the largest boost: a boosted curve cannot push other apps past 0 dBFS.
pub fn render_curve(curve: &SystemEqCurve) -> String {
    let mut out = String::from(HEADER);
    if !curve.enabled {
        out.push_str("Preamp: 0 dB\r\n");
        return out;
    }
    let gains: Vec<f64> = (0..FREQUENCIES.len())
        .map(|index| clamp_gain(curve.gains.get(index).copied().unwrap_or(0.0)))
        .collect();
    let max_boost = gains.iter().copied().fold(0.0_f64, f64::max);
    let preamp = clamp_gain(curve.preamp).min(-max_boost);
    out.push_str(&format!("Preamp: {:.1} dB\r\n", preamp + 0.0));
    for (index, (frequency, gain)) in FREQUENCIES.iter().zip(gains).enumerate() {
        out.push_str(&format!(
            "Filter {}: ON PK Fc {} Hz Gain {:.1} dB Q {:.2}\r\n",
            index + 1,
            frequency,
            gain + 0.0,
            BAND_Q
        ));
    }
    out
}

fn is_include_line(line: &str) -> bool {
    line.trim().eq_ignore_ascii_case(INCLUDE_LINE)
}

pub fn status_for(dir: Option<PathBuf>) -> SystemEqStatus {
    let Some(dir) = dir.filter(|dir| dir.is_dir()) else {
        return SystemEqStatus { installed: false, config_dir: None, linked: false, writable: false };
    };
    let include = dir.join(INCLUDE_FILE);
    let included = fs::read_to_string(dir.join("config.txt"))
        .map(|text| text.lines().any(is_include_line))
        .unwrap_or(false);
    let writable = fs::OpenOptions::new().write(true).open(&include).is_ok();
    SystemEqStatus {
        installed: true,
        config_dir: Some(dir.to_string_lossy().into_owned()),
        linked: included && include.is_file(),
        writable,
    }
}

/// Rewrites the include file in one call. The file must already exist: Play
/// never creates files in APO's folder without the elevated setup step.
pub fn write_curve(dir: &Path, curve: &SystemEqCurve) -> Result<(), String> {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(dir.join(INCLUDE_FILE))
        .map_err(|error| format!("ยังเขียนไฟล์ EQ ของ Equalizer APO ไม่ได้ ({error}) — กดตั้งค่าใหม่อีกครั้ง"))?;
    file.write_all(render_curve(curve).as_bytes()).map_err(|error| error.to_string())
}

/// Elevated part of setup. Idempotent: running it again changes nothing.
pub fn link(dir: &Path) -> Result<(), String> {
    let config = dir.join("config.txt");
    let include = dir.join(INCLUDE_FILE);
    let existing = match fs::read_to_string(&config) {
        Ok(text) => Some(text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.to_string()),
    };
    let backup = dir.join(BACKUP_FILE);
    if let Some(text) = &existing {
        if !backup.exists() {
            fs::write(&backup, text).map_err(|error| error.to_string())?;
        }
    }
    if !include.exists() {
        let flat = SystemEqCurve { enabled: false, preamp: 0.0, gains: vec![] };
        fs::write(&include, render_curve(&flat)).map_err(|error| error.to_string())?;
    }
    let text = existing.unwrap_or_default();
    if !text.lines().any(is_include_line) {
        let mut next = text;
        if !next.is_empty() && !next.ends_with('\n') {
            next.push_str("\r\n");
        }
        next.push_str(INCLUDE_LINE);
        next.push_str("\r\n");
        fs::write(&config, next).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Elevated undo: drop our Include line and our file; leave the rest of APO alone.
pub fn unlink(dir: &Path) -> Result<(), String> {
    let config = dir.join("config.txt");
    if let Ok(text) = fs::read_to_string(&config) {
        if text.lines().any(is_include_line) {
            let kept: Vec<&str> = text.split_inclusive('\n').filter(|line| !is_include_line(line)).collect();
            fs::write(&config, kept.concat()).map_err(|error| error.to_string())?;
        }
    }
    match fs::remove_file(dir.join(INCLUDE_FILE)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn valid_account(account: &str) -> bool {
    !account.is_empty()
        && account.len() <= 256
        && account
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, ' ' | '.' | '_' | '-' | '\\' | '$' | '@'))
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::process::CommandExt;

    fn wide(text: &str) -> Vec<u16> {
        std::ffi::OsStr::new(text).encode_wide().chain(Some(0)).collect()
    }

    fn read_hklm_string(subkey: &str, value: &str) -> Option<String> {
        use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
        let subkey = wide(subkey);
        let value = wide(value);
        let mut buffer = vec![0u16; 1024];
        let mut size = (buffer.len() * 2) as u32;
        let status = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                subkey.as_ptr(),
                value.as_ptr(),
                RRF_RT_REG_SZ,
                std::ptr::null_mut(),
                buffer.as_mut_ptr().cast(),
                &mut size,
            )
        };
        if status != 0 {
            return None;
        }
        let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
        Some(String::from_utf16_lossy(&buffer[..len]))
    }

    /// APO's config folder from its own registry key; never from caller input.
    pub fn config_dir() -> Option<PathBuf> {
        read_hklm_string("SOFTWARE\\EqualizerAPO", "ConfigPath")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("ProgramFiles")
                    .map(|root| PathBuf::from(root).join("EqualizerAPO").join("config"))
            })
            .filter(|dir| dir.is_dir())
    }

    pub fn current_account() -> Option<String> {
        let user = std::env::var("USERNAME").ok()?;
        Some(match std::env::var("USERDOMAIN") {
            Ok(domain) if !domain.is_empty() => format!("{domain}\\{user}"),
            _ => user,
        })
    }

    pub fn grant_modify(file: &Path, account: &str) -> Result<(), String> {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let status = std::process::Command::new("icacls")
            .arg(file)
            .arg("/grant")
            .arg(format!("{account}:(M)"))
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() { Ok(()) } else { Err(format!("icacls exited with {status}")) }
    }

    /// Runs this executable elevated (UAC) with the helper flag and waits for it.
    pub fn run_elevated(action: &str, account: &str) -> Result<(), String> {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject, INFINITE};
        use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

        let exe = std::env::current_exe().map_err(|error| error.to_string())?;
        let _ = fs::remove_file(helper_log_path());
        let file = wide(&exe.to_string_lossy());
        let verb = wide("runas");
        let params = wide(&format!("{HELPER_FLAG} {action} \"{account}\""));
        let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
        info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        info.fMask = SEE_MASK_NOCLOSEPROCESS;
        info.lpVerb = verb.as_ptr();
        info.lpFile = file.as_ptr();
        info.lpParameters = params.as_ptr();
        info.nShow = SW_HIDE;
        if unsafe { ShellExecuteExW(&mut info) } == 0 {
            return Err("ยกเลิกการขอสิทธิ์ผู้ดูแลระบบ หรือ Windows ไม่อนุญาต".into());
        }
        if info.hProcess.is_null() {
            return Err("Windows did not return the helper process".into());
        }
        let mut code = 1u32;
        unsafe {
            WaitForSingleObject(info.hProcess, INFINITE);
            GetExitCodeProcess(info.hProcess, &mut code);
            CloseHandle(info.hProcess);
        }
        if code == 0 {
            return Ok(());
        }
        let reason = fs::read_to_string(helper_log_path()).unwrap_or_default();
        Err(format!("ตั้งค่า Equalizer APO ไม่สำเร็จ (exit {code}) {reason}").trim().to_string())
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;
    pub fn config_dir() -> Option<PathBuf> { None }
    pub fn current_account() -> Option<String> { None }
    pub fn grant_modify(_: &Path, _: &str) -> Result<(), String> { Err("Windows only".into()) }
    pub fn run_elevated(_: &str, _: &str) -> Result<(), String> { Err("Equalizer APO is Windows only".into()) }
}

/// Entry point for the elevated helper. Returns `Some(exit code)` when this
/// process was started as the helper, so `main` must not start the app.
pub fn run_helper_from_args() -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) != Some(HELPER_FLAG) {
        return None;
    }
    let result = (|| {
        let dir = platform::config_dir().ok_or("Equalizer APO config folder not found")?;
        match args.get(2).map(String::as_str) {
            Some("link") => {
                let account = args.get(3).filter(|a| valid_account(a)).ok_or("invalid account")?;
                link(&dir)?;
                platform::grant_modify(&dir.join(INCLUDE_FILE), account)
            }
            Some("unlink") => unlink(&dir),
            _ => Err("unknown helper action".to_string()),
        }
    })();
    // The elevated process has no UI: leave the reason where the caller can read it.
    let _ = match &result {
        Ok(()) => fs::remove_file(helper_log_path()),
        Err(error) => fs::write(helper_log_path(), error),
    };
    Some(if result.is_ok() { 0 } else { 2 })
}

#[tauri::command]
pub async fn get_system_eq_status() -> SystemEqStatus {
    tauri::async_runtime::spawn_blocking(|| status_for(platform::config_dir()))
        .await
        .unwrap_or_else(|_| status_for(None))
}

#[tauri::command]
pub async fn setup_system_eq() -> Result<SystemEqStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = platform::config_dir().ok_or("ไม่พบ Equalizer APO ในเครื่องนี้")?;
        // APO's installer gives Users full control of its config folder, so this
        // usually works without elevation. UAC is only the fallback.
        if link(&dir).is_err() {
            let account = platform::current_account().filter(|a| valid_account(a)).ok_or("ไม่พบชื่อบัญชีผู้ใช้")?;
            platform::run_elevated("link", &account)?;
        }
        Ok(status_for(platform::config_dir()))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn remove_system_eq() -> Result<SystemEqStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = platform::config_dir().ok_or("ไม่พบ Equalizer APO ในเครื่องนี้")?;
        if unlink(&dir).is_err() {
            platform::run_elevated("unlink", "-")?;
        }
        Ok(status_for(platform::config_dir()))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn apply_system_eq(curve: SystemEqCurve) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = platform::config_dir().ok_or("ไม่พบ Equalizer APO ในเครื่องนี้")?;
        write_curve(&dir, &curve)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn curve(enabled: bool, preamp: f64, gains: Vec<f64>) -> SystemEqCurve {
        SystemEqCurve { enabled, preamp, gains }
    }

    #[test]
    fn renders_ten_peaking_filters_with_headroom() {
        let text = render_curve(&curve(true, -3.0, vec![5.0, 4.0, 3.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]));
        assert!(text.contains("Preamp: -5.0 dB\r\n"), "{text}");
        assert!(text.contains("Filter 1: ON PK Fc 31 Hz Gain 5.0 dB Q 1.40\r\n"));
        assert!(text.contains("Filter 10: ON PK Fc 16000 Hz Gain 0.0 dB Q 1.40\r\n"));
        assert_eq!(text.matches("ON PK").count(), 10);
    }

    #[test]
    fn keeps_a_lower_user_preamp_and_clamps_bad_values() {
        let text = render_curve(&curve(true, -9.0, vec![f64::NAN, 40.0, -40.0]));
        assert!(text.contains("Preamp: -12.0 dB"), "{text}");
        assert!(text.contains("Filter 1: ON PK Fc 31 Hz Gain 0.0 dB"));
        assert!(text.contains("Filter 3: ON PK Fc 125 Hz Gain -12.0 dB"));
        let cut = render_curve(&curve(true, 2.0, vec![-3.0; 10]));
        assert!(cut.contains("Preamp: 0.0 dB"), "{cut}");
    }

    #[test]
    fn bypass_writes_no_filters() {
        let text = render_curve(&curve(false, -3.0, vec![6.0; 10]));
        assert!(!text.contains("Filter"));
        assert!(text.contains("Preamp: 0 dB"));
    }

    #[test]
    fn link_is_idempotent_and_unlink_restores_the_config() {
        let dir = tempdir().unwrap();
        let original = "Device: all\r\nInclude: example.txt\r\n";
        fs::write(dir.path().join("config.txt"), original).unwrap();
        link(dir.path()).unwrap();
        link(dir.path()).unwrap();
        let linked = fs::read_to_string(dir.path().join("config.txt")).unwrap();
        assert_eq!(linked.matches(INCLUDE_LINE).count(), 1);
        assert_eq!(fs::read_to_string(dir.path().join(BACKUP_FILE)).unwrap(), original);
        let status = status_for(Some(dir.path().to_path_buf()));
        assert!(status.installed && status.linked && status.writable);

        write_curve(dir.path(), &curve(true, 0.0, vec![2.0; 10])).unwrap();
        assert!(fs::read_to_string(dir.path().join(INCLUDE_FILE)).unwrap().contains("Gain 2.0 dB"));

        unlink(dir.path()).unwrap();
        assert_eq!(fs::read_to_string(dir.path().join("config.txt")).unwrap(), original);
        assert!(!dir.path().join(INCLUDE_FILE).exists());
        assert!(!status_for(Some(dir.path().to_path_buf())).linked);
    }

    #[test]
    fn link_appends_after_a_config_without_trailing_newline() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("config.txt"), "Preamp: -2 dB").unwrap();
        link(dir.path()).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("config.txt")).unwrap(),
            "Preamp: -2 dB\r\nInclude: lalin-play.txt\r\n"
        );
    }

    #[test]
    fn write_never_creates_the_file_and_missing_apo_reports_not_installed() {
        let dir = tempdir().unwrap();
        assert!(write_curve(dir.path(), &curve(true, 0.0, vec![])).is_err());
        assert!(!dir.path().join(INCLUDE_FILE).exists());
        assert!(!status_for(None).installed);
        assert!(!status_for(Some(dir.path().join("missing"))).installed);
    }

    #[test]
    fn rejects_accounts_that_could_inject_icacls_arguments() {
        assert!(valid_account("DESKTOP-1\\suan"));
        assert!(!valid_account("x:(F) /T"));
        assert!(!valid_account("a\"b"));
        assert!(!valid_account(""));
    }
}
