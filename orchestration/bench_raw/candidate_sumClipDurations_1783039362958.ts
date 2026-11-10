export function sumClipDurations(clips: { start: number; end: number }[]): number {
  let total = 0;
  for (const clip of clips) {
    if (!Number.isFinite(clip.start) || !Number.isFinite(clip.end)) continue;
    if (clip.end <= clip.start) continue;
    total += clip.end - clip.start;
  }
  return Math.round(total * 1000) / 1000;
}