code block. No prose. Pure function, no imports.

Implement EXACTLY this signature in frontend/src/utils/formatTimecode.ts:
export function formatTimecode(sec: number): string

Rules:
- output format "MM:SS.mmm" zero-padded (minutes at least 2 digits).
- round to the nearest millisecond FIRST (total milliseconds), then split into minutes/seconds/ms so rounding can carry over (e.g. 59.9996 -> "01:00.000").
- negative or non-finite input -> "00:00.000".

Acceptance: formatTimecode(62.5) -> "01:02.500". formatTimecode(0) -> "00:00.000". formatTimecode(-3) -> "00:00.000". formatTimecode(659.999) -> "10:59.999".
Output ONLY the