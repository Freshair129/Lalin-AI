import { describe, expect, it, vi } from "vitest";
import { createDefaultEQ, type PlaybackQueue } from "@lalin/contracts";
import { buildPlayMigrationEnvelope } from "./playMigrationExport";

describe("Studio Play migration export", () => {
  it("exports queue/EQ from the live store shape and reports unresolved references", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn()
        .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
        .mockReturnValueOnce("00000000-0000-4000-8000-000000000002")
        .mockReturnValueOnce("00000000-0000-4000-8000-000000000003"),
    });
    const queue: PlaybackQueue = {
      items: [
        { id: "a", title: "Local audio", url: "asset:a", sourcePath: "C:\\Music\\one.wav" },
        { id: "upload-42", title: "Studio upload", url: "https://studio.invalid/upload", sourcePath: "upload-42", sourceKind: "upload" },
        { id: "a-again", title: "Same file again", url: "asset:a", sourcePath: "C:\\Music\\one.wav" },
      ],
      currentIndex: 1,
      repeatMode: "all",
      shuffle: true,
    };
    const eq = createDefaultEQ();
    eq.enabled = false;
    eq.preamp = -2;
    eq.bands[2].gain = 3.5;
    eq.customPresets = {
      Warm: { name: "Warm", preamp: -1, gains: [1, 1, 0, 0, 0, 0, 0, 0, 0, -1] },
    };

    const migration = buildPlayMigrationEnvelope(queue, eq, {
      exportId: "00000000-0000-4000-8000-000000000004",
      createdAt: "2026-09-25T10:00:00.000Z",
      sourceVersion: "0.1.1",
    });

    expect(migration.queue.items).toHaveLength(2);
    expect(migration.queue.items.map((item) => item.localPath)).toEqual([
      "C:\\Music\\one.wav",
      "C:\\Music\\one.wav",
    ]);
    expect(migration.queue.items[0].entryId).not.toBe(migration.queue.items[1].entryId);
    expect(migration.queue.currentEntryId).toBe("00000000-0000-4000-8000-000000000002");
    expect(migration.queue.repeatMode).toBe("all");
    expect(migration.queue.shuffle).toBe(true);
    expect(migration.unresolved).toEqual([{
      entryId: "00000000-0000-4000-8000-000000000002",
      displayLabel: "Studio upload",
      reason: "Studio did not provide a supported absolute local file path",
    }]);
    expect(migration.eq).toEqual({
      enabled: false,
      preamp: -2,
      bands: expect.arrayContaining([{ frequency: 125, gain: 3.5 }]),
      currentPreset: "Flat",
      customPresets: [{ name: "Warm", preamp: -1, gains: [1, 1, 0, 0, 0, 0, 0, 0, 0, -1] }],
    });
    expect(JSON.stringify(migration)).not.toContain("https://studio.invalid/upload");
    vi.unstubAllGlobals();
  });

  it("rejects invalid EQ rather than silently clamping or dropping it", () => {
    const eq = createDefaultEQ();
    eq.bands[0].gain = 13;
    expect(() => buildPlayMigrationEnvelope({
      items: [], currentIndex: -1, repeatMode: "off", shuffle: false,
  }, eq, { exportId: "00000000-0000-4000-8000-000000000004" })).toThrow(/EQ/);
  });

  it("rejects an export larger than the supported envelope limit", () => {
    const eq = createDefaultEQ();
    const queue: PlaybackQueue = {
      items: Array.from({ length: 600 }, (_, index) => ({
        id: `item-${index}`,
        title: `Track ${index}`,
        url: `asset:${index}`,
        sourcePath: `C:\\${"a".repeat(31_900)}${index}.wav`,
      })),
      currentIndex: -1,
      repeatMode: "off",
      shuffle: false,
    };
    expect(() => buildPlayMigrationEnvelope(queue, eq, {
      exportId: "00000000-0000-4000-8000-000000000004",
    })).toThrow("16 MiB");
  });
});
