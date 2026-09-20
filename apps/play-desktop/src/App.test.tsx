import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { App } from "./App";
import { PlaybackAudioEngine } from "./playback/audioEngine";
import {
  usePlaybackStore,
  loadPersistedQueue,
  STORAGE_QUEUE_KEY,
} from "./playback/usePlaybackStore";
import { loadPlaylists, savePlaylists } from "./playlists";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) =>
    `http://asset.localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
const track = {
  id: "local-one",
  path: "C:\\fixture\\เพลง one.wav",
  title: "เพลง one",
  artist: null,
  album: null,
  duration: 120,
  missing: false,
};
const engine = PlaybackAudioEngine.getInstance();
const audio = (engine as unknown as { audio: HTMLAudioElement }).audio;

beforeEach(() => {
  // jsdom ไม่มี MediaError constructor; ใช้ค่ามาตรฐานของ browser ใน fixture
  vi.stubGlobal("MediaError", {
    MEDIA_ERR_ABORTED: 1,
    MEDIA_ERR_NETWORK: 2,
    MEDIA_ERR_DECODE: 3,
    MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
  });
  localStorage.clear();
  vi.mocked(listen).mockResolvedValue(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
    async function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("playing"));
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  usePlaybackStore.getState().clearQueue();
  usePlaybackStore.getState().resetEQ();
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "get_library") return { version: 1, tracks: [track] };
    if (command === "resolve_media") return track.path;
    return undefined;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("standalone surfaces (mocked IPC; native evidence is separate)", () => {
  it("preserves one audio element, position, queue and EQ across Full/Compact", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /♪ เพลง one/ }));
    await waitFor(() =>
      expect(usePlaybackStore.getState().nowPlaying.state).toBe("playing"),
    );
    audio.currentTime = 12;
    audio.dispatchEvent(new Event("timeupdate"));
    usePlaybackStore.getState().setBandGain(3, 4);
    usePlaybackStore.getState().setVolume(0.3);
    const queue = usePlaybackStore.getState().queue;
    const eq = usePlaybackStore.getState().eq;
    fireEvent.click(screen.getByRole("button", { name: /Compact/ }));
    await screen.findByRole("button", { name: /Full/ });
    expect((engine as unknown as { audio: HTMLAudioElement }).audio).toBe(
      audio,
    );
    expect(usePlaybackStore.getState().queue).toBe(queue);
    expect(usePlaybackStore.getState().eq).toBe(eq);
    expect(audio.currentTime).toBe(12);
    fireEvent.click(screen.getByRole("button", { name: /Full/ }));
    await screen.findByRole("button", { name: /Compact/ });
    expect(usePlaybackStore.getState().nowPlaying.volume).toBe(0.3);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it("does not switch layout or recreate playback when native resizing fails", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /♪ เพลง one/ });
    vi.mocked(invoke).mockRejectedValueOnce(new Error("resize failed"));
    fireEvent.click(screen.getByRole("button", { name: /Compact/ }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: /Full ↗/ })).toBeNull();
    expect((engine as unknown as { audio: HTMLAudioElement }).audio).toBe(
      audio,
    );
  });

  it("queues without autoplay and surfaces missing-file errors without losing the queue", async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: /เพิ่ม เพลง one เข้าคิว/ }),
    );
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    vi.mocked(invoke).mockRejectedValueOnce(new Error("ไม่พบไฟล์"));
    fireEvent.click(screen.getByRole("button", { name: "เล่น" }));
    await waitFor(() =>
      expect(usePlaybackStore.getState().nowPlaying.state).toBe("error"),
    );
    expect(usePlaybackStore.getState().queue.items).toHaveLength(1);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});

describe("Compact fullscreen (native IPC mocked)", () => {
  it("waits for native state, ignores repeat input, exits with Escape and preserves playback", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /♪ เพลง one/ }));
    await waitFor(() =>
      expect(usePlaybackStore.getState().nowPlaying.state).toBe("playing"),
    );
    const main = engine.getMediaElement()!;
    main.currentTime = 22;
    const source = main.src;
    const queue = usePlaybackStore.getState().queue;
    fireEvent.click(screen.getByRole("button", { name: /Compact/ }));
    const enter = await screen.findByRole("button", { name: "เต็มจอ" });
    let resolve!: (state: boolean) => void;
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "set_compact_fullscreen") {
        if ((args as { enabled: boolean }).enabled)
          return new Promise((done) => {
            resolve = done;
          });
        return false;
      }
      return undefined;
    });
    fireEvent.click(enter);
    fireEvent.click(enter);
    expect((enter as HTMLButtonElement).disabled).toBe(true);
    expect(enter.getAttribute("aria-pressed")).toBe("false");
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === "set_compact_fullscreen"),
    ).toHaveLength(1);
    await act(async () => resolve(true));
    expect(
      screen
        .getByRole("button", { name: "ออกจากเต็มจอ" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    await screen.findByRole("button", { name: "เต็มจอ" });
    expect(invoke).toHaveBeenCalledWith("set_compact_fullscreen", {
      enabled: false,
    });
    expect(main.src).toBe(source);
    expect(main.currentTime).toBe(22);
    expect(usePlaybackStore.getState().queue).toBe(queue);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it("reconciles actual native fullscreen after a failed command and can return to Full", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Compact/ }));
    await screen.findByRole("button", { name: "เต็มจอ" });
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "set_compact_fullscreen")
        throw new Error("native transition failed");
      if (command === "get_compact_fullscreen") return true;
      return undefined;
    });
    fireEvent.click(screen.getByRole("button", { name: "เต็มจอ" }));
    await screen.findByRole("button", { name: "ออกจากเต็มจอ" });
    expect(screen.getByRole("alert").textContent).toContain(
      "native transition failed",
    );
    fireEvent.click(screen.getByRole("button", { name: "กลับ Full" }));
    await screen.findByRole("button", { name: /Compact/ });
    expect(invoke).toHaveBeenCalledWith("set_surface", {
      compact: false,
      video: false,
    });
    expect(
      vi.mocked(invoke).mock.calls.some(([command]) => command === "set_tv"),
    ).toBe(false);
  });
});

describe("standalone persistence", () => {
  it("does not start a pending local-file request after Stop", async () => {
    let resolve!: (value: string) => void;
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const pending = usePlaybackStore
      .getState()
      .play({ id: track.id, title: track.title, url: "asset:pending" });
    usePlaybackStore.getState().stop();
    resolve(track.path);
    await pending;
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(usePlaybackStore.getState().nowPlaying.state).toBe("idle");
  });

  it("restores queue only when explicitly enabled, without starting playback", () => {
    localStorage.setItem(
      STORAGE_QUEUE_KEY,
      JSON.stringify({
        items: [{ id: "one", url: "asset:one" }],
        currentIndex: 0,
      }),
    );
    expect(loadPersistedQueue().items).toHaveLength(0);
    localStorage.setItem("lalin-play:v1:resume", "true");
    expect(loadPersistedQueue().items).toHaveLength(1);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("saves versioned playlists of file references", () => {
    const playlists = [{ id: "mix", name: "เพลงโปรด", trackIds: [track.id] }];
    savePlaylists(playlists);
    expect(loadPlaylists()).toEqual(playlists);
  });

  it.each([
    '{"version":2,"playlists":[]}',
    '{"version":1,"playlists":[{"id":"x","name":"test","trackIds":[42]}]}',
    "{ broken",
  ])(
    "rejects malformed/unsupported playlist data without overwriting it: %s",
    (raw) => {
      localStorage.setItem("lalin-play:v1:playlists", raw);
      expect(() => loadPlaylists()).toThrow();
      expect(localStorage.getItem("lalin-play:v1:playlists")).toBe(raw);
    },
  );
});

describe("local video presentation", () => {
  const videoItem = {
    id: "C:\\fixture\\ภาพ test.mp4",
    title: "ภาพ test",
    url: "asset:video",
    sourcePath: "C:\\fixture\\ภาพ test.mp4",
  };

  it("keeps a single mounted video and source across layouts, navigation and expanded Escape", async () => {
    const { container } = render(<App />);
    await screen.findByRole("button", { name: /♪ เพลง one/ });
    await act(async () => {
      await usePlaybackStore.getState().play(videoItem);
    });
    const media = container.querySelector("video")!;
    expect(media).toBe(engine.getMediaElement());
    expect(container.querySelectorAll("video")).toHaveLength(1);
    const source = media.src;
    const parent = media.parentElement;
    media.currentTime = 14;
    fireEvent(media, new Event("timeupdate"));
    fireEvent.click(screen.getByRole("button", { name: /Compact/ }));
    await screen.findByRole("button", { name: /Full/ });
    expect(screen.queryByRole("button", { name: "EQ" })).toBeNull();
    expect(screen.queryByRole("button", { name: "หยุด" })).toBeNull();
    expect(media.parentElement).toBe(parent);
    fireEvent.click(screen.getByRole("button", { name: /กลับ Full/ }));
    await screen.findByRole("button", { name: /Compact/ });
    fireEvent.click(screen.getByRole("button", { name: "ปรับเสียง EQ" }));
    fireEvent.click(screen.getByRole("button", { name: "ขยายภาพ" }));
    expect(container.querySelector(".video-expanded")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".video-expanded")).toBeNull();
    expect(media.currentTime).toBe(14);
    expect(media.src).toBe(source);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it("uses actual metadata and hides stale video when a mixed queue returns to audio", async () => {
    const { container } = render(<App />);
    await act(async () => {
      await usePlaybackStore.getState().play(videoItem);
    });
    const media = engine.getMediaElement()!;
    Object.defineProperty(media, "videoWidth", {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(media, "videoHeight", {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(media, "duration", { configurable: true, value: 30 });
    fireEvent(media, new Event("loadedmetadata"));
    fireEvent(media, new Event("loadeddata"));
    fireEvent(media, new Event("durationchange"));
    expect(screen.getByText("640 × 360")).toBeTruthy();
    expect(usePlaybackStore.getState().nowPlaying.duration).toBe(30);
    await act(async () => {
      usePlaybackStore.getState().addToQueue({
        id: track.id,
        title: track.title,
        url: "asset:audio",
        kind: "audio",
      });
      await usePlaybackStore.getState().next();
    });
    expect(
      container
        .querySelector(".video-stage")
        ?.classList.contains("video-hidden"),
    ).toBe(true);
    expect(container.querySelector("video")).toBe(media);
    expect(usePlaybackStore.getState().queue.items).toHaveLength(2);
  });

  it("shows decode failure without clearing the video queue", async () => {
    render(<App />);
    await act(async () => {
      await usePlaybackStore.getState().play(videoItem);
    });
    const media = engine.getMediaElement()!;
    Object.defineProperty(media, "error", {
      configurable: true,
      value: { code: 3 },
    });
    fireEvent(media, new Event("error"));
    expect(screen.getByRole("status").textContent).toContain("codec");
    expect(usePlaybackStore.getState().queue.items).toHaveLength(1);
    Object.defineProperty(media, "error", { configurable: true, value: null });
  });
});
