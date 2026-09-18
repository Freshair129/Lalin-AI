import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindPlayWindowClose,
  hideOrCloseCurrentWindow,
  isCurrentPlayWindowFullscreen,
  isTauri,
  minimizeCurrentWindow,
  openOrFocusPlayWindow,
  setCurrentPlayWindowFullscreen,
  toggleMaximizeCurrentWindow,
} from "./windowManager";
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow";

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: { getByLabel: vi.fn() },
  getCurrentWebviewWindow: vi.fn(),
}));

const getByLabelMock = vi.mocked(WebviewWindow.getByLabel);
const getCurrentWindowMock = vi.mocked(getCurrentWebviewWindow);

let lastPopup: Window | null = null;

function markTauri(): void {
  (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
}

function makePlayWindow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    label: "play",
    show: vi.fn().mockResolvedValue(undefined),
    unminimize: vi.fn().mockResolvedValue(undefined),
    setFocus: vi.fn().mockResolvedValue(undefined),
    minimize: vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(false),
    isFullscreen: vi.fn().mockResolvedValue(false),
    maximize: vi.fn().mockResolvedValue(undefined),
    unmaximize: vi.fn().mockResolvedValue(undefined),
    setFullscreen: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    onCloseRequested: vi.fn().mockResolvedValue(vi.fn()),
    ...overrides,
  };
}

