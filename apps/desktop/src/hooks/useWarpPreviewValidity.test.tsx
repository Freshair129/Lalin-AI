import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWarpPreviewValidity } from "./useWarpPreviewValidity";

describe("warp preview validity", () => {
  it("invalidates a preview permanently when inputs change, including changing back", () => {
    const { result, rerender } = renderHook(({ key }) => useWarpPreviewValidity(key), { initialProps: { key: "original" } });
    act(() => result.current.startPreview());
    expect(result.current.canShow).toBe(true);
    rerender({ key: "changed" });
    expect(result.current.canShow).toBe(false);
    rerender({ key: "original" });
    expect(result.current.canShow).toBe(false);
    act(() => result.current.startPreview());
    expect(result.current.canShow).toBe(true);
  });
  it("keeps a marker draft editable but blocks old playback until a new preview", () => {
    const { result } = renderHook(() => useWarpPreviewValidity("input"));
    act(() => result.current.startPreview());
    act(() => result.current.markAnchorChanged());
    expect(result.current.canShow).toBe(true);
    expect(result.current.canAudition).toBe(false);
    act(() => result.current.startPreview());
    expect(result.current.canAudition).toBe(true);
  });
  it("invalidates an in-flight preview when the recipe changes", () => {
    const { result, rerender } = renderHook(({ key }) => useWarpPreviewValidity(key), { initialProps: { key: "a" } });
    act(() => result.current.startPreview());
    rerender({ key: "b" });
    rerender({ key: "a" });
    expect(result.current.canShow).toBe(false);
  });
});
