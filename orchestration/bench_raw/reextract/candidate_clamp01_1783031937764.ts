export function clamp01(x: number): number {
    if (isNaN(x)) return 0;
    const clamped = Math.max(0, Math.min(x, 1));
    return clamped;
}