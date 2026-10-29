# Expired beat-warp preview recovery

The user authorized this follow-up to PR #39: hide unusable preview controls, explain how to create a fresh preview, verify in native desktop, and merge.

The API already returns an absolute `audio_preview.expires_at` and rejects expired previews. The desktop currently ignores this deadline and displays raw HTTP errors. Keep the API contract and 30-minute TTL unchanged.

Use the deadline to retire the preview, including on window focus after sleep. Expiry is permanent for that preview ID/revision. Hide its audio player, A/B selectors, marker editor/revision action, and preview render actions. Show an accessible Thai notice with a "สร้าง preview ใหม่" button that invokes the existing analysis flow using current inputs. Preserve the recipe, timeline and saved output. An ordinary Run is still available because it does not consume the expired preview.

Handle server `preview_expired` from render/manual revision requests and background jobs with the same recovery state. Media load failure must also remove unusable controls, with a distinct unavailable message rather than claiming a network failure proves expiry. Do not let a late error for an older preview retire a replacement. Recovery must not reuse the expired ID or base revision, and failed recovery must remain retryable.

Approaches considered: server-error-only handling misses idle expiration; a new polling endpoint adds unnecessary API work. Chosen implementation is a small frontend lifetime hook with a deadline timer, focus/visibility recheck, action-time guard, and server/media failure handling. This is an implementation choice within the requested scope.

Validation: focused deadline/error/race tests, actual RemixPanel control/recovery tests, full desktop suite and build, isolated Tauri native UAT for deadline and server rejection plus regeneration. Native evidence must identify simulated shortened deadlines; it does not imply installed-package or human-listening acceptance.
