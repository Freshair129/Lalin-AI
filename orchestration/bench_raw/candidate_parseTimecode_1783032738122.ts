export function parseTimecode(s: string): number {
  const regex = /^(\d{2}):(\d{2})\.(\d{3})$/;
  const match = s.match(regex);
  
  if (!match) return -1;
  
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const milliseconds = parseInt(match[3], 10);
  
  if (seconds > 59 || minutes > 99) return -1;
  
  return minutes * 60 + seconds + milliseconds / 1000;
}