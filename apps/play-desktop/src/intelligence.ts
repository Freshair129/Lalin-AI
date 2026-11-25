import type { LocalTrack } from "./native";

// Lalin Intelligence (on-device): ตีความคำขอภาษาไทย/อังกฤษด้วยกฎในเครื่อง
// ไม่ส่งข้อมูลออกนอกเครื่อง และไม่เรียก LLM/API ใด ๆ — เป็นจุดต่อสำหรับ
// provider AI ในอนาคตซึ่งต้องผ่าน CR ตาม R5 ก่อนเปิดใช้

// chip เก็บเป็นชนิด+ค่า ให้ UI แปลตามภาษาที่เลือก (ENG/TH)
export type IntentChip =
  | { key: string; type: "video" | "audio" | "shuffle" }
  | { key: string; type: "max" | "min"; minutes: number }
  | { key: string; type: "who" | "term"; value: string };

export interface SmartIntent {
  kind?: "audio" | "video";
  maxSeconds?: number;
  minSeconds?: number;
  terms: string[];
  shuffle: boolean;
  chips: IntentChip[];
}

const VIDEO = /(วิดีโอ|วีดีโอ|คลิป|หนัง|videos?|movies?|clips?)/i;
const AUDIO = /(เฉพาะเพลง|แค่เพลง|เสียงอย่างเดียว|audio only|songs? only|music only)/i;
const SHUFFLE = /(สุ่ม|shuffle|random)/i;
const SHORT = /(สั้น|short|quick)/i;
const LONG = /(ยาว|long)/i;
const MAX_MIN =
  /(?:ไม่เกิน|น้อยกว่า|ต่ำกว่า|under|less than|below|<)\s*(\d+(?:\.\d+)?)\s*(?:นาที|min(?:ute)?s?|m)?/i;
const MIN_MIN =
  /(?:มากกว่า|เกิน|อย่างน้อย|over|more than|at least|>)\s*(\d+(?:\.\d+)?)\s*(?:นาที|min(?:ute)?s?|m)?/i;
const ARTIST = /(?:ของ|โดย|ศิลปิน|by|from)\s+(.+)$/i;

// คำทั่วไปที่ไม่ใช่เงื่อนไขค้นหา
const STOP = new Set(
  [
    "เปิด", "เล่น", "ขอ", "หา", "อยากฟัง", "อยากดู", "ให้", "หน่อย", "ที่",
    "เพลง", "ทั้งหมด", "นาที", "ทั้งคลัง", "แบบ", "play", "find", "show", "me",
    "some", "all", "the", "a", "and", "songs", "song", "tracks", "music",
    "minutes", "min", "please", "whole", "entire", "library", "everything", "only",
  ].map((word) => word.toLowerCase()),
);

const THAI_FILLER =
  /(อยากฟัง|อยากดู|ทั้งหมด|ทั้งคลัง|หน่อย|เปิด|เล่น|เพลง|นาที|ขอ|หา|ให้|แบบ)/g;

function toMinutes(seconds: number) {
  const minutes = seconds / 60;
  return Number.isInteger(minutes) ? minutes : Number(minutes.toFixed(1));
}

