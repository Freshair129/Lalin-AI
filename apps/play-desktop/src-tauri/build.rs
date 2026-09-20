fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_library",
            "select_media",
            "remove_library_track",
            "resolve_media",
            "set_surface",
            "get_compact_fullscreen",
            "set_compact_fullscreen",
            "set_tv",
            "quit_play",
        ]),
    ))
    .expect("generate scoped Play commands");
}
