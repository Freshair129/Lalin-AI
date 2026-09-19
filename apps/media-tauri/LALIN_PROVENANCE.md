# Lalin Media Tauri provenance

| Field | Value |
|---|---|
| Feature reference | VacuumTube |
| Upstream | https://github.com/shy1132/VacuumTube |
| Baseline | v1.8.2 / 4dd3ee4 |
| License | MIT; retain `apps/media-desktop/LICENSE` in distributions that copy upstream code |
| Port scope | Rust + Tauri v2 native shell and WebView boundary |
| Leanback surface | `https://www.youtube.com/tv` |
| User-Agent | derived from the pinned upstream source for compatibility testing |

This app does not copy VacuumTube DOM modules yet. Each future module must record
its source path, local adaptation, runtime assumptions and WebView2 evidence before
it is enabled. No custom YouTube-specific ad bypass or credential relay is part of
this candidate.

