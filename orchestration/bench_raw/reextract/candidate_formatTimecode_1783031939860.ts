export function formatTimecode(sec: number): string {
    // Handle negative or non-finite input
    if (!Number.isFinite(sec) || sec < 0) {
        return "00:00.000";
    }

    // Round to nearest millisecond (carry over if needed).
    const ms = Math.round(sec * 1000);

    // Split into minutes, seconds, milliseconds.
    const totalMinutes = Math.floor(ms / 60000);
    const remainingMsAfterMinutes = ms % 60000;
    const seconds = Math.floor(remainingMsAfterMinutes / 1000);
    const millis = remainingMsAfterMinutes % 1000;

    // Format with zero-padding.
    return `${String(totalMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}