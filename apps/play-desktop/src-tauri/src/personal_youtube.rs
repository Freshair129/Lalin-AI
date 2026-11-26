//! CR-010/CR-011 (personal builds only): two youtube.com "decks" in their own
//! window, with a scripted equal-power crossfade, the user's own unpacked
//! WebView2 extensions, YouTube search from Play, and Play's transport bar
//! driving the decks. Compiled only with the `personal-youtube-web` Cargo
//! feature; `build.rs` refuses release builds that enable it.
//!
//! Play never captures or processes deck audio: it only sets each page's
//! `<video>.volume`, plays, pauses and seeks it. Deck audio goes straight to Windows.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewUrl};

pub const WINDOW_LABEL: &str = "youtube-decks";
pub const DECK_LABELS: [&str; 2] = ["deck-a", "deck-b"];
pub const SEARCH_WINDOW_LABEL: &str = "youtube-search";
pub const SEARCH_LABEL: &str = "deck-search";
const CUE_PARAM: &str = "lalin_cue";
const FADE_STEP: Duration = Duration::from_millis(50);
const STALE_REPORT_WINDOW: Duration = Duration::from_secs(6);
const SEARCH_TIMEOUT: Duration = Duration::from_secs(15);
/// The first navigation after the deck browser starts can stall; retry once after this.
const LOAD_RETRY_AFTER: Duration = Duration::from_secs(6);
const SEARCH_IDLE_CLOSE: Duration = Duration::from_secs(120);
const MAX_SEARCH_RESULTS: usize = 20;
const MEDIA_KEY_ACTIONS: [&str; 5] = ["play", "pause", "nexttrack", "previoustrack", "stop"];
const ALLOWED_HOSTS: [&str; 6] = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "accounts.google.com",
    "accounts.youtube.com",
];
// Every webview on the shared deck profile must use identical environment options.
const BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

// ---------- pure helpers (unit tested) ----------

/// Equal-power gains for crossfade progress `p` in [0, 1]: (outgoing, incoming).
pub fn equal_power(p: f64) -> (f64, f64) {
    let p = if p.is_finite() { p.clamp(0.0, 1.0) } else { 0.0 };
    let angle = p * std::f64::consts::FRAC_PI_2;
    (angle.cos(), angle.sin())
}

/// The `<video>.volume` a deck should have: its crossfade gain times Play's master volume.
pub fn effective_volume(gain: f64, master: f64, muted: bool) -> f64 {
    let clean = |v: f64, fallback: f64| if v.is_finite() { v.clamp(0.0, 1.0) } else { fallback };
    if muted {
        0.0
    } else {
        clean(gain, 1.0) * clean(master, 1.0)
    }
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

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub video_id: String,
    pub title: String,
    pub channel: String,
    pub duration: String,
}

fn text_at<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    path.iter().try_fold(value, |v, key| v.get(key))?.as_str().filter(|s| !s.trim().is_empty())
}

fn is_clock(text: &str) -> bool {
    let parts: Vec<&str> = text.split(':').collect();
    (2..=3).contains(&parts.len())
        && parts.iter().all(|p| !p.is_empty() && p.len() <= 2 && p.bytes().all(|b| b.is_ascii_digit()))
}

/// First duration-looking badge text ("4:02", "1:02:33") anywhere under `value`.
fn find_clock(value: &Value) -> Option<String> {
    match value {
        Value::Object(map) => {
            if let Some(text) = map.get("thumbnailBadgeViewModel").and_then(|b| b.get("text")).and_then(Value::as_str) {
                if is_clock(text) {
                    return Some(text.to_string());
                }
            }
            map.values().find_map(find_clock)
        }
        Value::Array(items) => items.iter().find_map(find_clock),
        _ => None,
    }
}

fn lockup_result(lockup: &Value) -> Option<SearchResult> {
    if lockup.get("contentType")?.as_str()? != "LOCKUP_CONTENT_TYPE_VIDEO" {
        return None;
    }
    let video_id = lockup.get("contentId")?.as_str()?.to_string();
    let meta = lockup.get("metadata")?.get("lockupMetadataViewModel")?;
    let title = text_at(meta, &["title", "content"])?.to_string();
    // Live streams and premieres have no duration badge: skip them.
    let duration = find_clock(lockup.get("contentImage")?)?;
    let channel = meta
        .get("metadata")
        .and_then(|m| m.get("contentMetadataViewModel"))
        .and_then(|m| m.get("metadataRows"))
        .and_then(Value::as_array)
        .and_then(|rows| rows.first())
        .and_then(|row| row.get("metadataParts"))
        .and_then(Value::as_array)
        .and_then(|parts| {
            parts.iter().find_map(|part| {
                text_at(part, &["text", "content"])
                    .or_else(|| text_at(part, &["avatarStack", "avatarStackViewModel", "text", "content"]))
            })
        })
        .unwrap_or_default()
        .to_string();
    Some(SearchResult { video_id, title, channel, duration })
}

