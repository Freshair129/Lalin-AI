export function crossfadeGain(t: number, durationSec: number): { gainIn: number; gainOut: number } {
      if (durationSec <= 0 || !Number.isFinite(durationSec)) {
        return { gainIn: 1, gainOut: 0 };
      }

      let time = isNaN(t) ? 0 : t;
      const p = Math.max(0, Math.min(1, time / durationSec));

      const gainIn = Math.sin((p * Math.PI) / 2);
      const gainOut = Math.cos((p * Math.PI) / 2);

      return { gainIn, gainOut };
    }