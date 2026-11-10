export function parseSrtCues(srt: string): { start: number; end: number; text: string }[] {
  if (!srt || srt.trim() === "") return [];

  const lines = srt.split(/\r?\n/).map(l => l.trim());
  const result: { start: number; end: number; text: string }[] = [];
  let blockLines: string[] = [];

  for (const line of lines) {
    if (!line) {
      if (blockLines.length > 0) processBlock(blockLines, result);
      blockLines = [];
    } else {
      blockLines.push(line);
    }
  }

  if (blockLines.length > 0) processBlock(blockLines, result);

  return result;
}

function processBlock(lines: string[], result: { start: number; end: number; text: string }[]) {
  const timeLineIdx = lines.findIndex(
    l => /^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.test(l)
  );

  if (timeLineIdx === -1) return;

  const separator = /\s*-->\s*/;
  const parts = lines[timeLineIdx].split(separator);
  const startSec = parseTime(parts[0]);
  const endSec = parseTime(parts[1]);

  result.push({
    start: startSec,
    end: endSec,
    text: lines.slice(timeLineIdx + 1).join("\n")
  });
}

function parseTime(t: string): number {
  if (!t) return 0;
  const [hms, ms] = t.split(",");
  if (ms == null) return 0;
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s + Number(ms) / 1000;
}