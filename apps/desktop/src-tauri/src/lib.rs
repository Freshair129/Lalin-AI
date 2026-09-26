// G-Music Tauri entry (v2) — spawn backend sidecar + ปิดให้เรียบร้อยตอนออก
//
// หมายเหตุเรื่องสิทธิ์: capability ของ Tauri v2 คุมเฉพาะ IPC command ที่เรียกจาก
// webview — การ spawn จากฝั่ง Rust ตรงนี้ไม่ต้องเพิ่ม `shell:allow-execute`
// (และไม่ควรเพิ่ม เพราะจะเปิดให้หน้าเว็บรัน binary อะไรก็ได้โดยไม่จำเป็น)
use std::env;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

mod playback_handoff;

const BACKEND_PORT: u16 = 8756;
const BACKEND_VERSION: &str = env!("CARGO_PKG_VERSION");

fn backend_profile() -> &'static str {
    match option_env!("GMUSIC_BACKEND_PROFILE") {
        Some("lite") => "lite",
        _ => "full",
    }
}

/// เก็บ handle ของ sidecar ไว้ kill ตอนปิดแอป
struct Sidecar(Mutex<Option<CommandChild>>);

/// เก็บ process ของ Lalin Cast ที่ Studio เป็นผู้เปิดไว้
struct MediaProcess(Mutex<Option<Child>>);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaLifecycleState {
    state: String,
    request_id: String,
    pid: Option<u32>,
    exit_code: Option<i32>,
    code: Option<String>,
    message: Option<String>,
}

fn media_state(state: &str, request_id: String) -> MediaLifecycleState {
    MediaLifecycleState {
        state: state.to_owned(),
        request_id,
        pid: None,
        exit_code: None,
        code: None,
        message: None,
    }
}

fn media_failure(request_id: String, code: &str, message: String) -> MediaLifecycleState {
    MediaLifecycleState {
        state: "failed".to_owned(),
        request_id,
        pid: None,
        exit_code: None,
        code: Some(code.to_owned()),
        message: Some(message),
    }
}

fn cast_launch_spec() -> Result<(PathBuf, PathBuf), String> {
    if let Ok(raw_executable) = env::var("LALIN_CAST_EXECUTABLE") {
        let executable = PathBuf::from(raw_executable);
        if !executable.is_file() {
            return Err(format!(
                "ไม่พบ Lalin Cast executable ที่ {}",
                executable.display()
            ));
        }

        let workdir = env::var_os("LALIN_CAST_WORKDIR")
            .map(PathBuf::from)
            .or_else(|| executable.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| PathBuf::from("."));
        return Ok((executable, workdir));
    }

    let executable = env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join("lalin-cast.exe")))
        .ok_or_else(|| "ไม่สามารถระบุตำแหน่ง Lalin Cast runtime ได้".to_owned())?;
    if !executable.is_file() {
        return Err(format!(
            "ไม่พบ Lalin Cast runtime ที่ {} กรุณาตั้งค่า LALIN_CAST_EXECUTABLE หรือวาง lalin-cast.exe ไว้ข้าง Studio",
            executable.display()
        ));
    }
    let workdir = executable
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    Ok((executable, workdir))
}

