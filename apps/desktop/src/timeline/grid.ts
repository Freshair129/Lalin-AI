// grid.ts — ตัวช่วยคำนวณจังหวะ metronome / beat grid
// สร้างโดย local model (Ollama qwen3:14.8B) ผ่าน anti-error-loop dispatch
// + Verify Gate (acceptance: metronomeTicks(120,4,2) = ticks 0/0.5/1/1.5, accent [T,F,F,F]) ✅
// หมายเหตุ: ใช้ beatIndex*beatDuration กันดริฟต์สะสมสำหรับ duration ยาว

export function metronomeTicks(
  bpm: number,
  beatsPerBar: number,
  durationSec: number,
): { t: number; accent: boolean }[] {
  if (bpm <= 0 || beatsPerBar <= 0 || durationSec <= 0) return [];
  const ticks: { t: number; accent: boolean }[] = [];
  const beatDuration = 60 / bpm;
  for (let beatIndex = 0; ; beatIndex++) {
    const t = beatIndex * beatDuration; // จุดต่อจุด — ไม่สะสม error
    if (t >= durationSec) break;
    ticks.push({ t, accent: beatIndex % beatsPerBar === 0 });
  }
  return ticks;
}
