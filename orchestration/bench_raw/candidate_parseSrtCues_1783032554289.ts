export function parseSrtCues(srt: string): { start: number; end: number; text: string }[] {
   const normalized = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
   if (!normalized.trim()) return [];
   const blocks = normalized.split(/\n\s*\n+/);
   const cues: { start: number; end: number; text: string }[] = [];
   for (const block of blocks) {
      const lines = block.split('\n').map(l => l.trim());
      if (lines.length < 3) continue;
      const timingLine = lines[1];
      if (!timingLine.includes(' --> ')) continue;
      const parts = timingLine.split(' --> ');
      if (parts.length !== 2) continue;
      const startStr = parts[0].trim();
      const endStr = parts[1].trim();
      if (!/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.test(startStr)) continue;
      if (!/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.test(endStr)) continue;
      const [hStr, mStr, sMs] = startStr.split(':');
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      const [s, ms] = sMs.split(',').map(Number);
      const start = h * 3600 + m * 60 + s + ms / 1000;
      const [ehStr, emStr, esMs] = endStr.split(':');
      const eh = parseInt(ehStr, 10);
      const em = parseInt(emStr, 10);
      const [es, ems] = esMs.split(',').map(Number);
      const end = eh * 3600 + em * 60 + es + ems / 1000;
      const textLines = lines.slice(2).filter(l => l !== '');
      cues.push({ start, end, text: textLines.join('\n') });
   }
   return cues;
}