import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem, PlaybackQueue } from "../contracts";
import { resolveMedia } from "../native";
import { PlaybackAudioEngine } from "./audioEngine";
import { STORAGE_QUEUE_KEY, usePlaybackStore } from "./usePlaybackStore";

vi.mock("../native", () => ({
  isVideoItem: (item: { kind?: string } | null) => item?.kind === "video",
  resolveMedia: vi.fn().mockResolvedValue("asset:resolved"),
}));

const engine = PlaybackAudioEngine.getInstance();
const emit = (event: string, data?: unknown) =>
  (engine as unknown as { emit: (name: string, value?: unknown) => void }).emit(event, data);

function transitionQueue(): PlaybackQueue {
  const current: MediaItem = {
    id: "current-track",
    title: "Current track",
    url: "asset:current",
    duration: 100,
    queueEntryId: "entry-current",
  };
  const incoming: MediaItem = {
    id: "incoming-track",
    title: "Incoming track",
    url: "asset:incoming",
    duration: 120,
    queueEntryId: "entry-incoming",
  };
  return {
    items: [current, incoming],
    currentIndex: 0,
    repeatMode: "off",
    shuffle: false,
    revision: 10,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  usePlaybackStore.getState().setTransitionSettings({ mode: "off", durationSeconds: 5 });
  usePlaybackStore.setState((state) => ({
    queue: transitionQueue(),
    transitionSettings: { mode: "smooth", durationSeconds: 5 },
    transitionTargetQueueEntryId: null,
    isTransitioning: false,
    nowPlaying: {
      ...state.nowPlaying,
      item: transitionQueue().items[0]!,
      state: "playing",
      currentTime: 0,
      duration: 100,
      error: undefined,
    },
    playSession: 4,
  }));
  vi.mocked(resolveMedia).mockResolvedValue("asset:resolved");
});

afterEach(() => {
  usePlaybackStore.getState().setTransitionSettings({ mode: "off", durationSeconds: 5 });
  vi.restoreAllMocks();
});

