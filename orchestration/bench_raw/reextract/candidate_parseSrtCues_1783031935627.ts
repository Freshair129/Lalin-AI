export function parseSrtCues(srt: string): { start: number; end: number; text: string }[] {
  if (!srt || srt.trim() === "") return [];
  
  const blocks = srt.split(/\r?\n\r?\n+/).filter(b => b.trim());
  const result: { start: number; end: number; text: string }[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map(l => l.trim()).filter(l => l !== "");
    if (lines.length < 2) continue;

    const timeLine = lines[1];
    const match = timeLine.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
    if (!match) continue;

    const start = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10) + parseInt(match[4], 10) / 1000;
    const end = parseInt(match[5], 10) * 3600 + parseInt(match[6], 10) * 60 + parseInt(match[7], 10) + parseInt(match[8], 10) / 1000;

    result.push({ start, end, text: lines.slice(2).join("\n") });
  }

  return result;
}