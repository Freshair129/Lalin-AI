import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
// @ts-expect-error Node typings are not part of the frontend project.
import { readFileSync } from "node:fs";
import { App } from "./App";
import { STORAGE_LOCALE_KEY } from "./i18n";
import { PlaybackAudioEngine } from "./playback/audioEngine";
import { usePlaybackStore } from "./playback/usePlaybackStore";
import { STORAGE_EQ_OUTPUT_KEY, SYSTEM_EQ_DEBOUNCE_MS, curveFromEQ, useSystemEq, type SystemEqStatus } from "./systemEq";
import { parseYoutubeUrl, youtubeEmbedUrl } from "./youtubeEmbed";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

const READY: SystemEqStatus = { installed: true, configDir: "C:\\APO\\config", linked: true, writable: true };
const UNLINKED: SystemEqStatus = { installed: true, configDir: "C:\\APO\\config", linked: false, writable: false };
const MISSING: SystemEqStatus = { installed: false, configDir: null, linked: false, writable: false };

let apoStatus: SystemEqStatus;
let youtubeLinks: { id: string; url: string; title: string; addedAt: number }[];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  localStorage.clear();
  localStorage.setItem(STORAGE_LOCALE_KEY, "en");
  apoStatus = MISSING;
  youtubeLinks = [];
  useSystemEq.setState({ output: "app", status: null, busy: false, error: null });
  PlaybackAudioEngine.getInstance().setExternalEQ(false);
  vi.mocked(listen).mockResolvedValue(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "get_library") return { version: 1, tracks: [] };
    if (command === "list_damaged_tracks") return [];
    if (command === "list_youtube_links") return youtubeLinks;
    if (command === "get_system_eq_status") return apoStatus;
    if (command === "setup_system_eq") {
      apoStatus = READY;
      return READY;
    }
    if (command === "remove_system_eq") {
      apoStatus = UNLINKED;
      return UNLINKED;
    }
    return undefined;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const applyCalls = () => vi.mocked(invoke).mock.calls.filter(([command]) => command === "apply_system_eq");

describe("youtube embed urls", () => {
  it("accepts official video, short, music and playlist links", () => {
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=M7lc1UVf-VE")).toBe(
      "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?rel=0&playsinline=1&autoplay=1",
    );
    expect(parseYoutubeUrl("https://youtu.be/M7lc1UVf-VE")).toEqual({ videoId: "M7lc1UVf-VE", listId: null });
    expect(parseYoutubeUrl("https://www.youtube.com/shorts/M7lc1UVf-VE")?.videoId).toBe("M7lc1UVf-VE");
    expect(parseYoutubeUrl("https://music.youtube.com/watch?v=M7lc1UVf-VE&list=PL123abc")).toEqual({
      videoId: "M7lc1UVf-VE",
      listId: "PL123abc",
    });
    expect(youtubeEmbedUrl("https://www.youtube.com/playlist?list=PL123abc")).toBe(
      "https://www.youtube-nocookie.com/embed/videoseries?rel=0&playsinline=1&autoplay=1&list=PL123abc",
    );
  });

  it("rejects look-alike hosts, bad ids and non-video pages", () => {
    for (const url of [
      "http://www.youtube.com/watch?v=M7lc1UVf-VE",
      "https://youtube.com.evil.test/watch?v=M7lc1UVf-VE",
      "https://user@youtube.com/watch?v=M7lc1UVf-VE",
      "https://youtube.com:443/watch?v=M7lc1UVf-VE",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch?v=M7lc1UVf-VE%22onload",
      "https://www.youtube.com/redirect?q=https://evil.test",
      "https://www.youtube.com/@channel",
      "not a url",
    ]) {
      expect(youtubeEmbedUrl(url), url).toBeNull();
    }
  });

  it("allows only the YouTube embed origins as frames in the app CSP", () => {
    const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    const frameSrc = (conf.app.security.csp as string).split(";").map((part) => part.trim()).find((part) => part.startsWith("frame-src"));
    expect(frameSrc).toBe("frame-src https://www.youtube-nocookie.com https://www.youtube.com");
  });
});

describe("youtube Play here", () => {
  it("embeds the official player, pauses local playback, and unloads on close", async () => {
    youtubeLinks = [
      { id: "youtube:a", url: "https://www.youtube.com/watch?v=M7lc1UVf-VE", title: "Demo", addedAt: 1 },
      { id: "youtube:b", url: "https://www.youtube.com/@channel", title: "Channel", addedAt: 2 },
    ];
    const pause = vi.spyOn(usePlaybackStore.getState(), "pause");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "YouTube links" }));
    await screen.findByText("Demo");
    expect(screen.queryByRole("button", { name: "Play here Channel" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Play here Demo" }));
    const frame = screen.getByTitle("YouTube player: Demo") as HTMLIFrameElement;
    expect(frame.src).toBe("https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?rel=0&playsinline=1&autoplay=1");
    expect(frame.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(pause).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close player" }));
    expect(screen.queryByTitle("YouTube player: Demo")).toBeNull();
  });
});

describe("system EQ output", () => {
  it("explains how to install Equalizer APO when it is missing and keeps the in-app EQ", async () => {
    await useSystemEq.getState().selectOutput("system");
    expect(useSystemEq.getState().output).toBe("app");
    expect(useSystemEq.getState().error).toBe("not-installed");
    expect(PlaybackAudioEngine.getInstance().isExternalEQ()).toBe(false);
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith("setup_system_eq");
  });

  it("sets up APO once, flattens the in-app EQ, and syncs edits with a debounce", async () => {
    apoStatus = UNLINKED;
    render(<App />);
    await useSystemEq.getState().selectOutput("system");
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("setup_system_eq");
    expect(useSystemEq.getState().output).toBe("system");
    expect(localStorage.getItem(STORAGE_EQ_OUTPUT_KEY)).toBe("system");
    expect(PlaybackAudioEngine.getInstance().isExternalEQ()).toBe(true);
    expect(applyCalls()).toHaveLength(1);

    vi.useFakeTimers();
    usePlaybackStore.getState().setBandGain(0, 4);
    usePlaybackStore.getState().setBandGain(1, 3);
    expect(applyCalls()).toHaveLength(1);
    vi.advanceTimersByTime(SYSTEM_EQ_DEBOUNCE_MS);
    expect(applyCalls()).toHaveLength(2);
    expect(applyCalls()[1][1]).toEqual({ curve: curveFromEQ(usePlaybackStore.getState().eq) });
    vi.useRealTimers();

    await useSystemEq.getState().selectOutput("app");
    expect(PlaybackAudioEngine.getInstance().isExternalEQ()).toBe(false);
    const calls = applyCalls();
    expect(calls[calls.length - 1][1]).toEqual({ curve: { enabled: false, preamp: 0, gains: [] } });
  });

  it("shows the output picker in the EQ panel and removes Play from APO", async () => {
    apoStatus = READY;
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /^EQ$|Equalizer/ }));
    const system = await screen.findByRole("radio", { name: "Whole system (Equalizer APO)" });
    fireEvent.click(system);
    await waitFor(() => expect(system.getAttribute("aria-checked")).toBe("true"));
    expect(screen.getByText(/applies to every app/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove from Equalizer APO" }));
    await waitFor(() => expect(useSystemEq.getState().output).toBe("app"));
    expect(PlaybackAudioEngine.getInstance().isExternalEQ()).toBe(false);
  });
});