/// Older results markup, kept so a rollback on YouTube's side still parses.
fn legacy_result(renderer: &Value) -> Option<SearchResult> {
    let video_id = renderer.get("videoId")?.as_str()?.to_string();
    let title = text_at(renderer, &["title", "runs"])
        .map(str::to_string)
        .or_else(|| {
            renderer.get("title")?.get("runs")?.as_array()?.first()?.get("text")?.as_str().map(str::to_string)
        })?;
    let duration = text_at(renderer, &["lengthText", "simpleText"]).filter(|t| is_clock(t))?.to_string();
    let channel = renderer
        .get("ownerText")
        .and_then(|o| o.get("runs"))
        .and_then(Value::as_array)
        .and_then(|runs| runs.first())
        .and_then(|run| run.get("text"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    Some(SearchResult { video_id, title, channel, duration })
}

fn collect_results(value: &Value, out: &mut Vec<SearchResult>) {
    if out.len() >= MAX_SEARCH_RESULTS {
        return;
    }
    match value {
        Value::Object(map) => {
            let found = map
                .get("lockupViewModel")
                .and_then(lockup_result)
                .or_else(|| map.get("videoRenderer").and_then(legacy_result));
            if let Some(result) = found {
                if valid_video_id(&result.video_id) && !out.iter().any(|r| r.video_id == result.video_id) {
                    out.push(SearchResult { title: result.title.chars().take(200).collect(), ..result });
                }
                return;
            }
            for child in map.values() {
                collect_results(child, out);
            }
        }
        Value::Array(items) => items.iter().for_each(|item| collect_results(item, out)),
        _ => {}
    }
}

/// Videos from a youtube.com results page's `ytInitialData`. Shorts
/// (`shortsLockupViewModel`), playlists, live streams and ads are skipped.
pub fn parse_search_results(data: &Value) -> Vec<SearchResult> {
    let mut out = Vec::new();
    collect_results(data, &mut out);
    out
}

/// Resolves a manifest's `__MSG_key__` name through `_locales/<default>/messages.json`.
pub fn resolve_manifest_text(text: &str, messages: Option<&Value>) -> String {
    let Some(key) = text.strip_prefix("__MSG_").and_then(|t| t.strip_suffix("__")) else {
        return text.to_string();
    };
    messages
        .and_then(Value::as_object)
        .and_then(|map| map.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)))
        .and_then(|(_, v)| v.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| key.to_string())
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
    /// Loaded and held paused, waiting for a fade or Play's Next.
    pub cued: bool,
    pub ended: bool,
    pub video_id: String,
}

#[derive(Debug)]
pub struct DecksState {
    pub open: bool,
    pub decks: [DeckInfo; 2],
    pub active: usize,
    pub auto: bool,
    pub fade_seconds: f64,
    pub fading: bool,
    pub fade_generation: u64,
    pub mix: f64,
    pub gains: [f64; 2],
    pub master: f64,
    pub muted: bool,
    pub loaded_at: [Option<Instant>; 2],
    /// Bumped on every load; a report since the load proves the page is alive.
    pub load_seq: [u64; 2],
    pub reported: [bool; 2],
    pub search_waiter: Option<(String, mpsc::Sender<String>)>,
    pub last_search: Option<Instant>,
}

impl Default for DecksState {
    fn default() -> Self {
        Self {
            open: false,
            decks: Default::default(),
            active: 0,
            auto: false,
            fade_seconds: 5.0,
            fading: false,
            fade_generation: 0,
            mix: 0.0,
            gains: [1.0, 1.0],
            master: 1.0,
            muted: false,
            loaded_at: [None, None],
            load_seq: [0, 0],
            reported: [false, false],
            search_waiter: None,
            last_search: None,
        }
    }
}

