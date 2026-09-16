// @req FR-16.1 — Playback from Library/Workspace
// @req FR-16.2 — Transport controls: Play, Pause, Next, Previous, Seek, Stop, Volume
// @req FR-16.3 — Central Now Playing state
// @req FR-16.4 — Queue management: add, remove, reorder, clear, play-next
// @req FR-16.5 — Repeat (off/one/all) and Shuffle
// @req FR-16.11 — Player state survives route changes
// @req FR-16.12 — Session persistence
// @req FR-17.3 — Gain -12dB to +12dB per band & reset
// @req FR-17.4 — Preamp -12dB to +12dB
// @req FR-17.5 — EQ bypass toggle
// @req FR-17.6 — Standard presets
// @req FR-17.7 — Custom presets CRUD
// @req FR-17.8 — EQ preset persistence

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
import { PlaybackAudioEngine } from "./audioEngine";

const STORAGE_QUEUE_KEY = "lalin:playback:queue";
const STORAGE_EQ_KEY = "lalin:playback:eq";

function loadPersistedQueue(): PlaybackQueue {
  try {
    const raw = localStorage.getItem(STORAGE_QUEUE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.items)) {
        return {
          items: parsed.items,
          currentIndex: typeof parsed.currentIndex === "number" ? parsed.currentIndex : 0,
          repeatMode: parsed.repeatMode || "off",
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

function loadPersistedEQ(): PlaybackEQ {
  try {
    const raw = localStorage.getItem(STORAGE_EQ_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.bands) && parsed.bands.length === EQ_FREQUENCIES.length) {
        return parsed;
      }
    }
  } catch {}
  return createDefaultEQ();
}

function persistQueue(queue: PlaybackQueue) {
  try {
    localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

function persistEQ(eq: PlaybackEQ) {
  try {
    localStorage.setItem(STORAGE_EQ_KEY, JSON.stringify(eq));
  } catch {}
}

interface PlaybackStoreState {
  queue: PlaybackQueue;
  nowPlaying: NowPlaying;
  eq: PlaybackEQ;
  isOpen: boolean;

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

// Apply initial EQ to engine
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
      nowPlaying: { ...state.nowPlaying, state: "paused" },
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
      item: initialQueue.items[initialQueue.currentIndex] ?? null,
      state: "idle",
      currentTime: 0,
      duration: 0,
      volume: 1,
      muted: false,
      playbackRate: 1,
    },
    eq: initialEQ,
    isOpen: false,

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

    addToQueue: (item: MediaItem) => {
      const { queue } = get();
      const nextQueue = {
        ...queue,
        items: [...queue.items, item],
        currentIndex: queue.currentIndex === -1 ? 0 : queue.currentIndex,
      };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
    },

    removeFromQueue: (index: number) => {
      const { queue } = get();
      if (index < 0 || index >= queue.items.length) return;
      const nextItems = queue.items.filter((_, i) => i !== index);
      let nextIndex = queue.currentIndex;
      if (index < queue.currentIndex) {
        nextIndex--;
      } else if (index === queue.currentIndex) {
        if (nextIndex >= nextItems.length) {
          nextIndex = nextItems.length - 1;
        }
      }
      const nextQueue = { ...queue, items: nextItems, currentIndex: nextIndex };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
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
      const { queue } = get();
      const nextQueue = { ...queue, items: [], currentIndex: -1 };
      persistQueue(nextQueue);
      engine.stop();
      set({
        queue: nextQueue,
        nowPlaying: {
          ...get().nowPlaying,
          item: null,
          state: "idle",
          currentTime: 0,
          duration: 0,
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
        await get().playAtIndex(Math.max(0, queue.currentIndex));
      }
    },

    pause: () => engine.pause(),
    stop: () => engine.stop(),

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
      engine.seek(timeSec);
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, currentTime: timeSec },
      }));
    },

    setVolume: (v: number) => {
      const vol = Math.max(0, Math.min(1, v));
      engine.setVolume(vol);
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
