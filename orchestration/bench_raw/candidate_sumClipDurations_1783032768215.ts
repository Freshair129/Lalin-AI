export function sumClipDurations(clips: { start: number; end: number }[]): number {
    let total = 0;

    for (const clip of clips) {
        const { start, end } = clip;

        // Skip if either value is not a finite number (NaN or Infinity)
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
            continue;
        }

        // Only add duration when end > start
        if (end > start) {
            total += end - start;
        }
    }

    return Math.round(total * 1000) / 1000;
}