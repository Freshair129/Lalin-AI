export function crossfadeGain(t: number, durationSec: number): { gainIn: number; gainOut: number } {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { gainIn: 1, gainOut: 0 };
  }

  let clampedT = Number.isNaN(t) ? 0 : Math.max(0, Math.min(t, durationSec));
  const p = clampedT / durationSec;

  return {
    gainIn: Math.sin((p * Math.PI) / 2),
    gainOut: Math.cos((p * Math.PI) / 2),
  };
}