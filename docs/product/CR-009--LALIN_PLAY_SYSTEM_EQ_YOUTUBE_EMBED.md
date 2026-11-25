---
version: "0.3.1b"
created_at: "2026-11-25T13:30:00+07:00,Claude"
last_update: "2026-11-25T14:30:00+07:00,Claude"
status: "approved"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "change-request"
  scope: "Lalin Play system-wide EQ through Equalizer APO, and official embedded YouTube player"
---

# CR-009 — System EQ (Equalizer APO bridge) and embedded YouTube player

## Request

The user wants to tune sound in one place. Lalin Play should control a
system-wide EQ so the same curve applies to everything that plays on the
Focusrite Scarlett Solo, YouTube included. YouTube links should also play
inside Lalin Play instead of opening the browser.

Status is **approved**: the user approved CR-009 on 2026-11-25 and asked
to start implementation. CR-001 §1 and its non-goals exclude Windows
system-wide EQ / APO, and CR-007 §4 limits YouTube to links that open on
YouTube. CR-009 supersedes those two boundaries for the items below only.
Every other CR-001/CR-007 non-goal still applies.

## Source constraints

- Play's EQ is Web Audio inside the WebView: a preamp, ten peaking biquads at
  `EQ_FREQUENCIES` (Q 1.4), and a safety limiter (`audioEngine.ts`). It
  processes only Play's own media element.
- A YouTube embed is a cross-origin iframe. The same-origin policy blocks Play
  from reaching its media element, and the IFrame API exposes no audio stream.
- YouTube API Services policies forbid an API client from separating,
  isolating or modifying the audio of YouTube content. Play therefore must
  not capture or process embedded YouTube audio itself (no loopback capture,
  no virtual device owned by Play).
- A system EQ that the user installs, which processes all output on a chosen
  device, is the user's own playback chain. It is like EQ on headphones and
  does not target YouTube content.
- Equalizer APO is not installed on the reference PC (2026-11-25). The output
  device present is `Speakers (Focusrite USB Audio)`.

## Scope A — System EQ through Equalizer APO

Equalizer APO is a free, user-installed Windows APO. It reads text config from
its `config` folder (path in `HKLM\SOFTWARE\EqualizerAPO`, value `ConfigPath`)
and reloads changed files automatically. Play does not ship or install it.

