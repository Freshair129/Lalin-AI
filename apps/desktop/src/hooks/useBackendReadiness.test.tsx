import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { health } from "../api";
import { useBackendReadiness } from "./useBackendReadiness";

vi.mock("../api", () => ({
  health: vi.fn(),
}));

const mockedHealth = vi.mocked(health);

describe("useBackendReadiness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedHealth.mockReset();
  });

  it("keeps the app gated while backend health is offline", async () => {
    mockedHealth.mockRejectedValue(new Error("sidecar not ready"));

    const { result, unmount } = renderHook(() => useBackendReadiness());
    await act(async () => {});

    expect(result.current.state).toBe("offline");
    expect(result.current.online).toBe(false);
    expect(result.current.error).toBe("sidecar not ready");

    unmount();
    vi.useRealTimers();
  });

  it("polls again during sidecar boot and becomes ready after health passes", async () => {
    mockedHealth
      .mockRejectedValueOnce(new Error("booting"))
      .mockResolvedValueOnce({ status: "ok", brain: { provider: "ollama" } });

    const { result, unmount } = renderHook(() => useBackendReadiness());
    await act(async () => {});

    expect(result.current.state).toBe("offline");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(result.current.state).toBe("ready");
    expect(result.current.online).toBe(true);
    expect(result.current.brainName).toBe("ollama");

    unmount();
    vi.useRealTimers();
  });

  it("manual retry starts a new health check immediately", async () => {
    mockedHealth
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ status: "ok", brain: { provider: "cloud" } });

    const { result, unmount } = renderHook(() => useBackendReadiness());
    await act(async () => {});

    act(() => result.current.retry());
    await act(async () => {});

    expect(result.current.state).toBe("ready");
    expect(result.current.brainName).toBe("cloud");

    unmount();
    vi.useRealTimers();
  });
});
