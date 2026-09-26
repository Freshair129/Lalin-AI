fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_library",
            "select_media",
            "remove_library_track",
            "resolve_media",
            "preview_play_migration",
            "prepare_play_migration",
            "apply_play_migration",
            "commit_play_migration",
            "rollback_play_migration",
            "recover_play_migration",
            "ack_play_migration",
            "get_play_migration_undo_status",
            "prepare_undo_play_migration",
            "set_surface",
            "get_compact_fullscreen",
            "set_compact_fullscreen",
            "set_tv",
            "quit_play",
        ]),
    ))
    .expect("generate scoped Play commands");
}
