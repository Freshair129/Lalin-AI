# Lalin AI Corporate Identity

**Status:** name locked — visual implementation pending

## 1. Brand definition

**Public brand:** Lalin AI

**Desktop product:** Lalin Studio

**Legacy codename:** GM6 is retired. Keep it only in the historical filenames of this proposal pack until the controlled documentation migration.

**Descriptor:** Local AI Audio Workstation

**Promise:** Turn a voice, a clip, or a musical idea into a controlled local audio workflow.

**Personality:** precise, warm, cinematic, technically honest, creator-led. GM6 is not a clone of the reference brand and must never use its name, logo, copy, character art, or commercial credit language.

## 2. Visual signature

`quiet black studio` + `ember-to-gold signal` + `frosted technical surfaces`

- Black-green graphite gives the workstation visual calm.
- A restrained warm gradient signifies an active creative signal, not a global decoration.
- The visual focus is audio work, waveform, timeline, and results; campaign imagery remains optional and original.

## 3. Mark direction

- Create a distinct Lalin monogram from an `L` and interlocking waveform/track segments; do not use a lightning-S or any reference-brand geometry.
- Primary lockup: `LALIN AI` plus **Local AI Audio Workstation** in product contexts.
- Use a one-colour mark on dark surfaces; use the signal gradient only for campaign/launch applications.
- Clear space: at least one mark-height on every side. Minimum UI size: 20px; minimum marketing size: 32px.

## 4. Colour roles

| Role | Token | Value | Use |
|---|---|---:|---|
| canvas | `--gm6-canvas` | `#081013` | primary desktop/mobile backdrop |
| surface | `--gm6-surface` | `#0F1A1E` | cards and sheets |
| surface-raised | `--gm6-surface-raised` | `#16242A` | active cards, dock, modal |
| line | `--gm6-line` | `#24343A` | borders and separators |
| text | `--gm6-text` | `#F3F6F4` | primary copy |
| muted | `--gm6-muted` | `#A6B1AE` | supporting copy, never below 4.5:1 for body text |
| signal-ember | `--gm6-ember` | `#FF6A2A` | active/recording accent |
| signal-gold | `--gm6-gold` | `#FFD84D` | confirmation and primary-action endpoint |
| signal-cream | `--gm6-cream` | `#FFF4E9` | gradient midpoint/highlight |
| success | `--gm6-success` | `#65D68A` | completed state with text |
| danger | `--gm6-danger` | `#FF6C72` | destructive/error state with text |

**Signal gradient:** `linear-gradient(100deg, #FF6A2A 0%, #FFF4E9 48%, #FFD84D 100%)`. It belongs to one primary action per view, recording/processing focal points, and restrained brand moments. It must not be applied to long text or every card.

## 5. Typography and iconography

- Product/UI: `Instrument Sans`, then `Inter`, then system sans fallback. It should be licensed/self-hosted or substituted before shipping.
- Monospace metadata: `JetBrains Mono`, then `SFMono-Regular`, then `Consolas`.
- Type roles: Display 40/48 desktop, 32/40 tablet, 28/34 mobile; H1 28/34; H2 20/28; body 16/24; label 12/16.
- Use one consistent SVG icon family at 1.75px stroke. No emoji as structural icons.

## 6. CSS visual rules

```css
:root {
  --gm6-radius-card: 20px;
  --gm6-radius-control: 12px;
  --gm6-shadow-float: 0 20px 60px rgb(0 0 0 / .38);
  --gm6-glass: rgb(22 36 42 / .72);
  --gm6-glass-border: rgb(255 255 255 / .10);
  --gm6-focus: 0 0 0 3px rgb(255 216 77 / .42);
  --gm6-motion-fast: 160ms;
  --gm6-motion-standard: 240ms;
}
```

- Use one soft radial ember/gold glow per major view at most; blur only as an atmospheric layer behind readable content.
- Cards: 1px translucent border, 20px radius, opaque enough to retain hierarchy. Do not use glass opacity as the sole separation.
- Interaction: `transform`/`opacity` only; 160–240ms; respect `prefers-reduced-motion`.
- Controls: desktop min 36px, touch/mobile min 44px. Keep focus rings visible.

## 7. Brand applications

| Surface | Direction |
|---|---|
| Desktop workstation | graphite frame, compact headbar, timeline/action first, signal gradient only on primary render action |
| Mobile companion | task-first dark cards, bottom navigation up to five top-level destinations, safe-area spacing |
| Marketing/campaign | original abstract waveform/light visuals, one warm focal gradient, product screenshot only if it depicts GM6 |
| Documents | monochrome GM6 lockup, ember bullet/section marker, high-contrast white/graphite typography |

## 8. CI deliverables after approval

1. Original Lalin AI wordmark and monogram in SVG.
2. SVG app icons: 16, 20, 24, 32, 48, 64, 128, 256, 512.
3. Tauri icon pack generated from the approved source mark.
4. CSS token migration plan from Cinemaro tokens to GM6 semantic tokens.
5. Original campaign art direction brief; no supplied reference image ships in the app.
