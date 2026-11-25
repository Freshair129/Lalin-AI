// CR-011: YouTube search in Play, per-deck queues, and the transport bar driving the decks.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { App } from "./App";
import { STORAGE_LOCALE_KEY } from "./i18n";
import { usePlaybackStore } from "./playback/usePlaybackStore";
import {
  QUEUES_STORAGE_KEY,
  decideQueueAction,
  deckTransportView,
  itemFromSearch,
  useYoutubeDecks,
  type DeckInfo,
  type DeckQueues,
  type DecksSnapshot,
} from "./youtubeDecks";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

const deck = (over: Partial<DeckInfo> = {}): DeckInfo => ({
  loaded: false, title: "", time: 0, duration: 0, paused: true, volume: 1, ad: false, cued: false, ended: false, ...over,
});
const snap = (decks: [DeckInfo, DeckInfo], over: Partial<DecksSnapshot> = {}): DecksSnapshot => ({
  open: true, decks, active: 0, auto: false, fadeSeconds: 5, fading: false, mix: 0, extensionsDir: "C:\\ext", ...over,
});
const item = (title: string) => itemFromSearch({ videoId: "AClzgPv6tmk", title, channel: "GTK", duration: "4:02" });
const RESULTS = [
  { videoId: "AClzgPv6tmk", title: "Leela", channel: "GTK", duration: "4:02" },
  { videoId: "bzd1E2VahTo", title: "Thammada", channel: "ILLSLICK", duration: "2:48" },
];

describe("decideQueueAction", () => {
  const playingA = deck({ loaded: true, paused: false, time: 30, duration: 200 });
  const queues = (a: string[], b: string[]): DeckQueues => [a.map(item), b.map(item)];

  it("cues the other deck's next item while the active deck plays", () => {
    expect(decideQueueAction(snap([playingA, deck()]), queues([], ["x"]))).toEqual({ type: "cue", deck: 1 });
    expect(decideQueueAction(snap([playingA, deck({ loaded: true, paused: true })]), queues([], ["x"]))).toEqual({ type: "cue", deck: 1 });
  });

  it("does nothing when the other deck is already cued, playing, or its queue is empty", () => {
    expect(decideQueueAction(snap([playingA, deck({ loaded: true, paused: true, cued: true })]), queues([], ["x"]))).toBeNull();
    expect(decideQueueAction(snap([playingA, deck({ loaded: true, paused: false })]), queues([], ["x"]))).toBeNull();
    expect(decideQueueAction(snap([playingA, deck()]), queues(["own"], []))).toBeNull();
    expect(decideQueueAction(snap([playingA, deck()], { fading: true }), queues([], ["x"]))).toBeNull();
  });

  it("at the end plays the deck's own queue first, else fades into a cued other deck", () => {
    const ended = deck({ loaded: true, paused: true, ended: true, time: 200, duration: 200 });
    const cued = deck({ loaded: true, paused: true, cued: true });
    expect(decideQueueAction(snap([ended, cued]), queues(["own"], []))).toEqual({ type: "playOwn", deck: 0 });
    expect(decideQueueAction(snap([ended, cued]), queues([], []))).toEqual({ type: "crossfade" });
    expect(decideQueueAction(snap([ended, deck()]), queues([], []))).toBeNull();
  });
});

describe("deckTransportView", () => {
  it("shows the active deck only while the decks own playback", () => {
    const snapshot = snap([deck(), deck({ loaded: true, paused: false, title: "Leela", time: 12, duration: 242 })], { active: 1 });
    const current: [null, ReturnType<typeof item>] = [null, item("Leela")];
    expect(deckTransportView({ available: true, source: "local", snapshot, current })).toBeNull();
    expect(deckTransportView({ available: true, source: "decks", snapshot, current })).toEqual({
      title: "Leela", subtitle: "YouTube · Deck B · GTK", playing: true, time: 12, duration: 242,
    });
  });
});

