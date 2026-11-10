export function parseSrtCues(srt: string): { start: number; end: number; text: string }[] {
  const normalized = srt.replace(/\r/g, '');
  const lines = normalized.split('\n');
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  for (const line of lines) {
    if (line