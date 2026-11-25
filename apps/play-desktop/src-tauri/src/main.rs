#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // CR-009: the elevated Equalizer APO setup helper must exit before the app
    // (and its single-instance guard) starts.
    if let Some(code) = lalin_play_lib::system_eq::run_helper_from_args() {
        std::process::exit(code);
    }
    lalin_play_lib::run()
}
