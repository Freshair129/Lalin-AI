//! CR-010 (personal builds only): two youtube.com "decks" in their own window,
//! with a scripted equal-power crossfade and the user's own unpacked WebView2
//! extensions. Compiled only with the `personal-youtube-web` Cargo feature;
//! `build.rs` refuses release builds that enable it.
//!
//! Play never captures or processes deck audio: it only sets each page's
//! `<video>.volume`, plays and pauses it. Deck audio goes straight to Windows.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewUrl};

pub const WINDOW_LABEL: &str = "youtube-decks";
pub const DECK_LABELS: [&str; 2] = ["deck-a", "deck-b"];
const CUE_PARAM: &str = "lalin_cue";
const FADE_STEP: Duration = Duration::from_millis(50);
const ALLOWED_HOSTS: [&str; 6] = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "accounts.google.com",
    "accounts.youtube.com",
];

// ---------- pure helpers (unit tested) ----------

/// Equal-power gains for crossfade progress `p` in [0, 1]: (outgoing, incoming).
pub fn equal_power(p: f64) -> (f64, f64) {
    let p = if p.is_finite() { p.clamp(0.0, 1.0) } else { 0.0 };
    let angle = p * std::f64::consts::FRAC_PI_2;
    (angle.cos(), angle.sin())
}

