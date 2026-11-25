---
version: "0.3.0b"
created_at: "2026-11-25T18:30:00+07:00,Claude"
last_update: "2026-11-25T18:30:00+07:00,Claude"
status: "approved"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "change-request"
  scope: "Lalin Play personal-only build: YouTube search inside Play, per-deck queues, and the main transport bar driving the CR-010 decks"
---

# CR-011 — Deck search, per-deck queues, and unified transport

## Request

On 2026-11-25 the user reported three gaps in the CR-010 decks:

1. Play cannot search YouTube. The user has to search inside a deck window.
   They want to search song names in Play. From each result they want to add
   it to the queue or to a deck, and to choose which deck's queue.
2. They asked whether the decks run their Chrome extension the way Chrome does.
3. The main transport bar does not drive the decks. The decks panel offers
   only play and pause. Volume, seek and next/previous have to be changed in
   the deck window.

The boundary of CR-010 still applies. Everything here is **personal local
builds only**, behind the `personal-youtube-web` Cargo feature, with release
builds blocked.

Status is **approved**: the user approved CR-011 on 2026-11-25 and asked to
start implementation.

## Scope

### 1. YouTube search in Play

- In the YouTube view, a search box sends the query to a hidden third webview,
  `deck-search`. That webview uses the same isolated deck profile and loads
  `https://www.youtube.com/results?search_query=<query>`.
- An init script reads the results page and returns up to 20 videos through
  `invoke("deck_search_report")`. Each result has an ID, title, channel and
  duration. Shorts, live streams, playlists and ads are skipped.
  - YouTube now marks results up as `lockupViewModel`. The parser reads that
    format and also the older `videoRenderer` format.
  - Thumbnails were dropped. Showing them would mean widening Play's
    `img-src` CSP in every build, not only personal builds.
- No API key and no quota. The cost is that YouTube page changes can break
  the parser. On a parse failure Play shows "Search unavailable" and the user
  can still paste links.
- Rejected alternative: the YouTube Data API v3. The user would have to create
  their own key, and its default quota allows about 100 searches a day.
- When the decks are available, the top search field also gets a
  "Search YouTube" action, next to Ask Lalin.

### 2. Per-deck queues

- Each search result and each saved link has these actions:
  - **Play on A / Play on B:** load the video and play it now.
  - **Queue → A / Queue → B:** append it to that deck's queue.
  - **Save link:** add it to the CR-007/009 saved links.
- Each deck has its own ordered queue, persisted in local storage. The decks
  panel shows each queue. Items can be reordered, removed or moved to the
  other deck.
- When a deck's video ends, the deck loads the next item from its own queue.
- In auto mode, before the playing deck ends, the head of the *other* deck's
  queue is cued at volume 0 and the CR-010 crossfade runs.
- If the other deck's queue is empty, the playing deck continues from its own
  queue without a fade.

### 3. The main transport bar drives the decks