impl DecksState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Auto mode starts the other deck when the active one is within the fade
    /// length of its end and the other deck holds a cued (not yet played) video.
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
            && next.cued
            && !next.ad
    }

    pub fn desired_volume(&self, deck: usize) -> f64 {
        effective_volume(self.gains[deck], self.master, self.muted)
    }
}

/// True when an idle deck reports a video that Play did not load there, such
/// as YouTube autoplay moving on after the deck faded out.
fn is_unrequested_video(deck: usize, active: usize, fading: bool, info: &DeckInfo, report: &DeckReport) -> bool {
    deck != active
        && !fading
        && !info.cued
        && !info.video_id.is_empty()
        && !report.video_id.is_empty()
        && report.video_id != info.video_id
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
    #[serde(default)]
    pub ended: bool,
    #[serde(default)]
    pub video_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionInfo {
    pub folder: String,
    pub name: String,
    pub version: String,
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

fn apply_volume(app: &AppHandle, deck: usize) {
    let volume = app.state::<SharedDecks>().lock().unwrap().desired_volume(deck);
    eval(
        app,
        deck,
        &format!("(()=>{{window.__lalinVolume={volume:.4};const v=document.querySelector('video');if(v){{v.volume={volume:.4};if({volume:.4}>0)v.muted=false;}}}})()"),
    );
}

/// Sets a deck's crossfade gain (0..1); the page gets gain × master volume.
fn set_gain(app: &AppHandle, deck: usize, gain: f64) {
    {
        let shared = app.state::<SharedDecks>();
        let mut state = shared.lock().unwrap();
        state.gains[deck] = if gain.is_finite() { gain.clamp(0.0, 1.0) } else { 1.0 };
    }
    apply_volume(app, deck);
}

fn play(app: &AppHandle, deck: usize) {
    app.state::<SharedDecks>().lock().unwrap().decks[deck].cued = false;
    eval(app, deck, "(()=>{window.__lalinCueDone=true;document.querySelector('video')?.play()?.catch(()=>{});})()");
}

fn pause(app: &AppHandle, deck: usize) {
    eval(app, deck, "document.querySelector('video')?.pause()");
}

fn cancel_fade(state: &mut DecksState) {
    state.fade_generation += 1;
    state.fading = false;
}

/// Runs inside each youtube.com deck page. Reports player state to Play every
/// 250 ms and applies the volume Play wants; for cued loads it holds playback
/// until Play starts the deck; it routes media keys to Play's transport.
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
  const invoke = (cmd, args) => {
    const fn = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
    return fn ? fn(cmd, args) : Promise.reject();
  };
  let tick = 0;
  setInterval(() => {
    const v = document.querySelector("video");
    const player = document.querySelector("#movie_player");
    invoke("deck_report", { report: {
      time: v ? v.currentTime : 0,
      duration: v && isFinite(v.duration) ? v.duration : 0,
      paused: v ? v.paused : true,
      ended: !!(v && v.ended),
      volume: v ? v.volume : 1,
      title: document.title.replace(/ - YouTube$/, ""),
      ad: !!(player && player.classList.contains("ad-showing")),
      videoId: new URLSearchParams(location.search).get("v") || "",
    } }).then((want) => {
      if (!v || typeof want !== "number") return;
      window.__lalinVolume = want;
      if (Math.abs(v.volume - want) > 0.005) v.volume = want;
      if (want > 0 && v.muted) v.muted = false;
    }).catch(() => {});
    if (tick % 4 === 0) {
      // Play's queues pick the next video, so YouTube autoplay stays off.
      document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]')?.click();
    }
    if (tick++ % 4 === 0 && "mediaSession" in navigator) {
      for (const action of ["play", "pause", "nexttrack", "previoustrack", "stop"]) {
        try { navigator.mediaSession.setActionHandler(action, () => invoke("deck_media_key", { action }).catch(() => {})); } catch {}
      }
    }
  }, 250);
})();
"##;

/// Runs in the hidden search webview: hands the results page data to Play.
const SEARCH_SCRIPT: &str = r##"
(() => {
  if (window.top !== window || window.__lalinSearch) return;
  window.__lalinSearch = true;
  document.addEventListener("play", (event) => {
    if (event.target instanceof HTMLMediaElement) { event.target.muted = true; event.target.pause(); }
  }, true);
  if (location.pathname !== "/results") return;
  const query = new URLSearchParams(location.search).get("search_query") || "";
  let tries = 0;
  const send = () => {
    const invoke = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
    const data = window.ytInitialData;
    if (!invoke || !data) {
      if (++tries < 80) setTimeout(send, 250);
      else if (invoke) invoke("deck_search_report", { query, data: "" }).catch(() => {});
      return;
    }
    invoke("deck_search_report", { query, data: JSON.stringify(data) }).catch(() => {});
  };
  send();
})();
"##;

