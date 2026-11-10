export function formatTimecode(sec: number): string {
  if (sec < 0 || !Number.isFinite(sec)) {
    return "00:00.000";
  }
  const ms = Math.round(sec * 1000);
  const minutes = Math.floor(ms / 60000);
  const remainingMs = ms % 60000;
  const seconds = Math.floor(remainingMs / 1000);
  const milliseconds = remainingMs % 1000;
  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0") +
    "." +
    String(milliseconds).padStart(3, "0")
  );
}