fn valid_video_id(id: &str) -> bool {
    id.len() == 11 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn valid_list_id(id: &str) -> bool {
    (2..=64).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Same rules as CR-009 `parseYoutubeUrl`: official https hosts only, no
/// userinfo or port, video or playlist pages only.
pub fn parse_youtube(raw: &str) -> Option<(Option<String>, Option<String>)> {
    let text = raw.trim();
    let authority = text.strip_prefix("https://")?.split(['/', '?', '#']).next()?;
    if authority.is_empty() || authority.contains('@') || authority.contains(':') {
        return None;
    }
    let url = Url::parse(text).ok()?;
    let host = url.host_str()?;
    if !matches!(host, "youtube.com" | "www.youtube.com" | "m.youtube.com" | "music.youtube.com" | "youtu.be" | "www.youtu.be") {
        return None;
    }
    let segments: Vec<&str> = url.path_segments().map(|s| s.filter(|p| !p.is_empty()).collect()).unwrap_or_default();
    let query = |key: &str| url.query_pairs().find(|(k, _)| k == key).map(|(_, v)| v.into_owned());
    let video = if host.ends_with("youtu.be") {
        segments.first().map(|s| s.to_string())
    } else {
        match segments.first().copied() {
            Some("watch") => query("v"),
            Some("shorts" | "embed" | "live") => segments.get(1).map(|s| s.to_string()),
            Some("playlist") => None,
            _ => return None,
        }
    };
    let video = video.filter(|id| valid_video_id(id));
    let list = query("list").filter(|id| valid_list_id(id));
    if video.is_none() && list.is_none() {
        return None;
    }
    Some((video, list))
}

/// The full youtube.com page for a link (not the embed player), optionally cued.
pub fn watch_url(video: Option<&str>, list: Option<&str>, cue: bool) -> Option<String> {
    let mut url = match (video, list) {
        (Some(v), Some(l)) => format!("https://www.youtube.com/watch?v={v}&list={l}"),
        (Some(v), None) => format!("https://www.youtube.com/watch?v={v}"),
        (None, Some(l)) => format!("https://www.youtube.com/playlist?list={l}"),
        (None, None) => return None,
    };
    if cue {
        url.push_str(&format!("&{CUE_PARAM}=1"));
    }
    Some(url)
}

pub fn allowed_navigation(url: &Url) -> bool {
    (url.scheme() == "https" && url.host_str().is_some_and(|h| ALLOWED_HOSTS.contains(&h)))
        || url.scheme() == "about"
}

fn other(deck: usize) -> usize {
    1 - deck
}

// ---------- shared state ----------

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeckInfo {
    pub loaded: bool,
    pub title: String,
    pub time: f64,
    pub duration: f64,
    pub paused: bool,
    pub volume: f64,
    pub ad: bool,
}

#[derive(Debug, Default)]
pub struct DecksState {
    pub open: bool,
    pub decks: [DeckInfo; 2],
    pub active: usize,
    pub auto: bool,
    pub fade_seconds: f64,
    pub fading: bool,
    pub fade_generation: u64,
    pub mix: f64,
}

impl DecksState {
    pub fn new() -> Self {
        Self { fade_seconds: 5.0, ..Self::default() }
    }

    /// Auto mode starts the other deck when the active one is within the fade length of its end.
    pub fn should_auto_start(&self) -> bool {
        let active = &self.decks[self.active];
        let next = &self.decks[other(self.active)];
        self.auto
            && !self.fading
            && active.loaded
            && !active.paused
            && !active.ad
            && active.duration > 0.0
            && active.duration - active.time <= self.fade_seconds
            && next.loaded
            && !next.ad
    }
}

pub type SharedDecks = Mutex<DecksState>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecksSnapshot {
    pub open: bool,
    pub decks: [DeckInfo; 2],
    pub active: usize,
    pub auto: bool,
    pub fade_seconds: f64,
    pub fading: bool,
    pub mix: f64,
    pub extensions_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckReport {
    pub time: f64,
    pub duration: f64,
    pub paused: bool,
    pub volume: f64,
    pub title: String,
    pub ad: bool,
}

// ---------- webview plumbing ----------

fn root_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("personal-youtube"))
}

fn extensions_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = root_dir(app)?.join("extensions");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn snapshot(app: &AppHandle) -> DecksSnapshot {
    let shared = app.state::<SharedDecks>();
    let state = shared.lock().unwrap();
    DecksSnapshot {
        open: state.open,
        decks: state.decks.clone(),
        active: state.active,
        auto: state.auto,
        fade_seconds: state.fade_seconds,
        fading: state.fading,
        mix: state.mix,
        extensions_dir: extensions_dir(app).map(|d| d.to_string_lossy().into_owned()).unwrap_or_default(),
    }
}

fn emit_snapshot(app: &AppHandle) {
    let _ = app.emit("decks-changed", snapshot(app));
}

fn deck_webview(app: &AppHandle, deck: usize) -> Result<Webview, String> {
    app.get_webview(DECK_LABELS[deck]).ok_or_else(|| "YouTube Decks ยังไม่ได้เปิด".to_string())
}

fn eval(app: &AppHandle, deck: usize, js: &str) {
    if let Ok(webview) = deck_webview(app, deck) {
        let _ = webview.eval(js);
    }
}

fn set_volume(app: &AppHandle, deck: usize, volume: f64) {
    let volume = if volume.is_finite() { volume.clamp(0.0, 1.0) } else { 1.0 };
    eval(app, deck, &format!("(()=>{{const v=document.querySelector('video');if(v)v.volume={volume:.4};}})()"));
}

fn play(app: &AppHandle, deck: usize) {
    eval(app, deck, "(()=>{window.__lalinCueDone=true;document.querySelector('video')?.play()?.catch(()=>{});})()");
}

fn pause(app: &AppHandle, deck: usize) {
    eval(app, deck, "document.querySelector('video')?.pause()");
}

/// Runs inside each youtube.com deck page. Reports player state to Play every
/// 250 ms and, for cued loads, holds playback until Play starts the deck.
const DECK_SCRIPT: &str = r##"
(() => {
  if (window.top !== window || window.__lalinDeck) return;
  window.__lalinDeck = true;
  const cued = new URLSearchParams(location.search).get("lalin_cue") === "1";
  if (cued) {
    document.addEventListener("play", (event) => {
      if (!window.__lalinCueDone && event.target instanceof HTMLMediaElement) event.target.pause();
    }, true);
  }
  setInterval(() => {
    const invoke = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
    if (!invoke) return;
    const v = document.querySelector("video");
    const player = document.querySelector("#movie_player");
    invoke("deck_report", { report: {
      time: v ? v.currentTime : 0,
      duration: v && isFinite(v.duration) ? v.duration : 0,
      paused: v ? v.paused : true,
      volume: v ? v.volume : 1,
      title: document.title.replace(/ - YouTube$/, ""),
      ad: !!(player && player.classList.contains("ad-showing")),
    } }).catch(() => {});
  }, 250);
})();
"##;

fn ensure_window(app: &AppHandle) -> Result<(), String> {
    if app.get_window(WINDOW_LABEL).is_some() {
        return Ok(());
    }
    let root = root_dir(app)?;
    let data_dir = root.join("webview");
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let extensions = extensions_dir(app)?;

    let window = tauri::window::WindowBuilder::new(app, WINDOW_LABEL)
        .title("Lalin Play — YouTube Decks (personal)")
        .inner_size(1280.0, 460.0)
        .min_inner_size(640.0, 260.0)
        .build()
        .map_err(|e| e.to_string())?;
    let (width, height) = (1280.0, 460.0);

    for (index, label) in DECK_LABELS.iter().enumerate() {
        let nav_app = app.clone();
        let builder = tauri::webview::WebviewBuilder::new(
            *label,
            WebviewUrl::External(Url::parse("https://www.youtube.com/").unwrap()),
        )
        .data_directory(data_dir.clone())
        // Same args as Tauri's defaults plus autoplay without a click, so Play can start a deck.
        .additional_browser_args(
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required",
        )
        .browser_extensions_enabled(true)
        .extensions_path(&extensions)
        .initialization_script(DECK_SCRIPT)
        .on_navigation(move |url| {
            if allowed_navigation(url) {
                return true;
            }
            use tauri_plugin_opener::OpenerExt;
            let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
            false
        })
        .auto_resize();
        window
            .add_child(
                builder,
                LogicalPosition::new(index as f64 * width / 2.0, 0.0),
                LogicalSize::new(width / 2.0, height),
            )
            .map_err(|e| e.to_string())?;
    }

    let close_app = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            let shared = close_app.state::<SharedDecks>();
            let mut state = shared.lock().unwrap();
            let auto = state.auto;
            let fade_seconds = state.fade_seconds;
            *state = DecksState { auto, fade_seconds, ..DecksState::new() };
            drop(state);
            emit_snapshot(&close_app);
        }
    });
    app.state::<SharedDecks>().lock().unwrap().open = true;
    Ok(())
}

