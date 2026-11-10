export function formatTimecode(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return "00:00.000";
    const ms = Math.round(sec * 1000);
    const minutes = Math.floor(ms / 60);
    const seconds = Math.floor((ms % 60));
    const millis = ms - (minutes * 60 + seconds);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}