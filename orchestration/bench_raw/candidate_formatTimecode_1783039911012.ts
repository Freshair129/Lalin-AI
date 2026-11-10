export function formatTimecode(sec: number): string {
  const ms = Math.round(sec * 1000);
  if (!Number.isFinite(ms) || ms < 0) return "00:00.000";

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(3, "0")}.${milliseconds
    .toString()
    .padStart(3, "0")}`;
}