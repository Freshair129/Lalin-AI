import { beforeEach, describe, expect, it } from "vitest";
import { usePlaybackStore } from "./usePlaybackStore";
import type { MediaItem } from "@lalin/contracts";

const itemA: MediaItem = { id: "1", title: "Track A", url: "http://example.com/a.wav" };
const itemB: MediaItem = { id: "2", title: "Track B", url: "http://example.com/b.wav" };
const itemC: MediaItem = { id: "3", title: "Track C", url: "http://example.com/c.wav" };

describe("usePlaybackStore Queue Operations", () => {
  beforeEach(() => {
    localStorage.clear();
    usePlaybackStore.getState().clearQueue();
  });

  it("starts with empty queue", () => {
    const { queue } = usePlaybackStore.getState();
    expect(queue.items).toHaveLength(0);
    expect(queue.currentIndex).toBe(-1);
  });

  it("adds items to queue", () => {
    usePlaybackStore.getState().addToQueue(itemA);
    usePlaybackStore.getState().addToQueue(itemB);

    const { queue } = usePlaybackStore.getState();
    expect(queue.items).toHaveLength(2);
    expect(queue.items[0].title).toBe("Track A");
    expect(queue.items[1].title).toBe("Track B");
  });

  it("inserts item at playNext (right after current)", () => {
    usePlaybackStore.getState().addToQueue(itemA);
    usePlaybackStore.getState().addToQueue(itemC);
    // current index 0
    usePlaybackStore.setState((s) => ({ queue: { ...s.queue, currentIndex: 0 } }));

    usePlaybackStore.getState().playNext(itemB);

    const { queue } = usePlaybackStore.getState();
    expect(queue.items).toHaveLength(3);
    expect(queue.items[0].id).toBe("1");
    expect(queue.items[1].id).toBe("2"); // inserted next
    expect(queue.items[2].id).toBe("3");
  });

  it("removes items and updates currentIndex correctly", () => {
    usePlaybackStore.getState().addToQueue(itemA);
    usePlaybackStore.getState().addToQueue(itemB);
    usePlaybackStore.getState().addToQueue(itemC);
    usePlaybackStore.setState((s) => ({ queue: { ...s.queue, currentIndex: 2 } }));

    usePlaybackStore.getState().removeFromQueue(0);

    const { queue } = usePlaybackStore.getState();
    expect(queue.items).toHaveLength(2);
    expect(queue.items[0].id).toBe("2");
    expect(queue.items[1].id).toBe("3");
    expect(queue.currentIndex).toBe(1); // shifted down
  });

  it("reorders queue items", () => {
    usePlaybackStore.getState().addToQueue(itemA);
    usePlaybackStore.getState().addToQueue(itemB);
    usePlaybackStore.getState().addToQueue(itemC);

    usePlaybackStore.getState().reorderQueue(0, 2);

    const { queue } = usePlaybackStore.getState();
    expect(queue.items.map((i) => i.id)).toEqual(["2", "3", "1"]);
  });

  it("updates repeat and shuffle modes", () => {
    expect(usePlaybackStore.getState().queue.repeatMode).toBe("off");
    usePlaybackStore.getState().setRepeatMode("all");
    expect(usePlaybackStore.getState().queue.repeatMode).toBe("all");

    expect(usePlaybackStore.getState().queue.shuffle).toBe(false);
    usePlaybackStore.getState().toggleShuffle();
    expect(usePlaybackStore.getState().queue.shuffle).toBe(true);
  });
});
