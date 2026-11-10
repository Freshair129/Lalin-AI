code block. No prose. Pure function, no imports.

Implement EXACTLY this signature in frontend/src/timeline/sumClipDurations.ts:
export function sumClipDurations(clips: { start: number; end: number }[]): number

Rules:
- sum (end - start) over clips where end > start.
- ignore invalid clips: end <= start, or start/end not finite numbers.
- round the final sum to 3 decimals.
- empty array -> 0.

Acceptance: sumClipDurations([{start:0,end:1.5},{start:2,end:2}]) -> 1.5. sumClipDurations([]) -> 0. sumClipDurations([{start:1,end:0.5},{start:0,end:0.25}]) -> 0.25.
Output ONLY the