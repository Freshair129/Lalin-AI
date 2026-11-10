export function crossfadeGain(t: number, durationSec: number): { gainIn: number; gainOut: number } {
    if (Number.isNaN(t)) t = 0;
    if (!Number.isFinite(durationSec) || durationSec <= 0) return { gainIn: 1, gainOut: 0 };

    const p = Math.max(0, Math.min(1, t / durationSec));
    return { gainIn: Math.sin(p * Math.PI / 2), gainOut: Math.cos(p * Math.PI / 2) };
}