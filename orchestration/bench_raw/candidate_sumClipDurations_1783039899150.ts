export function sumClipDurations(clips): number {
  const total = clips.reduce((acc, clip) => {
    if (typeof clip !== 'object' || clip === null) return acc;
    const { start, end } = clip;
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? acc + end - start : acc;
  }, 0);
  return Number(total.toFixed(3));
}