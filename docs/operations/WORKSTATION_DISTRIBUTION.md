# Full ML Workstation Distribution Boundary

Date: 2026-07-03

## Decision

The full ML workstation distribution is a separate BYOM/runtime track from the lite NSIS desktop installer.

The lite NSIS installer is the MVP desktop shell:

- Bundles the Tauri UI.
- Bundles the lite backend sidecar.
- Starts the backend automatically.
- Validates app install, sidecar launch, updater signature, and shell/backend readiness.
- Does not bundle ML-heavy routers, model weights, CUDA libraries, or GPL-sensitive optional audio components.

The full ML workstation distribution is the production feature track for TTS, dubbing, mastering, and remix:

- Uses the backend Python 3.11 venv as the current executable runtime surface.
- Requires workstation ML modules such as `torch`, `torchaudio`, `faster_whisper`, `f5_tts`, `matchering`, `pyloudnorm`, `librosa`, `demucs`, `psola`, `pedalboard`, `soundfile`, and `imageio_ffmpeg`.
- Uses model caches outside source control, primarily Hugging Face cache and tool-specific caches.
- Treats GPL-sensitive components as BYOM/optional components instead of bundling them into the lite installer.
- Exposes a runtime device choice: prefer CUDA when compatible, but fall back to CPU/int8 for ASR and CPU for TTS when speech CUDA libraries are unstable.

## Current Validated Surface

Run from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File tools\verify\smoke_workstation_features.ps1
```

This validates the current workstation surface:

- Full profile boots and mounts ML feature routes.
- TTS voice cloning writes a real Thai audio output with F5-TTS-THAI.
- Dubbing writes an audio output plus SRT/VTT subtitles from a short Thai source clip.
- Auto mastering writes a WAV output and meets LUFS/peak gates.
- Remix writes a WAV output and meets LUFS/peak gates.

## Out Of Scope For The Lite Installer

- Bundling the full Python ML dependency tree into NSIS.
- Bundling model weights.
- Bundling GPL-sensitive optional components into the default commercial app payload.
- Claiming packaged TTS/dubbing/mastering/remix readiness from the lite sidecar.

## Next Distribution Gate

Define an installable or launchable workstation artifact that can be validated outside the source checkout. Acceptable candidates:

- A signed workstation bootstrapper that creates/repairs the backend venv, installs optional BYOM components, and launches the lite desktop shell against the workstation backend.
- A separate workstation sidecar bundle with explicit license prompts and optional component gates.
- A documented local workstation mode with one-click launchers and mandatory smoke output capture.

The gate is complete only when that artifact runs feature smoke from its intended user-facing surface, not from ad hoc developer commands.
