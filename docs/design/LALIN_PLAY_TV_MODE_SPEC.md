---
version: "0.1.1b"
created_at: "2026-09-18T09:00:00+07:00,LALIN,c86ddc4"
last_update: "2026-09-18T14:52:43+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "design"
  doc_type: "interaction-spec"
  scope: "Lalin Play TV and Leanback presentation mode"
---

# Lalin Play TV Mode — Interaction and Layout Spec

## 1. Surface

TV Mode is a presentation state inside the existing `Lalin Play` window. It uses
a dark Cinemaro surface with large, high-contrast controls and a visible focus
ring. It does not add a Studio rail item, route or media owner.

```text
┌─────────────────────────────────────────────────────────────┐
│ LALIN PLAY                         TV MODE        Exit      │
├───────────────────────────────┬─────────────────────────────┤
│                               │ Queue                         │
│       artwork / title         │ 01 current                    │
│       artist / format         │ 02 next                       │
│                               │                               │
│          ◀   ▶/❚❚   ▶         │                               │
│       ─────────●────────       │                               │
│       volume / EQ / output    │                               │
└───────────────────────────────┴─────────────────────────────┘
```

At widths below the TV target, the queue becomes a focusable drawer below the
Now Playing block. The normal Play layout remains the fallback presentation.

## 2. Target sizes and tokens

| Token | TV target |
|---|---|
| Body text | 24px minimum |
| Track title | 36px minimum, weight 700 |
| Primary transport target | 64px minimum hit area |
| Secondary target | 48px minimum hit area |
| Focus ring | 3px accent with 4px offset |
| Major region gap | 32px minimum |
| Reduced motion | disable scale/parallax transitions |

Use existing Cinemaro colors (`#080b12`, `#11151f`, `#cdf23f`) and do not encode
state by color alone. Buttons keep text/aria labels alongside icons.

## 3. Focus model

The TV root has `role="application"`, an accessible name and a roving focus
path:

1. Exit TV Mode
2. Now Playing / artwork summary
3. Previous
4. Play/Pause
5. Stop
6. Next
7. Volume / mute
8. Queue items and queue actions
9. EQ tab and EQ controls

Only actionable controls receive focus. Queue rows use `Enter` to play and retain
the same queue mutation actions as normal Play. The current track gets a visible
selected state in addition to the focus ring.

## 4. Input mapping

| Input | Action |
|---|---|
| ArrowUp / D-pad up | move focus to previous control/row |
| ArrowDown / D-pad down | move focus to next control/row |
| ArrowLeft / D-pad left | previous track or previous focus group |
| ArrowRight / D-pad right | next track or next focus group |
| Enter / Space / Gamepad A (button 0) | activate focused control |
| Escape / Gamepad B (button 1) | exit TV Mode |
| Gamepad Start (button 9) | focus Exit / menu anchor |
| Tab / Shift+Tab | browser fallback focus order |

Directional playback actions use the same store callbacks as visible buttons.
When a text input or select is focused, the existing form behavior wins and the
global TV key handler does not intercept it.

## 5. Interaction states

- **Entering:** TV root is rendered before fullscreen request; focus moves to the
  first actionable control after the request settles.
- **Active:** `data-tv-mode="true"`, focus ring visible, fullscreen indicator
  reflects the actual adapter state.
- **Fullscreen unavailable:** retain the TV layout, show an inline Thai message,
  and keep Exit and transport controls usable.
- **External exit:** `fullscreenchange` clears the fullscreen indicator; TV Mode
  remains usable until the user selects Exit.
- **Exiting:** release fullscreen if owned by TV Mode, restore normal class and
  return focus to the TV Mode toggle.

## 6. Accessibility and test hooks

Required stable hooks:

- root: `[data-tv-mode="true"]`, `aria-label="Lalin Play TV Mode"`
- enter button: `data-testid="tv-mode-toggle"`
- exit button: `data-testid="tv-mode-exit"`
- fullscreen state: `data-fullscreen="true|false"`
- inline failure: `role="alert"`

The root must preserve the existing Now Playing title, queue count, current time,
EQ tab and actionable errors. No test may infer audio state from a fabricated
meter; use the store snapshot and existing owner evidence.

## 7. CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-09-18 | beta | Closed provenance for the approved 10-foot layout and input/accessibility hooks implemented in the local feature commit. | c86ddc4 | LALIN |
| 0.1.0b | 2026-09-18 | beta | Approved 10-foot layout, focus order, mappings and accessibility hooks | uncommitted | LALIN |
