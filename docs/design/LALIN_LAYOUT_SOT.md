# Lalin Studio Layout Source of Truth

**Status:** active  
**Scope:** workstation shell, screen regions, responsive rules, and layout
invariants.  
**Companion:** [LALIN_SITEMAP_SOT.md](LALIN_SITEMAP_SOT.md)  
**Shared shell:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md)

## 1. What this governs

This is deliberately not a component catalogue or a page-by-page specification.
It defines where work happens and which region wins when space is limited.
Visual tokens belong in [GM6_DESIGN_SYSTEM.md](GM6_DESIGN_SYSTEM.md).

## 2. Desktop shell — W0 canonical arrangement

```
Application command bar: File | Edit | View | Help | Open | Save | Settings
Headbar: brand | current context | global search | global utility controls
Rail:    fixed primary destinations
Stage:   active task surface
Footer:  one-line runtime telemetry and live activity
Overlay: modal, inspector, activity log, command palette, popover
```

- The **application command bar** owns global Open, Save, and Settings access.
- The **headbar** owns global context and discovery; runtime telemetry and live
  job activity belong in the footer.
- The **rail** changes the primary task only. Tool-specific controls must not
  become permanent rail items without a sitemap change.
- The **stage** owns the active task and may scroll independently from the
  shell.
- **Overlays** are temporary and never hide a running job's recovery path.
- Dimensions and fixed-shell order are owned by
  [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md).

## 3. Work-surface patterns

| Pattern | Use | Layout contract |
|---|---|---|
| Task workspace | Voice, TTS, Dubbing, Mastering, Jobs | task header; input → options → output/progress; one visible primary action |
| Library workspace | projects, media, outputs, packs | browse/filter region plus detail or inspector only when selected |
| Arrange workspace | Remix | timeline is the primary surface; library and device controls are secondary |
| Settings workspace | runtime, storage, updates, provider | grouped settings with explicit save/restart impact |

### Arrange / Remix contract

```
Application command bar: File/Edit/View/Help | Open | Save | Settings
Arrange header: source, beat, transport, grid/snap, render
Work area: library/track browser | timeline canvas
Device rack: below timeline, collapsible
```

- Timeline occupies the largest usable area and remains visible while editing.
- FX, sync, stem mixer, mastering, and patch controls live in the contextual
  device dock or inspector; they yield before the timeline is squeezed.
- Do not add a second timeline/status strip beneath the Arrange header.
- Transport belongs with the timeline session, not the 22px global footer.

## 4. Responsive contract

The shipped workstation is desktop-first. Compact and mobile are target
contracts, not a claim that they are already implemented.

| Width | Shell behaviour | Priority rule |
|---|---|---|
| `>= 1100px` | full headbar, rail, multi-region stage | show contextual dock beside or below work surface |
| `900–1099px` | compact headbar; rail may use icons; cards reflow | hide labels before reducing task controls below usable size |
| `768–899px` | single task column with drawer/inspector | dock becomes a drawer; timeline stays full-width |
| `< 768px` | companion experience, bottom navigation | use step flows and bottom sheets; do not force desktop Arrange chrome into a narrow viewport |

## 5. Non-negotiable checks

- Exactly one persistent global status location: the headbar.
- One primary CTA per task view; secondary actions are grouped or progressive.
- A selected object always has a visible inspector/recovery path.
- Jobs expose progress, failure, and output access without relying on a toast.
- Arrange never gives priority to an idle mixer over an editable timeline.
- Test intended layout at 1280px, 1024px, and 375px before calling a responsive
  change complete.

## 6. Change ownership

Update this document for changes to shell regions, breakpoint behaviour, or the
Arrange priority rules. Update the sitemap instead for a destination, route, or
flow change. Update both when a destination changes its layout role.