fn profile_webview(app: &AppHandle, label: &str, url: Url, script: &str) -> Result<tauri::webview::WebviewBuilder<tauri::Wry>, String> {
    let root = root_dir(app)?;
    let data_dir = root.join("webview");
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let extensions = extensions_dir(app)?;
    let nav_app = app.clone();
    Ok(tauri::webview::WebviewBuilder::new(label, WebviewUrl::External(url))
        .data_directory(data_dir)
        .additional_browser_args(BROWSER_ARGS)
        .browser_extensions_enabled(true)
        .extensions_path(&extensions)
        .initialization_script(script)
        .on_navigation(move |url| {
            if allowed_navigation(url) {
                return true;
            }
            use tauri_plugin_opener::OpenerExt;
            let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
            false
        })
        .auto_resize())
}

fn ensure_window(app: &AppHandle) -> Result<(), String> {
    if app.get_window(WINDOW_LABEL).is_some() {
        return Ok(());
    }
    let window = tauri::window::WindowBuilder::new(app, WINDOW_LABEL)
        .title("Lalin Play — YouTube Decks (personal)")
        .inner_size(1280.0, 460.0)
        .min_inner_size(640.0, 260.0)
        .build()
        .map_err(|e| e.to_string())?;
    let (width, height) = (1280.0, 460.0);

    for (index, label) in DECK_LABELS.iter().enumerate() {
        let builder = profile_webview(app, label, Url::parse("https://www.youtube.com/").unwrap(), DECK_SCRIPT)?;
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
            let kept = DecksState {
                auto: state.auto,
                fade_seconds: state.fade_seconds,
                master: state.master,
                muted: state.muted,
                search_waiter: state.search_waiter.take(),
                last_search: state.last_search,
                ..DecksState::new()
            };
            *state = kept;
            drop(state);
            emit_snapshot(&close_app);
        }
    });
    app.state::<SharedDecks>().lock().unwrap().open = true;
    Ok(())
}

fn search_webview(app: &AppHandle, url: Url) -> Result<(), String> {
    if let Some(webview) = app.get_webview(SEARCH_LABEL) {
        return webview.navigate(url).map_err(|e| e.to_string());
    }
    let window = tauri::window::WindowBuilder::new(app, SEARCH_WINDOW_LABEL)
        .title("Lalin Play — YouTube search (personal)")
        .inner_size(1024.0, 720.0)
        .visible(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;
    let builder = profile_webview(app, SEARCH_LABEL, url, SEARCH_SCRIPT)?;
    window
        .add_child(builder, LogicalPosition::new(0.0, 0.0), LogicalSize::new(1024.0, 720.0))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn schedule_search_close(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(SEARCH_IDLE_CLOSE);
        let idle = app
            .state::<SharedDecks>()
            .lock()
            .unwrap()
            .last_search
            .is_some_and(|at| at.elapsed() >= SEARCH_IDLE_CLOSE);
        if idle {
            if let Some(window) = app.get_window(SEARCH_WINDOW_LABEL) {
                let _ = window.destroy();
            }
        }
    });
}

/// The first navigation after the deck browser starts can stall on about:blank.
/// If the page has not reported once by then, navigate again (once).
fn retry_stalled_load(app: &AppHandle, deck: usize, seq: u64, url: Url) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(LOAD_RETRY_AFTER);
        let stalled = {
            let shared = app.state::<SharedDecks>();
            let state = shared.lock().unwrap();
            state.load_seq[deck] == seq && !state.reported[deck]
        };
        if stalled {
            if let Ok(webview) = deck_webview(&app, deck) {
                let _ = webview.navigate(url);
            }
        }
    });
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
        set_gain(&app, to, 0.0);
        play(&app, to);
        let started = Instant::now();
        loop {
            let progress = started.elapsed().as_secs_f64() / seconds;
            let (out_gain, in_gain) = equal_power(progress);
            if app.state::<SharedDecks>().lock().unwrap().fade_generation != generation {
                return; // cancelled by the manual crossfader, Stop or a new load
            }
            set_gain(&app, from, out_gain);
            set_gain(&app, to, in_gain);
            if progress >= 1.0 {
                break;
            }
            std::thread::sleep(FADE_STEP);
        }
        pause(&app, from);
        // Keep the outgoing deck silent: YouTube may load another video there.
        set_gain(&app, from, 0.0);
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

