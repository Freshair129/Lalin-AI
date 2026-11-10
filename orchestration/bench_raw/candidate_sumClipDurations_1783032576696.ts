export function sumClipDurations(clips: { start: number; end: number }[]): number {
  let sum = 0;
  for (const clip of clips) {
    if (Number.isFinite(clip.start) && Number.isFinite(clip.end) && clip.end > clip.start) {
      sum += clip.end - clip.start;
    }
  }
  return Math.round(sum * 1000) / 1000;
}