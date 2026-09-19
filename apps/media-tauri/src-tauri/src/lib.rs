mod dial;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

const MEDIA_LABEL: &str = "media";
const MEDIA_TITLE: &str = "Lalin Media";
const LEANBACK_URL: &str = "https://www.youtube.com/tv";
const USER_AGENT: &str =
    "Mozilla/5.0 (PS4; Leanback Shell) Cobalt/25.lts.40.1035033; compatible; VacuumTube/1.8.2";
const INJECTED_SCRIPT: &str = include_str!("../injected.js");

fn focus_media(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MEDIA_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn seed_settings(app: &tauri::AppHandle) {
    let Ok(store) = app.store("media-settings.json") else {
        eprintln!("Lalin Media: settings store unavailable; using defaults for this run");
        return;
    };

    if store.get("fullscreen").is_none() {
        store.set("fullscreen", false);
    }
    if store.get("keepOnTop").is_none() {
        store.set("keepOnTop", false);
    }
    if store.get("adFilterMode").is_none() {
        store.set("adFilterMode", "upstream-only");
    }

    if let Err(error) = store.save() {
        eprintln!("Lalin Media: settings store could not be saved: {error}");
    }
}

fn read_bool_setting(app: &tauri::AppHandle, key: &str) -> bool {
    app.store("media-settings.json")
        .ok()
        .and_then(|store| store.get(key).and_then(|value| value.as_bool()))
        .unwrap_or(false)
}

fn write_bool_setting(app: &tauri::AppHandle, key: &str, value: bool) {
    if let Ok(store) = app.store("media-settings.json") {
        store.set(key, value);
        let _ = store.save();
    }
}

fn build_media_window(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if app.get_webview_window(MEDIA_LABEL).is_some() {
        focus_media(app);
        return Ok(());
    }

    let url = tauri::Url::parse(LEANBACK_URL).expect("LEANBACK_URL must be valid");
    let fullscreen = read_bool_setting(app, "fullscreen");
    let keep_on_top = read_bool_setting(app, "keepOnTop");
    let fullscreen_item = MenuItemBuilder::with_id("toggle-fullscreen", "เต็มหน้าจอ").build(app)?;
    let keep_on_top_item = MenuItemBuilder::with_id("toggle-on-top", "อยู่ด้านบนเสมอ").build(app)?;
    let reload_item = MenuItemBuilder::with_id("reload", "โหลดใหม่").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "ออกจาก Lalin Media").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[
            &fullscreen_item,
            &keep_on_top_item,
            &reload_item,
            &quit_item,
        ])
        .build()?;

    WebviewWindowBuilder::new(app, MEDIA_LABEL, WebviewUrl::External(url))
        .title(MEDIA_TITLE)
        .inner_size(1200.0, 675.0)
        .min_inner_size(720.0, 405.0)
        .resizable(true)
        .fullscreen(fullscreen)
        .always_on_top(keep_on_top)
        .menu(menu)
        .on_menu_event(|window, event| match event.id().as_ref() {
            "toggle-fullscreen" => {
                if let Ok(current) = window.is_fullscreen() {
                    let next = !current;
                    let _ = window.set_fullscreen(next);
                    write_bool_setting(&window.app_handle(), "fullscreen", next);
                }
            }
            "toggle-on-top" => {
                if let Ok(current) = window.is_always_on_top() {
                    let next = !current;
                    let _ = window.set_always_on_top(next);
                    write_bool_setting(&window.app_handle(), "keepOnTop", next);
                }
            }
            "reload" => {
                if let Some(webview) = window.app_handle().get_webview_window(MEDIA_LABEL) {
                    let _ = webview.reload();
                }
            }
            "quit" => window.app_handle().exit(0),
            _ => {}
        })
        .user_agent(USER_AGENT)
        .initialization_script(INJECTED_SCRIPT)
        .on_document_title_changed(|window, _| {
            let _ = window.set_title(MEDIA_TITLE);
        })
        .build()?
        .show()?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_media(app);
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            seed_settings(app.handle());
            match dial::start(app.handle()) {
                Ok(state) => {
                    app.manage(state);
                }
                Err(error) => {
                    eprintln!("Lalin Media: DIAL is unavailable: {error}");
                    app.manage(dial::disabled_state());
                }
            }
            build_media_window(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dial::dial_get_info,
            dial::dial_respond,
            dial::dial_set_device_id
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lalin Media");
}
