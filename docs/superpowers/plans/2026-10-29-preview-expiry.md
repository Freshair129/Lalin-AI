# Preview expiry implementation plan

> **For agentic workers:** Use superpowers:executing-plans task by task.

**Goal:** Retire expired previews with actionable recovery, verify native behavior, and merge.
**Architecture:** Keep existing recipe validity separate from preview lifetime. Register successful preview ID/revision and expiry; latch failures until a new preview replaces them. RemixPanel consumes the lifetime state.
**Tech Stack:** Existing React, TypeScript, Vitest and Tauri.
**Spec:** ../specs/2026-10-29-preview-expiry-design.md

## Global constraints

- No backend TTL, DSP, saved-project, or dependency changes.
- New UI copy is Thai; fresh previews use current inputs and no old preview identifiers.
- Preserve unrelated generated Tauri changes and the existing UAT data.

## Review focus

- A suspended window must retire the preview on focus before another action.
- A late request failure must not invalidate a replacement preview.
- Manual revision rejection must retain an actionable notice after its job result clears.
- A media/network error must not be presented as proven expiry.
- Invalid or already elapsed deadlines must not expose controls; ordinary errors must remain visible.

## Task 1: Lifetime and recovery

Files: new `apps/desktop/src/hooks/useWarpPreviewLifetime.ts` and its test; modify `apps/desktop/src/components/RemixPanel.tsx`; add RemixPanel expiry integration tests.

- [ ] Write tests for deadline, focus, invalid timestamp, old-error fencing, media failure and regeneration; run to establish failures.
- [ ] Implement `useWarpPreviewLifetime()` with `register(key, expiresAt)`, `clear()`, `isFresh(key)`, `invalidate(key, reason)`, and `reason` state. Track one active preview and clean timers/listeners on replacement/unmount.
- [ ] Register completed previews; guard preview actions; normalize expiry errors and unavailable media; render a Thai recovery notice and hide invalid controls.
- [ ] Run `npm test` and `npm run build` in apps/desktop. Expected: all tests and type/build checks pass.
- [ ] Review the complete diff, commit only task files.

## Task 2: Native and merge

- [ ] Launch the existing isolated native UAT profile/API. Create a preview through native UI with a shortened test-only TTL; verify idle expiry, removal of controls and recovery.
- [ ] Expire only an isolated manifest while UI deadline is still future; verify server rejection hides controls and replaces raw error, then regenerate and verify new playback/render controls.
- [ ] Record native receipts, scope and limits; open PR, verify exact head CI/reviews, then merge with a head SHA guard.

## Execution record

- Baseline: reused the isolated worktree on a new branch from merged PR #39, `e70ba2b`; three generated Tauri files were already dirty and have no textual diff.
- Initial regressions: five panel tests failed on visible expired controls/missing recovery; implementation passed 224 tests and build.
- Independent review found server cleanup returns `404 preview_not_found` for manual revision/render. Added two failing panel regressions, then handled exact missing-preview errors as unavailable; full suite passed 226 tests and build. Added late background-error fencing coverage for both error codes.
- Final review ruling: native UAT remains an execution gate below; installed-package/listening acceptance and backend TTL/DSP changes are outside this frontend task. No such release or audio-quality claim is made.
