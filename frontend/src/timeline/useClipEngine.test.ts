import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useClipEngine } from "./useClipEngine";

describe("useClipEngine — reorderTrack", () => {
  it("moves the first track to the last position", () => {
    const { result } = renderHook(() => useClipEngine());
    const ids = result.current.project.tracks.map((t) => t.id);
    expect(ids).toEqual(["vocal", "beat", "master"]);

    act(() => {
      result.current.reorderTrack("vocal", "master");
    });

    const nextIds = result.current.project.tracks.map((t) => t.id);
    expect(nextIds).toEqual(["beat", "master", "vocal"]);
  });

  it("is a no-op when fromId does not exist", () => {
    const { result } = renderHook(() => useClipEngine());
    const before = result.current.project.tracks.map((t) => t.id);

    act(() => {
      result.current.reorderTrack("no-such-track", "master");
    });

    const after = result.current.project.tracks.map((t) => t.id);
    expect(after).toEqual(before);
  });

  it("is a no-op when toId does not exist", () => {
    const { result } = renderHook(() => useClipEngine());
    const before = result.current.project.tracks.map((t) => t.id);

    act(() => {
      result.current.reorderTrack("vocal", "no-such-track");
    });

    const after = result.current.project.tracks.map((t) => t.id);
    expect(after).toEqual(before);
  });

  it("is a no-op when fromId and toId are the same", () => {
    const { result } = renderHook(() => useClipEngine());
    const before = result.current.project.tracks.map((t) => t.id);

    act(() => {
      result.current.reorderTrack("vocal", "vocal");
    });

    const after = result.current.project.tracks.map((t) => t.id);
    expect(after).toEqual(before);
  });

  it("does not push a history entry (reorderTrack is a silent update)", () => {
    const { result } = renderHook(() => useClipEngine());

    act(() => {
      result.current.reorderTrack("vocal", "master");
    });

    expect(result.current.canUndo).toBe(false);
  });
});

describe("useClipEngine — undo/redo", () => {
  it("undo reverts the last committed op (toggleTrack mute)", () => {
    const { result } = renderHook(() => useClipEngine());

    act(() => {
      result.current.toggleTrack("vocal", "muted");
    });
    expect(result.current.project.tracks.find((t) => t.id === "vocal")?.muted).toBe(true);
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.project.tracks.find((t) => t.id === "vocal")?.muted).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it("redo re-applies an undone op", () => {
    const { result } = renderHook(() => useClipEngine());

    act(() => {
      result.current.toggleTrack("vocal", "muted");
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });
    expect(result.current.project.tracks.find((t) => t.id === "vocal")?.muted).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("undo is a no-op when there is no history", () => {
    const { result } = renderHook(() => useClipEngine());
    const before = result.current.project;

    act(() => {
      result.current.undo();
    });

    expect(result.current.project).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("committing a new op after undo clears the redo stack", () => {
    const { result } = renderHook(() => useClipEngine());

    act(() => {
      result.current.toggleTrack("vocal", "muted");
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.toggleTrack("beat", "solo");
    });
    expect(result.current.canRedo).toBe(false);
  });
});
