export function parseSrtCues(srt): { start: number; end: number; text: string }[] {
  if (!srt || !srt.trim()) return [];

  const blocks = srt.split(/\r?\n\s*\r?\n+/);
  return blocks
    .map((block) => block.trim().split(/\r?\n/))
    .filter((lines) => lines.length >= 3 && /^\d+$/.test(lines[0])) // valid index line, at least time + one text line
    .map((lines) => {
      const timeLine = lines[1];
      const match = timeLine.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/);

      if (!match) return null;

      const toSeconds = (h: string, m: string, s: string, ms: string) =>
        Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;

      return {
        start: toSeconds(match[1], match[2], match[3], match[4]),
        end: toSeconds(match[6], match[7], match[8], match[9]),
        text: lines.slice(2).map((l) => l.trim()).filter((l) => l !== "").join("\n"),
      };
    })
    .filter((b): b is never null => b !== null);
}