// CR-010/CR-011 (personal builds only): state and IPC for the two youtube.com
// decks, YouTube search, per-deck queues, and routing Play's transport to the
// decks. In a normal build the deck commands do not exist, `available` stays
// false and no deck UI is shown.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { usePlaybackStore } from "./playback/usePlaybackStore";

export interface DeckInfo {
  loaded: boolean;
  title: string;
  time: number;
  duration: number;
  paused: boolean;
  volume: number;
  ad: boolean;
  cued?: boolean;
  ended?: boolean;
  videoId?: string;
}

export interface DecksSnapshot {
  open: boolean;
  decks: [DeckInfo, DeckInfo];
  active: number;
  auto: boolean;
  fadeSeconds: number;
  fading: boolean;
  mix: number;
  extensionsDir: string;
}

export interface SearchResult {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
}

export interface ExtensionInfo {
  folder: string;
  name: string;
  version: string;
}

/** A video waiting in, or played from, a deck queue. */
export interface DeckItem {
  key: string;
  url: string;
  title: string;
  channel?: string;
  duration?: string;
}

export type DeckQueues = [DeckItem[], DeckItem[]];
export type PlaybackSource = "local" | "decks";

export type QueueAction =
  | { type: "cue"; deck: number }
  | { type: "playOwn"; deck: number }
  | { type: "crossfade" };

export const QUEUES_STORAGE_KEY = "lalin-play:v1:deck-queues";
const HISTORY_LIMIT = 50;
const RESTART_THRESHOLD_SECONDS = 3;

let keySeed = 0;
const newKey = () => `${Date.now().toString(36)}-${(keySeed++).toString(36)}`;

export function itemFromSearch(result: SearchResult): DeckItem {
  return {
    key: newKey(),
    url: `https://www.youtube.com/watch?v=${result.videoId}`,
    title: result.title,
    channel: result.channel,
    duration: result.duration,
  };
}

export function itemFromLink(link: { url: string; title: string }): DeckItem {
  return { key: newKey(), url: link.url, title: link.title };
}

function sanitizeItems(value: unknown): DeckItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is DeckItem =>
      Boolean(item) && typeof item.url === "string" && typeof item.title === "string" && typeof item.key === "string",
    )
    .slice(0, 500)
    .map((item) => ({ key: item.key, url: item.url, title: item.title, channel: item.channel, duration: item.duration }));
}

function loadQueues(): DeckQueues {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUES_STORAGE_KEY) ?? "null");
    return [sanitizeItems(parsed?.queues?.[0]), sanitizeItems(parsed?.queues?.[1])];
  } catch {
    return [[], []];
  }
}

function saveQueues(queues: DeckQueues) {
  try {
    localStorage.setItem(QUEUES_STORAGE_KEY, JSON.stringify({ queues }));
  } catch {
    // Storage full or blocked: queues still work for this session.
  }
}

const isPlaying = (deck: DeckInfo) => deck.loaded && !deck.paused && !deck.cued;

/**
 * What the queues should do next for a deck snapshot. Pure, so it is unit tested.
 * - The active deck ended: play its own next item, else fade into a cued other deck.
 * - The active deck plays and the other deck is idle: cue the other deck's next item,
 *   so auto mode and Next can fade into it.
 */
export function decideQueueAction(snapshot: DecksSnapshot, queues: DeckQueues): QueueAction | null {
  if (snapshot.fading) return null;
  const a = snapshot.active;
  const o = 1 - a;
  const active = snapshot.decks[a];
  const other = snapshot.decks[o];
  if (active.loaded && active.ended) {
    if (queues[a].length) return { type: "playOwn", deck: a };
    if (other.loaded && other.cued) return { type: "crossfade" };
    return null;
  }
  const otherIdle = !other.loaded || (other.paused && !other.cued);
  if (isPlaying(active) && otherIdle && queues[o].length) return { type: "cue", deck: o };
  return null;
}

interface SearchState {
  query: string;
  results: SearchResult[];
  busy: boolean;
  error: string | null;
}

interface DecksStore {
  available: boolean;
  snapshot: DecksSnapshot | null;
  error: string | null;
  source: PlaybackSource;
  queues: DeckQueues;
  current: [DeckItem | null, DeckItem | null];
  history: DeckItem[];
  search: SearchState;
  extensions: ExtensionInfo[] | null;
  init: () => Promise<() => void>;
  run: (command: string, args?: Record<string, unknown>) => Promise<void>;
  searchYoutube: (query: string) => Promise<void>;
  loadExtensions: () => Promise<void>;
  playNow: (deck: number, item: DeckItem) => Promise<void>;
  enqueue: (deck: number, item: DeckItem) => void;
  removeQueued: (deck: number, key: string) => void;
  moveQueued: (deck: number, key: string, delta: number) => void;
  sendToOther: (deck: number, key: string) => void;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  stop: () => Promise<void>;
  seek: (time: number) => Promise<void>;
}