fn start_crossfade(app: &AppHandle, seconds: f64) {
    let (from, to, generation) = {
        let shared = app.state::<SharedDecks>();
        let mut state = shared.lock().unwrap();
        state.fading = true;
        state.fade_generation += 1;
        (state.active, other(state.active), state.fade_generation)
    };
    let seconds = if seconds.is_finite() { seconds.clamp(0.5, 30.0) } else { 5.0 };
    let app = app.clone();
    std::thread::spawn(move || {
        set_volume(&app, to, 0.0);
        play(&app, to);
        let started = Instant::now();
        loop {
            let progress = started.elapsed().as_secs_f64() / seconds;
            let (out_gain, in_gain) = equal_power(progress);
            if app.state::<SharedDecks>().lock().unwrap().fade_generation != generation {
                return; // cancelled by the manual crossfader
            }
            set_volume(&app, from, out_gain);
            set_volume(&app, to, in_gain);
            if progress >= 1.0 {
                break;
            }
            std::thread::sleep(FADE_STEP);
        }
        pause(&app, from);
        set_volume(&app, from, 1.0);
        {
            let shared = app.state::<SharedDecks>();
            let mut state = shared.lock().unwrap();
            if state.fade_generation == generation {
                state.fading = false;
                state.active = to;
                state.mix = to as f64;
            }
        }
        emit_snapshot(&app);
    });
}

// ---------- commands ----------

#[tauri::command]
pub fn deck_status(app: AppHandle) -> DecksSnapshot {
    snapshot(&app)
}

#[tauri::command]
pub async fn deck_open(app: AppHandle) -> Result<DecksSnapshot, String> {
    ensure_window(&app)?;
    if let Some(window) = app.get_window(WINDOW_LABEL) {
        let _ = window.set_focus();
    }
    emit_snapshot(&app);
    Ok(snapshot(&app))
}