describe("smooth transition queue commit", () => {
  it("waits for transitionend and persists exactly one queue revision", async () => {
    let finishCrossfade!: (completed: boolean) => void;
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockImplementation(
      () => new Promise<boolean>((resolve) => { finishCrossfade = resolve; }),
    );
    const writes = vi.spyOn(Storage.prototype, "setItem");

    emit("timeupdate", 96);
    await Promise.resolve();
    await Promise.resolve();

    expect(crossfade).toHaveBeenCalledOnce();
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
    expect(usePlaybackStore.getState().queue.revision).toBe(10);

    emit("transitionstart");
    emit("transitionend", { outgoing: 0, incoming: 1 });

    const state = usePlaybackStore.getState();
    expect(state.queue.currentIndex).toBe(1);
    expect(state.queue.revision).toBe(11);
    expect(state.nowPlaying.item?.id).toBe("incoming-track");
    expect(state.playSession).toBe(5);
    expect(writes.mock.calls.filter(([key]) => key === STORAGE_QUEUE_KEY)).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_QUEUE_KEY)!).revision).toBe(11);

    finishCrossfade(true);
    await Promise.resolve();
  });

  it("prepares and commits one duplicate-track occurrence by queueEntryId exactly once", async () => {
    const queue = transitionQueue();
    queue.items = [
      { ...queue.items[0]!, id: "same-track", queueEntryId: "occurrence-current" },
      { ...queue.items[1]!, id: "same-track", queueEntryId: "occurrence-next" },
      { ...queue.items[1]!, id: "same-track", queueEntryId: "occurrence-after-next" },
    ];
    usePlaybackStore.setState((state) => ({
      ...state,
      queue,
      nowPlaying: { ...state.nowPlaying, item: queue.items[0]!, state: "playing", duration: 100 },
    }));
    let finishCrossfade!: (completed: boolean) => void;
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockImplementation(
      () => new Promise<boolean>((resolve) => { finishCrossfade = resolve; }),
    );
    const writes = vi.spyOn(Storage.prototype, "setItem");

    emit("timeupdate", 96);
    await Promise.resolve();
    await Promise.resolve();

    expect(vi.mocked(resolveMedia)).toHaveBeenCalledOnce();
    expect(vi.mocked(resolveMedia)).toHaveBeenCalledWith(queue.items[1]);
    expect(crossfade).toHaveBeenCalledOnce();
    expect(crossfade).toHaveBeenCalledWith("asset:resolved", 4, 0, {
      mediaId: "same-track",
      queueEntryId: "occurrence-next",
      sessionId: 5,
      duration: 120,
    });
    emit("transitionstart");
    emit("transitionend", { outgoing: 0, incoming: 1 });
    expect(usePlaybackStore.getState().queue.items).toHaveLength(3);
    expect(usePlaybackStore.getState().queue.items.map((item) => item.id)).toEqual([
      "same-track", "same-track", "same-track",
    ]);
    expect(usePlaybackStore.getState().queue.items.map((item) => item.queueEntryId)).toEqual([
      "occurrence-current", "occurrence-next", "occurrence-after-next",
    ]);
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(1);
    expect(usePlaybackStore.getState().queue.revision).toBe(11);
    expect(usePlaybackStore.getState().nowPlaying.item?.queueEntryId).toBe("occurrence-next");
    expect(writes.mock.calls.filter(([key]) => key === STORAGE_QUEUE_KEY)).toHaveLength(1);

    emit("transitionend", { outgoing: 0, incoming: 1 });
    finishCrossfade(true);
    await Promise.resolve();
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(1);
    expect(usePlaybackStore.getState().queue.revision).toBe(11);
    expect(writes.mock.calls.filter(([key]) => key === STORAGE_QUEUE_KEY)).toHaveLength(1);
  });

  it("leaves the queue revision unchanged when a transition fails before commit", async () => {
    vi.spyOn(engine, "crossfadeTo").mockResolvedValue(false);

    emit("timeupdate", 96);
    await Promise.resolve();
    await Promise.resolve();

    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
    expect(usePlaybackStore.getState().queue.revision).toBe(10);
    expect(usePlaybackStore.getState().nowPlaying.item?.id).toBe("current-track");
  });

  it("pauses and resumes an active overlap without cancelling its queue plan", async () => {
    let finishCrossfade!: (completed: boolean) => void;
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockImplementation(
      () => new Promise<boolean>((resolve) => { finishCrossfade = resolve; }),
    );
    const cancel = vi.spyOn(engine, "cancelTransition");
    vi.spyOn(engine, "isTransitioning").mockReturnValue(true);
    const pause = vi.spyOn(engine, "pause").mockImplementation(() => emit("pause"));
    const play = vi.spyOn(engine, "play").mockResolvedValue();

    emit("timeupdate", 96);
    await Promise.resolve();
    await Promise.resolve();
    expect(crossfade).toHaveBeenCalledOnce();
    emit("transitionstart");

    usePlaybackStore.getState().pause();
    expect(pause).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
    expect(usePlaybackStore.getState().nowPlaying.state).toBe("paused");
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);

    await usePlaybackStore.getState().togglePlay();
    expect(play).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();

    finishCrossfade(true);
    emit("transitionend", { outgoing: 0, incoming: 1 });
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(1);
    expect(usePlaybackStore.getState().queue.revision).toBe(11);
  });

  it.each([
    ["seek", () => usePlaybackStore.getState().seek(40)],
    ["stop", () => usePlaybackStore.getState().stop()],
    ["queue edit", () => usePlaybackStore.getState().addToQueue({ id: "added", title: "Added", url: "asset:added" })],
    ["repeat change", () => usePlaybackStore.getState().setRepeatMode("all")],
    ["shuffle change", () => usePlaybackStore.getState().toggleShuffle()],
    ["output loss", () => emit("devicelost", "device-gone")],
  ] as const)("cancels a pending overlap on %s without committing its incoming track", async (_name, action) => {
    let finishCrossfade!: (completed: boolean) => void;
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockImplementation(
      () => new Promise<boolean>((resolve) => { finishCrossfade = resolve; }),
    );
    const cancel = vi.spyOn(engine, "cancelTransition");

    emit("timeupdate", 96);
    await Promise.resolve();
    await Promise.resolve();
    expect(crossfade).toHaveBeenCalledOnce();
    emit("transitionstart");
    expect(usePlaybackStore.getState().isTransitioning).toBe(true);

    action();
    expect(cancel).toHaveBeenCalled();
    expect(usePlaybackStore.getState().isTransitioning).toBe(false);
    expect(usePlaybackStore.getState().transitionTargetQueueEntryId).toBeNull();

    finishCrossfade(false);
    await Promise.resolve();
    emit("transitionend", { outgoing: 0, incoming: 1 });
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
    expect(usePlaybackStore.getState().nowPlaying.item?.id).toBe("current-track");
  });

  it("prepares a manual DJ deck at its cue-in and commits once when the fader reaches the incoming deck", async () => {
    const queue = transitionQueue();
    queue.items[1] = { ...queue.items[1]!, cueInSeconds: 18 };
    usePlaybackStore.setState((state) => ({
      ...state,
      queue,
      transitionSettings: { mode: "manual", durationSeconds: 5 },
    }));
    const prepare = vi.spyOn(engine, "prepareManualDeck").mockResolvedValue(true);
    const fader = vi.spyOn(engine, "setManualCrossfader").mockImplementation((position) => {
      if (position >= 1) emit("transitionend", { outgoing: 0, incoming: 1 });
      return true;
    });
    const writes = vi.spyOn(Storage.prototype, "setItem");

    await usePlaybackStore.getState().prepareNextDeck();
    expect(prepare).toHaveBeenCalledWith("asset:resolved", 18, {
      mediaId: "incoming-track",
      queueEntryId: "entry-incoming",
      sessionId: 5,
      duration: 120,
    });
    expect(usePlaybackStore.getState().transitionTargetQueueEntryId).toBe("entry-incoming");

    usePlaybackStore.getState().setCrossfader(0.5);
    expect(fader).toHaveBeenLastCalledWith(0.5);
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
    expect(writes.mock.calls.filter(([key]) => key === STORAGE_QUEUE_KEY)).toHaveLength(0);

    usePlaybackStore.getState().setCrossfader(1);
    expect(fader).toHaveBeenLastCalledWith(1);
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(1);
    expect(usePlaybackStore.getState().queue.revision).toBe(11);
    expect(writes.mock.calls.filter(([key]) => key === STORAGE_QUEUE_KEY)).toHaveLength(1);
  });

  it("uses medley cue-out as the transition point and the next track cue-in as its start", async () => {
    const queue = transitionQueue();
    queue.items[0] = { ...queue.items[0]!, cueOutSeconds: 84 };
    queue.items[1] = { ...queue.items[1]!, cueInSeconds: 14 };
    usePlaybackStore.setState((state) => ({
      ...state,
      queue,
      transitionSettings: { mode: "medley", durationSeconds: 5 },
    }));
    let finishCrossfade!: (completed: boolean) => void;
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockImplementation(
      () => new Promise<boolean>((resolve) => { finishCrossfade = resolve; }),
    );

    emit("timeupdate", 80);
    await Promise.resolve();
    await Promise.resolve();

    expect(crossfade).toHaveBeenCalledWith("asset:resolved", 4, 14, {
      mediaId: "incoming-track",
      queueEntryId: "entry-incoming",
      sessionId: 5,
      duration: 120,
    });
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
    finishCrossfade(false);
    await Promise.resolve();
  });
});
