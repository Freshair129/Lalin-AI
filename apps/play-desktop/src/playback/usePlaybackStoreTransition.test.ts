import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem, PlaybackQueue, SmartMedleyPairDecision } from "../contracts";
import { analyzeSmartMedleyPair, resolveMedia } from "../native";
import { PlaybackAudioEngine } from "./audioEngine";
import {
  loadPersistedExperimentalSettings,
  loadPersistedTransitionSettings,
  STORAGE_EXPERIMENTAL_SETTINGS_KEY,
  STORAGE_QUEUE_KEY,
  STORAGE_TRANSITION_SETTINGS_KEY,
  usePlaybackStore,
} from "./usePlaybackStore";

vi.mock("../native", () => ({
  analyzeSmartMedleyPair: vi.fn(),
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

function smartMedleyDecision(
  overrides: Partial<SmartMedleyPairDecision> = {},
): SmartMedleyPairDecision {
  const analysis = {
    analysisVersion: "smart-medley-0.2.0",
    mediaSha256: "a".repeat(64),
    durationSeconds: 100,
    bpm: 120,
    bpmConfidence: 0.95,
    key: { tonicSemitone: 0, mode: "major" as const },
    keyConfidence: 0.92,
    cueInSeconds: 0,
    cueOutSeconds: 84,
    cueConfidence: 0.9,
    availability: "ready" as const,
    fallbackReason: null,
  };
  return {
    currentTrackId: "current-track",
    nextTrackId: "incoming-track",
    mode: "smart-medley",
    eligible: true,
    reason: "eligible-current-next-pair",
    score: {
      tempoCompatibility: 1,
      keyCompatibility: 1,
      cuePhaseCompatibility: 1,
      confidenceFloor: 0.9,
      compatibilityScore: 0.82,
    },
    current: analysis,
    next: { ...analysis, mediaSha256: "b".repeat(64) },
    currentCueInSeconds: 0,
    currentCueOutSeconds: 84,
    nextCueInSeconds: 14,
    nextCueOutSeconds: 100,
    ...overrides,
  };
}

function smartLibraryQueue(): PlaybackQueue {
  const queue = transitionQueue();
  queue.items = queue.items.map((item) => ({
    ...item,
    sourceKind: "custom",
    sourcePath: `C:\\music\\${item.id}.wav`,
  }));
  return queue;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function enableSmartMode(queue = smartLibraryQueue()): void {
  usePlaybackStore.setState((state) => ({
    ...state,
    queue,
    nowPlaying: { ...state.nowPlaying, item: queue.items[0]!, state: "playing", duration: 100 },
  }));
  usePlaybackStore.getState().setExperimentalSmartMedley(true);
  usePlaybackStore.getState().setTransitionSettings({ mode: "smart", durationSeconds: 5 });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(analyzeSmartMedleyPair).mockReset();
  vi.mocked(analyzeSmartMedleyPair).mockResolvedValue(smartMedleyDecision());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  usePlaybackStore.getState().setExperimentalSmartMedley(false);
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
  usePlaybackStore.getState().setExperimentalSmartMedley(false);
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

  it.each([
    ["seek", () => usePlaybackStore.getState().seek(40)],
    ["stop", () => usePlaybackStore.getState().stop()],
    ["queue edit", () => usePlaybackStore.getState().addToQueue({ id: "added", title: "Added", url: "asset:added" })],
  ] as const)("cancels prepared manual deck on %s", async (_name, action) => {
    usePlaybackStore.setState({ transitionSettings: { mode: "manual", durationSeconds: 5 } });
    vi.spyOn(engine, "prepareManualDeck").mockResolvedValue(true);
    const cancel = vi.spyOn(engine, "cancelTransition");
    await usePlaybackStore.getState().prepareNextDeck();
    expect(usePlaybackStore.getState().transitionTargetQueueEntryId).toBe("entry-incoming");
    action();
    expect(cancel).toHaveBeenCalled();
    emit("transitionend", { outgoing: 0, incoming: 1 });
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
    expect(usePlaybackStore.getState().transitionTargetQueueEntryId).toBeNull();
  });

  it("clears the manual target when deck B fails to prepare", async () => {
    usePlaybackStore.setState({ transitionSettings: { mode: "manual", durationSeconds: 5 } });
    vi.spyOn(engine, "prepareManualDeck").mockResolvedValue(false);
    await usePlaybackStore.getState().prepareNextDeck();
    expect(usePlaybackStore.getState().transitionTargetQueueEntryId).toBeNull();
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
  });

  it.each([
    ["repeat", () => usePlaybackStore.getState().setRepeatMode("all")],
    ["shuffle", () => usePlaybackStore.getState().toggleShuffle()],
  ] as const)("cancels a medley transition on %s change", async (_name, action) => {
    const queue = transitionQueue();
    queue.items[0] = { ...queue.items[0]!, cueOutSeconds: 84 };
    usePlaybackStore.setState({ queue, transitionSettings: { mode: "medley", durationSeconds: 5 } });
    let finish!: (completed: boolean) => void;
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    emit("timeupdate", 80);
    await Promise.resolve();
    await Promise.resolve();
    expect(crossfade).toHaveBeenCalledOnce();
    action();
    finish(false);
    await Promise.resolve();
    emit("transitionend", { outgoing: 0, incoming: 1 });
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
  });

  it("starts medley at zero when the next cue-in is missing", async () => {
    const queue = transitionQueue();
    queue.items[0] = { ...queue.items[0]!, cueOutSeconds: 84 };
    usePlaybackStore.setState({ queue, transitionSettings: { mode: "medley", durationSeconds: 5 } });
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockResolvedValue(false);
    emit("timeupdate", 80);
    await Promise.resolve();
    await Promise.resolve();
    expect(crossfade).toHaveBeenCalledWith("asset:resolved", 4, 0, expect.anything());
  });

  it.each([[NaN, 0], [-3, 0], [120, 119.9], [200, 119.9]])(
    "bounds invalid medley cue-in %s to %s", async (cueIn, expected) => {
      const queue = transitionQueue();
      queue.items[0] = { ...queue.items[0]!, cueOutSeconds: 84 };
      queue.items[1] = { ...queue.items[1]!, cueInSeconds: cueIn };
      usePlaybackStore.setState({ queue, transitionSettings: { mode: "medley", durationSeconds: 5 } });
      const crossfade = vi.spyOn(engine, "crossfadeTo").mockResolvedValue(false);
      emit("timeupdate", 80);
      await Promise.resolve();
      await Promise.resolve();
      expect(crossfade).toHaveBeenCalledWith("asset:resolved", 4, expected, expect.anything());
    },
  );

  it.each([[NaN, 0], [-3, 0], [120, 119.9], [200, 119.9]])(
    "bounds invalid manual cue-in %s to %s", async (cueIn, expected) => {
      const queue = transitionQueue();
      queue.items[1] = { ...queue.items[1]!, cueInSeconds: cueIn };
      usePlaybackStore.setState({ queue, transitionSettings: { mode: "manual", durationSeconds: 5 } });
      const prepare = vi.spyOn(engine, "prepareManualDeck").mockResolvedValue(false);
      await usePlaybackStore.getState().prepareNextDeck();
      expect(prepare).toHaveBeenCalledWith("asset:resolved", expected, expect.anything());
    },
  );

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

describe("Smart Medley experimental transition", () => {
  it("defaults the experimental gate off and coerces a saved smart mode to smooth", () => {
    localStorage.removeItem(STORAGE_EXPERIMENTAL_SETTINGS_KEY);
    localStorage.setItem(STORAGE_TRANSITION_SETTINGS_KEY, JSON.stringify({ mode: "smart", durationSeconds: 7 }));
    expect(loadPersistedExperimentalSettings()).toEqual({ smartMedley: false });
    expect(loadPersistedTransitionSettings()).toEqual({ mode: "smooth", durationSeconds: 7 });

    localStorage.setItem(STORAGE_EXPERIMENTAL_SETTINGS_KEY, JSON.stringify({ smartMedley: true }));
    expect(loadPersistedTransitionSettings()).toEqual({ mode: "smart", durationSeconds: 7 });
  });

  it("persists the gate and falls back to smooth when the gate is turned off", () => {
    usePlaybackStore.getState().setExperimentalSmartMedley(true);
    usePlaybackStore.getState().setTransitionSettings({ mode: "smart", durationSeconds: 8 });
    expect(JSON.parse(localStorage.getItem(STORAGE_EXPERIMENTAL_SETTINGS_KEY)!)).toEqual({ smartMedley: true });

    usePlaybackStore.getState().setExperimentalSmartMedley(false);
    expect(usePlaybackStore.getState().transitionSettings).toEqual({ mode: "smooth", durationSeconds: 8 });
    expect(JSON.parse(localStorage.getItem(STORAGE_TRANSITION_SETTINGS_KEY)!)).toEqual({ mode: "smooth", durationSeconds: 8 });
  });

  it("prefetches the local current/next pair and uses eligible cue recommendations", async () => {
    const queue = smartLibraryQueue();
    queue.items[0] = { ...queue.items[0]!, cueInSeconds: 3, cueOutSeconds: 90 };
    queue.items[1] = { ...queue.items[1]!, cueInSeconds: 12 };
    vi.mocked(analyzeSmartMedleyPair).mockResolvedValue(smartMedleyDecision({
      currentCueOutSeconds: 84,
      nextCueInSeconds: 14,
    }));
    enableSmartMode(queue);
    const queueEntryIds = usePlaybackStore.getState().queue.items.map((item) => item.queueEntryId);
    const mediaGain = usePlaybackStore.getState().mixer.mediaGain;
    await flushMicrotasks();

    expect(analyzeSmartMedleyPair).toHaveBeenCalledWith(
      "current-track",
      "incoming-track",
      true,
      { cueInSeconds: 3, cueOutSeconds: 90 },
      { cueInSeconds: 12, cueOutSeconds: undefined },
    );
    expect(usePlaybackStore.getState().queue.items.map((item) => item.queueEntryId)).toEqual(queueEntryIds);
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
    expect(usePlaybackStore.getState().mixer.mediaGain).toBe(mediaGain);
    expect(usePlaybackStore.getState().nowPlaying.item?.id).toBe("current-track");

    const crossfade = vi.spyOn(engine, "crossfadeTo").mockResolvedValue(false);
    emit("timeupdate", 80);
    await flushMicrotasks();

    expect(crossfade).toHaveBeenCalledWith("asset:resolved", 4, 14, {
      mediaId: "incoming-track",
      queueEntryId: "entry-incoming",
      sessionId: 5,
      duration: 120,
    });
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
    expect(usePlaybackStore.getState().nowPlaying.state).toBe("playing");
  });

  it("uses the ordinary smooth crossfade for a fallback decision", async () => {
    vi.mocked(analyzeSmartMedleyPair).mockResolvedValue(smartMedleyDecision({
      mode: "smooth-fallback",
      eligible: false,
      reason: "incompatible-key",
    }));
    enableSmartMode();
    await flushMicrotasks();
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockResolvedValue(false);

    emit("timeupdate", 96);
    await flushMicrotasks();

    expect(crossfade).toHaveBeenCalledWith("asset:resolved", 4, 0, expect.anything());
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
    expect(usePlaybackStore.getState().nowPlaying.state).toBe("playing");
  });

  it("bounds Smart Medley cue-out and cue-in to their track durations", async () => {
    vi.mocked(analyzeSmartMedleyPair).mockResolvedValue(smartMedleyDecision({
      currentCueOutSeconds: 140,
      nextCueInSeconds: 200,
    }));
    enableSmartMode();
    await flushMicrotasks();
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockResolvedValue(false);

    emit("timeupdate", 96);
    await flushMicrotasks();

    expect(crossfade).toHaveBeenCalledWith("asset:resolved", 4, 119.9, expect.anything());
  });

  it("returns to Smooth if the recommended cue-out has already passed", async () => {
    vi.mocked(analyzeSmartMedleyPair).mockResolvedValue(smartMedleyDecision({
      currentCueOutSeconds: 84,
      nextCueInSeconds: 14,
    }));
    enableSmartMode();
    await flushMicrotasks();
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockResolvedValue(false);

    emit("timeupdate", 83);
    await flushMicrotasks();
    expect(crossfade).not.toHaveBeenCalled();
    expect(usePlaybackStore.getState().smartMedleyStatus.phase).toBe("fallback");

    emit("timeupdate", 96);
    await flushMicrotasks();
    expect(crossfade).toHaveBeenCalledWith("asset:resolved", 4, 0, expect.anything());
  });

  it("keeps playback running and uses smooth after analysis rejects", async () => {
    vi.mocked(analyzeSmartMedleyPair).mockRejectedValue(new Error("analysis unavailable"));
    enableSmartMode();
    await flushMicrotasks();
    expect(usePlaybackStore.getState().smartMedleyStatus.phase).toBe("fallback");

    const crossfade = vi.spyOn(engine, "crossfadeTo").mockResolvedValue(false);
    emit("timeupdate", 96);
    await flushMicrotasks();

    expect(crossfade).toHaveBeenCalledWith("asset:resolved", 4, 0, expect.anything());
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
    expect(usePlaybackStore.getState().nowPlaying.state).toBe("playing");
  });

  it("falls back to smooth if the decision is still pending at transition time", async () => {
    let resolveDecision!: (decision: SmartMedleyPairDecision) => void;
    vi.mocked(analyzeSmartMedleyPair).mockReturnValue(new Promise((resolve) => {
      resolveDecision = resolve;
    }));
    enableSmartMode();
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockResolvedValue(false);

    emit("timeupdate", 96);
    await flushMicrotasks();

    expect(crossfade).toHaveBeenCalledWith("asset:resolved", 4, 0, expect.anything());
    expect(usePlaybackStore.getState().nowPlaying.state).toBe("playing");
    resolveDecision(smartMedleyDecision());
    await flushMicrotasks();
  });

  it("matches Smooth by skipping analysis and crossfade for video queue items", async () => {
    const queue = smartLibraryQueue();
    queue.items[1] = { ...queue.items[1]!, kind: "video" };
    enableSmartMode(queue);
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockResolvedValue(false);

    emit("timeupdate", 96);
    await flushMicrotasks();

    expect(analyzeSmartMedleyPair).not.toHaveBeenCalled();
    expect(crossfade).not.toHaveBeenCalled();
    expect(usePlaybackStore.getState().nowPlaying.state).toBe("playing");
  });

  it("uses Smooth for non-library items without calling the analyzer", async () => {
    const queue = smartLibraryQueue();
    queue.items[0] = { ...queue.items[0]!, sourceKind: "workspace" };
    enableSmartMode(queue);
    const crossfade = vi.spyOn(engine, "crossfadeTo").mockResolvedValue(false);

    emit("timeupdate", 96);
    await flushMicrotasks();

    expect(analyzeSmartMedleyPair).not.toHaveBeenCalled();
    expect(crossfade).toHaveBeenCalledWith("asset:resolved", 4, 0, expect.anything());
    expect(usePlaybackStore.getState().nowPlaying.state).toBe("playing");
  });

  it("discards a stale pair result and serializes the next analysis request", async () => {
    let resolveOld!: (decision: SmartMedleyPairDecision) => void;
    let resolveNew!: (decision: SmartMedleyPairDecision) => void;
    vi.mocked(analyzeSmartMedleyPair)
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; }));
    const queue = smartLibraryQueue();
    enableSmartMode(queue);
    expect(analyzeSmartMedleyPair).toHaveBeenCalledTimes(1);

    usePlaybackStore.getState().setCuePoints(0, 2, 90);
    expect(analyzeSmartMedleyPair).toHaveBeenCalledTimes(1);
    expect(usePlaybackStore.getState().smartMedleyStatus.phase).toBe("analyzing");

    resolveOld(smartMedleyDecision({ currentCueOutSeconds: 55 }));
    await flushMicrotasks();
    expect(analyzeSmartMedleyPair).toHaveBeenCalledTimes(2);
    expect(usePlaybackStore.getState().smartMedleyStatus.phase).toBe("analyzing");

    resolveNew(smartMedleyDecision({ currentCueOutSeconds: 80, nextCueInSeconds: 13 }));
    await flushMicrotasks();
    expect(usePlaybackStore.getState().smartMedleyStatus.phase).toBe("match");
    expect(usePlaybackStore.getState().smartMedleyStatus.decision?.currentCueOutSeconds).toBe(80);
  });
});