- Play has two sources: **Local** (Play's own engine) and **Decks**. Starting
  any deck playback switches the source to Decks. Starting a local track
  switches it back to Local and pauses both decks.
- While the source is Decks, the bottom transport bar shows the active deck's
  title, channel, time and progress, from the existing 250 ms deck reports.
- Controls:

  | Control | Effect |
  |---|---|
  | Play / Pause | the active deck |
  | Seek bar | new command `deck_seek` on the active deck |
  | Next | crossfade to the other deck. If the other deck is empty, load the active deck's next queue item. |
  | Previous | more than 3 s into the video: restart it. Otherwise reload the previously played item, and put the current one back at the front of the queue. |
  | Stop | pauses both decks |
  | Volume and Mute | a new master volume. Each deck's `video.volume` = master × its crossfade gain, so fades keep their equal-power shape. |
  | Crossfade length | the existing setting. It already feeds the deck fade. |

- Media keys and Windows media controls follow the same routing.
  - Play's own media-session adapter handles keys that reach the main window.
  - Deck pages override YouTube's media-session handlers. Their keys go to
    Play through the deck-scoped `deck_media_key` command, so Next fades
    instead of jumping to a YouTube suggestion.
- EQ: deck audio goes to Windows, so the EQ panel applies to it only through
  the CR-009 Equalizer APO output. When the source is Decks and APO is off,
  the panel says so.

### 4. Extension status

- The decks panel lists the extensions found in the deck extensions folder,
  by name and version. Localized `__MSG_…__` names are resolved.
  - This is a deviation from "actually loaded". Wry does not expose WebView2's
    extension list, so whether an extension loaded is checked out of band
    (DevTools targets), not shown in Play.
- An acceptance step records whether the user's "AdBlocker for YouTube"
  actually removes ads in a deck. If it does not, that is recorded and the
  decks keep working without it.

### 5. Stalled first load

- The first navigation after the deck browser process starts can stay on
  `about:blank` and never commit. This was seen natively on 2026-11-25 for both
  decks and the search page.
- Recovery:
  - A deck whose page has not reported within 6 s of a load is navigated once
    more.
  - A search with no result within 6 s re-navigates once, then waits up to
    15 s more.

## Non-goals

- Shipping any of this in a distributed build.
- Downloading, caching or extracting YouTube media.
- Routing deck audio through Play's Web Audio EQ. Cross-origin audio cannot be
  captured; CR-009 APO remains the EQ path.
- Syncing Chrome's profile, sign-in or extension settings into the decks.

## Risks

| Risk | Mitigation |
|---|---|
| YouTube results markup changes | One parser with a fixture test. It fails soft: shows "Search unavailable", and pasted links keep working. |
| A third webview costs RAM | `deck-search` is created on first search and closed after 2 minutes idle |
| Two sources fighting over the transport bar | One explicit `source` state. Every control routes through it. Covered by unit tests. |
| Master volume and crossfade gains interacting | One formula (master × gain), unit-tested at the ends and midpoint of a fade |

## Acceptance criteria

1. A default build and CI contain none of this code. The release guard still
   refuses the feature.
2. Searching a song name in Play lists results. "Queue → B" puts the result in
   Deck B's queue. It plays when Deck B is next.
3. While a deck plays, the bottom bar shows its title and progress. Play,
   pause, seek, next, stop and volume all act on the decks, with no visit to
   the deck window.
4. Volume at 50 % during a fade gives deck volumes of 0.5 × the equal-power
   gains, within ±0.02.
5. Starting a local track pauses both decks, and the bar returns to Local.
6. The decks panel lists the loaded extensions. Whether ads are actually
   blocked is recorded, whatever the result.

## Change log

| Version | Date | Status | Change | Commit | Author |
|---|---|---|---|---|---|
| 0.3.0b | 2026-11-25 | approved | Implemented on `feat/play-deck-search-transport`. Automated checks: cargo `personal_youtube` 9/9 (parser fixture, master × fade, cued-only auto start, manifest names); vitest 194/194 (`decideQueueAction`, transport view, search→queue→cue, transport routing, local hand-back, extension list, media keys); `npm run build`; default `cargo check` builds without the module; the release guard still refuses the feature. The parser also read a real results page (18 videos with title, channel and duration). Native check in the personal dev build: (1) a cold search succeeded after one retry in 8.2 s and returned 17 results; warm, 1.8 s; (2) through the UI, searching "ILLSLICK" gave 20 results; "Queue B" listed the item; "Play on A" played it; Deck B was cued from its queue automatically and the queue emptied; (3) the bottom bar showed the deck title, "YouTube · Deck A · channel" and position; pause, play, seek (onChange 126 → 151 s), Stop (both paused) and volume 0.5 all acted on the decks; (4) Next ran a 7 s fade with master 0.5. Midway A = 0.32 and B = 0.39, power ≈ 0.25 = 0.5². It ended with B active at 0.5 and A paused; (5) at the end of Deck B, the next item in B's own queue loaded and played; (6) the panel listed "AdBlocker for YouTube™ 0.5.4", and its service worker ran in the deck profile. Not verified: whether ads are actually blocked (no ad appeared in 5 loads, which proves nothing), hardware media keys, a local track taking back the transport natively (unit-tested only), and auto mode at a natural track end. | working tree | Claude |
| 0.2.0b | 2026-11-25 | approved | Record user approval; implementation starts | working tree | Claude |
| 0.1.0b | 2026-11-25 | need review | Propose Play-side YouTube search, per-deck queues, and transport-bar control of the CR-010 decks | working tree | Claude |
