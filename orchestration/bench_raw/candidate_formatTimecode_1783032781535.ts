export function formatTimecode(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) {
    return "00:00.000";
  }

  // Round to nearest millisecond (carry over allowed, e.g., 59.9996 -> 1000 ms)
  const roundedMs = Math.round(sec * 1000);

  // Extract components
  const totalMinutes = Math.floor(roundedMs / 60000);
  const remainingMsAfterMinutes = roundedMs % 60000;
  const seconds = Math.floor(remainingMsAfterMinutes / 1000);
  const milliseconds = remainingMsAfterMinutes % 1000;

  // Zero-pad each component
  return `${String(totalMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}