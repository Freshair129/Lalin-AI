code block. No prose. Pure function, no imports.

Implement EXACTLY this signature in frontend/src/audio/clamp01.ts:
export function clamp01(x: number): number

Rules:
- return x clamped to the range [0, 1].
- if x is NaN return 0.

Acceptance: clamp01(-1) -> 0. clamp01(0.5) -> 0.5. clamp01(2) -> 1. clamp01(NaN) -> 0.
Output ONLY the