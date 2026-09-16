// @req FR-16.1 — Playback from Library/Workspace
// @req FR-16.2 — Transport controls
// @req FR-16.3 — Now Playing state
// @req FR-16.4 — Queue management
// @req FR-16.5 — Repeat and Shuffle
// @req FR-16.6 — Play / Play Next / Add to queue
// @req FR-16.7 — Non-destructive playback
// @req FR-16.8 — Actionable error reporting
// @req FR-16.11 — Player survives route changes
// @req FR-16.12 — Playback session persistence
// @req FR-16.13 — Playback speed
// @req FR-16.14 — Keyboard shortcuts
// @req FR-16W.1 — Hardware media keys
// @req FR-16W.2 — Windows SMTC metadata integration
// @req FR-16W.3 — Command contract routing
// @req FR-16W.4 — Output device selection
// @req FR-16W.5 — Output device fallback/loss handling
// @req FR-16W.6 — Background playback
// @req FR-17.1 — Integrated EQ surface
// @req FR-17.2 — 10-band EQ
// @req FR-17.3 — Band gain clamping
// @req FR-17.4 — Preamp gain
// @req FR-17.5 — EQ Bypass toggle
// @req FR-17.6 — Factory presets
// @req FR-17.7 — User custom presets
// @req FR-17.8 — Persistent EQ state
// @req FR-17.9 — Clipping protection limiter
// @req FR-17.10 — Real spectrum analyser
// @req FR-17.11 — Real-time EQ parameter updates
// @req FR-17.12 — Isolation from mastering parameters

import { create } from "zustand";
import {
  type MediaItem,
  type NowPlaying,
  type PlaybackQueue,
  type PlaybackRepeatMode,
  type PlaybackEQ,
  DEFAULT_EQ_PRESETS,
  createDefaultEQ,
  clampGain,
  EQ_FREQUENCIES,
} from "@lalin/contracts";
import { PlaybackAudioEngine, type AudioOutputDevice } from "./audioEngine";

export const STORAGE_QUEUE_KEY = "lalin:playback:queue";
export const STORAGE_EQ_KEY = "lalin:playback:eq";

export function loadPersistedQueue(): PlaybackQueue {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_QUEUE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.items)) {
        const validItems: MediaItem[] = parsed.items.filter(
          (it: any) => it && typeof it.id === "string" && typeof it.url === "string"
        );
        let idx = typeof parsed.currentIndex === "number" ? parsed.currentIndex : -1;
        if (validItems.length === 0 || idx < 0 || idx >= validItems.length) {
          idx = -1;
        }
        return {
          items: validItems,
          currentIndex: idx,
          repeatMode: parsed.repeatMode === "one" || parsed.repeatMode === "all" ? parsed.repeatMode : "off",
          shuffle: Boolean(parsed.shuffle),
        };
      }
    }
  } catch {}
  return {
    items: [],
    currentIndex: -1,
    repeatMode: "off",
    shuffle: false,
  };
}

export function loadPersistedEQ(): PlaybackEQ {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_EQ_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.bands) && parsed.bands.length === EQ_FREQUENCIES.length) {
        const validBands = parsed.bands.every(
          (b: any) => typeof b === "object" && b !== null && typeof b.frequency === "number" && typeof b.gain === "number"
        );
        if (validBands) {
          return {
            enabled: Boolean(parsed.enabled),
            preamp: typeof parsed.preamp === "number" ? clampGain(parsed.preamp) : 0,
            bands: parsed.bands.map((b: any, idx: number) => ({
              frequency: EQ_FREQUENCIES[idx],
              gain: clampGain(b.gain),
            })),
            currentPreset: typeof parsed.currentPreset === "string" ? parsed.currentPreset : "Flat",
            customPresets: typeof parsed.customPresets === "object" && parsed.customPresets !== null ? parsed.customPresets : {},
          };
        }
      }
    }
  } catch {}
  return createDefaultEQ();
}

export function persistQueue(queue: PlaybackQueue) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch {}
}

export function persistEQ(eq: PlaybackEQ) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_EQ_KEY, JSON.stringify(eq));
    }
  } catch {}
}

