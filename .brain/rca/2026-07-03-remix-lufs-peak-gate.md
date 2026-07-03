## Symptom

`backend/smoke_remix.py` completed successfully, but the generated remix missed
the requested mastering target. The smoke payload reported `target_lufs=-14.0`
and `result.lufs=-11.5`.

## Evidence

- `backend/smoke_remix.py` exited 0 after writing
  `backend/data/outputs/remix_56688ef12391.wav`.
- A direct measurement of that file returned `-11.50 LUFS`.
- The same direct measurement returned a sample peak of `1.0`, or `0.0 dBFS`,
  which exceeds the intended `-1.0 dBFS` ceiling.
- `_master_to_target()` corrected loudness before limiting, then measured after
  limiting, but did not correct post-limiter loudness drift.
- `_master_to_target()` used a final `np.clip(..., -1.0, 1.0)` safety clip
  instead of clipping/scaling to the configured ceiling.

## Root Cause

The remix mastering helper did not enforce its final acceptance gates after the
limiter stage. The limiter/fallback path could change integrated loudness, and
the final safety clip protected only full-scale clipping rather than the
configured `-1.0 dBFS` ceiling.

## Why The Issue Escaped Detection

The smoke script only checked that a file was written and printed the pipeline
metadata. It did not independently measure LUFS or peak level, so a completed
job could still be outside the release-quality audio gate.

## Proposed Prevention

- Correct loudness once after limiting, then enforce the configured peak
  ceiling.
- Make `backend/smoke_remix.py` measure the written file independently.
- Fail the smoke script when LUFS tolerance or peak ceiling is violated.
