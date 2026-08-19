import { describe, it, expect } from "vitest";
import { migrateSnapshot, SCHEMA_VERSION } from "./migrate";

describe("migrateSnapshot", () => {
  it("stamps an unversioned v1 snapshot as current", () => {
    const out = migrateSnapshot({ source: "a.mp3", project: { bpm: 90, tracks: [] } });
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("gives v1 tracks a default pan of 0", () => {
    const out = migrateSnapshot({
      project: { bpm: 120, tracks: [{ id: "vocal", clips: [], envelopes: [] }] },
    }) as { project: { tracks: { pan: number }[] } };
    expect(out.project.tracks[0].pan).toBe(0);
  });

  it("gives v1 projects a default timeSig of 4 and null loop", () => {
    const out = migrateSnapshot({ project: { bpm: 120, tracks: [] } }) as {
      project: { timeSig: number; loop: unknown };
    };
    expect(out.project.timeSig).toBe(4);
    expect(out.project.loop).toBeNull();
  });

  it("gives v1 snapshots default stemGains", () => {
    const out = migrateSnapshot({ project: { tracks: [] } }) as {
      stemGains: Record<string, number>;
    };
    expect(out.stemGains).toEqual({ vocals: 1, drums: 1, bass: 1, other: 1 });
  });

  it("preserves an existing pan rather than resetting it", () => {
    const out = migrateSnapshot({
      project: { tracks: [{ id: "a", pan: -0.7, clips: [], envelopes: [] }] },
    }) as { project: { tracks: { pan: number }[] } };
    expect(out.project.tracks[0].pan).toBe(-0.7);
  });

  it("leaves an already-current snapshot untouched", () => {
    const current = {
      schemaVersion: SCHEMA_VERSION,
      stemGains: { vocals: 0.5, drums: 1, bass: 1, other: 1 },
      project: {
        bpm: 90, timeSig: 3, loop: null,
        tracks: [{ id: "x", pan: -0.5, clips: [], envelopes: [] }],
      },
    };
    expect(migrateSnapshot(current)).toEqual(current);
  });

  it("returns an empty object unchanged except for the version stamp", () => {
    expect(migrateSnapshot({})).toEqual({ schemaVersion: SCHEMA_VERSION });
  });

  it("does not mutate its input", () => {
    const input = { project: { bpm: 100, tracks: [{ id: "a", clips: [], envelopes: [] }] } } as Record<string, unknown>;
    migrateSnapshot(input);
    expect(input.schemaVersion).toBeUndefined();
    expect((input.project as { tracks: Record<string, unknown>[] }).tracks[0].pan).toBeUndefined();
  });

  it("tolerates null and non-object input", () => {
    expect(migrateSnapshot(null).schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrateSnapshot(undefined).schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrateSnapshot("nonsense").schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe("v2 -> v3 asset migration", () => {
  it("converts an absolute input URL into an asset reference", () => {
    const out = migrateSnapshot({
      schemaVersion: 2,
      project: {
        bpm: 120, timeSig: 4, loop: null, tracks: [
          { id: "vocal", pan: 0, envelopes: [], clips: [
            { id: "c1", src: "http://127.0.0.1:8756/files/input/song.mp3", start: 0, duration: 3, offset: 0, gain: 1, muted: false, color: "#fff" },
          ] },
        ],
      },
    }) as any;
    const clip = out.project.tracks[0].clips[0];
    expect(clip.src).toBeUndefined();
    expect(out.project.assets[clip.assetId]).toEqual({
      id: clip.assetId, kind: "upload", name: "song.mp3",
    });
  });

  it("converts an absolute download URL into an output asset", () => {
    const out = migrateSnapshot({
      schemaVersion: 2,
      project: { tracks: [{ id: "m", pan: 0, envelopes: [], clips: [
        { id: "c1", src: "http://127.0.0.1:8756/files/download/remix_ab12.wav" },
      ] }] },
    }) as any;
    const clip = out.project.tracks[0].clips[0];
    expect(out.project.assets[clip.assetId].kind).toBe("output");
    expect(out.project.assets[clip.assetId].name).toBe("remix_ab12.wav");
  });

  it("decodes percent-encoded names back to the real filename", () => {
    const encoded = encodeURIComponent("ปล่อย (let them).mp3");
    const out = migrateSnapshot({
      schemaVersion: 2,
      project: { tracks: [{ id: "v", pan: 0, envelopes: [], clips: [
        { id: "c1", src: `http://127.0.0.1:8756/files/input/${encoded}` },
      ] }] },
    }) as any;
    const clip = out.project.tracks[0].clips[0];
    expect(out.project.assets[clip.assetId].name).toBe("ปล่อย (let them).mp3");
  });

  it("nulls a clip whose src is unrecognisable rather than dropping the clip", () => {
    const out = migrateSnapshot({
      schemaVersion: 2,
      project: { tracks: [{ id: "v", pan: 0, envelopes: [], clips: [{ id: "c1", src: "blob:whatever" }] }] },
    }) as any;
    expect(out.project.tracks[0].clips[0].assetId).toBeNull();
  });

  it("gives a v1 project an empty assets table", () => {
    const out = migrateSnapshot({ project: { tracks: [] } }) as any;
    expect(out.project.assets).toEqual({});
  });
});
