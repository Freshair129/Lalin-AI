import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { App } from "./App";
import { STORAGE_LOCALE_KEY } from "./i18n";
import { STORAGE_APPEARANCE_KEY, loadAppearance, resolveTheme } from "./appearance";
import { STORAGE_TRANSITION_SETTINGS_KEY, usePlaybackStore } from "./playback/usePlaybackStore";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

function stubSystemLight(light: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("light") ? light : !light,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  localStorage.clear();
  localStorage.setItem(STORAGE_LOCALE_KEY, "en");
  delete document.documentElement.dataset.theme;
  stubSystemLight(false);
  vi.mocked(listen).mockResolvedValue(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "get_library") return { version: 1, tracks: [] };
    if (command === "list_damaged_tracks" || command === "list_youtube_links") return [];
    return undefined;
  });
  usePlaybackStore.getState().setTransitionSettings({ mode: "off", durationSeconds: 5 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("appearance preference", () => {
  it("resolves System from the OS and falls back to System for unknown stored values", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
    localStorage.setItem(STORAGE_APPEARANCE_KEY, "sepia");
    expect(loadAppearance()).toBe("system");
  });

  it("switches System / Light / Dark from Settings and persists the choice", async () => {
    stubSystemLight(true);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    const group = screen.getByRole("radiogroup", { name: "Appearance" });
    expect(screen.getByRole("radio", { name: "System" }).getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.dataset.theme).toBe("light");

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(STORAGE_APPEARANCE_KEY)).toBe("dark");

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("radio", { name: "Light" }).getAttribute("aria-checked")).toBe("true");
    expect(group).toBeTruthy();
  });
});

describe("crossfade quick control", () => {
  it("turns the smooth crossfade on and off from the player bar and adjusts its length", async () => {
    render(<App />);
    const toggle = await screen.findByRole("button", { name: "Crossfade between tracks" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("slider", { name: "Crossfade length" })).toBeNull();

    fireEvent.click(toggle);
    expect(usePlaybackStore.getState().transitionSettings.mode).toBe("smooth");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(screen.getByRole("slider", { name: "Crossfade length" }), { target: { value: "8" } });
    expect(usePlaybackStore.getState().transitionSettings).toEqual({ mode: "smooth", durationSeconds: 8 });
    expect(JSON.parse(localStorage.getItem(STORAGE_TRANSITION_SETTINGS_KEY)!)).toEqual({ mode: "smooth", durationSeconds: 8 });
    expect(screen.getByText("8s")).toBeTruthy();

    fireEvent.click(toggle);
    expect(usePlaybackStore.getState().transitionSettings).toEqual({ mode: "off", durationSeconds: 8 });
  });

  it("shows Manual mode as on without the length slider", async () => {
    usePlaybackStore.getState().setTransitionSettings({ mode: "manual", durationSeconds: 5 });
    render(<App />);
    const toggle = await screen.findByRole("button", { name: "Crossfade between tracks" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("slider", { name: "Crossfade length" })).toBeNull();
  });
});
