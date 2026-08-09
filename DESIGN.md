---
version: "0.1.0b"
created_at: "2026-07-22T00:00:00+07:00,Codex,uncommitted"
last_update: "2026-07-22T00:00:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "design"
  doc_type: "source-of-truth"
  scope: "Lalin Studio desktop design system"
---

# Lalin Studio Design Source of Truth

## Status

This file captures the current approved desktop design direction. Detailed tab wireframes now live under `docs/design/`.

## Design Register

Lalin Studio is a product tool. The visual system should prioritize task clarity over decoration.

## Shell Invariants

- `M0`: 28px application command bar.
- `H1`: 56px global headbar.
- `R1`: 96px left navigation rail.
- `F1`: 22px runtime footer.
- `S1`: tab-owned main stage.

These dimensions are fixed for desktop unless a later SOT explicitly supersedes them.

## Navigation Order

The rail order is fixed:

1. Workspace
2. Voice Studio
3. Dubbing
4. Arrange
5. Mastering
6. Library
7. Jobs
8. Settings

## Visual Tone

- Dark workstation chrome.
- Restrained accent usage for selection, progress, and primary actions.
- Compact typography for toolbars, panels, meters, and status rows.
- Cards only for individual panels or repeated items; no nested decorative cards.
- No marketing hero patterns inside the desktop app.

## Current Implementation Anchors

- Shell: `apps/desktop/src/App.tsx`
- Global styles and shell dimensions: `apps/desktop/src/styles.css`
- Runtime footer source: `apps/desktop/src/hooks/useRuntimeActivity.ts`
- Runtime status endpoint: `apps/api/app/routers/health.py`
- Arrange editor: `apps/desktop/src/components/RemixPanel.tsx`
- Timeline dock: `apps/desktop/src/components/StudioDock.tsx`

## Component Rules

- Use tabs for work modes inside one destination, such as Profile, Text to speech, and Agent Voice.
- Use icon-plus-label buttons for major task launchers and compact icon controls for repeated editor actions.
- Use footer activity overlay for job detail entry, not a second persistent status bar.
- Show runtime, model, agent, and telemetry values as live data or unavailable states.

## Accessibility Rules

- Icon-only controls need labels or tooltips.
- Focus states must remain visible on shell navigation, command menus, and footer actions.
- Activity state cannot rely on color alone.
- Compact controls should retain usable click targets on mobile and narrow desktop.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-07-22 | beta | Created design SOT from approved Lalin desktop shell and current implementation. | uncommitted | Codex |
