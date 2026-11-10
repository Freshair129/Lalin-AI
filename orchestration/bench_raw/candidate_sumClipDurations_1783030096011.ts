export function sumClipDurations(clips: { start: number; end: number }[]): number {
  let totalSum = 0;
  for (const clip of clips) {
    if (Number.isFinite(clip.start) && Number.isFinite(clip.end)) {
      if (clip.end > clip.start) {
        totalSum += clip.end - clip.start;
      }
    }
  }
  return Math.round(totalSum * 1000) / 1000;
}