# G-Music Design System

**Status:** active
**Source implementation:** `apps/desktop/src/styles.css`
**Scope:** desktop Tauri workspace, including voice cloning profiles, Whisper configuration, and Agent Voice.

**Lalin AI proposal:** [GM6_DESIGN_SYSTEM.md](GM6_DESIGN_SYSTEM.md) defines the name-locked future visual system. It does not replace this active implementation system until the controlled UI migration begins.

## Principles

- Preserve the existing Cinemaro pro-audio dark interface; references inform workflow only, never branding or copied layouts.
- Give each state one primary action: create profile, start/stop capture, apply Whisper profile, or enable/disable Agent Voice.
- Keep technical states readable in text and never communicate readiness, recording, or error by colour alone.
- Default privacy-sensitive controls to off. Voice playback and Agent speech require an explicit user action or enabled preference.

## Core Tokens

| Role | Token | Use |
|---|---|---|
| canvas | `--bg`, `--bg2` | application and timeline backgrounds |
| surface | `--panel`, `--panel2`, `--panel3` | cards, grouped controls, active sub-surfaces |
| text | `--text`, `--muted`, `--muted2` | headings, supporting copy, technical metadata |
| primary | `--accent`, `--accent-bright`, `--accent-text` | primary action, selected profile, active toggle |
| signal | `--green`, `--amber`, `--red` | ready, loading/recording, error; always pair with text |
| audio lanes | `--vocal`, `--beat`, `--master` | audio-domain accents only; not sole status indicators |
| surfaces | `--glass-*`, `--radius`, `--radius-sm` | glass cards and shared shape/elevation |
| spacing | `--gap-xs` through `--gap-lg` | 4/8/12/16px spacing rhythm |
| interaction | `--tap-min` | minimum 44px control height for primary controls |

## Voice Feature Patterns

### Voice Profile Card

- Card title: profile display name; secondary line: language and capture source.
- Required textual states: `Ready`, `Recording`, `Processing`, `Unavailable`, `Error`.
- Card actions are ordered: preview, select/default, edit, delete.
- Deletion requires confirmation; a consent acknowledgement is required before creating a cloned reference.

### Whisper Profile Selector

- Use labelled segmented or select control with `Base`, `Small`, `Medium`, `Large-v3`, and `Turbo` only when supported locally.
- Show model state adjacent to the selector: installed/loading/ready/error plus device and quality-speed note.
- Disable changes while an ASR job runs, with a textual reason.

### Agent Voice

- A selected profile and `Speak replies` are independent controls; speech stays off by default.
- When enabled, show `Speaking`, `Queued`, or `Unavailable` beside the reply/player.
- Agent text always remains visible when audio fails or is disabled.

## Accessibility and Interaction

- Interactive controls have visible `:focus-visible` treatment and keyboard-equivalent actions.
- Icon buttons use accessible labels and minimum 44px hit areas even when their glyph is smaller.
- Recording and queued states use `aria-live="polite"`; errors provide an explicit recovery action.
- Motion is limited to opacity/transform and respects reduced-motion preferences.
- Avoid a nested scrolling region unless a long profile/history list requires it.

## Non-goals

- No imported third-party logos, names, artwork, or exact reference layouts.
- No automatic recording, automatic external text injection, or automatic spoken Agent replies.