fn spawn_media_process(executable: &Path, workdir: &Path, focus: bool) -> Result<Child, String> {
    let mut command = Command::new(executable);
    command
        .current_dir(workdir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if focus {
        command.arg("--lalin-focus");
    }
    command.spawn().map_err(|error| {
        format!(
            "ไม่สามารถเปิด Lalin Cast ได้จาก {}: {error}",
            executable.display()
        )
    })
}

fn reap_media_process(process: &mut Option<Child>) -> Result<Option<u32>, String> {
    let Some(child) = process.as_mut() else {
        return Ok(None);
    };

    match child.try_wait() {
        Ok(None) => Ok(Some(child.id())),
        Ok(Some(_)) => {
            *process = None;
            Ok(None)
        }
        Err(error) => Err(format!("ตรวจสถานะ Lalin Cast ไม่สำเร็จ: {error}")),
    }
}

#[tauri::command]
fn media_lifecycle(
    action: String,
    request_id: String,
    state: tauri::State<'_, MediaProcess>,
) -> Result<MediaLifecycleState, String> {
    let mut process = state
        .0
        .lock()
        .map_err(|_| "ไม่สามารถล็อกสถานะ Lalin Cast ได้".to_owned())?;
    let existing_pid = reap_media_process(&mut process)?;

    match action.as_str() {
        "status" => {
            if let Some(pid) = existing_pid {
                let mut result = media_state("ready", request_id);
                result.pid = Some(pid);
                Ok(result)
            } else {
                Ok(media_state("stopped", request_id))
            }
        }
        "close" => {
            if let Some(mut child) = process.take() {
                let _ = child.kill();
                let exit_code = child.wait().ok().and_then(|status| status.code());
                let mut result = media_state("stopped", request_id);
                result.exit_code = exit_code;
                Ok(result)
            } else {
                Ok(media_state("stopped", request_id))
            }
        }
        "launch" | "focus" => {
            if let Some(pid) = existing_pid {
                let (executable, workdir) = cast_launch_spec().map_err(|error| error.to_owned())?;
                spawn_media_process(&executable, &workdir, true)
                    .map(|_| ())
                    .map_err(|error| error.to_owned())?;
                let mut result = media_state("ready", request_id);
                result.pid = Some(pid);
                return Ok(result);
            }

            let (executable, workdir) = cast_launch_spec()?;
            let child = spawn_media_process(&executable, &workdir, false)?;
            let pid = child.id();
            process.replace(child);
            let mut result = media_state("starting", request_id);
            result.pid = Some(pid);
            Ok(result)
        }
        _ => Ok(media_failure(
            request_id,
            "MEDIA_ACTION_UNSUPPORTED",
            format!("ไม่รู้จักคำสั่ง Lalin Cast: {action}"),
        )),
    }
}

/// มี backend ตอบอยู่แล้วไหม (นักพัฒนารัน uvicorn เองอยู่ / เปิดแอปซ้อน)
fn backend_already_running() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], BACKEND_PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

fn spawn_backend(app: &tauri::AppHandle) {
    // dev รัน backend เองผ่าน dev.bat อยู่แล้ว — spawn ซ้ำจะชนพอร์ต 8756
    if cfg!(debug_assertions) {
        log::info!("dev build — ข้าม sidecar (dev.bat รัน uvicorn เองอยู่แล้ว)");
        return;
    }

    if backend_already_running() {
        log::info!("พบ backend ที่พอร์ต {BACKEND_PORT} อยู่แล้ว — ไม่ spawn sidecar ซ้ำ");
        return;
    }

    let command = match app.shell().sidecar("g-music-backend") {
        Ok(c) => c,
        Err(e) => {
            log::error!("หา sidecar ไม่เจอ: {e}");
            return;
        }
    };
    let command = command
        .env("GMUSIC_BACKEND_PROFILE", backend_profile())
        .env("GMUSIC_BACKEND_VERSION", BACKEND_VERSION);

    match command.spawn() {
        Ok((mut rx, child)) => {
            app.manage(Sidecar(Mutex::new(Some(child))));
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stderr(line) => {
                            log::info!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(payload) => {
                            log::error!("backend จบการทำงาน: {:?}", payload.code);
                            break;
                        }
                        _ => {}
                    }
                }
            });
        }
        Err(e) => log::error!("spawn sidecar ไม่สำเร็จ: {e}"),
    }
}

fn kill_backend(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<Sidecar>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

fn kill_media(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<MediaProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(MediaProcess(Mutex::new(None)))
        .manage(playback_handoff::StudioHandoffClient::default())
        .invoke_handler(tauri::generate_handler![
            media_lifecycle,
            playback_handoff::handoff_playback,
            playback_handoff::focus_play_window,
            playback_handoff::get_playback_state,
            playback_handoff::reconcile_playback_handoff
        ])
        .setup(|app| {
            spawn_backend(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                kill_backend(app);
                kill_media(app);
            }
        });
}
