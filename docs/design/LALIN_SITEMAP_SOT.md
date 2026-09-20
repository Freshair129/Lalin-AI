---
version: "0.3.0b"
created_at: "2026-09-20T18:34:22+07:00,LALIN,8429010"
last_update: "2026-09-20T22:01:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "design"
  doc_type: "source-of-truth"
  scope: "Studio sitemap and Play standalone surface proposal"
---

# Lalin Studio Sitemap Source of Truth

**Status:** existing Studio routes retained; Play standalone specification approved, implementation partial

**Scope:** desktop information architecture, mobile companion IA, and canonical
task flows.  
**Companion:** [LALIN_LAYOUT_SOT.md](LALIN_LAYOUT_SOT.md)  
**Shared shell:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md)

## 1. Product map

```
Lalin Studio
├─ Onboarding
├─ Home / Workspace
├─ Voice Studio
├─ Dubbing
├─ Remix / Arrange
├─ Mastering
├─ Library
├─ Jobs
└─ Settings
```

| Destination | Owns | Primary outcome | Current implementation mapping |
|---|---|---|---|
| Onboarding | readiness, consent, workspace preference | safe first use | target; not a separate shipped destination |
| Home / Workspace | recents, create, runtime summary, active jobs | continue or start work | target; shell opens a selected tool today |
| Voice Studio | profiles, cloning consent, TTS, agent voice | saved profile or generated audio | `voices` + `tts` |
| Dubbing | source, transcript, assignment, review, export | dubbed output | `dubbing` |
| Remix / Arrange | source/beat, timeline, devices, patch, render | arranged render | `remix` |
| Mastering | source/reference, loudness, preview, export | mastered output | `mastering` |
| Library | projects, media, outputs, packs/plugins | find or manage asset | `files`, `market`, `plugins` |
| Jobs | queue, progress, history, recovery | open/retry output | `queue` |
| Settings | runtime, Whisper, brain, storage, updates, about | saved configuration | `brain` plus update controls |

The rightmost column records the current desktop code, so a target name is not
mistaken for a completed route migration.

## 2. Navigation model

### Desktop

Every destination inherits the W0 shell: `M0` application command bar, `H1`
global headbar, `R1` persistent rail, `S1` stage, and `F1` runtime/activity
footer. The rail order is fixed: Workspace, Voice Studio, Dubbing, Arrange,
Mastering, Library, Jobs, Settings. Deep screens stay in `S1`, with
back/breadcrumb context where needed.

`M0` owns app commands: File (New/Open/Save/Save As), Edit, View, and Help.
Open, Save, and Settings remain reachable from the shared shell; a destination
must not duplicate them merely to make them visible.

### Mobile companion

Bottom navigation is **Home · Create · Jobs · Library · Settings**. Voice,
Dubbing, Arrange, and Master are launched from Create or opened as project
detail. Arrange uses its own project-detail back stack and a contextual bottom
sheet; it is not a cramped permanent tab.

## 3. Canonical task flows

| Flow | Minimal path |
|---|---|
| Voice profile | Voice Studio → file/microphone → consent → transcript/language → verify → save/profile detail |
| Text to speech | Voice Studio → choose profile → text/options → generate → player/save |
| Agent voice | Voice Studio → choose profile + opt in → agent reply → queued speech/player or explicit unavailable state |
| Dubbing | Dubbing → import → transcript/translate → assign voices → review timing → run → export |
| Remix | Arrange → source/beat → timeline edit → contextual device/patch → render → output |
| Mastering | Mastering → source/reference → target → preview → master/export |
| Recovery | Jobs → job detail → open output or retry with visible failure reason |

### Lalin Play deep surface

Current source: Lalin Play is a consumer surface opened from Library/File Manager,
still inside the Studio binary. Its TV Mode is a presentation state inside the
existing `play` window, not a new Studio destination or rail item. The current flow is:

`Library/File Manager → Play → TV Mode → transport/queue/EQ → Exit TV Mode`

TV Mode preserves the Play owner, queue, Now Playing and EQ state. Receiver mode,
casting, network remotes and YouTube/DRM remain outside this slice.

### Lalin Play standalone surfaces (approved target)

The approved product direction is a local media player with Full and Compact
layouts in one independent application, sharing the same playback owner:

| Surface | Primary navigation and controls | Switch behavior |
|---|---|---|
| Full | Library (tracks/artists/albums from actual metadata), playlists, queue, Now Playing and EQ | Enter Compact without restarting media or clearing state |
| Compact | Minimal overlay: Play/Pause, ±10 seconds, seek/time with video preview, volume/mute, Fullscreen and Full; open when empty, drag/drop | Restore Full and its navigation/window bounds; queue/EQ remain active and are accessible in Full |

