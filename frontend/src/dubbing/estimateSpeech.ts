// @req FR-03 — ประมาณความยาวเสียงพูด ใช้เกลาบทให้พอดี slot (FR-03.6)
// estimateSpeech.ts — ประมาณความยาวเสียงพูดจากข้อความ (heuristic) ใช้เกลาบทให้พอดี slot
// สร้างโดย local model (Ollama qwen3:14.8B, warm=5.6s) ผ่าน anti-error-loop + Verify Gate ✅
// (acceptance: "hello world"/en=1.014, ""/en=0, "สวัสดีครับ"/th=2.3)

export function estimateSpeechDurationSec(text: string, lang: "th" | "en"): number {
  const trimmedText = text.trim();
  if (trimmedText === "") return 0;
  const nonSpaceChars = trimmedText.replace(/\s/g, "").length;
  const charPerSec = lang === "th" ? 5.0 : 14.0;
  const duration = nonSpaceChars / charPerSec + 0.3;
  return Math.round(duration * 1000) / 1000;
}
