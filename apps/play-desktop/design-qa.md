# Lalin Play EQ component visual QA

## Source visual truth

The user supplied six reference images. They were treated as visual references for the EQ controls and dark media-player presentation; product names, text, and device-specific capabilities in the images were not copied as product instructions.

- `C:\Users\suanr\AppData\Local\Temp\codex-clipboard-39cf08b9-4810-4b6f-843e-a54dac3fd732.png` — control shapes and sliders (1024 × 635 px)
- `C:\Users\suanr\AppData\Local\Temp\codex-clipboard-858cae0e-9957-4f99-aced-a14f6e118692.png` — control states and spectrum motif (1024 × 339 px)
- `C:\Users\suanr\AppData\Local\Temp\codex-clipboard-ba986f29-0227-44b0-ae1d-814c47cca869.png` — dark desktop device panel with EQ (1024 × 768 px)
- `C:\Users\suanr\AppData\Local\Temp\codex-clipboard-2201ca48-196f-42c2-950e-3ce62763b001.png` — compact EQ card and labeled frequency bands (1024 × 768 px)
- `C:\Users\suanr\AppData\Local\Temp\codex-clipboard-0d2c0387-2b47-4aed-b5c7-f5f4e2e03ed6.png` — grouped audio controls (1024 × 768 px)
- `C:\Users\suanr\AppData\Local\Temp\codex-clipboard-b86bbc8f-7bbb-4511-9dc3-60725e7f7c68.png` — dark music-player presentation (1024 × 768 px)

## Implementation capture

- URL: `http://127.0.0.1:4173/` in the Codex in-app browser
- Screenshot: captured in the current Codex task after selecting Full → EQ and scrolling until the graph and all 10 bands were visible. The CUA browser returned a 1006 × 752 px screenshot; the capture API did not expose a filesystem path.
- CSS viewport: approximately 1006 × 752 px; device scale was not overridden.
- State: Flat preset, EQ enabled, no track loaded; the app's spectrum analyser is therefore idle.
- Comparison: focused on the EQ component, since the references show multiple products and are not a single screen to reproduce pixel-for-pixel.

## Comparison history

1. First rendered comparison showed the spectrum label and description wrapping awkwardly. Shortened the labels and placed the description beneath the label.
2. Final rendered comparison showed a readable EQ gain graph, distinct live-spectrum region, separate Preamp control, three frequency groups, and all 10 labeled sliders. No actionable P0/P1/P2 visual differences remained at the captured viewport.

## Required fidelity surfaces

- **Typography:** retained the app's Segoe UI system font; used compact Thai labels, exact frequency units, and visible dB units.
- **Spacing and layout:** grouped the controls in dark cards, kept the Preamp distinct, and placed the ten bands in a horizontally scrollable grid for narrower widths.
- **Colors and tokens:** retained Lalin Play's dark olive surfaces and lime accent rather than importing another product's branding.
- **Image quality and assets:** the EQ component does not require product imagery; the response and spectrum canvases visualize live component data.
- **Copy and content:** the response graph is labeled as the stored gain per frequency band and explicitly excludes Preamp. The real spectrum analyser has a separate label.

## Interaction and runtime notes

- Selecting Bass Boost updated the preset, Preamp, band values, and response graph.
- Setting the 1 kHz slider to +6 dB updated its value and graph point; the preset changed to the unsaved custom state.
- Bypassing EQ changed the state label and disabled the EQ sliders; re-enabling EQ restored them.
- Restored the preview to Flat and EQ enabled after the interactions.
- `npm run build` passed. The automated test suite was not run.
- The Vite browser preview displayed a Tauri `invoke` error banner because it is outside the native shell; it was dismissed for visual inspection. Native Tauri playback/runtime was not verified in this pass.
- No new audio effects were added; this change presents the existing 10-band EQ and analyser more clearly.

## Follow-up polish

- A future DSP task can add separately controllable effects. The current component does not present hardware ANC or imply that Lalin Play controls headphone firmware.

## Final result

passed
