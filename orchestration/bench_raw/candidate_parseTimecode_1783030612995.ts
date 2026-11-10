export function parseTimecode(s: string): number {
      const regex = /^([0-9]{2}):([0-9]{2})\.([0-9]{3})$/;
      const match = s.match(regex);

      if (!match) return -1;

      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = parseInt(match[3], 10);

      // Seconds must be 00-59. Minutes are already limited to 00-99 by regex [0-9]{2}.
      if (seconds >= 60) return -1;

      return minutes * 60 + seconds + milliseconds / 1000;
    }