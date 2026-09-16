// @req FR-16.1 — Playback from Library/Workspace
// @req FR-16.6 — Play / Play Next / Add to queue
// @req FR-16.11 — Player survives route/window changes
// @req FR-16W.6 — Playback continues when minimized or secondary surface closed

import type { MediaItem } from "@lalin/contracts";

export interface PlaybackBridgeMessage {
  type: "PLAY" | "PLAY_NEXT" | "ADD_TO_QUEUE" | "FOCUS_PLAYER";
  item?: MediaItem;
}

const PLAYBACK_CHANNEL_NAME = "lalin:playback:bridge";

/**
 * Checks if the current application is running inside the Tauri native runtime.
 */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/**
 * Opens or focuses the dedicated Lalin Play secondary window.
 */
export async function openOrFocusPlayWindow(): Promise<boolean> {
  if (isTauri()) {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      let win = await WebviewWindow.getByLabel("play");
      if (!win) {
        win = new WebviewWindow("play", {
          title: "Lalin Play",
          url: "/?surface=play",
          width: 960,
          height: 640,
          minWidth: 720,
          minHeight: 480,
        });
      } else {
        await win.show();
        await win.unminimize();
        await win.setFocus();
      }
      return true;
    } catch (err) {
      console.warn("[windowManager] Failed to launch Tauri Play window:", err);
    }
  }

  // Web / Browser fallback: open popup window
  if (typeof window !== "undefined") {
    const playUrl = `${window.location.origin}${window.location.pathname}?surface=play`;
    const popup = window.open(
      playUrl,
      "LalinPlay",
      "width=960,height=640,menubar=no,toolbar=no,location=no,status=no,resizable=yes"
    );
    if (popup) {
      popup.focus();
      return true;
    }
  }

  return false;
}

/**
 * Minimizes the current window if running in Tauri.
 */
export async function minimizeCurrentWindow(): Promise<void> {
  if (isTauri()) {
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      await getCurrentWebviewWindow().minimize();
    } catch {}
  }
}

/**
 * Toggles maximize / unmaximize of the current window if running in Tauri.
 */
export async function toggleMaximizeCurrentWindow(): Promise<void> {
  if (isTauri()) {
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const current = getCurrentWebviewWindow();
      const isMax = await current.isMaximized();
      if (isMax) {
        await current.unmaximize();
      } else {
        await current.maximize();
      }
    } catch {}
  }
}

/**
 * Hides or closes the current secondary window without quitting the application.
 */
export async function hideOrCloseCurrentWindow(): Promise<void> {
  if (isTauri()) {
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const current = getCurrentWebviewWindow();
      if (current.label === "play") {
        // Hide so playback continues smoothly in background (FR-16W.6)
        await current.hide();
      } else {
        await current.close();
      }
    } catch {}
  } else if (typeof window !== "undefined") {
    window.close();
  }
}

/**
 * Dispatches a playback command across windows via BroadcastChannel.
 */
export function dispatchPlaybackBridgeMessage(msg: PlaybackBridgeMessage): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(PLAYBACK_CHANNEL_NAME);
    channel.postMessage(msg);
    channel.close();
  } catch (err) {
    console.warn("[windowManager] Failed to dispatch playback bridge message:", err);
  }
}

/**
 * Listens for cross-window playback bridge messages.
 * Returns an unbind cleanup function.
 */
export function listenPlaybackBridgeMessages(
  handler: (msg: PlaybackBridgeMessage) => void
): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  const channel = new BroadcastChannel(PLAYBACK_CHANNEL_NAME);
  channel.onmessage = (event) => {
    if (event.data && typeof event.data === "object" && event.data.type) {
      handler(event.data as PlaybackBridgeMessage);
    }
  };
  return () => {
    channel.close();
  };
}