#[tauri::command]
pub async fn deck_load(app: AppHandle, deck: usize, url: String) -> Result<DecksSnapshot, String> {
    if deck > 1 {
        return Err("invalid deck".into());
    }
    let (video, list) = parse_youtube(&url).ok_or("ลิงก์นี้เปิดใน deck ไม่ได้")?;
    ensure_window(&app)?;
    let cue = {
        let shared = app.state::<SharedDecks>();
        let state = shared.lock().unwrap();
        // Cue (hold) a deck that is not the one currently playing.
        deck != state.active && state.decks[state.active].loaded && !state.decks[state.active].paused
    };
    let target = watch_url(video.as_deref(), list.as_deref(), cue).ok_or("ลิงก์ไม่ถูกต้อง")?;
    let parsed = Url::parse(&target).map_err(|e| e.to_string())?;
    deck_webview(&app, deck)?.navigate(parsed).map_err(|e| e.to_string())?;
    {
        let shared = app.state::<SharedDecks>();
        let mut state = shared.lock().unwrap();
        state.decks[deck] = DeckInfo { loaded: true, paused: cue, volume: 1.0, ..DeckInfo::default() };
        if !cue {
            state.active = deck;
            state.mix = deck as f64;
        }
    }
    emit_snapshot(&app);
    Ok(snapshot(&app))
}

#[tauri::command]
pub fn deck_play_pause(app: AppHandle, deck: usize, playing: bool) -> Result<(), String> {
    if deck > 1 {
        return Err("invalid deck".into());
    }
    if playing {
        set_volume(&app, deck, 1.0);
        play(&app, deck);
    } else {
        pause(&app, deck);
    }
    Ok(())
}

/// Manual crossfader: 0 = only A, 1 = only B, equal-power in between. Cancels a running fade.
#[tauri::command]
pub fn deck_set_mix(app: AppHandle, mix: f64) -> Result<(), String> {
    let mix = if mix.is_finite() { mix.clamp(0.0, 1.0) } else { 0.0 };
    {
        let shared = app.state::<SharedDecks>();
        let mut state = shared.lock().unwrap();
        state.fade_generation += 1;
        state.fading = false;
        state.mix = mix;
        state.active = if mix >= 0.5 { 1 } else { 0 };
    }
    let (a, b) = equal_power(mix);
    set_volume(&app, 0, a);
    set_volume(&app, 1, b);
    emit_snapshot(&app);
    Ok(())
}

#[tauri::command]
pub fn deck_crossfade(app: AppHandle, seconds: f64) -> Result<(), String> {
    {
        let shared = app.state::<SharedDecks>();
        let state = shared.lock().unwrap();
        if !state.decks[other(state.active)].loaded {
            return Err("ยังไม่มีเพลงใน deck ถัดไป".into());
        }
    }
    start_crossfade(&app, seconds);
    emit_snapshot(&app);
    Ok(())
}

#[tauri::command]
pub fn deck_set_auto(app: AppHandle, enabled: bool, fade_seconds: f64) {
    {
        let shared = app.state::<SharedDecks>();
        let mut state = shared.lock().unwrap();
        state.auto = enabled;
        if fade_seconds.is_finite() {
            state.fade_seconds = fade_seconds.clamp(0.5, 30.0);
        }
    }
    emit_snapshot(&app);
}

