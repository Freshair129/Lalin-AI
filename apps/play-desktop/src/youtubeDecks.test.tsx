import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { App } from "./App";
import { STORAGE_LOCALE_KEY } from "./i18n";
import { useYoutubeDecks, type DecksSnapshot } from "./youtubeDecks";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

const deck = (over: Partial<DecksSnapshot["decks"][0]> = {}) => ({
  loaded: false, title: "", time: 0, duration: 0, paused: true, volume: 1, ad: false, ...over,
});
const SNAPSHOT: DecksSnapshot = {
  open: true,
  decks: [deck({ loaded: true, title: "I KNOW", time: 61, duration: 180, paused: false }), deck({ loaded: true, title: "Fade Away" })],
  active: 0,
  auto: false,
  fadeSeconds: 5,
  fading: false,
  mix: 0,
  extensionsDir: "C:\Play\personal-youtube\extensions",
};
const LINKS = [{ id: "youtube:a", url: "https://youtu.be/-fMEMCLuY7M?si=x", title: "I KNOW", addedAt: 1 }];

let personalBuild: boolean;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  localStorage.clear();
  localStorage.setItem(STORAGE_LOCALE_KEY, "en");
  useYoutubeDecks.setState({ available: false, snapshot: null, error: null });
  personalBuild = true;
  vi.mocked(listen).mockResolvedValue(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "get_library") return { version: 1, tracks: [] };
    if (command === "list_damaged_tracks") return [];
    if (command === "list_youtube_links") return LINKS;
    if (command === "get_system_eq_status") return { installed: false, configDir: null, linked: false, writable: false };
    if (command === "deck_status") {
      if (!personalBuild) throw new Error("command deck_status not found");
      return SNAPSHOT;
    }
    if (command === "deck_load") return SNAPSHOT;
    return undefined;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openYoutubeView() {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "YouTube links" }));
  await screen.findByText("Play here", { exact: false }).catch(() => undefined);
}

describe("YouTube decks (CR-010 personal build)", () => {
  it("stays hidden in a normal build where the deck commands do not exist", async () => {
    personalBuild = false;
    await openYoutubeView();
    await screen.findAllByText("I KNOW");
    expect(screen.queryByRole("region", { name: "YouTube Decks" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deck A I KNOW" })).toBeNull();
  });

  it("loads a link into a deck, crossfades, toggles auto and moves the crossfader", async () => {
    await openYoutubeView();
    await screen.findByRole("region", { name: "YouTube Decks" });
    expect(screen.getByText("1:01 / 3:00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Deck B I KNOW" }));
    await waitFor(() =>
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_load", { deck: 1, url: "https://youtu.be/-fMEMCLuY7M?si=x" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Fade to B/ }));
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_crossfade", { seconds: expect.any(Number) });

    fireEvent.click(screen.getByRole("checkbox", { name: "Auto crossfade near the end" }));
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_set_auto", { enabled: true, fadeSeconds: expect.any(Number) });

    fireEvent.change(screen.getByRole("slider", { name: "Crossfader A to B" }), { target: { value: "0.4" } });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("deck_set_mix", { mix: 0.4 });
  });
});
