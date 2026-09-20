mod library;

use library::LibraryState;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WindowEvent,
};

struct Presentation {
    compact: bool,
    full: PhysicalSize<u32>,
    small: PhysicalSize<u32>,
    fullscreen_restore: Option<WindowPlacement>,
}

#[derive(Clone, Copy)]
struct WindowPlacement {
    size: PhysicalSize<u32>,
    position: PhysicalPosition<i32>,
    maximized: bool,
}

// เก็บเฉพาะ windowed placement; ห้ามจำขนาด fullscreen แทน Compact
fn restore_compact_window(
    window: &tauri::WebviewWindow,
    mode: &mut Presentation,
) -> Result<Option<WindowPlacement>, String> {
    let placement = mode.fullscreen_restore;
    if let Some(saved) = placement {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        if saved.maximized {
            window.maximize().map_err(|e| e.to_string())?;
        } else {
            window.unmaximize().map_err(|e| e.to_string())?;
            window.set_size(saved.size).map_err(|e| e.to_string())?;
            window
                .set_position(saved.position)
                .map_err(|e| e.to_string())?;
        }
        mode.fullscreen_restore = None;
    }
    Ok(placement)
}

#[tauri::command]
fn get_compact_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    window.is_fullscreen().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_compact_fullscreen(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Mutex<Presentation>>,
    enabled: bool,
) -> Result<bool, String> {
    let mut mode = state.lock().map_err(|e| e.to_string())?;
    if !mode.compact {
        return Err("Fullscreen นี้ใช้กับ Compact เท่านั้น".into());
    }
    if enabled {
        if mode.fullscreen_restore.is_none() {
            mode.fullscreen_restore = Some(WindowPlacement {
                size: window.inner_size().map_err(|e| e.to_string())?,
                position: window.outer_position().map_err(|e| e.to_string())?,
                maximized: window.is_maximized().map_err(|e| e.to_string())?,
            });
        }
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
    } else {
        restore_compact_window(&window, &mut mode)?;
    }
    window.is_fullscreen().map_err(|e| e.to_string())
}

fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn set_surface(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Mutex<Presentation>>,
    compact: bool,
    video: Option<bool>,
) -> Result<(), String> {
    let mut mode = state.lock().map_err(|e| e.to_string())?;
    let minimum = surface_minimum(compact, video.unwrap_or(false));
    if mode.compact == compact {
        window
            .set_min_size(Some(minimum))
            .map_err(|e| e.to_string())?;
        if compact && video.unwrap_or(false) {
            let size = window
                .inner_size()
                .map_err(|e| e.to_string())?
                .to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?);
            if size.height < minimum.height {
                window
                    .set_size(LogicalSize::new(
                        size.width.max(minimum.width),
                        minimum.height,
                    ))
                    .map_err(|e| e.to_string())?;
            }
        }
        return Ok(());
    }
    let restored = restore_compact_window(&window, &mut mode)?;
    window.set_fullscreen(false).map_err(|e| e.to_string())?;
    if mode.compact {
        mode.small = compact_size_after_exit(
            mode.small,
            restored,
            window.inner_size().map_err(|e| e.to_string())?,
        );
    } else {
        mode.full = window.inner_size().map_err(|e| e.to_string())?;
    }
    window.unmaximize().map_err(|e| e.to_string())?;
    window
        .set_min_size(Some(minimum))
        .map_err(|e| e.to_string())?;
    let desired = if compact { mode.small } else { mode.full };
    let mut logical = desired.to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?);
    logical.width = logical.width.max(minimum.width);
    logical.height = logical.height.max(minimum.height);
    window.set_size(logical).map_err(|e| e.to_string())?;
    mode.compact = compact;
    Ok(())
}

fn compact_size_after_exit(
    previous: PhysicalSize<u32>,
    restored: Option<WindowPlacement>,
    current: PhysicalSize<u32>,
) -> PhysicalSize<u32> {
    match restored {
        Some(saved) if saved.maximized => previous,
        Some(saved) => saved.size,
        None => current,
    }
}

fn surface_minimum(compact: bool, _video: bool) -> LogicalSize<f64> {
    if compact {
        LogicalSize::new(440., 300.)
    } else {
        LogicalSize::new(840., 620.)
    }
}

#[cfg(test)]
mod presentation_tests {
    use super::*;
    #[test]
    fn overlay_video_shares_minimal_audio_bounds() {
        assert_eq!(surface_minimum(true, false).height, 300.);
        assert_eq!(surface_minimum(true, true).height, 300.);
        assert_eq!(surface_minimum(false, true), surface_minimum(false, false));
    }
    #[test]
    fn fullscreen_bounds_never_replace_compact_bounds() {
        let small = PhysicalSize::new(500, 340);
        let fullscreen = PhysicalSize::new(1920, 1080);
        let saved = WindowPlacement {
            size: small,
            position: PhysicalPosition::new(40, 50),
            maximized: false,
        };
        assert_eq!(
            compact_size_after_exit(small, Some(saved), fullscreen),
            small
        );
        assert_eq!(
            compact_size_after_exit(
                small,
                Some(WindowPlacement {
                    size: fullscreen,
                    maximized: true,
                    ..saved
                }),
                fullscreen
            ),
            small
        );
        assert_eq!(
            compact_size_after_exit(small, None, PhysicalSize::new(440, 300)),
            PhysicalSize::new(440, 300)
        );
    }
}

#[tauri::command]
fn set_tv(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    window.set_fullscreen(enabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_play(app: AppHandle) {
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show(app)
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(Presentation {
            compact: false,
            full: PhysicalSize::new(1120, 740),
            small: PhysicalSize::new(500, 340),
            fullscreen_restore: None,
        }))
        .setup(|app| {
            let library = library::initialize(app.handle()).map_err(std::io::Error::other)?;
            app.manage(LibraryState(Mutex::new(library)));
            let open = MenuItem::with_id(app, "open", "เปิด Lalin Play", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "ออกจาก Lalin Play", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut pixels = vec![0u8; 32 * 32 * 4];
            for y in 0..32 {
                for x in 0..32 {
                    let offset = (y * 32 + x) * 4;
                    let play = x >= 11 && x <= 23 && (y as i32 - 16).abs() <= ((23 - x) / 2) as i32;
                    pixels[offset..offset + 4].copy_from_slice(if play {
                        &[20, 26, 20, 255]
                    } else {
                        &[205, 242, 63, 255]
                    });
                }
            }
            TrayIconBuilder::new()
                .icon(tauri::image::Image::new_owned(pixels, 32, 32))
                .tooltip("Lalin Play — เล่นต่อเมื่อซ่อนหน้าต่าง")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                let app = window.app_handle().clone();
                let paths = paths.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Err(error) = library::import_selected(&app, paths) {
                        let _ = app.emit("play-import-error", error);
                    }
                });
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            library::get_library,
            library::select_media,
            library::remove_library_track,
            library::resolve_media,
            set_surface,
            get_compact_fullscreen,
            set_compact_fullscreen,
            set_tv,
            quit_play
        ])
        .run(tauri::generate_context!())
        .expect("Lalin Play startup failed; existing data was not reset");
}
