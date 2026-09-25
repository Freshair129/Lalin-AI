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
            "register_handoff_owner",
            "publish_handoff_state",
            "complete_handoff_command",
            "grant_handoff_media",
        ]),
    ))
    .expect("generate scoped Play commands");
}
