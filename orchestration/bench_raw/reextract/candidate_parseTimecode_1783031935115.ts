export function parseTimecode(s: string): number {
  const regex = /^\d{2}:\d{2}\.\d{3}$/;
  if (!regex.test(s)) return -1;
  const [_, mm, ss, ms] = s.split(/[:.]/);
  const minutes = parseInt(mm, 10);
  const seconds = parseInt(ss, 10);
  const milliseconds = parseInt(ms, 10) / 1000;
  if (seconds > 59) return -1;
  return minutes * 60 + seconds + milliseconds;
}