export function sumClipDurations(clips: { start: number; end: number }[]): number {
  let total = 0;
  for (const clip of clips) {
    const { start, end } = clip;
    if (Number.isFinite(start) && Number.isFinite(end)) {
      if (end > start) {
        total += end - start;
      }
    }
  }
  return Math.round(total * 1000) / 1000;
}