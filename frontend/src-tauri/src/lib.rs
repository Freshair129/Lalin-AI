// G-Music Tauri entry (v2)

use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let (_rx, child) = app
                .shell()
                .sidecar("g-music-backend")?
                .env("GMUSIC_BACKEND_PROFILE", "full")
                .spawn()?;
            app.manage(child);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
