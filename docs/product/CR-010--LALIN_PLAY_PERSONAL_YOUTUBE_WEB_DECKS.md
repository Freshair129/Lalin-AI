---
version: "0.3.0b"
created_at: "2026-11-25T16:30:00+07:00,Claude"
last_update: "2026-11-25T16:30:00+07:00,Claude"
status: "approved"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "change-request"
  scope: "Lalin Play personal-only build: two youtube.com web decks with scripted crossfade and user-supplied WebView2 extensions"
---

# CR-010 — Personal YouTube web decks (two-deck crossfade, user extensions)

## Request

The user wants every YouTube song to play inside Lalin Play, label music
included. They also want two decks that crossfade (manually, or automatically
by a script), and want to load their own Chrome extension into those decks.
The user states the feature is for **personal use only** (2026-11-25).

Status is **approved**: the user approved CR-010 on 2026-11-25 and asked
to start implementation, for personal local builds only.

## Why CR-009 is not enough

The CR-009 embed is the official player. On 2026-11-25 both of the user's saved
songs showed "This video is unavailable" on both `youtube-nocookie.com` and
`youtube.com/embed`, tested from a plain localhost page outside Play:

- `-fMEMCLuY7M`: official music video
- `yTwCRr3amV4`: "Topic" auto-generated track

The rights holders block embedded playback, while Google's demo video plays.
Only the full `youtube.com/watch` page plays such songs.

## Boundary: personal build only

Driving youtube.com pages with injected scripts, and loading ad-blocking
extensions, conflicts with YouTube's Terms of Service. This CR therefore ships
only behind a Cargo feature, `personal-youtube-web`:

- The feature is off by default. CI, `npm run build` / `tauri build`, and the
  NSIS installer never enable it.
- A build guard fails a `release` profile build that has the feature on.
- The developer runs it locally with
  `npm run tauri dev -- --features personal-youtube-web`.
- Play bundles, recommends or downloads no extension. The user copies their
  own unpacked extension into a folder.
- Distributed Play builds keep CR-009 behaviour only.

## Scope

1. **Deck window.** One extra window, "YouTube Decks", with two child webviews
   (Deck A, Deck B) on Tauri's `unstable` multi-webview API. Each deck loads
   `https://www.youtube.com/watch?v=<id>` built from saved links. The ID rules
   are the same as CR-009.
2. **Isolated profile.** The decks use their own WebView2 data directory,
   `%APPDATA%\ai.lalin.play\personal-youtube\webview`, separate from Play's
   main WebView. Cookies, sign-in and extensions never touch the main window.
3. **User extensions.** `browser_extensions_enabled(true)` with
   `extensions_path(%APPDATA%\ai.lalin.play\personal-youtube\extensions)`.
   Every subfolder holding a `manifest.json` loads at deck start. Settings
   shows the folder and an "Open folder" button.
4. **Navigation guard.** Decks may navigate only to `youtube.com`,
   `www.youtube.com`, `m.youtube.com`, `music.youtube.com` and Google sign-in
   hosts. Other links open in the default browser.
5. **Crossfade by script, no AI.** Play sets `HTMLVideoElement.volume` on each
   deck through `webview.eval`.
   - Curve: equal-power (`cos`/`sin`).
   - Length: the existing `transitionSettings.durationSeconds` (2–12 s).
   - **Manual:** a Crossfade button, plus a draggable A↔B crossfader.
   - **Auto:** when the playing deck has ≤ the fade length left and the other
     deck has a queued link, the other deck starts at volume 0 and the fade
     runs. Deck state (time, duration, paused) is read every 250 ms via `eval`.
6. **Controls in Play.** A "Decks" panel in the YouTube links view:
   - load a link to A or B;
   - play/pause each deck;
   - crossfader, fade button, auto toggle.
7. **Audio path.** Deck audio goes straight to Windows. It is EQ'd only by the
   CR-009 Equalizer APO bridge when that is on. Play never captures or
   processes it.

## Non-goals

- Shipping or enabling this in any distributed build.
- Bundling, downloading or recommending extensions.
- Downloading, caching, recording or extracting YouTube media.
- Beat matching or AI-picked mix points. YouTube audio is not available to
  analyse.
- Bypassing sign-in, age gates, region blocks or Premium checks.

## Risks

| Risk | Mitigation |
|---|---|
| YouTube Terms of Service | Personal feature flag, release guard, no bundled extensions. The user accepts the risk for local use. |
| WebView2 extension support is partial. The user's "AdBlocker for YouTube" 0.5.4 is MV3 with `declarativeNetRequest` plus content scripts. | Spike first. If it does not load, the decks still work without it. |
| Google may block sign-in in embedded webviews | Decks work signed out. Sign-in is best effort. |
| YouTube page changes break the selectors or volume script | The script uses only the first `video` element and fails soft: no fade, playback continues. |
| `unstable` Tauri API changes | Pinned Tauri version. The feature is compiled only with `personal-youtube-web`. |
| Two decks double CPU/RAM | The deck window is created on demand and closed when not used. |

## Acceptance criteria

1. A default build and CI contain no deck code. A `release` build with the
   feature fails the guard.
2. With the feature on, both of the user's saved songs play in a deck.
3. A manual fade A→B over N s ends with A paused at volume 0 and B at 1.
   A sampled curve is equal-power within ±0.02 (unit test on the curve).
4. Auto mode starts B when A has ≤ N s left. It does not start B when B is
   empty.
5. An unpacked extension in the folder loads. The result is recorded whatever
   happens, including if the user's MV3 extension fails.
6. Decks cannot navigate off the allowed hosts. The main Play window's storage
   is untouched.

## Change log

| Version | Date | Status | Change | Commit | Author |
|---|---|---|---|---|---|
| 0.3.0b | 2026-11-25 | approved | Implemented on `feat/play-personal-youtube-web`. Automated checks: cargo `personal_youtube` 5/5; vitest 185/185; `npm run build`; a default build compiles without the module; `cargo check --release --features personal-youtube-web` is refused by the guard. Native check (personal dev build): Deck A played `-fMEMCLuY7M`, which is blocked as an embed, at 9 s. Deck B cued `yTwCRr3amV4` paused. A 4 s crossfade sampled 0.77/0.67 at 2 s, then A ended paused with its volume reset and B played at volume 1, active B. The user's MV3 extension registered as unpacked, with DNR rules and storage created; actual ad blocking was not observed. Not yet verified: auto mode near a real track end, and Google sign-in. | working tree | Claude |
| 0.2.0b | 2026-11-25 | approved | Record user approval; implementation starts | working tree | Claude |
| 0.1.0b | 2026-11-25 | need review | Propose personal-only YouTube web decks with scripted crossfade and user extensions | working tree | Claude |
