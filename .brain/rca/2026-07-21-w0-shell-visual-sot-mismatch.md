# RCA: W0 shell visual SOT mismatch

**Date:** 2026-07-21  
**Status:** resolved in documentation; revised visual pending approval

## Symptom

`LALIN_W0_SHARED_SHELL_MASTER_APPROVED.png` showed a 44px footer and no M0
application command bar while `LALIN_SHELL_SOT.md` required a 22px footer and
M0.

## Evidence

- The stored image visibly labels `F1` as `44px` and starts with `H1`.
- `docs/LALIN_SHELL_SOT.md` specified `M0` at 28px and `F1` at 22px.

## Root cause

The pre-change W0 reference image was copied into the repository and named
`APPROVED` after the specification changed. The visual and textual authorities
were not checked against each other before the SOT was declared active.

## Why it escaped detection

Verification checked that the file existed and the Markdown links resolved; it
did not compare the dimensions and regions rendered in the visual authority
against the shell table.

## Prevention

- Never label a visual artifact approved until its dimension labels match the
  current shell table.
- Store source reference and candidate/approved artifacts under distinct names.
- Add a visual-to-SOT comparison check before declaring a shell change complete.