export interface PlaybackStoreState {
  queue: PlaybackQueue;
  nowPlaying: NowPlaying;
  eq: PlaybackEQ;
  isOpen: boolean;
  availableOutputDevices: AudioOutputDevice[];

  // Actions
  setOpen: (open: boolean) => void;
  play: (item: MediaItem) => Promise<void>;
  playNext: (item: MediaItem) => void;
  addToQueue: (item: MediaItem) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  playAtIndex: (index: number) => Promise<void>;

  togglePlay: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (timeSec: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (r: number) => void;
  setRepeatMode: (mode: PlaybackRepeatMode) => void;
  toggleShuffle: () => void;
  refreshOutputDevices: () => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<boolean>;

  // EQ Actions
  setBandGain: (index: number, db: number) => void;
  setPreamp: (db: number) => void;
  toggleEQBypass: () => void;
  selectPreset: (name: string) => void;
  saveCustomPreset: (name: string) => void;
  deleteCustomPreset: (name: string) => void;
  resetEQ: () => void;
}

const initialQueue = loadPersistedQueue();
const initialEQ = loadPersistedEQ();
const engine = PlaybackAudioEngine.getInstance();

// Apply initial EQ to engine (stored in engine state and applied on graph creation)
engine.applyEQ(initialEQ);

export const usePlaybackStore = create<PlaybackStoreState>((set, get) => {
  // Attach audio engine events
  engine.on("play", () => {
    set((state) => ({
      nowPlaying: { ...state.nowPlaying, state: "playing", error: undefined },
    }));
  });

  engine.on("pause", () => {
    set((state) => ({
      nowPlaying: { ...state.nowPlaying, state: state.nowPlaying.state === "idle" ? "idle" : "paused" },
    }));
  });

  engine.on("loading", () => {
    set((state) => ({
      nowPlaying: { ...state.nowPlaying, state: "loading" },
    }));
  });

  engine.on("timeupdate", (time: number) => {
    set((state) => ({
      nowPlaying: {
        ...state.nowPlaying,
        currentTime: time,
        duration: engine.getDuration() || state.nowPlaying.duration,
      },
    }));
  });

  engine.on("durationchange", (duration: number) => {
    set((state) => ({
      nowPlaying: { ...state.nowPlaying, duration },
    }));
  });

  engine.on("error", (errorMsg: string) => {
    set((state) => ({
      nowPlaying: { ...state.nowPlaying, state: "error", error: errorMsg },
    }));
  });

  engine.on("devicechange", () => {
    get().refreshOutputDevices();
  });

  engine.on("devicelost", () => {
    set((state) => ({
      nowPlaying: {
        ...state.nowPlaying,
        activeOutputDeviceId: "",
      },
    }));
    get().refreshOutputDevices();
  });

  engine.on("ended", () => {
    const { queue } = get();
    if (queue.repeatMode === "one") {
      engine.seek(0);
      engine.play().catch(() => {});
      return;
    }

    if (queue.items.length === 0) return;

    if (queue.shuffle) {
      const nextIdx = Math.floor(Math.random() * queue.items.length);
      get().playAtIndex(nextIdx);
      return;
    }

    const nextIndex = queue.currentIndex + 1;
    if (nextIndex < queue.items.length) {
      get().playAtIndex(nextIndex);
    } else if (queue.repeatMode === "all") {
      get().playAtIndex(0);
    } else {
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, state: "idle", currentTime: 0 },
      }));
    }
  });

  return {
    queue: initialQueue,
    nowPlaying: {
      item:
        initialQueue.currentIndex >= 0 && initialQueue.items[initialQueue.currentIndex]
          ? initialQueue.items[initialQueue.currentIndex]
          : null,
      state: "idle",
      currentTime: 0,
      duration: 0,
      volume: 1,
      muted: false,
      playbackRate: 1,
      activeOutputDeviceId: "",
    },
    eq: initialEQ,
    isOpen: false,
    availableOutputDevices: [{ deviceId: "", label: "Default Audio Output" }],

    setOpen: (open: boolean) => set({ isOpen: open }),

    play: async (item: MediaItem) => {
      const { queue } = get();
      const existingIdx = queue.items.findIndex((i) => i.id === item.id || i.url === item.url);
      let nextQueue: PlaybackQueue;
      let targetIdx: number;

      if (existingIdx !== -1) {
        targetIdx = existingIdx;
        nextQueue = { ...queue, currentIndex: targetIdx };
      } else {
        targetIdx = queue.items.length;
        nextQueue = {
          ...queue,
          items: [...queue.items, item],
          currentIndex: targetIdx,
        };
      }

      persistQueue(nextQueue);
      set({
        queue: nextQueue,
        nowPlaying: {
          ...get().nowPlaying,
          item,
          state: "loading",
          currentTime: 0,
          duration: item.duration ?? 0,
          error: undefined,
        },
      });

      try {
        await engine.loadAndPlay(item.url);
      } catch (err: any) {
        set((state) => ({
          nowPlaying: { ...state.nowPlaying, state: "error", error: String(err?.message ?? err) },
        }));
      }
    },

    playNext: (item: MediaItem) => {
      const { queue } = get();
      const insertAt = queue.currentIndex >= 0 ? queue.currentIndex + 1 : 0;
      const nextItems = [...queue.items];
      nextItems.splice(insertAt, 0, item);
      const nextQueue = { ...queue, items: nextItems };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
    },

    /**
     * Adds an item to queue without modifying currentIndex or nowPlaying if playback hasn't started.
     * When queue has items but nothing is playing, currentIndex remains -1 and nowPlaying.item remains null.
     */
    addToQueue: (item: MediaItem) => {
      const { queue } = get();
      const nextQueue = {
        ...queue,
        items: [...queue.items, item],
      };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
    },

    /**
     * Removes an item from the queue while maintaining the invariant:
     * If currentIndex >= 0 and queue has items, queue.items[currentIndex].id === nowPlaying.item.id
     */
    removeFromQueue: (index: number) => {
      const { queue, nowPlaying } = get();
      if (index < 0 || index >= queue.items.length) return;

      const nextItems = queue.items.filter((_, i) => i !== index);

      // Case 1: Removed item was before the currently playing item
      if (index < queue.currentIndex) {
        const nextIndex = queue.currentIndex - 1;
        const nextQueue = { ...queue, items: nextItems, currentIndex: nextIndex };
        persistQueue(nextQueue);
        set({ queue: nextQueue });
        return;
      }

      // Case 2: Removed item was after the currently playing item
      if (index > queue.currentIndex) {
        const nextQueue = { ...queue, items: nextItems };
        persistQueue(nextQueue);
        set({ queue: nextQueue });
        return;
      }

      // Case 3: Removed item is the currently playing item (index === queue.currentIndex)
      if (nextItems.length === 0) {
        // Queue is completely empty now
        engine.stop();
        const nextQueue: PlaybackQueue = { ...queue, items: [], currentIndex: -1 };
        persistQueue(nextQueue);
        set({
          queue: nextQueue,
          nowPlaying: {
            ...nowPlaying,
            item: null,
            state: "idle",
            currentTime: 0,
            duration: 0,
            error: undefined,
          },
        });
        return;
      }

      // Clamp nextIndex if removing the last item
      let nextIndex = queue.currentIndex;
      if (nextIndex >= nextItems.length) {
        nextIndex = nextItems.length - 1;
      }
      const nextItem = nextItems[nextIndex];
      const nextQueue = { ...queue, items: nextItems, currentIndex: nextIndex };
      persistQueue(nextQueue);

      const wasActive = nowPlaying.state === "playing" || nowPlaying.state === "loading";
      set({
        queue: nextQueue,
        nowPlaying: {
          ...nowPlaying,
          item: nextItem,
          currentTime: 0,
          duration: nextItem.duration ?? 0,
          state: wasActive ? "loading" : "idle",
          error: undefined,
        },
      });

      if (wasActive) {
        engine.loadAndPlay(nextItem.url).catch((err: any) => {
          set((state) => ({
            nowPlaying: { ...state.nowPlaying, state: "error", error: String(err?.message ?? err) },
          }));
        });
      } else {
        engine.stop();
      }
    },

    reorderQueue: (fromIndex: number, toIndex: number) => {
      const { queue } = get();
      if (
        fromIndex < 0 || fromIndex >= queue.items.length ||
        toIndex < 0 || toIndex >= queue.items.length
      ) return;

      const nextItems = [...queue.items];
      const [moved] = nextItems.splice(fromIndex, 1);
      nextItems.splice(toIndex, 0, moved);

      let nextCurrentIndex = queue.currentIndex;
      if (queue.currentIndex === fromIndex) {
        nextCurrentIndex = toIndex;
      } else if (fromIndex < queue.currentIndex && toIndex >= queue.currentIndex) {
        nextCurrentIndex--;
      } else if (fromIndex > queue.currentIndex && toIndex <= queue.currentIndex) {
        nextCurrentIndex++;
      }

      const nextQueue = { ...queue, items: nextItems, currentIndex: nextCurrentIndex };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
    },

    clearQueue: () => {
      engine.stop();
      const nextQueue: PlaybackQueue = {
        items: [],
        currentIndex: -1,
        repeatMode: "off",
        shuffle: false,
      };
      persistQueue(nextQueue);
      set({
        queue: nextQueue,
        nowPlaying: {
          ...get().nowPlaying,
          item: null,
          state: "idle",
          currentTime: 0,
          duration: 0,
          error: undefined,
        },
      });
    },

    playAtIndex: async (index: number) => {
      const { queue } = get();
      if (index < 0 || index >= queue.items.length) return;
      const item = queue.items[index];
      const nextQueue = { ...queue, currentIndex: index };
      persistQueue(nextQueue);

      set({
        queue: nextQueue,
        nowPlaying: {
          ...get().nowPlaying,
          item,
          state: "loading",
          currentTime: 0,
          duration: item.duration ?? 0,
          error: undefined,
        },
      });

      try {
        await engine.loadAndPlay(item.url);
      } catch (err: any) {
        set((state) => ({
          nowPlaying: { ...state.nowPlaying, state: "error", error: String(err?.message ?? err) },
        }));
      }
    },

    togglePlay: async () => {
      const { nowPlaying, queue } = get();
      if (nowPlaying.state === "playing") {
        engine.pause();
      } else if (nowPlaying.item) {
        await engine.play();
      } else if (queue.items.length > 0) {
        const targetIdx = queue.currentIndex >= 0 ? queue.currentIndex : 0;
        await get().playAtIndex(targetIdx);
      }
    },

    pause: () => engine.pause(),

    stop: () => {
      engine.stop();
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, state: "idle", currentTime: 0 },
      }));
    },

    next: async () => {
      const { queue } = get();
      if (queue.items.length === 0) return;
      if (queue.shuffle) {
        const nextIdx = Math.floor(Math.random() * queue.items.length);
        await get().playAtIndex(nextIdx);
        return;
      }
      const nextIndex = queue.currentIndex + 1;
      if (nextIndex < queue.items.length) {
        await get().playAtIndex(nextIndex);
      } else if (queue.repeatMode === "all") {
        await get().playAtIndex(0);
      }
    },

    previous: async () => {
      const { queue, nowPlaying } = get();
      if (queue.items.length === 0) return;
      // If played more than 3 seconds, restart current track
      if (nowPlaying.currentTime > 3) {
        engine.seek(0);
        return;
      }
      const prevIndex = queue.currentIndex - 1;
      if (prevIndex >= 0) {
        await get().playAtIndex(prevIndex);
      } else if (queue.repeatMode === "all") {
        await get().playAtIndex(queue.items.length - 1);
      }
    },

    seek: (timeSec: number) => {
      const dur = get().nowPlaying.duration || 0;
      const clamped = Math.max(0, dur > 0 ? Math.min(dur, timeSec) : Math.max(0, timeSec));
      engine.seek(clamped);
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, currentTime: clamped },
      }));
    },

    setVolume: (v: number) => {
      const vol = Math.max(0, Math.min(1, v));
      engine.setVolume(vol); // adjusting volume automatically un-mutes
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, volume: vol, muted: false },
      }));
    },

    toggleMute: () => {
      const { nowPlaying } = get();
      const nextMuted = !nowPlaying.muted;
      engine.setMuted(nextMuted);
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, muted: nextMuted },
      }));
    },

    setPlaybackRate: (r: number) => {
      engine.setPlaybackRate(r);
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, playbackRate: r },
      }));
    },

    setRepeatMode: (mode: PlaybackRepeatMode) => {
      const { queue } = get();
      const nextQueue = { ...queue, repeatMode: mode };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
    },

    toggleShuffle: () => {
      const { queue } = get();
      const nextQueue = { ...queue, shuffle: !queue.shuffle };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
    },

    refreshOutputDevices: async () => {
      const devices = await engine.getAvailableOutputDevices();
      set({ availableOutputDevices: devices });
    },

    setOutputDevice: async (deviceId: string): Promise<boolean> => {
      const ok = await engine.setOutputDevice(deviceId);
      set((state) => ({
        nowPlaying: {
          ...state.nowPlaying,
          activeOutputDeviceId: ok ? deviceId : "",
        },
      }));
      return ok;
    },

    // ── EQ Operations ──────────────────────────────────────────
    setBandGain: (index: number, db: number) => {
      const { eq } = get();
      const clamped = clampGain(db);
      const nextBands = eq.bands.map((band, i) =>
        i === index ? { ...band, gain: clamped } : band
      );
      const nextEQ: PlaybackEQ = {
        ...eq,
        bands: nextBands,
        currentPreset: "Custom",
      };
      engine.setBandGain(index, clamped);
      persistEQ(nextEQ);
      set({ eq: nextEQ });
    },

    setPreamp: (db: number) => {
      const { eq } = get();
      const clamped = clampGain(db);
      const nextEQ: PlaybackEQ = {
        ...eq,
        preamp: clamped,
        currentPreset: "Custom",
      };
      engine.setPreamp(clamped);
      persistEQ(nextEQ);
      set({ eq: nextEQ });
    },

    toggleEQBypass: () => {
      const { eq } = get();
      const nextEnabled = !eq.enabled;
      const nextEQ: PlaybackEQ = { ...eq, enabled: nextEnabled };
      engine.setBypass(!nextEnabled);
      persistEQ(nextEQ);
      set({ eq: nextEQ });
    },

    selectPreset: (name: string) => {
      const { eq } = get();
      const preset = DEFAULT_EQ_PRESETS[name] || eq.customPresets[name];
      if (!preset) return;

      const nextBands = eq.bands.map((band, i) => ({
        ...band,
        gain: preset.gains[i] ?? 0,
      }));
      const nextEQ: PlaybackEQ = {
        ...eq,
        preamp: preset.preamp,
        bands: nextBands,
        currentPreset: name,
      };

      engine.applyEQ(nextEQ);
      persistEQ(nextEQ);
      set({ eq: nextEQ });
    },

    saveCustomPreset: (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const { eq } = get();
      const nextCustomPresets = {
        ...eq.customPresets,
        [trimmed]: {
          name: trimmed,
          preamp: eq.preamp,
          gains: eq.bands.map((b) => b.gain),
        },
      };
      const nextEQ: PlaybackEQ = {
        ...eq,
        currentPreset: trimmed,
        customPresets: nextCustomPresets,
      };
      persistEQ(nextEQ);
      set({ eq: nextEQ });
    },

    deleteCustomPreset: (name: string) => {
      const { eq } = get();
      const nextCustomPresets = { ...eq.customPresets };
      delete nextCustomPresets[name];
      const nextEQ: PlaybackEQ = {
        ...eq,
        currentPreset: eq.currentPreset === name ? "Flat" : eq.currentPreset,
        customPresets: nextCustomPresets,
      };
      persistEQ(nextEQ);
      set({ eq: nextEQ });
      if (eq.currentPreset === name) {
        get().selectPreset("Flat");
      }
    },

    resetEQ: () => {
      const defaultEQ = createDefaultEQ();
      engine.applyEQ(defaultEQ);
      persistEQ(defaultEQ);
      set({ eq: defaultEQ });
    },
  };
});
