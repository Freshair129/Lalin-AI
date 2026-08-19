# Lalin Studio Sitemap Source of Truth

**Status:** active  
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
space priority.