1. **Detect.** Settings shows an "EQ output" choice:
   - **Lalin Play only** (default, today's behaviour).
   - **Whole system (Equalizer APO)**.

   If APO is not installed, the second option explains how to install it and
   how to enable it on the Scarlett in APO's Configurator (reboot required). It
   offers a link to the official site, opened in the browser. Play never
   downloads or installs software.
2. **One-time setup.** APO 1.4.2's installer grants `BUILTIN\Users` full
   control of its config folder (seen on the reference PC), so setup normally
   runs without elevation. If writing fails, Play falls back to one elevated
   step and the user sees the Windows prompt. Setup:
   - backs up `config.txt` to `config.lalin-play-backup.txt`;
   - creates `lalin-play.txt` in the config folder (the elevated fallback also
     grants the current user Modify on that file only);
   - appends `Include: lalin-play.txt` to `config.txt` if the line is absent.

   It changes nothing else in the user's APO config.
3. **Sync.** While the output is System, every EQ change (bands, preamp, preset,
   bypass) rewrites `lalin-play.txt` after a 150 ms debounce:
   - `Preamp: <dB>`
   - ten `Filter: ON PK Fc <f> Hz Gain <g> dB Q 1.4` lines
   - bypass writes the file with every filter OFF

   The file is plain ASCII and is written in one call.
4. **No double EQ.** In System mode, Play's in-app preamp and filters stay flat,
   because Play's own audio already passes through APO. Mixer, spatial mode and
   the in-app limiter keep working.
5. **Headroom.** APO has no limiter. To avoid clipping YouTube and other apps,
   the file's preamp is never above minus the largest band boost: it is the
   lower of the user's preamp and that value. The UI says so.
6. **Undo.** Switching back to "Lalin Play only" empties `lalin-play.txt`.
   "Remove from Equalizer APO" deletes the Include line and the file (UAC only
   if the folder is not writable).
   Uninstalling Play leaves APO with an empty include, so the sound is unchanged.
7. **Compressor.** Out of scope for System mode. APO has no built-in
   compressor (VST hosting only). Play's limiter stays in-app.

## Scope B — Official embedded YouTube player

1. In the YouTube links view, each link gets **Play here**. It opens the
   official embedded player (`https://www.youtube-nocookie.com/embed/<id>`,
   with `list=` supported for playlists) in a panel at least 480×270 px. YouTube
   controls and branding stay visible and are never covered.
2. Pressing Play here pauses Play's local playback. YouTube audio goes straight
   to Windows. It does not enter Play's Web Audio, queue, crossfade, Media
   Session or history. With Scope A on, it is EQ'd by APO like any other app.
3. **R5 network exception.** Nothing loads from YouTube until the user presses
   Play here. CSP gains `frame-src` for `www.youtube-nocookie.com` and
   `www.youtube.com` only. No YouTube scripts run in Play's own origin; control
   goes only through the iframe.
4. Closing the panel unloads the iframe (no background playback).
5. Only URLs that pass the existing `is_official_youtube_url` check can be
   embedded. The video ID must match `[A-Za-z0-9_-]{11}`, otherwise Play falls
   back to "Open on YouTube".

## Non-goals

- Downloading, caching, extracting, recording or proxying YouTube media.
- Play processing YouTube audio directly (loopback capture, virtual audio
  device, own APO or driver).
- Installing or updating Equalizer APO, or editing APO settings other than the
  single Include line and `lalin-play.txt`.
- Per-app EQ, or routing other apps through Play's mixer or spatial mode.

## Risks

| Risk | Mitigation |
|---|---|
| Embeds fail in WebView2 with error 152/153 because the Tauri origin or Referer is missing | Run a spike first. If it fails, keep "Open on YouTube" and ship Scope A alone. |
| Elevated step edits a user's custom `config.txt` | Back it up, append only one line, make it idempotent, and offer undo. |
| APO enabled on the wrong device | Show the setup steps, and test that the Scarlett responds with a 0/+6 dB tone check. |
| Clipping on non-Play audio | Automatic headroom preamp (A5). |
| Users expect the compressor to apply system-wide | Label it clearly: System mode covers EQ and preamp only. |

## Acceptance criteria

1. With APO missing, the System option shows setup guidance and changes nothing.
2. After setup, `config.txt` has exactly one added Include line and a backup
   exists. Running setup again adds nothing.
3. Moving a band in Play updates `lalin-play.txt` within 300 ms. Audible change
   on YouTube in a browser through the Scarlett (manual check).
4. In System mode, Play's in-app filters are flat (unit test) and local files
   are not EQ'd twice.
5. Back to "Lalin Play only": the file is empty and in-app EQ is restored.
   "Remove" leaves `config.txt` equal to the backup apart from line endings.
6. Play here embeds only valid official IDs. It pauses local playback and
   leaves the queue untouched. Closing it removes the iframe.
7. Unit tests: APO file rendering, headroom math, ID parsing, CSP list. Rust
   tests: setup idempotency on a temp folder.

## Change log

| Version | Date | Status | Change | Commit | Author |
|---|---|---|---|---|---|
| 0.3.1b | 2026-11-25 | approved | Native check on the reference PC with APO 1.4.2: setup runs without UAC because Users have full control of the config folder; the elevated helper is now only the fallback and reports its error. Choosing Whole system wrote ten PK filters, and 31 Hz +4 dB was written with Preamp -4.0 dB (headroom). Still open: listening check through the Scarlett, and the YouTube embed in WebView2. | working tree | Claude |
| 0.3.0b | 2026-11-25 | approved | Implemented on `feat/play-system-eq-youtube-embed`. Automated checks pass: vitest 183/183, cargo lib 104 + 6 ignored, `npm run build`. Native checks still open: APO is not installed on the reference PC, and the embed is checked only in Chromium from a localhost origin, not in WebView2 or at the release origin. | working tree | Claude |
| 0.2.0b | 2026-11-25 | approved | Record user approval; implementation starts | working tree | Claude |
| 0.1.0b | 2026-11-25 | need review | Propose Equalizer APO bridge and official YouTube embed | working tree | Claude |
