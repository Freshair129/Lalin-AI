import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CompactTransport } from "./CompactTransport";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { FramePreview } from "../playback/framePreview";
import { resolveMedia } from "../native";
import { PlaybackAudioEngine } from "../playback/audioEngine";

vi.mock("../native", () => ({
  isVideoItem: (item: { kind?: string } | null) => item?.kind === "video",
  resolveMedia: vi.fn().mockResolvedValue("http://asset.localhost/test.mp4"),
}));
vi.mock("../playback/framePreview", () => ({
  FramePreview: vi.fn().mockImplementation(() => ({
    request: vi.fn(),
    cancel: vi.fn(),
    dispose: vi.fn(),
  })),
}));
const seek = vi.fn();
const item = {
  id: "video",
  title: "video",
  kind: "video" as const,
  url: "asset:pending",
};
const props = {
  fullscreen: false,
  onFullscreen: vi.fn(),
  onFull: vi.fn(),
  switching: false,
  onOpen: vi.fn(),
  report: vi.fn(),
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(resolveMedia).mockResolvedValue("http://asset.localhost/test.mp4");
  vi.mocked(FramePreview).mockImplementation(
    () =>
      ({
        request: vi.fn(),
        cancel: vi.fn(),
        dispose: vi.fn(),
      }) as unknown as FramePreview,
  );
  vi.stubGlobal("PointerEvent", MouseEvent);
  // jsdom ไม่มี pointer capture; native behavior ตรวจแยกใน Windows
  Object.defineProperty(HTMLInputElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLInputElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    width: 100,
  } as DOMRect);
  usePlaybackStore.setState((state) => ({
    seek,
    nowPlaying: {
      ...state.nowPlaying,
      item,
      state: "playing",
      currentTime: 12,
      duration: 100,
      error: undefined,
    },
  }));
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLInputElement.prototype, "setPointerCapture");
  Reflect.deleteProperty(HTMLInputElement.prototype, "releasePointerCapture");
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function mount() {
  const result = render(
    <div className="app">
      <CompactTransport {...props} />
    </div>,
  );
  await act(async () => {});
  return result;
}

it("hover does not seek; dragging commits once and Escape/cancel do not commit", async () => {
  await mount();
  const slider = screen.getByRole("slider", { name: "ตำแหน่งเล่น" });
  fireEvent.pointerMove(slider, { clientX: 20 });
  expect(seek).not.toHaveBeenCalled();
  fireEvent.pointerDown(slider, { button: 0, clientX: 30 });
  fireEvent.pointerMove(slider, { clientX: 60 });
  expect(seek).not.toHaveBeenCalled();
  fireEvent.pointerUp(slider, { clientX: 60 });
  expect(seek).toHaveBeenCalledTimes(1);
  expect(seek).toHaveBeenCalledWith(60);
  fireEvent.pointerDown(slider, { button: 0, clientX: 70 });
  fireEvent.keyDown(slider, { key: "Escape" });
  fireEvent.pointerUp(slider, { clientX: 80 });
  fireEvent.pointerDown(slider, { button: 0, clientX: 70 });
  fireEvent.pointerCancel(slider);
  expect(seek).toHaveBeenCalledTimes(1);
  expect(usePlaybackStore.getState().nowPlaying.currentTime).toBe(12);
  expect(usePlaybackStore.getState().nowPlaying.state).toBe("playing");
});

it("keyboard range change seeks; Full-only buttons are absent", async () => {
  await mount();
  fireEvent.change(screen.getByRole("slider", { name: "ตำแหน่งเล่น" }), {
    target: { value: "35" },
  });
  expect(seek).toHaveBeenCalledWith(35);
  expect(
    screen.queryByRole("button", { name: /EQ|คิว|สุ่ม|หยุด$/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "กลับ Full" }));
  expect(props.onFull).toHaveBeenCalled();
});

