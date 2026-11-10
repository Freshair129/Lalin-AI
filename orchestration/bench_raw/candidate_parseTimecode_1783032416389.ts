export function parseTimecode(s: string): number {
    if (!s) return -1;
    const [min, sec, ms] = s.split(/[:.]/).map(Number);
    if (sec > 59 || !/^\d{2}$/.test(min) || !/^\d{2}$/.test(sec) || !/^\d{3}$/.test(ms)) return -1;
    return min * 60 + sec + ms / 1000;
}