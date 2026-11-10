export function crossfadeGain(t: number, durationSec: number): { gainIn: number; gainOut: number } {
  if (!isFinite(durationSec) || durationSec <= 0) {
    return { gainIn: 1, gainOut: 0 };
  }

  let effectiveT = t;
  if (Number.isNaN(effectiveT)) {
    effectiveT = 0;
  }

  const p = effectiveT / durationSec;
  const clampedP = Math.max(0, Math.min(1, p));

  return {
    gainIn: Math.sin(clampedP * Math.PI / 2),
    gainOut: Math.cos(clampedP * Math.PI / 2)
  };
}