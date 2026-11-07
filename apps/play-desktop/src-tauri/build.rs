fn main() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-env-changed=TAURI_CONFIG");
    if std::env::var("PROFILE").is_ok_and(|profile| profile == "release") {
        let config_path = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("tauri.conf.json");
        let config = std::fs::read_to_string(&config_path)
            .expect("read Play Tauri configuration for release signing guard");
        // `tauri build --config <json>` passes overrides through TAURI_CONFIG and
        // tauri-build merges them; a real pubkey supplied there satisfies the guard.
        let overridden = std::env::var("TAURI_CONFIG").is_ok_and(|merged| {
            merged.contains("\"pubkey\"")
                && !merged.contains("REPLACE_WITH_PLAY_UPDATER_PUBLIC_KEY")
        });
        if !overridden && config.contains("REPLACE_WITH_PLAY_UPDATER_PUBLIC_KEY") {
            panic!("release build blocked: configure the Play updater public key before building");
        }
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_library",
            "list_damaged_tracks",
            "select_media",
            "select_relink_file",
            "relink_track",
            "select_restore_file",
            "restore_managed_track",
            "remove_library_track",
            "set_track_favorite",
            "record_listen",
            "list_youtube_links",
            "add_youtube_link",
            "remove_youtube_link",
            "open_youtube_link",
            "get_cache_settings",
            "set_cache_settings",
            "resolve_media",
            "analyze_smart_medley_pair",
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
            "register_handoff_owner",
            "publish_handoff_state",
            "complete_handoff_command",
            "grant_handoff_media",
        ]),
    ))
    .expect("generate scoped Play commands");
}