fn read_extensions(dir: &Path) -> Vec<ExtensionInfo> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found: Vec<ExtensionInfo> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| {
            let path = entry.path();
            let manifest: Value = serde_json::from_str(&std::fs::read_to_string(path.join("manifest.json")).ok()?).ok()?;
            let messages = manifest
                .get("default_locale")
                .and_then(Value::as_str)
                .and_then(|locale| std::fs::read_to_string(path.join("_locales").join(locale).join("messages.json")).ok())
                .and_then(|text| serde_json::from_str::<Value>(&text).ok());
            Some(ExtensionInfo {
                folder: entry.file_name().to_string_lossy().into_owned(),
                name: resolve_manifest_text(manifest.get("name").and_then(Value::as_str).unwrap_or("?"), messages.as_ref()),
                version: manifest.get("version").and_then(Value::as_str).unwrap_or("").to_string(),
            })
        })
        .collect();
    found.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    found
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

/// `start`: true plays now (pausing the other deck), false cues (holds paused),
/// absent cues only when the other deck is playing.
#[tauri::command]
pub async fn deck_load(app: AppHandle, deck: usize, url: String, start: Option<bool>) -> Result<DecksSnapshot, String> {
    if deck > 1 {
        return Err("invalid deck".into());
    }
    let (video, list) = parse_youtube(&url).ok_or("ลิงก์นี้เปิดใน deck ไม่ได้")?;
    ensure_window(&app)?;
    let cue = match start {
        Some(start) => !start,
        None => {
            let shared = app.state::<SharedDecks>();
            let state = shared.lock().unwrap();
            deck != state.active && state.decks[state.active].loaded && !state.decks[state.active].paused
        }
    };
    let target = watch_url(video.as_deref(), list.as_deref(), cue).ok_or("ลิงก์ไม่ถูกต้อง")?;
    let parsed = Url::parse(&target).map_err(|e| e.to_string())?;
    if !cue {
        pause(&app, other(deck));
    }
    deck_webview(&app, deck)?.navigate(parsed.clone()).map_err(|e| e.to_string())?;
    let seq = {
        let shared = app.state::<SharedDecks>();
        let mut state = shared.lock().unwrap();
        state.decks[deck] = DeckInfo {
            loaded: true,
            paused: cue,
            cued: cue,
            volume: 1.0,
            video_id: video.clone().unwrap_or_default(),
            ..DeckInfo::default()
        };
        state.loaded_at[deck] = Some(Instant::now());
        state.load_seq[deck] += 1;
        state.reported[deck] = false;
        if cue {
            state.gains[deck] = 0.0;
        } else {
            cancel_fade(&mut state);
            state.gains[deck] = 1.0;
            state.active = deck;
            state.mix = deck as f64;
        }
        state.load_seq[deck]
    };
    retry_stalled_load(&app, deck, seq, parsed);
    emit_snapshot(&app);
    Ok(snapshot(&app))
}

#[tauri::command]
pub fn deck_play_pause(app: AppHandle, deck: usize, playing: bool) -> Result<(), String> {
    if deck > 1 {
        return Err("invalid deck".into());
    }
    if playing {
        set_gain(&app, deck, 1.0);
        play(&app, deck);
    } else {
        pause(&app, deck);
    }
    Ok(())
}

/// Seeks the active deck (Play's seek bar).
#[tauri::command]
pub fn deck_seek(app: AppHandle, time: f64) -> Result<(), String> {
    if !time.is_finite() || time < 0.0 {
        return Err("invalid time".into());
    }
    let active = app.state::<SharedDecks>().lock().unwrap().active;
    eval(&app, active, &format!("(()=>{{const v=document.querySelector('video');if(v)v.currentTime={time:.3};}})()"));
    Ok(())
}

/// Play's Stop: pause both decks and cancel any fade.
#[tauri::command]
pub fn deck_stop(app: AppHandle) {
    cancel_fade(&mut app.state::<SharedDecks>().lock().unwrap());
    pause(&app, 0);
    pause(&app, 1);
    emit_snapshot(&app);
}

