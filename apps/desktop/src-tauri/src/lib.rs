// G-Music Tauri entry (v2) — spawn backend sidecar + ปิดให้เรียบร้อยตอนออก
//
// หมายเหตุเรื่องสิทธิ์: capability ของ Tauri v2 คุมเฉพาะ IPC command ที่เรียกจาก
// webview — การ spawn จากฝั่ง Rust ตรงนี้ไม่ต้องเพิ่ม `shell:allow-execute`
// (และไม่ควรเพิ่ม เพราะจะเปิดให้หน้าเว็บรัน binary อะไรก็ได้โดยไม่จำเป็น)
use std::net::{SocketAddr, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            spawn_backend(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                kill_backend(app);
            }
        });
}
