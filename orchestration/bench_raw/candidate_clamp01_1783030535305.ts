code block. No prose, no explanation.
    *   Constraints: Pure function, no imports, no external deps, surgical and minimal.
    *   File path: `frontend/src/audio/clamp01.ts`.
    *   Signature: `export function clamp01(x: number): number`.
    *   Logic: Clamp $x$ to $[0, 1]$. If $x$ is `NaN`, return 0.

    *   Input: `-1` -> Output: `0`
    *   Input: `0.5` -> Output: `0.5`
    *   Input: `2` -> Output: `1`
    *   Input: `NaN` -> Output: `0`