/// Play's volume and mute, applied on top of the crossfade gains.
#[tauri::command]
pub fn deck_set_master(app: AppHandle, volume: f64, muted: bool) {
    {
        let shared = app.state::<SharedDecks>();
        let mut state = shared.lock().unwrap();
        state.master = if volume.is_finite() { volume.clamp(0.0, 1.0) } else { 1.0 };
        state.muted = muted;
    }
    apply_volume(&app, 0);
    apply_volume(&app, 1);
}

/// Manual crossfader: 0 = only A, 1 = only B, equal-power in between. Cancels a running fade.
#[tauri::command]
pub fn deck_set_mix(app: AppHandle, mix: f64) -> Result<(), String> {
    let mix = if mix.is_finite() { mix.clamp(0.0, 1.0) } else { 0.0 };
    {
        let shared = app.state::<SharedDecks>();
        let mut state = shared.lock().unwrap();
        cancel_fade(&mut state);
        state.mix = mix;
        state.active = if mix >= 0.5 { 1 } else { 0 };
    }
    let (a, b) = equal_power(mix);
    set_gain(&app, 0, a);
    set_gain(&app, 1, b);
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

/// Extensions found in the deck extensions folder (each subfolder with a manifest).
#[tauri::command]
pub fn deck_extensions(app: AppHandle) -> Result<Vec<ExtensionInfo>, String> {
    Ok(read_extensions(&extensions_dir(&app)?))
}

/// Searches youtube.com in a hidden webview on the deck profile.
#[tauri::command]
pub async fn deck_search(app: AppHandle, query: String) -> Result<Vec<SearchResult>, String> {
    let query = query.trim().to_string();
    if query.is_empty() || query.chars().count() > 200 {
        return Err("คำค้นหาว่างหรือยาวเกินไป".into());
    }
    let url = Url::parse_with_params("https://www.youtube.com/results", &[("search_query", query.as_str())])
        .map_err(|e| e.to_string())?;
    let (sender, receiver) = mpsc::channel();
    {
        let shared = app.state::<SharedDecks>();
        let mut state = shared.lock().unwrap();
        state.search_waiter = Some((query.clone(), sender));
        state.last_search = Some(Instant::now());
    }
    search_webview(&app, url.clone())?;
    schedule_search_close(&app);
    let (receiver, first) = tauri::async_runtime::spawn_blocking(move || {
        let first = receiver.recv_timeout(LOAD_RETRY_AFTER);
        (receiver, first)
    })
    .await
    .map_err(|e| e.to_string())?;
    let raw = match first {
        Ok(raw) => raw,
        Err(_) => {
            // The first navigation after the deck browser starts can stall: navigate once more.
            search_webview(&app, url)?;
            tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(SEARCH_TIMEOUT))
                .await
                .map_err(|e| e.to_string())?
                .map_err(|_| "ค้นหา YouTube ไม่สำเร็จ (หมดเวลา)".to_string())?
        }
    };
    let data: Value = serde_json::from_str(&raw).map_err(|_| "ค้นหา YouTube ไม่ได้ในตอนนี้".to_string())?;
    Ok(parse_search_results(&data))
}

/// Called only by the hidden search page (remote capability scoped to `deck-search`).
#[tauri::command]
pub fn deck_search_report(app: AppHandle, webview: Webview, query: String, data: String) {
    if webview.label() != SEARCH_LABEL {
        return;
    }
    let shared = app.state::<SharedDecks>();
    let mut state = shared.lock().unwrap();
    if state.search_waiter.as_ref().is_some_and(|(waiting, _)| *waiting == query) {
        if let Some((_, sender)) = state.search_waiter.take() {
            let _ = sender.send(data);
        }
    }
}

/// Media keys pressed while a deck page owns Windows' media session.
#[tauri::command]
pub fn deck_media_key(app: AppHandle, webview: Webview, action: String) {
    if DECK_LABELS.contains(&webview.label()) && MEDIA_KEY_ACTIONS.contains(&action.as_str()) {
        let _ = app.emit("deck-media-key", action);
    }
}

