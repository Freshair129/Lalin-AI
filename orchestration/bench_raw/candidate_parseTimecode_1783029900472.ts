export function parseTimecode(s: string): number {
  if (!/^\d{2}:\d{2}\.\d{3}$/.test(s)) {
    return -1;
  }
  const [minutesStr, secondsMillis] = s.split(':');
  const [secondsStr, millisStr] = secondsMillis.split('.');
  const minutes = parseInt(minutesStr, 10);
  const seconds = parseInt(secondsStr, 10);
  const millis = parseInt(millisStr, 10);
  return minutes * 60 + seconds + millis / 1000;
}