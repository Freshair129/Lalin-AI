import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { closeMedia, openMedia, requestMediaLifecycle } from "./mediaLauncher";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

function markTauri(): void {
  (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
}

describe("Lalin Cast lifecycle launcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("reports native-only failure in the browser without invoking Tauri", async () => {
    await expect(requestMediaLifecycle("focus")).resolves.toMatchObject({
      state: "failed",
      code: "MEDIA_NATIVE_ONLY",
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("sends a versioned lifecycle request through the Tauri command", async () => {
    markTauri();
    invokeMock.mockResolvedValue({ state: "stopped", requestId: "test" });

    await closeMedia();

    expect(invokeMock).toHaveBeenCalledWith(
      "media_lifecycle",
      expect.objectContaining({
        action: "close",
        requestId: expect.any(String),
      }),
    );
  });

  it("polls status after start and returns ready instead of using a fixed sleep as readiness", async () => {
    markTauri();
    invokeMock
      .mockResolvedValueOnce({ state: "starting", requestId: "start", pid: 42 })
      .mockResolvedValueOnce({ state: "ready", requestId: "status", pid: 42 });

    await expect(openMedia()).resolves.toMatchObject({ state: "ready", pid: 42 });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