#[tauri::command]
pub fn deck_open_extensions_folder(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = extensions_dir(&app)?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Called only by the deck pages (remote capability scoped to deck webviews and youtube.com).
/// The deck is identified by the calling webview's label, never by page input.
#[tauri::command]
pub fn deck_report(app: AppHandle, webview: Webview, report: DeckReport) {
    let Some(deck) = DECK_LABELS.iter().position(|label| *label == webview.label()) else {
        return;
    };
    let start_auto = {
        let shared = app.state::<SharedDecks>();
        let mut state = shared.lock().unwrap();
        let info = &mut state.decks[deck];
        info.loaded = true;
        info.time = if report.time.is_finite() { report.time.max(0.0) } else { 0.0 };
        info.duration = if report.duration.is_finite() { report.duration.max(0.0) } else { 0.0 };
        info.paused = report.paused;
        info.volume = report.volume.clamp(0.0, 1.0);
        info.ad = report.ad;
        info.title = report.title.chars().take(200).collect();
        state.should_auto_start()
    };
    if start_auto {
        let seconds = app.state::<SharedDecks>().lock().unwrap().fade_seconds;
        start_crossfade(&app, seconds);
    }
    emit_snapshot(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equal_power_keeps_constant_power_and_clamps() {
        for i in 0..=20 {
            let (a, b) = equal_power(i as f64 / 20.0);
            assert!((a * a + b * b - 1.0).abs() < 1e-9);
        }
        assert_eq!(equal_power(0.0), (1.0, 0.0));
        let (a, b) = equal_power(1.0);
        assert!(a.abs() < 1e-9 && (b - 1.0).abs() < 1e-9);
        assert_eq!(equal_power(-3.0), (1.0, 0.0));
        assert_eq!(equal_power(f64::NAN), (1.0, 0.0));
        let (a, b) = equal_power(0.5);
        assert!((a - 0.7071).abs() < 0.02 && (b - 0.7071).abs() < 0.02);
    }

    #[test]
    fn parses_the_same_links_as_cr009() {
        assert_eq!(parse_youtube("https://youtu.be/-fMEMCLuY7M?si=x"), Some((Some("-fMEMCLuY7M".into()), None)));
        assert_eq!(
            parse_youtube("https://music.youtube.com/watch?v=yTwCRr3amV4&list=PL123abc"),
            Some((Some("yTwCRr3amV4".into()), Some("PL123abc".into())))
        );
        assert_eq!(parse_youtube("https://www.youtube.com/playlist?list=PL123abc"), Some((None, Some("PL123abc".into()))));
        for bad in [
            "http://www.youtube.com/watch?v=M7lc1UVf-VE",
            "https://youtube.com.evil.test/watch?v=M7lc1UVf-VE",
            "https://user@youtube.com/watch?v=M7lc1UVf-VE",
            "https://youtube.com:443/watch?v=M7lc1UVf-VE",
            "https://www.youtube.com/watch?v=short",
            "https://www.youtube.com/@channel",
            "not a url",
        ] {
            assert_eq!(parse_youtube(bad), None, "{bad}");
        }
    }

    #[test]
    fn builds_full_watch_pages_and_cue_flag() {
        assert_eq!(watch_url(Some("-fMEMCLuY7M"), None, false).unwrap(), "https://www.youtube.com/watch?v=-fMEMCLuY7M");
        assert_eq!(
            watch_url(Some("-fMEMCLuY7M"), Some("PL1"), true).unwrap(),
            "https://www.youtube.com/watch?v=-fMEMCLuY7M&list=PL1&lalin_cue=1"
        );
        assert!(watch_url(None, None, false).is_none());
    }

    #[test]
    fn navigation_stays_on_youtube_and_google_sign_in() {
        assert!(allowed_navigation(&Url::parse("https://www.youtube.com/watch?v=x").unwrap()));
        assert!(allowed_navigation(&Url::parse("https://accounts.google.com/signin").unwrap()));
        assert!(!allowed_navigation(&Url::parse("https://evil.test/").unwrap()));
        assert!(!allowed_navigation(&Url::parse("http://www.youtube.com/").unwrap()));
    }

    #[test]
    fn auto_mode_starts_only_near_the_end_with_a_loaded_next_deck() {
        let mut state = DecksState::new();
        state.auto = true;
        state.fade_seconds = 6.0;
        state.decks[0] = DeckInfo { loaded: true, duration: 200.0, time: 100.0, paused: false, ..Default::default() };
        assert!(!state.should_auto_start(), "too early");
        state.decks[0].time = 195.0;
        assert!(!state.should_auto_start(), "next deck empty");
        state.decks[1].loaded = true;
        assert!(state.should_auto_start());
        state.decks[0].ad = true;
        assert!(!state.should_auto_start(), "not during an ad");
        state.decks[0].ad = false;
        state.fading = true;
        assert!(!state.should_auto_start(), "already fading");
        state.fading = false;
        state.auto = false;
        assert!(!state.should_auto_start(), "auto off");
    }
}
