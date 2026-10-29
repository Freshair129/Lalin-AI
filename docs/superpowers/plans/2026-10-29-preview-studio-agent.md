# Preview validity and studio agent panel implementation plan

**Goal:** prevent stale preview use and provide compact navigation plus an app-wide agent panel.
**Architecture:** bind previews to a one-way invalidation generation; retain marker draft only for submitting a new revision. Reuse MixCopilot and the shared engine in a persistent shell side panel.
**Tech stack:** React, TypeScript, Vitest, Tauri, FastAPI.
**Spec:** docs/superpowers/specs/2026-10-29-preview-studio-agent-design.md

1. Add regression tests for input changes followed by restoration, marker edits and restoration, in-flight preview invalidation, and fresh revision recovery; implement preview lifecycle gates.
2. Add accessible collapsible rail and persistence tests, then a shell-level agent panel with real existing agent interaction, proposal approval and error handling tests.
3. Run desktop build and tests. Run native desktop UAT on real Demucs with rights-cleared controlled-drift pair: preview, playback, changed/restored setting, marker edit, fresh revision, stale rejection and accepted output parity. Record exact evidence and scope.
4. Review changed files, commit and deliver through PR and required CI per existing authorization.