/// Called only by the deck pages (remote capability scoped to deck webviews and youtube.com).
/// The deck is identified by the calling webview's label, never by page input.
/// Returns the `<video>.volume` Play wants for that deck.
#[tauri::command]
pub fn deck_report(app: AppHandle, webview: Webview, report: DeckReport) -> f64 {
    let Some(deck) = DECK_LABELS.iter().position(|label| *label == webview.label()) else {
        return 1.0;
    };
    let (start_auto, started_by_user, desired) = {
        let shared = app.state::<SharedDecks>();
        let mut state = shared.lock().unwrap();
        let desired = state.desired_volume(deck);
        // Ignore the previous page's last reports right after a load.
        let fresh_load = state.loaded_at[deck].is_some_and(|at| at.elapsed() < STALE_REPORT_WINDOW);
        let expected = &state.decks[deck].video_id;
        if fresh_load && !expected.is_empty() && *expected != report.video_id {
            return desired;
        }
        state.reported[deck] = true;
        let fading = state.fading;
        let active = state.active;
        // YouTube autoplay (or a click on another video) changed the video on
        // the idle deck: Play did not ask for it, so hold it silent and paused.
        if is_unrequested_video(deck, active, fading, &state.decks[deck], &report) {
            state.gains[deck] = 0.0;
            drop(state);
            pause(&app, deck);
            return 0.0;
        }
        let info = &mut state.decks[deck];
        info.loaded = true;
        info.time = if report.time.is_finite() { report.time.max(0.0) } else { 0.0 };
        info.duration = if report.duration.is_finite() { report.duration.max(0.0) } else { 0.0 };
        info.paused = report.paused;
        info.ended = report.ended;
        info.volume = report.volume.clamp(0.0, 1.0);
        info.ad = report.ad;
        info.title = report.title.chars().take(200).collect();
        if !report.video_id.is_empty() {
            info.video_id = report.video_id.chars().take(16).collect();
        }
        // The user started this deck in the deck window: follow it.
        let started_by_user = deck != active && !report.paused && !info.cued && !fading;
        if started_by_user {
            state.active = deck;
            state.mix = deck as f64;
            state.gains[deck] = 1.0;
        }
        let desired = if started_by_user { state.desired_volume(deck) } else { desired };
        (state.should_auto_start(), started_by_user, desired)
    };
    if started_by_user {
        pause(&app, other(deck)); // one deck plays at a time outside a fade
    }
    if start_auto {
        let seconds = app.state::<SharedDecks>().lock().unwrap().fade_seconds;
        start_crossfade(&app, seconds);
    }
    emit_snapshot(&app);
    desired
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn report(video_id: &str) -> DeckReport {
        DeckReport {
            time: 1.0,
            duration: 200.0,
            paused: false,
            volume: 1.0,
            title: String::new(),
            ad: false,
            ended: false,
            video_id: video_id.into(),
        }
    }

    #[test]
    fn idle_deck_autoplay_is_unrequested() {
        let info = DeckInfo { video_id: "aaa".into(), ..DeckInfo::default() };
        // YouTube autoplay moved the faded-out deck to another video.
        assert!(is_unrequested_video(0, 1, false, &info, &report("bbb")));
        // The same video (user pressed play in the deck window) is followed.
        assert!(!is_unrequested_video(0, 1, false, &info, &report("aaa")));
        // The active deck, a running fade, a cued deck and unknown ids are left alone.
        assert!(!is_unrequested_video(1, 1, false, &info, &report("bbb")));
        assert!(!is_unrequested_video(0, 1, true, &info, &report("bbb")));
        let cued = DeckInfo { cued: true, ..info.clone() };
        assert!(!is_unrequested_video(0, 1, false, &cued, &report("bbb")));
        assert!(!is_unrequested_video(0, 1, false, &DeckInfo::default(), &report("bbb")));
        assert!(!is_unrequested_video(0, 1, false, &info, &report("")));
    }

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
    fn master_volume_scales_the_fade_and_mute_silences() {
        let (a, b) = equal_power(0.5);
        assert!((effective_volume(a, 0.5, false) - 0.5 * 0.7071).abs() < 0.02);
        assert!((effective_volume(b, 0.5, false) - 0.5 * 0.7071).abs() < 0.02);
        assert_eq!(effective_volume(1.0, 0.5, false), 0.5);
        assert_eq!(effective_volume(0.0, 1.0, false), 0.0);
        assert_eq!(effective_volume(1.0, 1.0, true), 0.0);
        assert_eq!(effective_volume(f64::NAN, 2.0, false), 1.0);
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
    fn auto_mode_starts_only_near_the_end_with_a_cued_next_deck() {
        let mut state = DecksState::new();
        state.auto = true;
        state.fade_seconds = 6.0;
        state.decks[0] = DeckInfo { loaded: true, duration: 200.0, time: 100.0, paused: false, ..Default::default() };
        assert!(!state.should_auto_start(), "too early");
        state.decks[0].time = 195.0;
        assert!(!state.should_auto_start(), "next deck empty");
        state.decks[1].loaded = true;
        assert!(!state.should_auto_start(), "next deck holds an old, already played video");
        state.decks[1].cued = true;
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

    fn lockup(kind: &str, id: &str, title: &str, badge: Option<&str>) -> Value {
        let badges: Vec<Value> = badge.map(|t| json!({ "thumbnailBadgeViewModel": { "text": t } })).into_iter().collect();
        json!({ "lockupViewModel": {
            "contentType": kind,
            "contentId": id,
            "contentImage": { "thumbnailViewModel": { "overlays": [
                { "thumbnailBottomOverlayViewModel": { "badges": badges } }
            ] } },
            "metadata": { "lockupMetadataViewModel": {
                "title": { "content": title },
                "metadata": { "contentMetadataViewModel": { "metadataRows": [
                    { "metadataParts": [
                        { "avatarStack": { "avatarStackViewModel": { "text": { "content": "Some Channel" } } } },
                        { "text": { "content": "1M views" } }
                    ] }
                ] } }
            } }
        } })
    }

    #[test]
    fn search_parser_keeps_videos_and_skips_playlists_shorts_live_and_duplicates() {
        let data = json!({ "contents": { "twoColumnSearchResultsRenderer": { "primaryContents": { "sectionListRenderer": { "contents": [
            { "itemSectionRenderer": { "contents": [
                lockup("LOCKUP_CONTENT_TYPE_PLAYLIST", "PLAdzvBzqnV7P0", "A playlist", Some("20 videos")),
                lockup("LOCKUP_CONTENT_TYPE_VIDEO", "AClzgPv6tmk", "Song One", Some("4:02")),
                lockup("LOCKUP_CONTENT_TYPE_VIDEO", "liveStream1", "Live now", None),
                { "gridShelfViewModel": { "contents": [ { "shortsLockupViewModel": { "entityId": "x" } } ] } },
                lockup("LOCKUP_CONTENT_TYPE_VIDEO", "bzd1E2VahTo", "Song Two", Some("1:02:33")),
                lockup("LOCKUP_CONTENT_TYPE_VIDEO", "AClzgPv6tmk", "Song One again", Some("4:02")),
                { "videoRenderer": {
                    "videoId": "M7lc1UVf-VE",
                    "title": { "runs": [ { "text": "Legacy Song" } ] },
                    "ownerText": { "runs": [ { "text": "Legacy Channel" } ] },
                    "lengthText": { "simpleText": "3:15" }
                } }
            ] } }
        ] } } } } });
        let results = parse_search_results(&data);
        let ids: Vec<&str> = results.iter().map(|r| r.video_id.as_str()).collect();
        assert_eq!(ids, ["AClzgPv6tmk", "bzd1E2VahTo", "M7lc1UVf-VE"]);
        assert_eq!(results[0].title, "Song One");
        assert_eq!(results[0].channel, "Some Channel");
        assert_eq!(results[0].duration, "4:02");
        assert_eq!(results[1].duration, "1:02:33");
        assert_eq!(results[2].channel, "Legacy Channel");
        assert!(parse_search_results(&json!({})).is_empty());
    }

    #[test]
    fn clock_badges_only() {
        assert!(is_clock("4:02") && is_clock("1:02:33"));
        assert!(!is_clock("LIVE") && !is_clock("20 videos") && !is_clock("4:") && !is_clock("123:45"));
    }

    #[test]
    fn manifest_names_resolve_through_locale_messages() {
        let messages = json!({ "appName": { "message": "AdBlocker for YouTube™" } });
        assert_eq!(resolve_manifest_text("__MSG_appName__", Some(&messages)), "AdBlocker for YouTube™");
        assert_eq!(resolve_manifest_text("__MSG_APPNAME__", Some(&messages)), "AdBlocker for YouTube™");
        assert_eq!(resolve_manifest_text("__MSG_missing__", Some(&messages)), "missing");
        assert_eq!(resolve_manifest_text("Plain Name", None), "Plain Name");
    }
}
