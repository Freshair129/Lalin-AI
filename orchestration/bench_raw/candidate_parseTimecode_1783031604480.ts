code block. No prose. Pure function, no imports.

Implement EXACTLY this signature in frontend/src/utils/parseTimecode.ts:
export function parseTimecode(s: string): number

Rules:
- input format is exactly "MM:SS.mmm" (2-digit minutes, 2-digit seconds, 3-digit milliseconds).
- seconds part must be 00-59; minutes 00-99.
- return total seconds as a number.
- any string not matching the format exactly -> return -1.

Acceptance: parseTimecode("01:02.500") -> 62.5. parseTimecode("00:00.000") -> 0. parseTimecode("abc") -> -1. parseTimecode("1:02.500") -> -1 (minutes must be 2 digits).
Output ONLY the