it("auto-hides only playing idle video; pointer/focus/pause keep controls available", async () => {
  const { container } = await mount();
  const footer = container.querySelector("footer")!;
  act(() => vi.advanceTimersByTime(2500));
  expect(footer.classList.contains("controls-hidden")).toBe(true);
  fireEvent.pointerMove(container.querySelector(".app")!);
  expect(footer.classList.contains("controls-hidden")).toBe(false);
  act(() => screen.getByRole("button", { name: "กลับ Full" }).focus());
  act(() => vi.advanceTimersByTime(2500));
  expect(footer.classList.contains("controls-hidden")).toBe(false);
  act(() =>
    usePlaybackStore.setState((state) => ({
      nowPlaying: { ...state.nowPlaying, state: "paused" },
    })),
  );
  act(() => vi.advanceTimersByTime(3000));
  expect(footer.classList.contains("controls-hidden")).toBe(false);
});

it("audio/empty/unknown duration does not start a preview and disposes video on exit", async () => {
  const result = await mount();
  const decoder = vi.mocked(FramePreview).mock.results[0].value;
  result.unmount();
  expect(decoder.dispose).toHaveBeenCalled();
  vi.mocked(FramePreview).mockClear();
  usePlaybackStore.setState((state) => ({
    nowPlaying: { ...state.nowPlaying, item: null, duration: Infinity },
  }));
  await mount();
  expect(FramePreview).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("slider", { name: "ตำแหน่งเล่น" }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByRole("button", { name: "เปิดไฟล์" })).toBeTruthy();
});

it("does not create a decoder after native authorization resolves after unmount", async () => {
  let resolve!: (url: string) => void;
  vi.mocked(resolveMedia).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const result = await mount();
  result.unmount();
  await act(async () => resolve("http://asset.localhost/old.mp4"));
  expect(FramePreview).not.toHaveBeenCalled();
});

it.each(["playing", "paused"] as const)(
  "skips from live media time rather than preview/store and preserves %s",
  async (state) => {
    usePlaybackStore.setState((s) => ({
      nowPlaying: { ...s.nowPlaying, state },
    }));
    const main = PlaybackAudioEngine.getInstance().getMediaElement()!;
    main.currentTime = 25;
    Object.defineProperty(main, "duration", { configurable: true, value: 100 });
    Object.defineProperty(main, "seekable", {
      configurable: true,
      value: { length: 1, start: () => 0, end: () => 100 },
    });
    const before = usePlaybackStore.getState();
    await mount();
    fireEvent.pointerMove(screen.getByRole("slider", { name: "ตำแหน่งเล่น" }), {
      clientX: 80,
    });
    fireEvent.click(screen.getByRole("button", { name: "ข้าม 10 วินาที" }));
    expect(seek).toHaveBeenLastCalledWith(35);
    fireEvent.click(screen.getByRole("button", { name: "ย้อน 10 วินาที" }));
    expect(seek).toHaveBeenLastCalledWith(15);
    expect(usePlaybackStore.getState().nowPlaying.state).toBe(state);
    expect(usePlaybackStore.getState().queue).toBe(before.queue);
    expect(usePlaybackStore.getState().eq).toBe(before.eq);
  },
);

it("disables skip during drag/loading/error and consumes only the drag-cancelling Escape", async () => {
  await mount();
  const escape = vi.fn();
  window.addEventListener("keydown", escape);
  try {
    const slider = screen.getByRole("slider", { name: "ตำแหน่งเล่น" });
    const forward = screen.getByRole("button", {
      name: "ข้าม 10 วินาที",
    }) as HTMLButtonElement;
    fireEvent.pointerDown(slider, { button: 0, clientX: 50 });
    expect(forward.disabled).toBe(true);
    fireEvent.keyDown(slider, { key: "Escape" });
    expect(escape).not.toHaveBeenCalled();
    fireEvent.keyDown(slider, { key: "Escape" });
    expect(escape).toHaveBeenCalledTimes(1);
    for (const state of ["loading", "error"] as const) {
      act(() =>
        usePlaybackStore.setState((s) => ({
          nowPlaying: { ...s.nowPlaying, state },
        })),
      );
      expect(forward.disabled).toBe(true);
    }
  } finally {
    window.removeEventListener("keydown", escape);
  }
});
