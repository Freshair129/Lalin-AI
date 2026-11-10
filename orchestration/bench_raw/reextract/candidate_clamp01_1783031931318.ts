export function clamp01(x: number): number {
  if (isNaN(x)) return 0;
  return Math.min(Math.max(x, 0), 1);
}