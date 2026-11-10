code block. No prose, no explanation.
    *   Constraints: Pure function, no imports, no external deps, surgical and minimal.

    *   File path: `frontend/src/timeline/sumClipDurations.ts`
    *   Signature: `export function sumClipDurations(clips: { start: number; end: number }[]): number`
    *   Logic:
        1.  Sum `end - start` for each clip.
        2.  Condition 1: Only include if `end > start`.
        3.  Condition 2: Ignore invalid clips (where `start` or `end` are not finite numbers).
        4.  Rounding: Round the final sum to 3 decimals.
        5.  Edge case: Empty array returns 0.

    *   Input: `[{start:0, end:1.5}, {start:2, end:2}]` -> (1.5 - 0) = 1.5. Sum = 1.5. Round(1.5) = 1.5.
    *   Input: `[]` -> 0.
    *   Input: `[{start:1, end:0.5}, {start:0, end:0.25}]` -> (0.5 - 1 is <= 0, ignore), (0.25 - 0 = 0.25). Sum = 0.25. Round(0.25) = 0.25.