export function parseTimecode(s: string): number {
  if (!/^\d{2}:\d{2}\.\d{3}$/.test(s)) return -1;

  const [minStr, secMilli] = s.split(':');
  const [secStr, mmmStr] = secMilli.split('.');

  return Number(minStr) * 60 + Number(secStr) + Number(mmmStr) / 1000;
}