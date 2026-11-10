code block. No prose. Pure function, no imports.

Implement EXACTLY this signature in frontend/src/audio/crossfadeGain.ts:
export function crossfadeGain(t: number, durationSec: number): { gainIn: number; gainOut: number }

Rules:
- equal-power crossfade: p = t/durationSec clamped to [0,1]; gainIn = sin(p*PI/2), gainOut = cos(p*PI/2).
- if durationSec <= 0 or not finite -> { gainIn: 1, gainOut: 0 }.
- if t is NaN -> treat as t = 0.
- numeric tolerance for acceptance: within 1e-6.

Acceptance: crossfadeGain(0,2) -> {gainIn:0,gainOut:1}. crossfadeGain(1,2) -> {gainIn:0.7071068,gainOut:0.7071068} (midpoint, within 1e-6). crossfadeGain(2,2) -> {gainIn:1,gainOut:0}. crossfadeGain(5,2) -> {gainIn:1,gainOut:0}.
Output ONLY the