import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { previewFailureReason, useWarpPreviewLifetime } from "./useWarpPreviewLifetime";

describe("warp preview lifetime", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T00:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("retires idle previews at their deadline and never revives them after a clock rollback", () => {
    const { result } = renderHook(useWarpPreviewLifetime);
    act(() => result.current.register("a:1", "2026-10-29T00:00:10Z"));
    expect(result.current.isFresh("a:1")).toBe(true);
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.reason).toBe("expired");
    act(() => { vi.setSystemTime(new Date("2026-10-28T00:00:00Z")); result.current.register("a:1", "2026-10-29T00:00:10Z"); });
    expect(result.current.isFresh("a:1")).toBe(false);
  });

  it.each(["focus", "visibilitychange"])("rechecks elapsed time on %s after suspended timers", (event) => {
    const { result } = renderHook(useWarpPreviewLifetime);
    act(() => result.current.register("a:1", "2026-10-29T00:00:10Z"));
    act(() => {
      vi.setSystemTime(new Date("2026-10-29T00:01:00Z"));
      (event === "focus" ? window : document).dispatchEvent(new Event(event));
    });
    expect(result.current.reason).toBe("expired");
  });

  it("checks the deadline at action time even before the timer fires", () => {
    const { result } = renderHook(useWarpPreviewLifetime);
    act(() => result.current.register("a:1", "2026-10-29T00:00:10Z"));
    vi.setSystemTime(new Date("2026-10-29T00:01:00Z"));
    act(() => expect(result.current.isFresh("a:1")).toBe(false));
    expect(result.current.reason).toBe("expired");
  });

  it.each(["invalid", "", "2026-10-29T00:00:00Z"])("rejects unusable deadline %s", (deadline) => {
    const { result } = renderHook(useWarpPreviewLifetime);
    act(() => result.current.register("a:1", deadline));
    expect(result.current.reason).toBe("expired");
    expect(result.current.isFresh("a:1")).toBe(false);
  });

  it("ignores old failures and timers after replacement and distinguishes unavailable media", () => {
    const { result } = renderHook(useWarpPreviewLifetime);
    act(() => result.current.register("a:1", "2026-10-29T00:00:10Z"));
    act(() => result.current.invalidate("a:1", "expired"));
    act(() => result.current.register("b:1", "2026-10-29T00:01:00Z"));
    act(() => { result.current.invalidate("a:1", "expired"); vi.advanceTimersByTime(10_000); });
    expect(result.current.reason).toBe(null);
    expect(result.current.isFresh("b:1")).toBe(true);
    act(() => result.current.invalidate("b:1", "unavailable"));
    expect(result.current.reason).toBe("unavailable");
    expect(result.current.isFresh("b:1")).toBe(false);
    act(() => result.current.clear());
    act(() => result.current.invalidate("b:1", "expired"));
    expect(result.current.reason).toBe(null);
    expect(result.current.isFresh("b:1")).toBe(false);
  });

  it("removes its deadline timer on unmount", () => {
    const { result, unmount } = renderHook(useWarpPreviewLifetime);
    act(() => result.current.register("a:1", "2026-10-29T00:00:10Z"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("recognizes expiry from HTTP and job errors without swallowing unrelated failures", () => {
    expect(previewFailureReason(new Error('410: {"detail":"preview_expired"}'))).toBe("expired");
    expect(previewFailureReason("preview_expired")).toBe("expired");
    expect(previewFailureReason(new Error('404: {"detail":"preview_not_found"}'))).toBe("unavailable");
    expect(previewFailureReason("preview_not_found")).toBe("unavailable");
    for (const error of ['404: {"detail":"other"}', '410: {"detail":"other"}', "network failure", "410: invalid JSON", null]) {
      expect(previewFailureReason(error)).toBe(null);
    }
  });
});
