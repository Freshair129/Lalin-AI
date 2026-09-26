import { describe, expect, it, vi } from "vitest";
import {
  PLAY_EQ_KEY,
  PLAY_QUEUE_KEY,
  PLAY_RESUME_KEY,
  parseMigrationEnvelope,
  playbackEqFromMigration,
  playbackQueueFromPlan,
  recoverPlayMigrationBeforeStore,
  type MigrationEnvelope,
  type MigrationRecovery,
} from "./playMigration";
import { invoke } from "@tauri-apps/api/core";
import type { LocalTrack } from "./native";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset:${path}`,
}));
vi.mock("./native", () => ({
  mediaItem: (track: LocalTrack) => ({
    id: track.id, title: track.title, url: `asset:${track.path}`, sourcePath: track.path,
  }),
}));

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const envelope = (): MigrationEnvelope => ({
  format: "lalin-play-migration",
  schemaVersion: 1,
  exportId: uuid("1"),
  createdAt: "2026-09-25T10:00:00.000Z",
  sourceApp: "lalin-studio",
  sourceVersion: "0.1.1",
  sourceCommit: null,
  queue: {
    items: [
      { entryId: uuid("2"), localPath: "C:\\Music\\one.wav", title: "one", kind: "audio" },
      { entryId: uuid("3"), localPath: "C:\\Music\\one.wav", title: "one again", kind: "audio" },
    ],
    currentEntryId: uuid("3"),
    repeatMode: "all",
    shuffle: true,
  },
  eq: {
    enabled: true,
    preamp: 0,
    bands: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
      .map((frequency) => ({ frequency, gain: 0 })),
    currentPreset: "Flat",
    customPresets: [{ name: "Warm", preamp: -1, gains: [1, 1, 0, 0, 0, 0, 0, 0, 0, -1] }],
  },
  unresolved: [{ entryId: uuid("4"), displayLabel: "upload", reason: "No local path" }],
});

describe("Play migration envelope", () => {
  it("validates the envelope while preserving duplicates and an unresolved current pointer", () => {
    const value = envelope();
    expect(parseMigrationEnvelope(JSON.stringify(value))).toEqual(value);
    expect(value.queue.items[0].localPath).toBe(value.queue.items[1].localPath);
  });

  it.each([
    (value: MigrationEnvelope) => { value.schemaVersion = 2 as 1; },
    (value: MigrationEnvelope) => { value.queue.items[1].entryId = value.queue.items[0].entryId; },
    (value: MigrationEnvelope) => { value.queue.items[0].localPath = "https://example.test/a.wav"; },
    (value: MigrationEnvelope) => { value.eq.bands[0].gain = 12.1; },
    (value: MigrationEnvelope) => { value.eq.bands.reverse(); },
    (value: MigrationEnvelope) => { value.eq.customPresets.push(value.eq.customPresets[0]); },
    (value: MigrationEnvelope) => { value.queue.currentEntryId = uuid("9"); },
  ])("rejects invalid or ambiguous migration data", (mutate) => {
    const value = envelope();
    mutate(value);
    expect(() => parseMigrationEnvelope(JSON.stringify(value))).toThrow();
  });

  it("rejects unknown fields and oversized JSON before parsing", () => {
    const value = envelope() as MigrationEnvelope & { unexpected?: boolean };
    value.unexpected = true;
    expect(() => parseMigrationEnvelope(JSON.stringify(value))).toThrow(/ไม่รองรับ/);
    expect(() => parseMigrationEnvelope(" ".repeat(16 * 1024 * 1024 + 1))).toThrow(/16 MiB/);
  });

  it("maps duplicate queue entries and an unresolved current item to no selection", () => {
    const value = envelope();
    const track: LocalTrack = {
      id: "C:\\Music\\one.wav", path: "C:\\Music\\one.wav", title: "one",
      artist: null, album: null, duration: 1, missing: false,
    };
    const plan = {
      items: value.queue.items.map((item) => ({ entryId: item.entryId, track })),
      currentEntryId: value.unresolved[0].entryId,
      repeatMode: "all" as const,
      shuffle: true,
    };
    const queue = playbackQueueFromPlan(plan);
    const eq = playbackEqFromMigration(value.eq);
    expect(queue.items).toHaveLength(2);
    expect(queue.items[0].id).toBe(queue.items[1].id);
    expect(queue.currentIndex).toBe(-1);
    expect(queue.repeatMode).toBe("all");
    expect(queue.shuffle).toBe(true);
    expect(playbackQueueFromPlan({
      ...plan,
      currentEntryId: value.queue.items[1].entryId,
    }).currentIndex).toBe(1);
    expect(eq.customPresets.Warm.gains[0]).toBe(1);
  });

  it("restores rollback values before acknowledging startup recovery", async () => {
    const value = envelope();
    localStorage.setItem(PLAY_QUEUE_KEY, "partially-written-queue");
    localStorage.setItem(PLAY_EQ_KEY, "partially-written-eq");
    localStorage.setItem(PLAY_RESUME_KEY, "true");
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "recover_play_migration") {
        return {
          transactionId: uuid("10"),
          committed: false,
          oldQueueRaw: "exact-old-queue",
          oldEqRaw: "exact-old-eq",
          oldResumeRaw: "false",
          plan: { items: [], currentEntryId: null, repeatMode: "off", shuffle: false },
          eq: value.eq,
        };
      }
      return undefined;
    });

    try {
      await recoverPlayMigrationBeforeStore();
      expect(localStorage.getItem(PLAY_QUEUE_KEY)).toBe("exact-old-queue");
      expect(localStorage.getItem(PLAY_EQ_KEY)).toBe("exact-old-eq");
      expect(localStorage.getItem(PLAY_RESUME_KEY)).toBe("false");
      expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
        "recover_play_migration", "ack_play_migration",
      ]);
    } finally {
      delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  });

  it("reapplies committed queue and EQ before acknowledging startup recovery", async () => {
    const value = envelope();
    const track: LocalTrack = {
      id: "C:\\Music\\one.wav", path: "C:\\Music\\one.wav", title: "one",
      artist: null, album: null, duration: 1, missing: false,
    };
    const plan: MigrationRecovery["plan"] = {
      items: value.queue.items.map(({ entryId }) => ({ entryId, track })),
      currentEntryId: value.queue.currentEntryId,
      repeatMode: value.queue.repeatMode,
      shuffle: value.queue.shuffle,
    };
    const recovery: MigrationRecovery = {
      transactionId: uuid("11"),
      committed: true,
      oldQueueRaw: "old queue",
      oldEqRaw: "old eq",
      oldResumeRaw: "false",
      plan,
      eq: value.eq,
    };
    localStorage.setItem(PLAY_QUEUE_KEY, "old queue");
    localStorage.setItem(PLAY_EQ_KEY, "old eq");
    localStorage.setItem(PLAY_RESUME_KEY, "false");
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "recover_play_migration") return recovery;
      if (command === "ack_play_migration") {
        expect(localStorage.getItem(PLAY_QUEUE_KEY)).toBe(
          JSON.stringify(playbackQueueFromPlan(plan)),
        );
        expect(localStorage.getItem(PLAY_EQ_KEY)).toBe(
          JSON.stringify(playbackEqFromMigration(value.eq)),
        );
        expect(localStorage.getItem(PLAY_RESUME_KEY)).toBe("true");
      }
      return undefined;
    });

    try {
      await recoverPlayMigrationBeforeStore();
      expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
        "recover_play_migration", "ack_play_migration",
      ]);
      expect(JSON.parse(localStorage.getItem(PLAY_QUEUE_KEY)!)).toMatchObject({
        currentIndex: 1,
        repeatMode: "all",
        shuffle: true,
      });
    } finally {
      delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  });
});
