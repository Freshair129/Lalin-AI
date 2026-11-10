block—no surrounding prose, no imports, just the pure function definition.

First, let me restate the requirements clearly:

- Function signature: `export function crossfadeGain(t: number, durationSec: number): { gainIn: number; gainOut: number }`
- Compute a normalized time fraction `p = t / durationSec`. Clamp `p` to `[0, 1]`.
- Then compute `gainIn = sin(p * π / 2)` and `gainOut = cos(p * π / 2)`. This yields an equal-power crossfade because the sum of squares equals 1.
- Edge cases:
  - If `durationSec <= 0` or not finite (i.e., NaN, Infinity), return `{ gainIn: 1, gainOut: 0 }`.
  - If `t` is NaN, treat it as `t = 0`. This means we should first replace any NaN in `t` with 0 before computing `p`.
- Numeric tolerance for acceptance: results must be within 1e-6 of the expected values. That suggests I don't need to round or truncate; just compute using standard double precision and let JavaScript's math handle it. The test cases given are:
  - `crossfadeGain(0,2)` → `{gainIn:0,gainOut:1}`
  - `crossfadeGain(1,2)` → `{gainIn:0.7071068,gainOut:0.7071068}` (midpoint)
  - `crossfadeGain(2,2)` → `{gainIn:1,gainOut:0}`
  - `crossfadeGain(5,2)` → `{gainIn:1,gainOut:0}` (since t > durationSec, p clamped to 1).

Now I need to decide on the implementation details. Since this is a pure function with no side effects, I can just compute directly using Math.sin and Math.cos. No imports needed beyond the built-in `Math` object. The file will be minimal: just the export statement and the function body.

Potential pitfalls:
- Division by zero when `durationSec` is 0 or NaN. That's covered by the early return for non-finite duration.
- NaN in `t`. I'll replace it with 0 before computing `p`. This matches the spec "if t is NaN -> treat as t = 0".
- Clamping `p` to `[0,1]`. Since `durationSec` can be negative or zero, we must handle that. The simplest way: compute `p = t / durationSec`, then clamp using `Math.max(0, Math.min(1, p))`. However, if `durationSec` is 0 (or NaN), the division will produce Infinity or NaN; but those cases are already caught by the early return for non-finite duration. So after that guard, we can safely compute `p = t / durationSec`, then clamp.
- Using `Math.sin(p * Math.PI / 2)` and `Math.cos(p * Math.PI / 2)`. That's straightforward.

Now I'll write the code: