---
version: "0.1.1b"
created_at: "2026-07-21T00:00:00+07:00,ATHER,uncommitted"
last_update: "2026-07-21T00:00:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "product-ui"
  doc_type: "tab-layout-spec"
  scope: "Lalin Studio Mastering desktop"
---

# Lalin Studio Mastering Tab Specification

**Status:** approved design baseline; implementation pending.  
**Parent shell:** [LALIN_SHELL_SOT.md](LALIN_SHELL_SOT.md)  
**Approved visual:** `docs/design/reference/lalin/LALIN_MASTERING_V1_APPROVED.png`.

## Purpose

Mastering prepares a source for an explicit delivery target. It keeps source,
optional reference, target loudness, preview, and export decision visible in
one focused work surface.

## Stage map

```
M0/H1/R1/F1 inherited unchanged from W0
S1           M1 source/reference | M2 target + analysis | M3 preview + output
```

| ID | Region | Desktop rule |
|---|---|---|
| `M1` | source/reference | input audio and optional reference with format, duration, player, and replace actions. |
| `M2` | target and analysis | named delivery presets, loudness/headroom metrics, waveform/level display, and analysis state. |
| `M3` | preview/output | A/B preview, output format/settings, warnings, and the single Master & export action. |

## Interaction rules

- Source is mandatory; reference is optional and must be clearly labelled as
  absent when not provided.
- Preset changes disclose their target values; Custom exposes editable values
  rather than silently applying an unknown configuration.
- Analysis or master jobs report in `F1` and preserve last valid metrics until
  replacement results are ready.
- Master & export remains unavailable until source validation passes; warnings
  identify the blocking setting/file.

## Acceptance checks

- W0 shell dimensions and rail order are unchanged.
- Source, target, preview, and output are simultaneously discoverable.
- A/B comparison is explicit; a reference cannot be mistaken for output.
- One primary Master & export action is visible and its disabled reason is
  recoverable.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-21 | beta | Mastering v1 visual baseline approved; implementation pending. | uncommitted | ATHER |
| 0.1.0b | 2026-07-21 | superseded | First Mastering design spec under approved W0 shell, pending visual approval. | uncommitted | ATHER |
