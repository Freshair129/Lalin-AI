export function formatTimecode(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) {
        return "00:00.000";
    }
    const ms = Math.round(sec * 1000);
    const minutes = Math.floor(ms / 60000);
    let remainder = ms % 60000;
    const seconds = Math.floor(remainder / 1000);
    remainder %= 1000;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${remainder.toString().padStart(3, "0")}`;
}