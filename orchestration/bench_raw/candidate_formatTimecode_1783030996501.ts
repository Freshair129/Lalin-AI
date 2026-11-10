export function formatTimecode(sec: number): string {
      if (!Number.isFinite(sec) || sec < 0) {
        return "00:00.000";
      }

      const totalMs = Math.round(sec * 1000);
      const minutes = Math.floor(totalMs / 60000);
      const seconds = Math.floor((totalMs % 60000) / 1000);
      const ms = totalMs % 1000;

      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');
      const mmm = String(ms).padStart(3, '0');

      return `${mm}:${ss}.${mmm}`;
    }