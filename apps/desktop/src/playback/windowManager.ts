// @req FR-16.1 — Playback from Library/Workspace
// @req FR-16.11 — Playback survives route/window changes
// @req FR-16W.6 — Playback continues when minimized or the Play surface is hidden

import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const PLAY_WINDOW_LABEL = "play";
const BROWSER_POPUP_NAME = "LalinPlay";
const BROWSER_POPUP_FEATURES =
  "width=960,height=640,menubar=no,toolbar=no,location=no,status=no,resizable=yes";
const MISSING_PLAY_WINDOW_MESSAGE =
  "ไม่พบหน้าต่าง native Lalin Play (label: play) กรุณาปิดแล้วเปิดแอปใหม่อีกครั้ง";

let browserPlayPopup: Window | null = null;

/**
 * Checks if the current application is running inside the Tauri native runtime.
 */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

function errorDetail(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return "";
}

function nativeOperationError(operation: string, error: unknown): Error {
  const detail = errorDetail(error);
  const suffix = detail ? ` รายละเอียด: ${detail}` : "";
  return new Error(
    `ไม่สามารถ${operation}หน้าต่าง Lalin Play ได้ กรุณาปิดแล้วเปิดแอปใหม่อีกครั้ง${suffix}`
  );
}

async function getCurrentNativeWindow(): Promise<WebviewWindow> {
  const { getCurrentWebviewWindow } = await import(
    "@tauri-apps/api/webviewWindow"
  );
  return getCurrentWebviewWindow();
}

async function runOnCurrentPlayWindow(
  operation: string,
  action: (current: WebviewWindow) => Promise<void>
): Promise<void> {
  try {
    const current = await getCurrentNativeWindow();
    if (current.label !== PLAY_WINDOW_LABEL) {
      return;
    }
    await action(current);
  } catch (error) {
    throw nativeOperationError(operation, error);
  }
}

function isLiveBrowserPopup(popup: Window | null): popup is Window {
  if (!popup) {
    return false;
  }
  try {
    return !popup.closed;
  } catch {
    return false;
  }
}

function focusBrowserPopup(popup: Window): boolean {
  try {
    popup.focus();
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens or focuses the predeclared native Lalin Play window, or a browser
 * popup when running outside Tauri.
 */
export async function openOrFocusPlayWindow(): Promise<boolean> {
  // Keep this branch synchronous through window.open so a browser user gesture
  // is still active when the popup is created.
  if (!isTauri()) {
    if (isLiveBrowserPopup(browserPlayPopup)) {
      return focusBrowserPopup(browserPlayPopup);
    }

    browserPlayPopup = null;
    if (typeof window === "undefined" || typeof window.open !== "function") {
      return false;
    }

    const playUrl = `${window.location.origin}${window.location.pathname}?surface=play`;
    const popup = window.open(
      playUrl,
      BROWSER_POPUP_NAME,
      BROWSER_POPUP_FEATURES
    );
    if (!popup) {
      return false;
    }
    if (!focusBrowserPopup(popup)) {
      return false;
    }
    browserPlayPopup = popup;
    return true;
  }

  try {
    const { WebviewWindow } = await import(
      "@tauri-apps/api/webviewWindow"
    );
    const playWindow = await WebviewWindow.getByLabel(PLAY_WINDOW_LABEL);
    if (!playWindow || playWindow.label !== PLAY_WINDOW_LABEL) {
      throw new Error(MISSING_PLAY_WINDOW_MESSAGE);
    }
    await playWindow.show();
    await playWindow.unminimize();
    await playWindow.setFocus();
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === MISSING_PLAY_WINDOW_MESSAGE) {
      throw error;
    }
    throw nativeOperationError("เปิด", error);
  }
}

/**
 * Minimizes the current native Play window. Other native callers are ignored.
 */
export async function minimizeCurrentWindow(): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await runOnCurrentPlayWindow("ย่อ", (current) => current.minimize());
}

/**
 * Toggles maximize state for the current native Play window. Other native
 * callers are ignored.
 */
export async function toggleMaximizeCurrentWindow(): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await runOnCurrentPlayWindow("เปลี่ยนขนาด", async (current) => {
    if (await current.isMaximized()) {
      await current.unmaximize();
    } else {
      await current.maximize();
    }
  });
}

const BROWSER_FULLSCREEN_UNAVAILABLE_MESSAGE =
  "เบราว์เซอร์นี้ไม่รองรับโหมดเต็มหน้าจอ แต่ยังใช้ TV Mode ได้ในหน้าต่างปัจจุบัน";

async function getBrowserFullscreenState(): Promise<boolean> {
  return typeof document !== "undefined" && Boolean(document.fullscreenElement);
}

async function setBrowserFullscreen(fullscreen: boolean): Promise<boolean> {
  if (typeof document === "undefined") return false;
  if (fullscreen) {
    if (document.fullscreenElement) return true;
    const request = document.documentElement.requestFullscreen;
    if (typeof request !== "function") {
      throw new Error(BROWSER_FULLSCREEN_UNAVAILABLE_MESSAGE);
    }
    await request.call(document.documentElement);
  } else if (document.fullscreenElement) {
    const exit = document.exitFullscreen;
    if (typeof exit !== "function") {
      throw new Error(BROWSER_FULLSCREEN_UNAVAILABLE_MESSAGE);
    }
    await exit.call(document);
  }
  return Boolean(document.fullscreenElement);
}

/** Reads fullscreen state for the current Play surface only. */
export async function isCurrentPlayWindowFullscreen(): Promise<boolean> {
  if (!isTauri()) return getBrowserFullscreenState();
  try {
    const current = await getCurrentNativeWindow();
    if (current.label !== PLAY_WINDOW_LABEL) return false;
    return await current.isFullscreen();
  } catch (error) {
    throw nativeOperationError("ตรวจสอบโหมดเต็มหน้าจอ", error);
  }
}

/** Changes fullscreen state for the current Play surface only. */
export async function setCurrentPlayWindowFullscreen(
  fullscreen: boolean,
): Promise<boolean> {
  if (!isTauri()) return setBrowserFullscreen(fullscreen);
  try {
    const current = await getCurrentNativeWindow();
    if (current.label !== PLAY_WINDOW_LABEL) return false;
    await current.setFullscreen(fullscreen);
    return await current.isFullscreen();
  } catch (error) {
    throw nativeOperationError("เปลี่ยนโหมดเต็มหน้าจอ", error);
  }
}

/**
 * Hides the native Play window while playback continues. In a browser the
 * current popup is closed because there is no native hide operation.
 */
export async function hideOrCloseCurrentWindow(): Promise<void> {
  if (!isTauri()) {
    if (typeof window !== "undefined") {
      window.close();
    }
    return;
  }
  await runOnCurrentPlayWindow("ซ่อน", (current) => current.hide());
}

/**
 * Prevents the native Play window from being destroyed by a close request.
 * The returned cleanup is idempotent so StrictMode teardown cannot unlisten
 * the same native listener twice. The caller owns async setup/teardown races.
 */
export async function bindPlayWindowClose(
  onError: (message: string) => void
): Promise<() => void> {
  if (!isTauri()) {
    return () => {};
  }

  try {
    const current = await getCurrentNativeWindow();
    if (current.label !== PLAY_WINDOW_LABEL) {
      return () => {};
    }

    const unlisten = await current.onCloseRequested(async (event) => {
      event.preventDefault();
      try {
        await current.hide();
      } catch (error) {
        onError(nativeOperationError("ซ่อน", error).message);
      }
    });

    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      unlisten();
    };
  } catch (error) {
    throw nativeOperationError("ผูกการปิด", error);
  }
}
