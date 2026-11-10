export function crossfadeGain(t: number, durationSec: number): { gainIn: number; gainOut: number } {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { gainIn: 1, gainOut: 0 };
  }

  let normalizedT = t;
  if (Number.isNaN(normalizedT)) {
    normalizedT = 0;
  }

  const p = Math.min(1, Math.max(0, normalizedT / durationSec));
  return { gainIn: Math.sin(p * Math.PI / 2), gainOut: Math.cos(p * Math.PI / 2) };
}