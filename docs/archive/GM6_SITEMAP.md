# Lalin AI Detailed Sitemap and Responsive Information Architecture

> **Superseded as sitemap authority.** The concise, maintained source is
> [LALIN_SITEMAP_SOT.md](../design/LALIN_SITEMAP_SOT.md). This proposal remains as design
> rationale and detailed mobile exploration only.

**Status:** proposed — documentation approval gate before routing/UI changes.

## 1. Product navigation model

```
Lalin AI
├─ Onboarding (first run)
│  ├─ Welcome / local-first promise
│  ├─ Runtime readiness (full/lite, GPU, models)
│  ├─ Consent and voice-rights acknowledgement
│  └─ Workspace preference (desktop / companion mobile)
├─ Home / Workspace
│  ├─ Recent projects
│  ├─ Create: Voice profile, Speech, Dubbing, Remix, Master
│  ├─ Runtime status
│  └─ Active jobs
├─ Voice Studio
│  ├─ Voice profiles
│  ├─ Create profile: file / microphone
│  ├─ Profile detail: consent, transcript, language, preview, edit, delete
│  ├─ Text to speech
│  └─ Agent Voice settings
├─ Dubbing
│  ├─ Source import
│  ├─ Transcript / translate
│  ├─ Speaker and voice assignment
│  ├─ Timing review
│  └─ Export
├─ Remix / Arrange
│  ├─ Source and beat import
│  ├─ Timeline work surface
│  ├─ Device dock: FX, sync, stem mix, master
│  ├─ Patch (advanced graph)
│  └─ Render / export
├─ Mastering
│  ├─ Source / reference
│  ├─ Target loudness
│  ├─ Preview
│  └─ Export
├─ Library
│  ├─ Projects
│  ├─ Media
│  ├─ Outputs
│  └─ Packs / plugins
├─ Jobs
│  ├─ Queue
│  ├─ Job detail / progress
│  └─ History / retry
└─ Settings
   ├─ Runtime and Whisper model
   ├─ Brain provider
   ├─ Storage
   ├─ Updates
   ├─ Accessibility
   └─ About / version
```

## 2. Desktop shell

```
┌ Headbar: Lalin mark | current location | runtime | brain | version | update/menu ┐
├ Rail: Home · Voice · Dubbing · Remix · Master · Library · Jobs · Settings    ┤
└ Work area: primary task surface; contextual inspector/dock only when needed  ┘
```

- `Remix / Arrange` is the only canvas-first screen. Timeline retains visual priority; controls yield before it.
- Voice, Dubbing, Mastering, and Jobs use task cards with a persistent job-progress affordance.
- A command palette can expose secondary actions; it never replaces visible primary task actions.

## 3. Mobile companion

Top-level bottom navigation: **Home · Create · Jobs · Library · Settings**. Remix is a project detail entered from Home/Library, not a permanently cramped tab.

| Destination | Mobile first view | Secondary routes |
|---|---|---|
| Home | recent project + one prominent continue/create action | runtime details, notifications |
| Create | Voice profile, Speech, Dubbing, Remix, Master task launcher | task-specific step flow |
| Jobs | live job cards and one-tap retry | job detail/log/output |
| Library | projects/media/output tabs | search, filters, project detail |
| Settings | runtime, voices, storage, accessibility | update/about |

### Mobile task flows

**Voice profile:** Create → choose File/Microphone → consent → record/upload → transcript/language → verify → saved profile.

**TTS:** Choose profile → write/paste text → options (progressive disclosure) → Generate → player/save/share.

**Dubbing:** select media → transcript/translate → assign voice → review segments → start job → output.

**Remix:** select project → transport/timeline → tap clip → bottom sheet inspector → render → output. Pinch is optional; zoom buttons, split, and move actions remain explicit.

## 4. Screen-level requirements

| Screen | Primary action | Must retain | Mobile adaptation |
|---|---|---|---|
| Home | Create/continue | runtime status, recent work | cards stack; max two recents above fold |
| Voice profile | Save profile | consent and source | step flow and waveform preview |
| TTS | Generate audio | chosen profile and job state | sticky bottom CTA with safe-area inset |
| Dubbing | Start dubbing | source/voice/segment confirmation | segmented review sheet |
| Arrange | Render | timeline, transport, selected-clip state | timeline full-width; inspector sheet |
| Mastering | Master/export | reference/target/preview | target presets scroll horizontally with text labels |
| Jobs | Retry/open output | progress and error recovery | live cards, not a dense table |
| Settings | Save changes | side effects and restart notices | grouped list/detail navigation |

## 5. Route and state principles

- Desktop uses persistent rail; mobile uses a five-item bottom navigation and contextual back stack. Do not mix both at the same hierarchy.
- Every key screen must support deep linking and state restoration: selected project, filter, selected voice, active tab, and scroll position.
- Authentication is not added to the local-first desktop MVP without a separate product/security decision; reference auth screens are visual-flow reference only.
- Marketing/campaign pages, if created later, are a separate public website IA and never replace the workstation shell.