describe("windowManager native and browser lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
    lastPopup = null;
  });

  afterEach(() => {
    if (lastPopup) {
      Object.defineProperty(lastPopup, "closed", {
        configurable: true,
        value: true,
      });
    }
    delete (window as Window & { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
  });

  it("identifies native and browser environments safely", () => {
    expect(isTauri()).toBe(false);
    markTauri();
    expect(isTauri()).toBe(true);
  });

  it("opens the browser popup in the user call stack and reuses it without navigation", async () => {
    const popup = {
      closed: false,
      focus: vi.fn(),
    } as unknown as Window;
    lastPopup = popup;
    const open = vi
      .spyOn(window, "open")
      .mockImplementation((url, name, features) => {
        expect(url).toContain("?surface=play");
        expect(name).toBe("LalinPlay");
        expect(features).toContain("width=960");
        return popup;
      });

    let stillInGesture = true;
    open.mockImplementationOnce(() => {
      expect(stillInGesture).toBe(true);
      return popup;
    });
    const first = openOrFocusPlayWindow();
    stillInGesture = false;

    await expect(first).resolves.toBe(true);
    await expect(openOrFocusPlayWindow()).resolves.toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(popup.focus).toHaveBeenCalledTimes(2);
  });

  it("returns false when the browser blocks the popup", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    await expect(openOrFocusPlayWindow()).resolves.toBe(false);
  });

  it("supports closing the current browser window", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => {});

    await expect(hideOrCloseCurrentWindow()).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it("uses only the predeclared native play window and its lifecycle operations", async () => {
    markTauri();
    const playWindow = makePlayWindow();
    getByLabelMock.mockResolvedValue(playWindow as never);

    await expect(openOrFocusPlayWindow()).resolves.toBe(true);
    expect(getByLabelMock).toHaveBeenCalledWith("play");
    expect(playWindow.show).toHaveBeenCalledOnce();
    expect(playWindow.unminimize).toHaveBeenCalledOnce();
    expect(playWindow.setFocus).toHaveBeenCalledOnce();
  });

  it("throws an actionable Thai error when the native play window is missing", async () => {
    markTauri();
    getByLabelMock.mockResolvedValue(null);
    const open = vi.spyOn(window, "open");

    await expect(openOrFocusPlayWindow()).rejects.toThrow(
      "ไม่พบหน้าต่าง native Lalin Play"
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("throws instead of silently falling back when native operations fail", async () => {
    markTauri();
    getByLabelMock.mockRejectedValue(new Error("permission denied"));
    const open = vi.spyOn(window, "open");

    await expect(openOrFocusPlayWindow()).rejects.toThrow(
      "ไม่สามารถเปิดหน้าต่าง Lalin Play ได้"
    );
    expect(open).not.toHaveBeenCalled();
  });

  it.each([
    ["minimize", minimizeCurrentWindow],
    ["toggle maximize", toggleMaximizeCurrentWindow],
    ["hide", hideOrCloseCurrentWindow],
  ])("throws when native %s fails", async (_name, operation) => {
    markTauri();
    const playWindow = makePlayWindow({
      minimize: vi.fn().mockRejectedValue(new Error("native failure")),
      isMaximized: vi.fn().mockRejectedValue(new Error("native failure")),
      hide: vi.fn().mockRejectedValue(new Error("native failure")),
    });
    getCurrentWindowMock.mockReturnValue(playWindow as never);

    await expect(operation()).rejects.toThrow("กรุณาปิดแล้วเปิดแอปใหม่อีกครั้ง");
  });

  it("does not operate on the native main window", async () => {
    markTauri();
    const mainWindow = makePlayWindow({ label: "main" });
    getCurrentWindowMock.mockReturnValue(mainWindow as never);

    await minimizeCurrentWindow();
    await toggleMaximizeCurrentWindow();
    await hideOrCloseCurrentWindow();

    expect(mainWindow.minimize).not.toHaveBeenCalled();
    expect(mainWindow.isMaximized).not.toHaveBeenCalled();
    expect(mainWindow.maximize).not.toHaveBeenCalled();
    expect(mainWindow.unmaximize).not.toHaveBeenCalled();
    expect(mainWindow.hide).not.toHaveBeenCalled();
  });

  it("toggles the native play window in both directions", async () => {
    markTauri();
    const playWindow = makePlayWindow();
    getCurrentWindowMock.mockReturnValue(playWindow as never);

    await minimizeCurrentWindow();
    await toggleMaximizeCurrentWindow();
    playWindow.isMaximized.mockResolvedValueOnce(true);
    await toggleMaximizeCurrentWindow();
    await hideOrCloseCurrentWindow();

    expect(playWindow.minimize).toHaveBeenCalledOnce();
    expect(playWindow.maximize).toHaveBeenCalledOnce();
    expect(playWindow.unmaximize).toHaveBeenCalledOnce();
    expect(playWindow.hide).toHaveBeenCalledOnce();
  });

  it("reads and changes fullscreen only on the native Play window", async () => {
    markTauri();
    const playWindow = makePlayWindow({ isFullscreen: vi.fn().mockResolvedValue(true) });
    getCurrentWindowMock.mockReturnValue(playWindow as never);

    await expect(isCurrentPlayWindowFullscreen()).resolves.toBe(true);
    await expect(setCurrentPlayWindowFullscreen(false)).resolves.toBe(true);
    expect(playWindow.isFullscreen).toHaveBeenCalledTimes(2);
    expect(playWindow.setFullscreen).toHaveBeenCalledWith(false);
  });

  it("uses the browser Fullscreen API and returns the actual state", async () => {
    const requestFullscreen = vi.fn().mockImplementation(async () => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: document.documentElement,
      });
    });
    const exitFullscreen = vi.fn().mockImplementation(async () => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: null,
      });
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });

    await expect(setCurrentPlayWindowFullscreen(true)).resolves.toBe(true);
    await expect(isCurrentPlayWindowFullscreen()).resolves.toBe(true);
    await expect(setCurrentPlayWindowFullscreen(false)).resolves.toBe(false);
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(exitFullscreen).toHaveBeenCalledOnce();
  });

  it("reports a Thai error when browser fullscreen is unavailable", async () => {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });

    await expect(setCurrentPlayWindowFullscreen(true)).rejects.toThrow(
      "เบราว์เซอร์นี้ไม่รองรับโหมดเต็มหน้าจอ แต่ยังใช้ TV Mode ได้ในหน้าต่างปัจจุบัน",
    );
    await expect(isCurrentPlayWindowFullscreen()).resolves.toBe(false);
  });

  it("prevents native play close, awaits hide, reports hide failures, and cleans up once", async () => {
    markTauri();
    let closeHandler:
      | ((event: { preventDefault: () => void }) => Promise<void>)
      | undefined;
    const unlisten = vi.fn();
    const playWindow = makePlayWindow({
      onCloseRequested: vi.fn().mockImplementation(async (handler) => {
        closeHandler = handler;
        return unlisten;
      }),
    });
    getCurrentWindowMock.mockReturnValue(playWindow as never);

    const onError = vi.fn();
    const cleanup = await bindPlayWindowClose(onError);
    const event = { preventDefault: vi.fn() };

    await closeHandler?.(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(playWindow.hide).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();

    cleanup();
    cleanup();
    expect(unlisten).toHaveBeenCalledOnce();

    playWindow.hide.mockRejectedValueOnce(new Error("hide denied"));
    await closeHandler?.(event);
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining("ไม่สามารถซ่อนหน้าต่าง Lalin Play ได้")
    );
  });

  it("does not bind close handling for a native non-play caller", async () => {
    markTauri();
    const mainWindow = makePlayWindow({ label: "main" });
    getCurrentWindowMock.mockReturnValue(mainWindow as never);

    const cleanup = await bindPlayWindowClose(vi.fn());
    cleanup();
    expect(mainWindow.onCloseRequested).not.toHaveBeenCalled();
  });
});
