import { beforeEach, describe, expect, it } from "vitest";
import {
  usePlaybackStore,
  loadPersistedQueue,
  loadPersistedEQ,
  STORAGE_QUEUE_KEY,
  STORAGE_EQ_KEY,
} from "./usePlaybackStore";
import type { MediaItem } from "@lalin/contracts";

const itemA: MediaItem = { id: "1", title: "Track A", url: "http://example.com/a.wav", duration: 180 };
const itemB: MediaItem = { id: "2", title: "Track B", url: "http://example.com/b.wav", duration: 200 };
const itemC: MediaItem = { id: "3", title: "Track C", url: "http://example.com/c.wav", duration: 150 };

describe("usePlaybackStore Queue Operations & Invariants", () => {
  beforeEach(() => {
    localStorage.clear();
    usePlaybackStore.getState().clearQueue();
  });

  it("starts with empty queue", () => {
    const { queue, nowPlaying } = usePlaybackStore.getState();
    expect(queue.items).toHaveLength(0);
    expect(queue.currentIndex).toBe(-1);
    expect(nowPlaying.item).toBeNull();
  });

  it("adds items to queue without advancing currentIndex until played", () => {
    usePlaybackStore.getState().addToQueue(itemA);
    usePlaybackStore.getState().addToQueue(itemB);

    const { queue, nowPlaying } = usePlaybackStore.getState();
    expect(queue.items).toHaveLength(2);
    expect(queue.items[0].title).toBe("Track A");
    expect(queue.items[1].title).toBe("Track B");
    expect(queue.currentIndex).toBe(-1);
    expect(nowPlaying.item).toBeNull();
  });

  it("inserts item at playNext (right after current)", () => {
    usePlaybackStore.getState().addToQueue(itemA);
    usePlaybackStore.getState().addToQueue(itemC);
    usePlaybackStore.setState((s) => ({ queue: { ...s.queue, currentIndex: 0 } }));

    usePlaybackStore.getState().playNext(itemB);

    const { queue } = usePlaybackStore.getState();
    expect(queue.items).toHaveLength(3);
    expect(queue.items[0].id).toBe("1");
    expect(queue.items[1].id).toBe("2"); // inserted next
    expect(queue.items[2].id).toBe("3");
  });

  it("removes items before current track and updates currentIndex correctly", () => {
    usePlaybackStore.getState().addToQueue(itemA);
    usePlaybackStore.getState().addToQueue(itemB);
    usePlaybackStore.getState().addToQueue(itemC);
    usePlaybackStore.setState((s) => ({
      queue: { ...s.queue, currentIndex: 2 },
      nowPlaying: { ...s.nowPlaying, item: itemC },
    }));

    usePlaybackStore.getState().removeFromQueue(0);

    const { queue, nowPlaying } = usePlaybackStore.getState();
    expect(queue.items).toHaveLength(2);
    expect(queue.items[0].id).toBe("2");
    expect(queue.items[1].id).toBe("3");
    expect(queue.currentIndex).toBe(1); // shifted down
    // Invariant holds
    expect(queue.items[queue.currentIndex].id).toBe(nowPlaying.item?.id);
  });

  it("removes current playing track while multiple tracks exist and preserves invariant", () => {
    usePlaybackStore.getState().addToQueue(itemA);
    usePlaybackStore.getState().addToQueue(itemB);
    usePlaybackStore.getState().addToQueue(itemC);

    // Track B is playing at index 1
    usePlaybackStore.setState((s) => ({
      queue: { ...s.queue, currentIndex: 1 },
      nowPlaying: { ...s.nowPlaying, item: itemB, state: "playing" },
    }));

    // Remove B (the active track)
    usePlaybackStore.getState().removeFromQueue(1);

    const { queue, nowPlaying } = usePlaybackStore.getState();
    expect(queue.items).toHaveLength(2);
    expect(queue.items.map((i) => i.id)).toEqual(["1", "3"]);
    // currentIndex was 1, now points to C (item at new index 1)
    expect(queue.currentIndex).toBe(1);
    expect(nowPlaying.item?.id).toBe("3");
    expect(queue.items[queue.currentIndex].id).toBe(nowPlaying.item?.id);
  });

  it("removes current playing track when it is the last item in queue", () => {
    usePlaybackStore.getState().addToQueue(itemA);
    usePlaybackStore.getState().addToQueue(itemB);

    // Track B is playing at index 1 (the last item)
    usePlaybackStore.setState((s) => ({
      queue: { ...s.queue, currentIndex: 1 },
      nowPlaying: { ...s.nowPlaying, item: itemB, state: "playing" },
    }));

    usePlaybackStore.getState().removeFromQueue(1);

    const { queue, nowPlaying } = usePlaybackStore.getState();
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].id).toBe("1");
    // currentIndex clamps back to 0
    expect(queue.currentIndex).toBe(0);
    expect(nowPlaying.item?.id).toBe("1");
    expect(queue.items[queue.currentIndex].id).toBe(nowPlaying.item?.id);
  });

  it("removes current playing track when it is the only item in queue", () => {
    usePlaybackStore.getState().addToQueue(itemA);
    usePlaybackStore.setState((s) => ({
      queue: { ...s.queue, currentIndex: 0 },
      nowPlaying: { ...s.nowPlaying, item: itemA, state: "playing" },
    }));

    usePlaybackStore.getState().removeFromQueue(0);

    const { queue, nowPlaying } = usePlaybackStore.getState();
    expect(queue.items).toHaveLength(0);
    expect(queue.currentIndex).toBe(-1);
    expect(nowPlaying.item).toBeNull();
    expect(nowPlaying.state).toBe("idle");
  });

  it("reorders queue items and updates currentIndex correctly", () => {
    usePlaybackStore.getState().addToQueue(itemA);
    usePlaybackStore.getState().addToQueue(itemB);
    usePlaybackStore.getState().addToQueue(itemC);
    usePlaybackStore.setState((s) => ({ queue: { ...s.queue, currentIndex: 0 } }));

    usePlaybackStore.getState().reorderQueue(0, 2);

    const { queue } = usePlaybackStore.getState();
    expect(queue.items.map((i) => i.id)).toEqual(["2", "3", "1"]);
    expect(queue.currentIndex).toBe(2); // followed moved item
  });

  it("handles stop state cleanly", () => {
    usePlaybackStore.setState((s) => ({
      nowPlaying: { ...s.nowPlaying, state: "playing", currentTime: 45 },
    }));

    usePlaybackStore.getState().stop();

    const { nowPlaying } = usePlaybackStore.getState();
    expect(nowPlaying.state).toBe("idle");
    expect(nowPlaying.currentTime).toBe(0);
  });

  it("clamps seek time within [0, duration]", () => {
    usePlaybackStore.setState((s) => ({
      nowPlaying: { ...s.nowPlaying, duration: 100, currentTime: 20 },
    }));

    usePlaybackStore.getState().seek(-10);
    expect(usePlaybackStore.getState().nowPlaying.currentTime).toBe(0);

    usePlaybackStore.getState().seek(150);
    expect(usePlaybackStore.getState().nowPlaying.currentTime).toBe(100);

    usePlaybackStore.getState().seek(50);
    expect(usePlaybackStore.getState().nowPlaying.currentTime).toBe(50);
  });

  it("handles corrupted or invalid persistence storage gracefully", () => {
    // 1. Invalid JSON in queue
    localStorage.setItem(STORAGE_QUEUE_KEY, "invalid-json{{}");
    const corruptedQueue = loadPersistedQueue();
    expect(corruptedQueue.items).toEqual([]);
    expect(corruptedQueue.currentIndex).toBe(-1);

    // 2. Queue with invalid item objects and out-of-bounds currentIndex
    localStorage.setItem(
      STORAGE_QUEUE_KEY,
      JSON.stringify({
        items: [{ id: "x", url: "http://test.com/x.mp3" }, null, "not an object"],
        currentIndex: 99,
      })
    );
    const sanitizedQueue = loadPersistedQueue();
    expect(sanitizedQueue.items).toHaveLength(1);
    expect(sanitizedQueue.currentIndex).toBe(-1); // out-of-bounds currentIndex resets to -1 (idle)

    // 3. Corrupted EQ JSON
    localStorage.setItem(STORAGE_EQ_KEY, "{ bad eq json");
    const defaultEQ = loadPersistedEQ();
    expect(defaultEQ.bands).toHaveLength(10);
    expect(defaultEQ.preamp).toBe(0);
    expect(defaultEQ.currentPreset).toBe("Flat");

    // 4. EQ with wrong band count
    localStorage.setItem(
      STORAGE_EQ_KEY,
      JSON.stringify({
        enabled: true,
        bands: [{ frequency: 100, gain: 2 }],
      })
    );
    const recoveredEQ = loadPersistedEQ();
    expect(recoveredEQ.bands).toHaveLength(10);
  });
});