describe("Play-side YouTube search and deck transport (CR-011)", () => {
  let snapshot: DecksSnapshot;
  let listeners: Record<string, (event: { payload: unknown }) => void>;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
    localStorage.clear();
    localStorage.setItem(STORAGE_LOCALE_KEY, "en");
    useYoutubeDecks.setState({
      available: false, snapshot: null, error: null, source: "local", queues: [[], []], current: [null, null], history: [],
      extensions: null, search: { query: "", results: [], busy: false, error: null },
    });
    snapshot = snap([deck(), deck()]);
    listeners = {};
    vi.mocked(listen).mockImplementation(async (name, handler) => {
      listeners[name as string] = handler as (event: { payload: unknown }) => void;
      return () => {};
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "get_library") return { version: 1, tracks: [] };
      if (command === "list_damaged_tracks") return [];
      if (command === "list_youtube_links") return [];
      if (command === "get_system_eq_status") return { installed: false, configDir: null, linked: false, writable: false };
      if (command === "deck_status") return snapshot;
      if (command === "deck_extensions") return [{ folder: "adblocker", name: "AdBlocker for YouTube™", version: "0.5.4" }];
      if (command === "deck_search") return RESULTS;
      if (command === "deck_load") {
        const { deck: index, start } = args as { deck: number; start: boolean };
        const decks: [DeckInfo, DeckInfo] = [...snapshot.decks];
        decks[index] = deck({ loaded: true, paused: !start, cued: !start });
        snapshot = { ...snapshot, decks, active: start ? index : snapshot.active };
        return snapshot;
      }
      return undefined;
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const push = (next: DecksSnapshot) =>
    act(() => {
      snapshot = next;
      listeners["decks-changed"]?.({ payload: next });
    });

  async function openYoutube() {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "YouTube links" }));
    return screen.findByRole("region", { name: "Search YouTube" });
  }

  it("searches YouTube, plays a result on a deck and queues another on the chosen deck", async () => {
    const region = await openYoutube();
    fireEvent.change(within(region).getByRole("searchbox", { name: "Search YouTube songs" }), { target: { value: "lalil" } });
    fireEvent.click(within(region).getByRole("button", { name: "Search" }));
    await within(region).findByText("Leela");
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_search", { query: "lalil" });

    fireEvent.click(within(region).getByRole("button", { name: "Add to queue of deck B Thammada" }));
    expect(within(screen.getByRole("list", { name: "Queue B" })).getByText("Thammada")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(QUEUES_STORAGE_KEY) ?? "{}").queues[1][0].title).toBe("Thammada");

    // Deck A plays now; the song queued for B is cued on deck B, ready for the fade.
    fireEvent.click(within(region).getByRole("button", { name: "Play on deck A Leela" }));
    await waitFor(() =>
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_load", { deck: 0, url: "https://www.youtube.com/watch?v=AClzgPv6tmk", start: true }),
    );
    await waitFor(() =>
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_load", { deck: 1, url: "https://www.youtube.com/watch?v=bzd1E2VahTo", start: false }),
    );
    expect(within(screen.getByRole("list", { name: "Queue B" })).getByText("Queue is empty")).toBeTruthy();
  });

  it("drives the decks from the transport bar and applies Play's volume", async () => {
    await openYoutube();
    await push(snap([deck({ loaded: true, paused: false, title: "Leela", time: 61, duration: 242 }), deck({ loaded: true, paused: true, cued: true })]));
    const bar = screen.getByRole("contentinfo", { name: "Playback controls" });
    expect(within(bar).getByText("Leela")).toBeTruthy();
    expect(within(bar).getByTestId("position").textContent).toBe("1:01");

    vi.mocked(invoke).mockClear();
    fireEvent.click(within(bar).getByRole("button", { name: "Pause" }));
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_play_pause", { deck: 0, playing: false });

    fireEvent.click(within(bar).getByRole("button", { name: "Next track" }));
    await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_crossfade", { seconds: expect.any(Number) }));

    fireEvent.change(within(bar).getByRole("slider", { name: "Playback position" }), { target: { value: "120" } });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_seek", { time: 120 });

    fireEvent.click(within(bar).getByRole("button", { name: "Stop" }));
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_stop");

    fireEvent.change(within(bar).getByRole("slider", { name: "Volume" }), { target: { value: "0.5" } });
    await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_set_master", { volume: 0.5, muted: false }));
  });

  it("hands the transport back to Play when a local track starts", async () => {
    await openYoutube();
    await push(snap([deck({ loaded: true, paused: false, title: "Leela" }), deck()]));
    expect(useYoutubeDecks.getState().source).toBe("decks");
    act(() => {
      const state = usePlaybackStore.getState();
      usePlaybackStore.setState({ nowPlaying: { ...state.nowPlaying, state: "playing" } });
    });
    expect(useYoutubeDecks.getState().source).toBe("local");
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_stop");
  });

  it("lists the extensions found in the deck extensions folder", async () => {
    await openYoutube();
    expect(await screen.findByText("AdBlocker for YouTube™ 0.5.4")).toBeTruthy();
  });

  it("routes deck-page media keys to the decks", async () => {
    await openYoutube();
    await push(snap([deck({ loaded: true, paused: false, title: "Leela" }), deck()]));
    vi.mocked(invoke).mockClear();
    act(() => listeners["deck-media-key"]?.({ payload: "pause" }));
    await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_play_pause", { deck: 0, playing: false }));
  });
});
