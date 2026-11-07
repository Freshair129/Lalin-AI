// @tested FR-20.1, FR-20.2, FR-20.4, FR-20.5, FR-22.1, FR-22.2
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
import { check } from "@tauri-apps/plugin-updater";
import { listen } from "@tauri-apps/api/event";
import { App } from "./App";
import { PlaybackAudioEngine } from "./playback/audioEngine";
import {
  usePlaybackStore,
  loadPersistedQueue,
  STORAGE_QUEUE_KEY,
} from "./playback/usePlaybackStore";
import { loadPlaylists, savePlaylists } from "./playlists";
import { STORAGE_LOCALE_KEY } from "./i18n";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
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

async function openAllTracks(): Promise<void> {
  fireEvent.click(
    await screen.findByRole("button", { name: /All tracks|เพลงทั้งหมด/ }),
  );
}

beforeEach(() => {
  // jsdom ไม่มี MediaError constructor; ใช้ค่ามาตรฐานของ browser ใน fixture
  vi.stubGlobal("MediaError", {
    MEDIA_ERR_ABORTED: 1,
    MEDIA_ERR_NETWORK: 2,
    MEDIA_ERR_DECODE: 3,
    MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
  });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  localStorage.clear();
  localStorage.setItem(STORAGE_LOCALE_KEY, "th");
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
  usePlaybackStore.getState().setMediaGain(1);
  if (usePlaybackStore.getState().mixer.mediaMuted) usePlaybackStore.getState().toggleMediaMute();
  usePlaybackStore.getState().setSpatialMode("stereo");
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "get_library") return { version: 1, tracks: [track] };
    if (command === "resolve_media") return track.path;
    if (command === "list_damaged_tracks") return [];
    return undefined;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("standalone surfaces (mocked IPC; native evidence is separate)", () => {
  it("localizes managed and user source badges in Thai", async () => {
    vi.mocked(invoke).mockImplementation(async command => command === "get_library" ? { version: 1, tracks: [{ ...track, sourceKind: "user", storageKind: "managed" }] } : command === "list_damaged_tracks" || command === "list_youtube_links" ? [] : undefined);
    render(<App />);
    await openAllTracks();
    expect(await screen.findByText("\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19")).toBeTruthy();
    expect(screen.getByText("\u0e2d\u0e2d\u0e1f\u0e44\u0e25\u0e19\u0e4c")).toBeTruthy();
  });

  it("keeps the app usable when a user-requested update check fails", async () => {
    localStorage.setItem(STORAGE_LOCALE_KEY, "en");
    vi.mocked(invoke).mockImplementation(async command => command === "get_library" ? { version: 1, tracks: [track] } : command === "list_damaged_tracks" || command === "list_youtube_links" ? [] : undefined);
    vi.mocked(check).mockRejectedValueOnce(new Error("offline"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Could not check for updates.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /All tracks/ }));
    expect(await screen.findByText(track.title)).toBeTruthy();
  });

  it("orders reopened listening data and produces deterministic recommendations", async () => {
    localStorage.setItem(STORAGE_LOCALE_KEY, "en");
    const fixture = [
      { ...track, id: "a", title: "Alpha", artist: "Artist", album: "Album", playCount: 3, lastPlayedAt: 100, favorite: true },
      { ...track, id: "b", title: "Beta", artist: "Artist", album: "Other", playCount: 1, lastPlayedAt: 300 },
      { ...track, id: "c", title: "Charlie", artist: "Artist", album: "Album", playCount: 0, lastPlayedAt: null },
    ];
    vi.mocked(invoke).mockImplementation(async (command) => command === "get_library" ? { version: 1, tracks: fixture } : command === "list_damaged_tracks" ? [] : undefined);
    render(<App />);
    const titles = async (heading: string) => {
      const section = (await screen.findByText(heading)).parentElement!;
      await waitFor(() => expect(section.querySelectorAll(".track-row").length).toBeGreaterThan(0));
      return Array.from(section.querySelectorAll(".track-row"), row => row.textContent ?? "");
    };
    const recent = await titles("Recently played");
    expect(recent[0]).toContain("Beta"); expect(recent[1]).toContain("Alpha");
    const most = await titles("Most played");
    expect(most[0]).toContain("Alpha"); expect(most[1]).toContain("Beta");
    const recommended = await titles("Recommended for you");
    expect(recommended[0]).toContain("Charlie"); expect(recommended[1]).toContain("Beta");
  });

  it("filters reopened favorites and renders persisted USER and OFFLINE badges", async () => {
    localStorage.setItem(STORAGE_LOCALE_KEY, "en");
    const fixture = [
      { ...track, id: "fav", title: "Saved Favorite", favorite: true, sourceKind: "user", storageKind: "managed" },
      { ...track, id: "other", title: "Not Favorite", favorite: false, sourceKind: "user", storageKind: "linked" },
    ];
    vi.mocked(invoke).mockImplementation(async (command) => command === "get_library" ? { version: 1, tracks: fixture } : command === "list_damaged_tracks" ? [] : undefined);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Favorites/ }));
    expect(await screen.findByText("Saved Favorite")).not.toBeNull();
    expect(screen.queryByText("Not Favorite")).toBeNull();
    expect(screen.getByText("USER")).not.toBeNull();
    expect(screen.getByText("OFFLINE")).not.toBeNull();
  });

  it("shows repair panel and restores without changing queue or playlists", async () => {
    localStorage.setItem(STORAGE_LOCALE_KEY, "en");
    const damaged = { id: track.id, title: track.title, artist: null, album: null, contentHash: "hash", ext: "wav", reason: "missing", sourcePath: track.path };
    usePlaybackStore.setState({ queue: { items: [{ id: track.id, title: track.title, url: "old", queueEntryId: "first" }], currentIndex: 0, repeatMode: "off", shuffle: false, revision: 1 } });
    const queue = structuredClone(usePlaybackStore.getState().queue);
    const playlist = JSON.stringify({ version: 1, playlists: [] });
    localStorage.setItem("lalin-play:v1:playlists", playlist);
    let restored = false;
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "get_library") return { version: 1, tracks: restored ? [track] : [] };
      if (command === "list_damaged_tracks") return restored ? [] : [damaged];
      if (command === "select_restore_file") return track.path;
      if (command === "restore_managed_track") { restored = true; return track; }
      return undefined;
    });
    render(<App />);
    expect(await screen.findByText("1 offline file needs repair")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Repair panel" }));
    expect(screen.getByText("Managed object is missing")).not.toBeNull();
    expect(screen.getByText(track.path)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Restore from file/ }));
    expect(await screen.findByText("Offline track restored. Queue and playlist references were kept.")).not.toBeNull();
    expect(usePlaybackStore.getState().queue).toEqual(queue);
    expect(localStorage.getItem("lalin-play:v1:playlists")).toBe(playlist);
    await openAllTracks();
    expect(await screen.findByText(track.title)).not.toBeNull();
  });

  it("offers import as a new track on recovery mismatch", async () => {
    localStorage.setItem(STORAGE_LOCALE_KEY, "en");
    const damaged = { id: track.id, title: track.title, artist: null, album: null, contentHash: "hash", ext: "wav", reason: "corrupt", sourcePath: track.path };
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "get_library") return { version: 1, tracks: [] };
      if (command === "list_damaged_tracks") return [damaged];
      if (command === "select_restore_file") return track.path;
      if (command === "restore_managed_track") throw new Error("recovery:content-mismatch");
      return undefined;
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Repair panel" }));
    fireEvent.click(screen.getByRole("button", { name: /Restore from file/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Import it as a new track?")));
  });

  it("shows the compact recovery hint", async () => {
    localStorage.setItem(STORAGE_LOCALE_KEY, "en");
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "get_library") return { version: 1, tracks: [] };
      if (command === "list_damaged_tracks") return [{ id: track.id, title: track.title, reason: "missing" }];
      return undefined;
    });
    render(<App />);
    await screen.findByText("1 offline file needs repair");
    fireEvent.click(screen.getByRole("button", { name: /Compact/ }));
    expect(await screen.findByText("1 offline file needs repair. Switch to Full to repair.")).not.toBeNull();
  });

  it("relinks a missing row after confirmation and preserves queue identities and playlists", async () => {
    const replacement = { ...track, path: "C:\\new\\one.wav", missing: false };
    const missing = { ...track, missing: true };
    const queue = {
      items: [
        { id: track.id, title: track.title, url: "old", sourcePath: track.path, queueEntryId: "first" },
        { id: "other", title: "Other", url: "other", queueEntryId: "middle" },
        { id: track.id, title: track.title, url: "old", sourcePath: track.path, queueEntryId: "last" },
      ], currentIndex: 1, repeatMode: "off" as const, shuffle: false, revision: 1,
    };
    usePlaybackStore.setState({ queue });
    const playlistRaw = JSON.stringify({ version: 1, playlists: [] });
    localStorage.setItem("lalin-play:v1:playlists", playlistRaw);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    let attempts = 0;
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "get_library") return { version: 1, tracks: [missing] };
      if (command === "select_relink_file") return replacement.path;
      if (command === "relink_track") {
        if (attempts++ === 0) throw new Error("relink:different-content");
        return replacement;
      }
      if (command === "list_damaged_tracks") return [];
      return undefined;
    });
    render(<App />);
    await openAllTracks();
    fireEvent.click(await screen.findByRole("button", { name: "เชื่อมไฟล์ใหม่…" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("button", { name: "เชื่อมไฟล์ใหม่…" })).toBeNull());
    const calls = vi.mocked(invoke).mock.calls.filter(([command]) => command === "relink_track");
    expect(calls.map(([, args]) => args)).toEqual([
      { id: track.id, path: replacement.path, acceptDifferentContent: false },
      { id: track.id, path: replacement.path, acceptDifferentContent: true },
    ]);
    const result = usePlaybackStore.getState().queue;
    expect(result.currentIndex).toBe(1);
    expect(result.items.map((item) => item.queueEntryId)).toEqual(["first", "middle", "last"]);
    for (const item of [result.items[0], result.items[2]]) {
      expect(item.sourcePath).toBe(replacement.path);
      expect(item.url).toBe(`http://asset.localhost/${encodeURIComponent(replacement.path)}`);
    }
    expect(JSON.parse(localStorage.getItem(STORAGE_QUEUE_KEY)!).items).toEqual(result.items);
    expect(localStorage.getItem("lalin-play:v1:playlists")).toBe(playlistRaw);
  });
  it("defaults to English and switches the shared locale without changing playback", async () => {
    localStorage.removeItem(STORAGE_LOCALE_KEY);
    render(<App />);
    const english = await screen.findByRole("button", { name: "ENG" });
    expect(english.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "♫ All tracks" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mixer" }));
    expect(screen.getAllByText("MUTE")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "TH" }));
    expect(screen.getByText("คลังเพลง")).not.toBeNull();
    expect(Array.from(document.querySelectorAll(".mixer-mute"), (button) => button.textContent)).toEqual([
      "ปิดเสียง",
      "ปิดเสียง",
    ]);
    expect(localStorage.getItem(STORAGE_LOCALE_KEY)).toBe("th");
    expect(document.documentElement.lang).toBe("th");
    fireEvent.click(screen.getByRole("button", { name: /Compact/ }));
    expect(await screen.findByRole("button", { name: "กลับ Full" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "กลับ Full" }));
    expect(await screen.findByRole("button", { name: "มิกเซอร์" })).not.toBeNull();
    expect(usePlaybackStore.getState().nowPlaying.item).toBeNull();
  });

  it("exposes only real media/master mixer channels and persists media controls", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "มิกเซอร์" }));
    expect(screen.getByText("MEDIA · สื่อ")).not.toBeNull();
    expect(screen.getByText("MASTER · รวม")).not.toBeNull();
    expect(screen.queryByText("GAME")).toBeNull();
    fireEvent.change(screen.getByRole("slider", { name: "ระดับเสียงสื่อ" }), { target: { value: "1.25" } });
    expect(usePlaybackStore.getState().mixer.mediaGain).toBe(1.25);
    expect(JSON.parse(localStorage.getItem("lalin-play:v1:mixer")!).mediaGain).toBe(1.25);
    fireEvent.click(screen.getByRole("button", { name: "ปิดเสียงช่องสื่อ" }));
    expect(usePlaybackStore.getState().mixer.mediaMuted).toBe(true);
    expect(screen.getByText("ปิดเสียงแล้ว")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "เปิดอีควอไลเซอร์" }));
    expect(screen.getByRole("region", { name: "ปรับระดับแต่ละย่าน EQ" })).not.toBeNull();
  });

  it("preserves one audio element, position, queue and EQ across Full/Compact", async () => {
    render(<App />);
    await openAllTracks();
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
    await openAllTracks();
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
    await openAllTracks();
    fireEvent.click(
      await screen.findByRole("button", { name: /เพิ่มเข้าคิว เพลง one/ }),
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

  it("records a listen only after attributed deck time is audible", async () => {
    render(<App />);
    const shortItem = {
      id: "listened-track",
      title: "Short listen",
      url: "asset:short-listen",
      duration: 4,
    };
    await act(async () => usePlaybackStore.getState().play(shortItem));
    const media = engine.getActiveMediaElement()!;
    const updateTime = async (time: number) => {
      await act(async () => {
        media.currentTime = time;
        media.dispatchEvent(new Event("timeupdate"));
      });
    };

    await updateTime(0);
    usePlaybackStore.getState().toggleMediaMute();
    await updateTime(1);
    await updateTime(2);
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "record_listen")).toHaveLength(0);

    usePlaybackStore.getState().toggleMediaMute();
    await updateTime(2);
    await updateTime(3);
    await updateTime(4);
    await waitFor(() => {
      expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "record_listen")).toHaveLength(1);
    });
    expect(invoke).toHaveBeenCalledWith("record_listen", { id: "listened-track" });
    await updateTime(5);
    await updateTime(6);
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "record_listen")).toHaveLength(1);
  });

  it("counts both overlap decks only while each deck is audible, ignoring silent preload", async () => {
    render(<App />);
    const emitAudibleTime = async (update: {
      mediaId: string;
      queueEntryId: string;
      sessionId: number;
      duration: number;
      currentTime: number;
      audible: boolean;
    }) => {
      await act(async () => {
        (engine as unknown as { emit: (name: string, data: unknown) => void })
          .emit("audibletimeupdate", update);
      });
    };
    const event = (
      mediaId: string,
      queueEntryId: string,
      sessionId: number,
      currentTime: number,
      audible: boolean,
    ) => ({ mediaId, queueEntryId, sessionId, duration: 4, currentTime, audible });

    await emitAudibleTime(event("outgoing-track", "entry-outgoing", 1, 0, true));
    await emitAudibleTime(event("outgoing-track", "entry-outgoing", 1, 1, true));
    await emitAudibleTime(event("incoming-track", "entry-incoming", 2, 0, false));
    await emitAudibleTime(event("incoming-track", "entry-incoming", 2, 1, false));
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "record_listen")).toHaveLength(0);

    await emitAudibleTime(event("outgoing-track", "entry-outgoing", 1, 2, true));
    await emitAudibleTime(event("incoming-track", "entry-incoming", 2, 2, true));
    await emitAudibleTime(event("outgoing-track", "entry-outgoing", 1, 3, true));
    await emitAudibleTime(event("incoming-track", "entry-incoming", 2, 3, true));
    await emitAudibleTime(event("outgoing-track", "entry-outgoing", 1, 4, true));
    await emitAudibleTime(event("incoming-track", "entry-incoming", 2, 4, true));

    await waitFor(() => {
      expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "record_listen")).toHaveLength(2);
    });
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "record_listen").map(([, args]) => args))
      .toEqual([{ id: "outgoing-track" }, { id: "incoming-track" }]);
  });
});

describe("Compact fullscreen (native IPC mocked)", () => {
  it("waits for native state, ignores repeat input, exits with Escape and preserves playback", async () => {
    render(<App />);
    await openAllTracks();
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
      if (command === "list_damaged_tracks") return [];
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
      if (command === "list_damaged_tracks") return [];
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
    await openAllTracks();
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
    fireEvent.click(screen.getByRole("button", { name: "อีควอไลเซอร์" }));
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
