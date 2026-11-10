export function crossfadeGain(t: number, durationSec: number): { gainIn: number; gainOut: number } {
  // Handle NaN t by treating as 0 (start of fade)
  const safeT = Number.isNaN(t) ? 0 : t;
  
  // Check for invalid duration - return no crossfade state
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { gainIn: 1, gainOut: 0 };
  }
  
  // Calculate normalized position p = t / durationSec
  const p = safeT / durationSec;
  
  // Clamp p to [0, 1] range
  const clampedP = Math.min(1, Math.max(0, p));
  
  // Equal-power crossfade: gainIn follows sine curve, gainOut follows cosine curve
  const gainIn = Math.sin(clampedP * Math.PI / 2);
  const gainOut = Math.cos(clampedP * Math.PI / 2);
  
  return { gainIn, gainOut };
}