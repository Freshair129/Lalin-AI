// ป้องกันหน้าต่าง console เด้งบน Windows ตอน release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    g_music_lib::run()
}
