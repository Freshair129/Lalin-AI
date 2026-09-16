import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isTauri,
  dispatchPlaybackBridgeMessage,
  listenPlaybackBridgeMessages,
  openOrFocusPlayWindow,
  minimizeCurrentWindow,
  toggleMaximizeCurrentWindow,
  hideOrCloseCurrentWindow,
} from "./windowManager";
import type { MediaItem } from "@lalin/contracts";

describe("windowManager & Playback Bridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it("identifies non-Tauri environment safely", () => {
    expect(isTauri()).toBe(false);
  });

  it("identifies Tauri environment when __TAURI_INTERNALS__ is defined", () => {
    (window as any).__TAURI_INTERNALS__ = {};
    expect(isTauri()).toBe(true);
  });

  it("handles window actions safely in browser fallback without throwing", async () => {
    // In node/jsdom without window.open, returns false or opens popup
    const res = await openOrFocusPlayWindow();
    expect(typeof res).toBe("boolean");
    await expect(minimizeCurrentWindow()).resolves.toBeUndefined();
    await expect(toggleMaximizeCurrentWindow()).resolves.toBeUndefined();
    await expect(hideOrCloseCurrentWindow()).resolves.toBeUndefined();
  });

  it("dispatches and receives messages across playback bridge via BroadcastChannel", async () => {
    const testItem: MediaItem = {
      id: "track-123",
      title: "Test Song",
      artist: "Test Artist",
      url: "http://localhost:8756/test.mp3",
      sourceKind: "workspace",
      sourcePath: "test.mp3",
      ext: "mp3",
    };

    const received: any[] = [];
    const unsubscribe = listenPlaybackBridgeMessages((msg) => {
      received.push(msg);
    });

    dispatchPlaybackBridgeMessage({ type: "PLAY", item: testItem });
    dispatchPlaybackBridgeMessage({ type: "PLAY_NEXT", item: testItem });
    dispatchPlaybackBridgeMessage({ type: "FOCUS_PLAYER" });

    // BroadcastChannel dispatch is synchronous/microtask in Node/jsdom
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received.length).toBe(3);
    expect(received[0]).toEqual({ type: "PLAY", item: testItem });
    expect(received[1]).toEqual({ type: "PLAY_NEXT", item: testItem });
    expect(received[2]).toEqual({ type: "FOCUS_PLAYER" });

    unsubscribe();

    // After unsubscribe, messages should no longer be handled by this listener
    dispatchPlaybackBridgeMessage({ type: "ADD_TO_QUEUE", item: testItem });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received.length).toBe(3);
  });
});