let driving = false;

export const useYoutubeDecks = create<DecksStore>((set, get) => {
  const fail = (error: unknown) => set({ error: String(error) });

  const setQueues = (queues: DeckQueues) => {
    saveQueues(queues);
    set({ queues });
  };

  /** Deck playback takes over from Play's own engine. */
  const takeOver = () => {
    if (get().source !== "decks") set({ source: "decks" });
    const playback = usePlaybackStore.getState();
    if (playback.nowPlaying.state === "playing") playback.pause();
  };

  const load = async (deck: number, item: DeckItem, start: boolean) => {
    const { current, history } = get();
    const replaced = current[deck];
    const nextCurrent: [DeckItem | null, DeckItem | null] = [...current];
    nextCurrent[deck] = item;
    set({
      current: nextCurrent,
      history: replaced ? [...history, replaced].slice(-HISTORY_LIMIT) : history,
    });
    const snapshot = await invoke<DecksSnapshot>("deck_load", { deck, url: item.url, start });
    if (snapshot) set({ snapshot });
  };

  const takeHead = (deck: number): DeckItem | undefined => {
    const queues = get().queues;
    const [head, ...rest] = queues[deck];
    if (!head) return undefined;
    const next: DeckQueues = [...queues];
    next[deck] = rest;
    setQueues(next);
    return head;
  };

  const fadeSeconds = () => usePlaybackStore.getState().transitionSettings.durationSeconds;

  const drive = async () => {
    const { snapshot, queues } = get();
    if (!snapshot || driving) return;
    const action = decideQueueAction(snapshot, queues);
    if (!action) return;
    driving = true;
    try {
      if (action.type === "crossfade") {
        await invoke("deck_crossfade", { seconds: fadeSeconds() });
      } else {
        const item = takeHead(action.deck);
        if (item) await load(action.deck, item, action.type === "playOwn");
      }
    } catch (error) {
      fail(error);
    } finally {
      driving = false;
    }
  };

  const onSnapshot = (snapshot: DecksSnapshot) => {
    const previous = get().snapshot;
    set({ snapshot });
    const nowPlaying = snapshot.decks.some(isPlaying);
    const wasPlaying = previous ? previous.decks.some(isPlaying) : false;
    if (nowPlaying && !wasPlaying) takeOver();
    void drive();
  };

  return {
    available: false,
    snapshot: null,
    error: null,
    source: "local",
    queues: loadQueues(),
    current: [null, null],
    history: [],
    search: { query: "", results: [], busy: false, error: null },
    extensions: null,

    init: async () => {
      try {
        const snapshot = await invoke<DecksSnapshot>("deck_status");
        if (!snapshot) return () => {};
        set({ available: true, snapshot });
      } catch {
        set({ available: false });
        return () => {};
      }
      const pushMaster = () => {
        const { volume, muted } = usePlaybackStore.getState().nowPlaying;
        void invoke("deck_set_master", { volume, muted }).catch(() => {});
      };
      pushMaster();
      const unsubscribePlayback = usePlaybackStore.subscribe((state, prev) => {
        if (state.nowPlaying.volume !== prev.nowPlaying.volume || state.nowPlaying.muted !== prev.nowPlaying.muted) {
          pushMaster();
        }
        // A local track started: Play's own engine takes back the transport.
        if (state.nowPlaying.state === "playing" && prev.nowPlaying.state !== "playing" && get().source === "decks") {
          set({ source: "local" });
          void invoke("deck_stop").catch(() => {});
        }
      });
      const stops = await Promise.all([
        listen<DecksSnapshot>("decks-changed", (event) => onSnapshot(event.payload)),
        listen<string>("deck-media-key", (event) => {
          const decks = get();
          if (decks.source !== "decks") return;
          const action = event.payload;
          if (action === "play" || action === "pause") void decks.togglePlay();
          else if (action === "nexttrack") void decks.next();
          else if (action === "previoustrack") void decks.previous();
          else if (action === "stop") void decks.stop();
        }),
      ]);
      return () => {
        unsubscribePlayback();
        stops.forEach((stop) => stop());
      };
    },

    run: async (command, args) => {
      set({ error: null });
      try {
        const result = await invoke<DecksSnapshot | void>(command, args);
        if (result) set({ snapshot: result });
      } catch (error) {
        fail(error);
      }
    },

    searchYoutube: async (query) => {
      const text = query.trim();
      if (!text) return;
      set({ search: { query: text, results: get().search.results, busy: true, error: null } });
      try {
        const results = await invoke<SearchResult[]>("deck_search", { query: text });
        set({ search: { query: text, results: results ?? [], busy: false, error: null } });
      } catch (error) {
        set({ search: { query: text, results: [], busy: false, error: String(error) } });
      }
    },

    loadExtensions: async () => {
      try {
        set({ extensions: (await invoke<ExtensionInfo[]>("deck_extensions")) ?? [] });
      } catch {
        set({ extensions: [] });
      }
    },

    playNow: async (deck, item) => {
      set({ error: null });
      takeOver();
      try {
        await load(deck, item, true);
        void drive();
      } catch (error) {
        fail(error);
      }
    },

    enqueue: (deck, item) => {
      const next: DeckQueues = [...get().queues];
      next[deck] = [...next[deck], item];
      setQueues(next);
      void drive();
    },

    removeQueued: (deck, key) => {
      const next: DeckQueues = [...get().queues];
      next[deck] = next[deck].filter((item) => item.key !== key);
      setQueues(next);
    },

    moveQueued: (deck, key, delta) => {
      const list = [...get().queues[deck]];
      const from = list.findIndex((item) => item.key === key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= list.length) return;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      const next: DeckQueues = [...get().queues];
      next[deck] = list;
      setQueues(next);
    },

    sendToOther: (deck, key) => {
      const queues = get().queues;
      const item = queues[deck].find((entry) => entry.key === key);
      if (!item) return;
      const next: DeckQueues = [...queues];
      next[deck] = queues[deck].filter((entry) => entry.key !== key);
      next[1 - deck] = [...queues[1 - deck], item];
      setQueues(next);
      void drive();
    },

    togglePlay: async () => {
      const { snapshot, queues } = get();
      if (!snapshot) return;
      set({ error: null });
      const a = snapshot.active;
      const active = snapshot.decks[a];
      try {
        if (active.loaded) {
          if (active.paused) takeOver();
          await invoke("deck_play_pause", { deck: a, playing: active.paused });
          return;
        }
        const deck = queues[a].length ? a : queues[1 - a].length ? 1 - a : -1;
        const item = deck >= 0 ? takeHead(deck) : undefined;
        if (item) {
          takeOver();
          await load(deck, item, true);
        }
      } catch (error) {
        fail(error);
      }
    },

    next: async () => {
      const { snapshot } = get();
      if (!snapshot) return;
      set({ error: null });
      const a = snapshot.active;
      const other = snapshot.decks[1 - a];
      try {
        takeOver();
        if (other.loaded && other.cued) {
          await invoke("deck_crossfade", { seconds: fadeSeconds() });
          return;
        }
        const deck = get().queues[a].length ? a : get().queues[1 - a].length ? 1 - a : -1;
        const item = deck >= 0 ? takeHead(deck) : undefined;
        if (item) await load(deck, item, true);
        else set({ error: "decks.queueEmpty" });
      } catch (error) {
        fail(error);
      }
    },

    previous: async () => {
      const { snapshot, history, current, queues } = get();
      if (!snapshot) return;
      const a = snapshot.active;
      try {
        if (snapshot.decks[a].time > RESTART_THRESHOLD_SECONDS || !history.length) {
          await invoke("deck_seek", { time: 0 });
          return;
        }
        const previousItem = history[history.length - 1];
        const replaced = current[a];
        const nextQueues: DeckQueues = [...queues];
        if (replaced) nextQueues[a] = [replaced, ...queues[a]];
        setQueues(nextQueues);
        const nextCurrent: [DeckItem | null, DeckItem | null] = [...current];
        nextCurrent[a] = previousItem;
        set({ history: history.slice(0, -1), current: nextCurrent });
        takeOver();
        const result = await invoke<DecksSnapshot>("deck_load", { deck: a, url: previousItem.url, start: true });
        if (result) set({ snapshot: result });
      } catch (error) {
        fail(error);
      }
    },

    stop: async () => {
      try {
        await invoke("deck_stop");
      } catch (error) {
        fail(error);
      }
    },

    seek: async (time) => {
      try {
        await invoke("deck_seek", { time });
      } catch (error) {
        fail(error);
      }
    },
  };
});

/** What Play's transport bar shows while the decks own playback, or null. */
export interface DeckTransportView {
  title: string;
  subtitle: string;
  playing: boolean;
  time: number;
  duration: number;
}

export function deckTransportView(state: Pick<DecksStore, "available" | "source" | "snapshot" | "current">): DeckTransportView | null {
  const { available, source, snapshot, current } = state;
  if (!available || source !== "decks" || !snapshot) return null;
  const a = snapshot.active;
  const deck = snapshot.decks[a];
  const item = current[a];
  return {
    title: deck.title || item?.title || "YouTube",
    subtitle: [`YouTube · Deck ${deckName(a)}`, item?.channel].filter(Boolean).join(" · "),
    playing: isPlaying(deck),
    time: deck.time,
    duration: deck.duration,
  };
}

export function useDeckTransportView(): DeckTransportView | null {
  const available = useYoutubeDecks((state) => state.available);
  const source = useYoutubeDecks((state) => state.source);
  const snapshot = useYoutubeDecks((state) => state.snapshot);
  const current = useYoutubeDecks((state) => state.current);
  return deckTransportView({ available, source, snapshot, current });
}

export const deckName = (deck: number) => (deck === 0 ? "A" : "B");

export function formatDeckTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
