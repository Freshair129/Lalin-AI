import { describe, expect, it } from "vitest";
import { applyIntent, libraryInsights, parseIntent, suggestPrompts } from "./intelligence";
import type { LocalTrack } from "./native";

const track = (patch: Partial<LocalTrack>): LocalTrack => ({
  id: patch.title ?? "id",
  path: "C:/m/a.mp3",
  title: "untitled",
  artist: null,
  album: null,
  duration: 200,
  missing: false,
  ...patch,
});

const library = [
  track({ title: "Morning", artist: "Lalin", duration: 150 }),
  track({ title: "Night Drive", artist: "Lalin", duration: 420 }),
  track({ title: "Trailer", path: "C:/m/t.mp4", kind: "video", duration: 90 }),
  track({ title: "Gone", artist: "Lalin", duration: 100, missing: true }),
];

describe("Lalin Intelligence (on-device)", () => {
  it("parses Thai duration and kind constraints", () => {
    const intent = parseIntent("วิดีโอไม่เกิน 5 นาที");
    expect(intent.kind).toBe("video");
    expect(intent.maxSeconds).toBe(300);
    expect(intent.chips).toContainEqual({ key: "max", type: "max", minutes: 5 });
    expect(intent.terms).toEqual([]);
    expect(applyIntent(library, intent).map((t) => t.title)).toEqual(["Trailer"]);
  });

  it("matches artist phrases and skips missing files", () => {
    const intent = parseIntent("เปิดเพลงของ Lalin");
    expect(intent.terms).toEqual(["lalin"]);
    expect(applyIntent(library, intent).map((t) => t.title)).toEqual([
      "Morning",
      "Night Drive",
    ]);
  });

  it("understands short/long and English", () => {
    expect(applyIntent(library, parseIntent("เพลงสั้น")).map((t) => t.title)).toEqual([
      "Morning",
      "Trailer",
    ]);
    expect(
      applyIntent(library, parseIntent("songs over 5 minutes")).map((t) => t.title),
    ).toEqual(["Night Drive"]);
  });

  it("handles every suggested prompt in both languages", () => {
    for (const prompt of ["เพลงสั้น ไม่เกิน 3 นาที", "Short songs under 3 minutes"]) {
      const intent = parseIntent(prompt);
      expect(intent.maxSeconds).toBe(180);
      expect(intent.terms).toEqual([]);
    }
    expect(parseIntent("Videos under 10 minutes")).toMatchObject({ kind: "video", maxSeconds: 600, terms: [] });
    expect(parseIntent("Shuffle the whole library")).toMatchObject({ shuffle: true, terms: [] });
    expect(parseIntent("Play songs by Lalin").terms).toEqual(["lalin"]);
  });

  it("shuffles deterministically with injected random", () => {
    const intent = parseIntent("สุ่มทั้งคลัง");
    expect(intent.shuffle).toBe(true);
    expect(intent.terms).toEqual([]);
    expect(applyIntent(library, intent, () => 0)).toHaveLength(3);
  });

  it("builds suggestions and insights from the library", () => {
    expect(suggestPrompts(library)[0]).toEqual({ key: "artist", artist: "Lalin" });
    expect(libraryInsights(library)).toMatchObject({ total: 4, videos: 1, missing: 1 });
  });
});
