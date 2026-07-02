## Symptom

`run_remix()` occasionally emitted `pyloudnorm` warnings about clipped samples during loudness normalization, and the final LUFS could drift away from the requested target after the later peak-scaling step.

## Evidence

- A real local remix run produced `UserWarning: Possible clipped samples in output.` from `pyloudnorm.normalize.loudness`.
- The current pipeline first applied loudness gain to hit the LUFS target, then separately reduced peaks afterward.
- A follow-up remix run returned a final loudness of `-14.9 LUFS` while targeting `-14.0`, showing that the post-normalize peak fix could move the result away from the target.

## Root Cause

The mastering stage was not peak-aware when applying loudness normalization. It boosted audio to the requested LUFS without considering headroom, then compensated afterward with raw peak scaling. That two-step process could clip transient peaks during normalization and then undershoot the requested loudness after the recovery scaling.

## Why The Issue Escaped Detection

The remix flow still completed and wrote valid audio files, so the issue surfaced as a quality warning rather than a hard failure. Earlier work focused on getting end-to-end remix generation running, not on the final mastering headroom behavior.

## Proposed Prevention

- Keep loudness normalization and peak protection in one helper.
- Apply a limiter before final ceiling trim when headroom is exceeded.
- Verify both peak ceiling and final LUFS after mastering as part of remix smoke checks.
