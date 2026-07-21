---
version: "0.1.0b"
created_at: "2026-07-22T00:00:00+07:00,Codex,uncommitted"
last_update: "2026-07-22T00:00:00+07:00,Codex"
status: "beta"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "source-of-truth"
  scope: "Lalin Studio product identity and operating intent"
---

# Lalin Studio Product Source of Truth

## Status

This file is the new product-level source of truth. It documents the intended product identity from the current codebase without pretending the rename is complete.

## Product Identity

- Public brand: Lalin AI
- Desktop product: Lalin Studio
- Current repository and compatibility name: G-Music
- Current GitHub remote: `https://github.com/Freshair129/G-Music.git`
- Current desktop package identity: `G-Music`, `com.gmusic.app`, `g-music-backend`

## Register

Lalin Studio is a product UI, not a marketing surface. The interface should feel like a local AI audio workstation: dense, predictable, fast to scan, and built around repeated editing tasks.

## Users

- Thai and bilingual creators working with voice, dubbing, music remix, and mastering.
- Power users with local GPU hardware who want privacy, low marginal cost, and fewer cloud dependencies.
- Operators who need recoverable jobs, project files, runtime telemetry, and clear model/provider status.

## Product Promise

Lalin Studio turns local AI audio workflows into one desktop workspace: voice profiles, text-to-speech, dubbing, Arrange timeline finishing, mastering, files, jobs, and runtime settings.

## Current Product Surface

- Desktop shell: Tauri v2 + React + Vite.
- Backend: FastAPI on Python 3.11 with a lite/full sidecar profile.
- Audio runtime: F5-TTS Thai, faster-whisper, mastering, and optional remix dependencies such as Demucs, psola, pedalboard, and Matchering.
- Brain runtime: switchable Ollama and cloud providers through one abstraction layer.
- Packaging lane: NSIS installer, Tauri updater, GitHub Releases endpoint.

## Current Top-Level Tabs

The approved desktop shell has eight top-level tabs:

1. Workspace
2. Voice Studio
3. Dubbing
4. Arrange
5. Mastering
6. Library
7. Jobs
8. Settings

## Strategic Rules

- Arrange is the primary editor workspace. Timeline stays visually and functionally dominant.
- Runtime information belongs in the shared footer, not repeated inside editor panels.
- Product-facing copy uses Lalin Studio. Compatibility identifiers may keep G-Music until a tested migration releases.
- Heavy ML dependencies stay lazy or optional so lite packaging and basic shell startup remain fast.
- Missing telemetry must render as unavailable, not fabricated.

## Non-Goals

- Do not rename bundle IDs, updater URLs, install paths, or sidecar binaries without a migration gate.
- Runtime data lives under `runtime/` in development and must remain outside source-controlled app folders.
- Do not introduce Nx or Turborepo until shared packages or CI affected-build needs justify the extra tool.
- Do not collapse release evidence into product specs; validation history remains archived evidence.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-07-22 | beta | Created product identity SOT from current codebase and approved Lalin direction. | uncommitted | Codex |
