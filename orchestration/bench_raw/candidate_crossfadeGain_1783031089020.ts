block. No prose, no imports, no external deps.
    *   Signature: `export function crossfadeGain(t: number, durationSec: number): { gainIn: number; gainOut: number }`.

    *   Equal-power crossfade formula:
        *   $p = \text{clamp}(t / \text{durationSec}, 0, 1)$
        *   $\text{gainIn} = \sin(p \cdot \pi / 2)$
        *   $\text{gainOut} = \cos(p \cdot \pi / 2)$
    *   Edge cases:
        *   `durationSec <= 0` or not finite $\rightarrow$ `{ gainIn: 1, gainOut: 0 }`.
        *   `t` is `NaN` $\rightarrow$ treat as $t = 0$.
    *   Tolerance: $1e-6$.

    *   Input: `t`, `durationSec`.
    *   Handle `t === NaN`: `if (isNaN(t)) t = 0;`
    *   Handle `durationSec <= 0` or not finite: `if (durationSec <= 0 || !Number.isFinite(durationSec)) return { gainIn: 1, gainOut: 0 };`
    *   Calculate $p$: `const p = Math.max(0, Math.min(1, t / durationSec));`
    *   Calculate gains:
        *   $\text{gainIn} = \sin(p \cdot \frac{\pi}{2})$
        *   $\text{gainOut} = \cos(p \cdot \frac{\pi}{2})$
    *   Return object.