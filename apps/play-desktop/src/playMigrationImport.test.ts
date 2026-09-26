import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaybackStore } from "./playback/usePlaybackStore";
import {
  PLAY_EQ_KEY,
  PLAY_QUEUE_KEY,
  PLAY_RESUME_KEY,
  playbackEqFromMigration,
  playbackQueueFromPlan,
  type MigrationPreview,
} from "./playMigration";
import { importPlayMigration, undoLastPlayMigration } from "./playMigrationImport";
import type { LocalTrack } from "./native";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset:${path}`,
}));
vi.mock("./native", () => ({
  mediaItem: (track: LocalTrack) => ({
    kind: track.kind ?? "audio", id: track.id, title: track.title,
    url: `asset:${track.path}`, sourcePath: track.path,
  }),
}));

const txId = "00000000-0000-4000-8000-000000000010";
const exportId = "00000000-0000-4000-8000-000000000011";
const track: LocalTrack = {
  kind: "audio", id: "C:\\Music\\new.wav", path: "C:\\Music\\new.wav",
  title: "new", artist: null, album: null, duration: 15, missing: false,
};
const preview: MigrationPreview = {
  exportId,
  plan: {
    items: [{
      entryId: "00000000-0000-4000-8000-000000000012",
      track,
    }],
    currentEntryId: "00000000-0000-4000-8000-000000000012",
    repeatMode: "off",
    shuffle: false,
  },
  eq: {
    enabled: true,
    preamp: 0,
    bands: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
      .map((frequency) => ({ frequency, gain: 1 })),
    currentPreset: "Imported",
    customPresets: [{ name: "Imported", preamp: -1, gains: Array(10).fill(1) }],
  },
  unresolved: [],
  alreadyImported: false,
};
const prepared = { ...preview, transactionId: txId };

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => txId });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  localStorage.clear();
  usePlaybackStore.getState().clearQueue();
  usePlaybackStore.getState().resetEQ();
  vi.mocked(invoke).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("atomic Play migration import", () => {
  it("recovers a journal when the native prepare response is lost", async () => {
    localStorage.setItem(PLAY_QUEUE_KEY, "exact-old-queue");
    localStorage.setItem(PLAY_EQ_KEY, "exact-old-eq");
    localStorage.setItem(PLAY_RESUME_KEY, "false");
    const recovery = {
      transactionId: txId,
      committed: false,
      oldQueueRaw: "exact-old-queue",
      oldEqRaw: "exact-old-eq",
      oldResumeRaw: "false",
      plan: preview.plan,
      eq: preview.eq,
    };
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "prepare_play_migration") throw new Error("prepare response lost");
      if (command === "recover_play_migration") return recovery;
      return undefined;
    });

    await expect(importPlayMigration("migration-json", preview, false))
      .rejects.toThrow("prepare response lost");

    expect(localStorage.getItem(PLAY_QUEUE_KEY)).toBe("exact-old-queue");
    expect(localStorage.getItem(PLAY_EQ_KEY)).toBe("exact-old-eq");
    expect(localStorage.getItem(PLAY_RESUME_KEY)).toBe("false");
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      "prepare_play_migration", "recover_play_migration", "ack_play_migration",
    ]);
  });

  it("restores exact prior storage and store state when native catalog apply fails", async () => {
    usePlaybackStore.getState().addToQueue({ id: "old", title: "old", url: "asset:old" });
    usePlaybackStore.getState().setBandGain(0, 4);
    localStorage.setItem(PLAY_QUEUE_KEY, "exact-old-queue");
    localStorage.setItem(PLAY_EQ_KEY, "exact-old-eq");
    localStorage.setItem(PLAY_RESUME_KEY, "false");
    const recovery = {
      transactionId: txId,
      committed: false,
      oldQueueRaw: "exact-old-queue",
      oldEqRaw: "exact-old-eq",
      oldResumeRaw: "false",
      plan: preview.plan,
      eq: preview.eq,
    };
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "prepare_play_migration") return prepared;
      if (command === "apply_play_migration") throw new Error("catalog write failed");
      if (command === "rollback_play_migration") return recovery;
      return undefined;
    });

    await expect(importPlayMigration("migration-json", preview, false))
      .rejects.toThrow("catalog write failed");

    expect(localStorage.getItem(PLAY_QUEUE_KEY)).toBe("exact-old-queue");
    expect(localStorage.getItem(PLAY_EQ_KEY)).toBe("exact-old-eq");
    expect(localStorage.getItem(PLAY_RESUME_KEY)).toBe("false");
    expect(usePlaybackStore.getState().queue.items.map((item) => item.id)).toEqual(["old"]);
    expect(usePlaybackStore.getState().eq.bands[0].gain).toBe(4);
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      "prepare_play_migration", "apply_play_migration",
      "rollback_play_migration", "ack_play_migration",
    ]);
  });

  it("rolls back native catalog and exact prior values when EQ storage write fails", async () => {
    usePlaybackStore.getState().addToQueue({ id: "old", title: "old", url: "asset:old" });
    usePlaybackStore.getState().setBandGain(0, 4);
    localStorage.setItem(PLAY_QUEUE_KEY, "exact-old-queue");
    localStorage.setItem(PLAY_EQ_KEY, "exact-old-eq");
    localStorage.setItem(PLAY_RESUME_KEY, "false");
    const recovery = {
      transactionId: txId,
      committed: false,
      oldQueueRaw: "exact-old-queue",
      oldEqRaw: "exact-old-eq",
      oldResumeRaw: "false",
      plan: preview.plan,
      eq: preview.eq,
    };
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "prepare_play_migration") return prepared;
      if (command === "rollback_play_migration") return recovery;
      return undefined;
    });
    let writeFailed = false;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === PLAY_EQ_KEY && value !== "exact-old-eq" && !writeFailed) {
        writeFailed = true;
        throw new DOMException("storage full", "QuotaExceededError");
      }
      return setItem.call(this, key, value);
    });

    await expect(importPlayMigration("migration-json", preview, false))
      .rejects.toThrow("storage full");

    expect(localStorage.getItem(PLAY_QUEUE_KEY)).toBe("exact-old-queue");
    expect(localStorage.getItem(PLAY_EQ_KEY)).toBe("exact-old-eq");
    expect(localStorage.getItem(PLAY_RESUME_KEY)).toBe("false");
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      "prepare_play_migration", "rollback_play_migration", "ack_play_migration",
    ]);
  });

  it("rolls back storage and store state when native commit fails after catalog apply", async () => {
    localStorage.setItem(PLAY_QUEUE_KEY, "old-queue");
    localStorage.setItem(PLAY_EQ_KEY, "old-eq");
    localStorage.setItem(PLAY_RESUME_KEY, "false");
    const recovery = {
      transactionId: txId,
      committed: false,
      oldQueueRaw: "old-queue",
      oldEqRaw: "old-eq",
      oldResumeRaw: "false",
      plan: preview.plan,
      eq: preview.eq,
    };
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "prepare_play_migration") return prepared;
      if (command === "commit_play_migration") throw new Error("commit write failed");
      if (command === "recover_play_migration") return recovery;
      if (command === "rollback_play_migration") return recovery;
      return undefined;
    });

    await expect(importPlayMigration("migration-json", preview, false))
      .rejects.toThrow("commit write failed");

    expect(localStorage.getItem(PLAY_QUEUE_KEY)).toBe("old-queue");
    expect(localStorage.getItem(PLAY_EQ_KEY)).toBe("old-eq");
    expect(localStorage.getItem(PLAY_RESUME_KEY)).toBe("false");
    expect(usePlaybackStore.getState().queue.items).toHaveLength(0);
    expect(usePlaybackStore.getState().nowPlaying.state).toBe("idle");
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      "prepare_play_migration", "apply_play_migration", "commit_play_migration",
      "recover_play_migration", "rollback_play_migration", "ack_play_migration",
    ]);
  });

  it("commits queue, EQ and resume together without starting playback", async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "prepare_play_migration") return prepared;
      return undefined;
    });

    const result = await importPlayMigration("migration-json", preview, false);

    expect(result).toEqual({ cleanupPending: false });
    expect(localStorage.getItem(PLAY_RESUME_KEY)).toBe("true");
    expect(JSON.parse(localStorage.getItem(PLAY_QUEUE_KEY)!).items[0].id).toBe(track.id);
    expect(JSON.parse(localStorage.getItem(PLAY_EQ_KEY)!).bands[0].gain).toBe(1);
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
    expect(usePlaybackStore.getState().eq.currentPreset).toBe("Imported");
    expect(usePlaybackStore.getState().nowPlaying.state).toBe("idle");
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      "prepare_play_migration", "apply_play_migration",
      "commit_play_migration", "ack_play_migration",
    ]);
  });

  it("keeps a committed result when only journal cleanup is delayed", async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "prepare_play_migration") return prepared;
      if (command === "ack_play_migration") throw new Error("cleanup unavailable");
      return undefined;
    });

    await expect(importPlayMigration("migration-json", preview, false))
      .resolves.toEqual({ cleanupPending: true });
    expect(usePlaybackStore.getState().queue.items[0].id).toBe(track.id);
    expect(usePlaybackStore.getState().eq.currentPreset).toBe("Imported");
  });

  it("undoes the last import and restores the exact prior queue, EQ, resume and catalog transaction", async () => {
    usePlaybackStore.getState().addToQueue({ id: "old", title: "old", url: "asset:old" });
    usePlaybackStore.getState().setBandGain(0, 4);
    const oldQueueRaw = JSON.stringify(usePlaybackStore.getState().queue);
    const oldEqRaw = JSON.stringify(usePlaybackStore.getState().eq);
    localStorage.setItem(PLAY_QUEUE_KEY, oldQueueRaw);
    localStorage.setItem(PLAY_EQ_KEY, oldEqRaw);
    localStorage.setItem(PLAY_RESUME_KEY, "false");
    const importedQueue = playbackQueueFromPlan(preview.plan);
    usePlaybackStore.getState().replaceFromMigration(
      importedQueue,
      playbackEqFromMigration(preview.eq),
    );
    localStorage.setItem(PLAY_QUEUE_KEY, JSON.stringify(importedQueue));
    localStorage.setItem(PLAY_EQ_KEY, JSON.stringify(preview.eq));
    localStorage.setItem(PLAY_RESUME_KEY, "true");

    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "prepare_undo_play_migration") {
        return {
          transactionId: txId,
          committed: false,
          oldQueueRaw: localStorage.getItem(PLAY_QUEUE_KEY),
          oldEqRaw: localStorage.getItem(PLAY_EQ_KEY),
          oldResumeRaw: "true",
          restoreRawStorage: true,
          newQueueRaw: oldQueueRaw,
          newEqRaw: oldEqRaw,
          newResumeRaw: "false",
          plan: preview.plan,
          eq: preview.eq,
        };
      }
      return undefined;
    });

    await expect(undoLastPlayMigration()).resolves.toEqual({ cleanupPending: false });

    expect(localStorage.getItem(PLAY_QUEUE_KEY)).toBe(oldQueueRaw);
    expect(localStorage.getItem(PLAY_EQ_KEY)).toBe(oldEqRaw);
    expect(localStorage.getItem(PLAY_RESUME_KEY)).toBe("false");
    expect(usePlaybackStore.getState().queue.items.map((item) => item.id)).toEqual(["old"]);
    expect(usePlaybackStore.getState().eq.bands[0].gain).toBe(4);
    expect(usePlaybackStore.getState().nowPlaying.state).toBe("idle");
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      "prepare_undo_play_migration", "apply_play_migration",
      "commit_play_migration", "ack_play_migration",
    ]);
  });
});
