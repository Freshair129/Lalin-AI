code block. No prose. Pure function, no imports.

    *   Input: `clips: { start: number; end: number }[]`
    *   Logic:
        1. Initialize `total = 0`.
        2. Iterate through each clip in the array.
        3. Check if `start` and `end` are finite numbers (`Number.isFinite`).
        4. Check if `end > start`.
        5. If valid, add `(end - start)` to `total`.
        6. After loop, round `total` to 3 decimal places using `Math.round(total * 1000) / 1000` or `.toFixed(3)` (but the return type is number, so math rounding is better). Actually, `Number(total.toFixed(3))` is safer for precision issues.
        7. Return result.

    *   Example 1: `[{start:0,end:1.5},{start:2,end:2}]` -> (1.5 - 0) = 1.5. Valid. Result 1.5.
    *   Example 2: `[]` -> 0.
    *   Example 3: `[{start:1,end:0.5},{start:0,end:0.25}]` -> (0.5 - 1) is invalid (end <= start). (0.25 - 0) = 0.25. Result 0.25.