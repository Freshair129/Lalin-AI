export function parseSrtCues(srt: string): { start: number; end: number; text: string }[] {
  if (!srt || srt.trim() === '') return [];

  const blocks = splitIntoBlocks(srt);
  return blocks.map(block => parseBlock(block)).filter(Boolean) as any[];
}

function splitIntoBlocks(input: string): string[] {
  // Normalize line endings and split by blank lines
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
}

function parseBlock(block: string): { start: number; end: number; text: string } | null {
  const lines = block.split('\n').map(l => l.trim());
  if (lines.length < 2) return null;

  // Find the time line (contains -->)
  const timeLineIndex = lines.findIndex(line => line.includes('-->'));
  if (timeLineIndex === -1 || timeLineIndex !== 1) return null;

  const [startStr, endStr] = lines[timeLineIndex].split('-->').map(s => s.trim());
  const start = parseTime(startStr);
  const end = parseTime(endStr);

  if (isNaN(start) || isNaN(end)) return null;

  // Text is everything after the time line, joined with \n
  const textLines = lines.slice(timeLineIndex + 1).filter(l => l !== '');
  const text = textLines.length > 0 ? textLines.join('\n') : '';

  return { start, end, text };
}

function parseTime(timeStr: string): number {
  // Format: HH:MM:SS,mmm or HH:MM:SS.mmm
  const match = timeStr.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.|,)(\d{3})$/);
  if (!match) return NaN;

  const [, hh, mm, ss, ms] = match;
  return (parseInt(hh, 10) * 3600 + parseInt(mm, 10) * 60 + parseInt(ss, 10)) + parseFloat('0.' + ms);
}