export function parseSrtCues(srt: string): { start: number; end: number; text: string }[] {
      if (!srt || !srt.trim()) return [];

      const results: { start: number; end: number; text: string }[] = [];
      // Split by one or more blank lines (handles \n\n and \r\n\r\n)
      const blocks = srt.split(/\r?\n\s*\r?\n/);

      for (const block of blocks) {
        const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");
        if (lines.length < 2) continue;

        // Find the time line: "00:00:01,000 --> 00:00:02,500"
        let timeLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes("-->")) {
            timeLineIndex = i;
            break;
          }
        }

        if (timeLineIndex === -1) continue;

        const timeParts = lines[timeLineIndex].split(" --> ");
        if (timeParts.length !== 2) continue;

        const parseTime = (t: string): number => {
          const match = t.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
          if (!match) return NaN;
          const [_, h, m, s, ms] = match.map(Number);
          return h * 3600 + m * 60 + s + ms / 1000;
        };

        const start = parseTime(timeParts[0]);
        const end = parseTime(timeParts[1]);

        if (isNaN(start) || isNaN(end)) continue;

        // Text lines are everything after the time line
        const textLines = lines.slice(timeLineIndex + 1);
        const text = textLines.join("\n");

        if (text) {
          results.push({ start, end, text });
        }
      }

      return results;
    }