`Open Lalin Play → select files/folders → Full library → play → Compact → Full`

`Studio Library/File Manager → resolve local file → external Play / Play Next / Add to Queue`

Standalone Play must remain usable after Studio/API exits. Full is not synonymous
with fullscreen. Existing TV presentation is an option within Full, not a third
primary product surface. Approved [CR-003](../product/CR-003--LALIN_PLAY_LOCAL_VIDEO.md)
adds a persistent local video stage to both Full and Compact; expanded video
fills the same window and Escape restores its layout, independently of TV mode.
New decoder/general codec expansion stays excluded. See [PRD §4.9](../product/PRD.md#49-lalin-play--standalone-local-media-player-approved)
and [ADR-004](../architecture/ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md).

### Approved Compact replacement — CR-004

[CR-004](../product/CR-004--LALIN_PLAY_MINIMAL_COMPACT_PREVIEW.md) implements
video-first Compact with bottom auto-hiding seek/Play-Pause/time/volume/Full
controls. Approved Addendum A adds ±10 seconds beside Play/Pause and a native
Fullscreen toggle separate from Full. No queue/EQ tabs or persistent header.
Return to Full to access queue/EQ; their state remains active in Compact.
Hover/drag displays a real frame thumbnail and target timestamp; only committed
seek changes main playback. Audio-only keeps minimal visible controls and no
video preview. Native title bar remains outside fullscreen. Escape/exit restores
the previous Compact bounds; returning to Full exits fullscreen first. Scrub
Escape cancels the draft before exiting fullscreen on the next Escape.
See [fullscreen and skip captures](../validation/LALIN_PLAY_FULLSCREEN_SKIP.md).
User approved this change on 2026-09-20;
[current native captures](../validation/LALIN_PLAY_MINIMAL_COMPACT.md) replace
CR-003 screenshots for Compact layout evidence; device/DPI limits remain explicit.

### Product portfolio: current and candidate boundaries

Lalin AI is being documented as an umbrella platform without changing the Studio
rail:

| Surface | Product role | Studio relationship | Status |
|---|---|---|---|
| Lalin Studio | Create: local AI audio workstation | current shell and rail | current |
| Lalin Play | Local library/media player; Full + Compact | original Studio window retained; separate candidate has no Studio command handoff yet | native foundation at `apps/play-desktop` on `codex/lalin-play-split` |
| Lalin Cast (formerly Lalin Media) | YouTube TV / Leanback and phone pairing | existing external Cast launcher, not a rail tab | source separated to `Freshair129/lalin-cast`; release gates separate |
| Lalin Room | shared media/session experience | separate future surface | deferred |
| Lalin Remote | companion control | separate future surface | deferred |
| Lalin Ride | mobile/rider experience | separate future surface | deferred |

Cast owns the VacuumTube-derived YouTube TV boundary; Play owns local playback.
Do not treat the old combined Media/Play label as current product ownership.
Cast source and runtime evidence are recorded in the
[separation handoff](../architecture/LALIN_CAST_SEPARATION_HANDOFF.md);
this sitemap does not independently certify pairing, filtering or release readiness.

## 4. Route-state requirements

Each primary destination restores, where applicable: selected project, selected
voice, active tab, filter, selected clip/asset, and scroll position. Authentication
is outside the local-first desktop MVP unless a separate product/security
decision adds it.

## 5. Change ownership

Update this document before adding/removing a destination, merging a current
tool into a Lalin destination, or changing a canonical flow. Pair it with
[LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md) and
[LALIN_LAYOUT_SOT.md](LALIN_LAYOUT_SOT.md) when the change affects shell or
space priority. For the umbrella platform, update the ADR and migration map
before changing the Studio rail or retiring the current Play owner.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.3.0b | 2026-09-20 | beta | Add approved Compact fullscreen exit routes and ten-second controls | based on 8429010 | LALIN |
| 0.2.1b | 2026-09-20 | beta | Record approved minimal Compact navigation and native preview captures | based on 8429010 | LALIN |
| 0.2.0b | 2026-09-20 | candidate | Add pending minimal Compact navigation and frame-preview flow | based on 8429010 | LALIN |
| 0.1.2b | 2026-09-20 | beta | Record persistent video stage and expanded-view return path in both layouts | based on 8429010 | LALIN |
| 0.1.1b | 2026-09-20 | beta | Record approved surfaces and partial native implementation without claiming Studio handoff | based on 8429010 | LALIN |
| 0.1.0b | 2026-09-20 | candidate | Add version metadata and Play Full/Compact candidate flows; distinguish current Play from separated Cast | based on 8429010 | LALIN |
