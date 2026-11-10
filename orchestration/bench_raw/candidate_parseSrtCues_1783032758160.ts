export function parseSrtCues(srt: string): { start: number; end: number; text: string }[] {
  if (!srt || srt.trim() === "") return [];

  const blocks = srt.split(/\n\s*\n/);
  const result: { start: number; end: number; text: string }[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    const timeLineIndex = lines.findIndex(
      (line) => line.includes("-->") && /^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}$/.test(line)
    );

    if (timeLineIndex === -1) continue;

    const timeParts = lines[timeLineIndex].split("-->").map((t) => t.trim());
    if (timeParts.length !== 2) continue;

    const parseTime = (ts: string): number | null => {
      const match = ts.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
      if (!match) return null;
      return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
    };

    const start = parseTime(timeParts[0]);
    const end = parseTime(timeParts[1]);

    if (start === null || end === null) continue;

    const textLines = lines.slice(timeLineIndex + 1);
    result.push({ start, end, text: textLines.join("\n") });
  }

  return result;
}