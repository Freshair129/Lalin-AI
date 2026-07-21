# Lalin AI Design System

> Structure and navigation are governed by [LALIN_LAYOUT_SOT.md](../design/LALIN_LAYOUT_SOT.md)
> and [LALIN_SITEMAP_SOT.md](../design/LALIN_SITEMAP_SOT.md). This document governs visual
> language and components only.

**Status:** proposed — supplements, does not yet replace, [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Intent and constraints

Lalin AI adopts the supplied reference's dark editorial contrast, warm signal gradient, large-radius glass surfaces, and compact audio-tool hierarchy. It preserves the existing local-first, timeline-first workstation workflow. The reference brand, artwork, logos, text, and layouts are excluded.

## Foundations

### Spacing and layout

`4, 8, 12, 16, 24, 32, 48, 64` px is the only default spacing scale. Desktop uses a 12-column content grid; mobile uses four columns with 16px gutters. All major media has an explicit aspect ratio and uses original/owned assets only.

### Elevation

| Layer | Use |
|---|---|
| 0 | canvas/timeline grid |
| 1 | grouped controls, static cards |
| 2 | active card, context inspector |
| 3 | popover, command palette, modal |
| 4 | transient alert/toast only |

### Components

| Component | Required behaviour |
|---|---|
| Signal button | one primary CTA per view; gradient fill; loading text/spinner; disabled semantic state |
| Glass card | readable opaque base, 1px border, title/body/action hierarchy; no content-only blur |
| Audio task card | input source, output target, parameters, progress, primary action in this order |
| Timeline | primary work surface on desktop; horizontal pinch/zoom plus visible transport alternatives on mobile |
| Device dock | secondary FX/mixer controls; collapsible before timeline is reduced |
| Voice profile | source, language, consent, readiness, preview/select/edit/delete in that order |
| Bottom sheet | mobile contextual controls, clear dismiss control, safe-area aware |

### State contract

Every asynchronous action has idle, ready, loading, progress, success, error, and unavailable states. Colour never communicates state alone. Error includes cause and recovery action; long work exposes progress without blocking navigation.

## Breakpoints and adaptive rules

| Width | Navigation | Layout |
|---|---|---|
| 1440+ | left rail + headbar | 12-column workstation; timeline and dock visible together |
| 1024–1439 | compact rail + headbar | 8-column workspace; inspector becomes a right drawer |
| 768–1023 | labelled top actions + collapsible rail | 6-column tablet; dock becomes bottom sheet |
| 480–767 | bottom navigation (max 5) | 4-column single-task flow; secondary tools in sheet |
| 320–479 | bottom navigation (max 5) | one task per viewport; 16px gutter; 44px controls |

## Accessibility release gate

- Body text contrast ≥ 4.5:1; component boundaries and large icons ≥ 3:1.
- Keyboard order equals visual order; all icon controls have labels.
- Mobile supports dynamic text and safe areas; no horizontal document scroll.
- Motion is reduced under `prefers-reduced-motion`.
- Drag/timeline has keyboard and visible-control alternatives.

## Implementation sequencing

1. Add GM6 tokens alongside current Cinemaro tokens; visual-regression check desktop and mobile.
2. Replace structural emoji icons with the approved SVG system.
3. Migrate shell/headbar/rail first, then task cards, then StudioDock and Arrange workspace.
4. Build mobile navigation and task-first variants; do not compress the desktop DAW into a narrow canvas.
