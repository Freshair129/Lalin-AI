import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FramePreview } from "./framePreview";

let media: HTMLVideoElement;
let preview: FramePreview;
let publish: ReturnType<typeof vi.fn>;
let draw: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  const create = document.createElement.bind(document);
  media = create("video");
  for (const [key, value] of Object.entries({
    readyState: 2,
    duration: 60,
    videoWidth: 640,
    videoHeight: 360,
  })) {
    Object.defineProperty(media, key, { configurable: true, value });
  }
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
    tag === "video" ? media : create(tag)) as typeof document.createElement);
  draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
    () => `frame:${media.currentTime}`,
  );
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  publish = vi.fn();
  preview = new FramePreview("http://asset.localhost/test.mp4", publish);
});
afterEach(() => {
  preview.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("decodes only the in-flight and newest pending targets, never plays", () => {
  preview.request(10);
  preview.request(20);
  preview.request(30);
  expect(media.currentTime).toBe(10);
  media.dispatchEvent(new Event("seeked"));
  expect(media.currentTime).toBe(30);
  expect(publish).not.toHaveBeenCalledWith(
    expect.objectContaining({ image: "frame:10" }),
  );
  media.dispatchEvent(new Event("seeked"));
  expect(publish).toHaveBeenLastCalledWith({
    time: 30,
    image: "frame:30",
    failed: false,
  });
  expect(media.muted).toBe(true);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(draw).toHaveBeenCalledWith(media, 0, 0, 192, 108);
});

it("bounds the cache to 24 thumbnails and reuses a cached frame", () => {
  for (let time = 1; time <= 25; time++) {
    preview.request(time);
    media.dispatchEvent(new Event("seeked"));
  }
  expect(draw).toHaveBeenCalledTimes(25);
  preview.request(25);
  expect(draw).toHaveBeenCalledTimes(25);
  preview.request(1);
  media.dispatchEvent(new Event("seeked"));
  expect(draw).toHaveBeenCalledTimes(26);
});

it("never publishes cancelled or disposed work and releases the source", () => {
  preview.request(10);
  preview.cancel();
  publish.mockClear();
  media.dispatchEvent(new Event("seeked"));
  expect(publish).not.toHaveBeenCalled();
  preview.request(20);
  preview.dispose();
  publish.mockClear();
  media.dispatchEvent(new Event("seeked"));
  vi.advanceTimersByTime(9000);
  expect(publish).not.toHaveBeenCalled();
  expect(media.hasAttribute("src")).toBe(false);
});

it("reports decode failure and bounded load timeout without a fake frame", () => {
  preview.request(8);
  vi.advanceTimersByTime(8000);
  expect(publish).toHaveBeenLastCalledWith({
    time: 8,
    image: null,
    failed: true,
  });
  preview.request(9);
  expect(publish).toHaveBeenLastCalledWith({
    time: 9,
    image: null,
    failed: true,
  });
});

it("waits for media data and catches canvas failures", () => {
  Object.defineProperty(media, "readyState", { configurable: true, value: 0 });
  preview.request(7);
  expect(media.currentTime).toBe(0);
  Object.defineProperty(media, "readyState", { configurable: true, value: 2 });
  media.dispatchEvent(new Event("loadeddata"));
  draw.mockImplementation(() => {
    throw new Error("tainted");
  });
  media.dispatchEvent(new Event("seeked"));
  expect(publish).toHaveBeenLastCalledWith({
    time: 7,
    image: null,
    failed: true,
  });
});
