export function parseSrtCues(srt: string): { start: number; end: number; text: string }[] {
      if (!srt || !srt.trim()) return [];

      const blocks = srt.split(/\r?\n\s*\r?\n/);
      const results: { start: number; end: number; text: string }[] = [];

      for (const block of blocks) {
        const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");
        if (lines.length < 2) continue;

        // Find the time line. It's usually the second non-empty line, but let's be robust.
        let timeLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(" --> ")) {
            timeLineIndex = i;
            break;
          }
        }

        if (timeLineIndex === -1) continue;

        const timeParts = lines[timeLineIndex].split(" --> ");
        if (timeParts.length !== 2) continue;

        const parseTime = (timeStr: string): number => {
          const [h, m, s_ms] = timeStr.split(":");
          const [s, ms] = s_ms.split(",");
          return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(ms, 10) / 1000;
        };

        try {
          const start = parseTime(timeParts[0]);
          const end = parseTime(timeParts[1]);
          // Text is everything after the time line
          const text = lines.slice(timeLineIndex + 1).join("\n");

          if (!isNaN(start) && !isNaN(end)) {
            results.push({ start, end, text });
          }
        } catch (e) {
          // Skip malformed time
        }
      }

      return results;
    }