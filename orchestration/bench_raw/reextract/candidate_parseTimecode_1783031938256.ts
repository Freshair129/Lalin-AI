export function parseTimecode(s: string): number {
  const regex = /^(\d{2}):(\d{2})\.(\d{3})$/;
  const match = s.match(regex);
  
  if (!match) return -1;
  
  const [, minutes, seconds, milliseconds] = match;
  
  const m = parseInt(minutes, 10);
  const sec = parseInt(seconds, 10);
  const ms = parseInt(milliseconds, 10);
  
  if (m > 99 || sec > 59) return -1;
  
  return m * 60 + sec + ms / 1000;
}