export function parseIntent(raw: string): SmartIntent {
  let text = raw.trim();
  const intent: SmartIntent = { terms: [], shuffle: false, chips: [] };
  if (!text) return intent;

  if (VIDEO.test(text)) {
    intent.kind = "video";
    intent.chips.push({ key: "kind", type: "video" });
    text = text.replace(VIDEO, " ");
  } else if (AUDIO.test(text)) {
    intent.kind = "audio";
    intent.chips.push({ key: "kind", type: "audio" });
    text = text.replace(AUDIO, " ");
  }

  const max = text.match(MAX_MIN);
  if (max) {
    intent.maxSeconds = Number(max[1]) * 60;
    text = text.replace(MAX_MIN, " ");
  }
  const min = text.match(MIN_MIN);
  if (min) {
    intent.minSeconds = Number(min[1]) * 60;
    text = text.replace(MIN_MIN, " ");
  }
  // คำว่า สั้น/ยาว ถูกตัดออกเสมอ แต่ใช้เป็นค่าเริ่มต้นเฉพาะเมื่อไม่ได้ระบุนาที
  if (SHORT.test(text)) {
    if (!max) intent.maxSeconds = 180;
    text = text.replace(SHORT, " ");
  }
  if (LONG.test(text)) {
    if (!min) intent.minSeconds = 360;
    text = text.replace(LONG, " ");
  }
  if (intent.maxSeconds != null)
    intent.chips.push({ key: "max", type: "max", minutes: toMinutes(intent.maxSeconds) });
  if (intent.minSeconds != null)
    intent.chips.push({ key: "min", type: "min", minutes: toMinutes(intent.minSeconds) });

  if (SHUFFLE.test(text)) {
    intent.shuffle = true;
    intent.chips.push({ key: "shuffle", type: "shuffle" });
    text = text.replace(SHUFFLE, " ");
  }

  const artist = text.match(ARTIST);
  const phrase = artist ? artist[1].trim() : "";
  if (phrase) {
    intent.terms.push(phrase.toLowerCase());
    intent.chips.push({ key: "who", type: "who", value: phrase });
    text = text.replace(ARTIST, " ");
  }
  // ภาษาไทยไม่เว้นวรรคระหว่างคำ จึงตัดคำเติมแบบ substring ก่อนแยกคำค้น
  text = text.replace(THAI_FILLER, " ");
  for (const word of text.split(/\s+/)) {
    const term = word.trim().toLowerCase();
    if (term && !STOP.has(term) && !/^\d+$/.test(term)) {
      intent.terms.push(term);
      intent.chips.push({ key: `term:${term}`, type: "term", value: word.trim() });
    }
  }
  return intent;
}

export function trackKind(track: LocalTrack): "audio" | "video" {
  return track.kind ?? (/\.(mp4|webm)$/i.test(track.path) ? "video" : "audio");
}

// สุ่มแบบ deterministic ได้เมื่อส่ง random เข้ามา (ใช้ในเทสต์)
export function applyIntent(
  tracks: LocalTrack[],
  intent: SmartIntent,
  random: () => number = Math.random,
): LocalTrack[] {
  const result = tracks.filter((track) => {
    if (track.missing) return false;
    if (intent.kind && trackKind(track) !== intent.kind) return false;
    if (intent.maxSeconds != null) {
      if (track.duration == null || track.duration > intent.maxSeconds)
        return false;
    }
    if (intent.minSeconds != null) {
      if (track.duration == null || track.duration < intent.minSeconds)
        return false;
    }
    const haystack =
      `${track.title} ${track.artist ?? ""} ${track.album ?? ""}`.toLowerCase();
    return intent.terms.every((term) => haystack.includes(term));
  });
  if (intent.shuffle) {
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
  }
  return result;
}

export type PromptSuggestion =
  | { key: "artist"; artist: string }
  | { key: "video" | "short" | "shuffle" };

export function suggestPrompts(tracks: LocalTrack[]): PromptSuggestion[] {
  const counts = new Map<string, number>();
  for (const track of tracks)
    if (track.artist && !track.missing)
      counts.set(track.artist, (counts.get(track.artist) ?? 0) + 1);
  const topArtist = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const prompts: PromptSuggestion[] = [];
  if (topArtist) prompts.push({ key: "artist", artist: topArtist });
  if (tracks.some((track) => trackKind(track) === "video"))
    prompts.push({ key: "video" });
  prompts.push({ key: "short" }, { key: "shuffle" });
  return prompts;
}

export interface LibraryInsights {
  total: number;
  videos: number;
  seconds: number;
  missing: number;
  untagged: number;
}

export function libraryInsights(tracks: LocalTrack[]): LibraryInsights {
  return tracks.reduce<LibraryInsights>(
    (acc, track) => ({
      total: acc.total + 1,
      videos: acc.videos + (trackKind(track) === "video" ? 1 : 0),
      seconds: acc.seconds + (track.duration ?? 0),
      missing: acc.missing + (track.missing ? 1 : 0),
      untagged: acc.untagged + (!track.artist || !track.album ? 1 : 0),
    }),
    { total: 0, videos: 0, seconds: 0, missing: 0, untagged: 0 },
  );
}

export function splitDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  return { hours, minutes: Math.round((seconds % 3600) / 60) };
}
