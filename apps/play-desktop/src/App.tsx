import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PlaybackEQPanel } from "./components/PlaybackEQPanel";
import { PlaybackSettings } from "./components/PlaybackSettings";
import { VideoStage } from "./components/VideoStage";
import { CompactTransport } from "./components/CompactTransport";
import { Transport, formatTime } from "./components/Transport";
import { getLibrary, mediaItem, isVideoItem, type LocalTrack } from "./native";
import { loadPlaylists, savePlaylists, type Playlist } from "./playlists";
import { usePlaybackStore } from "./playback/usePlaybackStore";
import {
  activateTvFocus,
  createGamepadAdapter,
  isTextEditingTarget,
  mapTvKey,
  moveTvFocus,
} from "./playback/tvMode";

type View =
  | "tracks"
  | "artists"
  | "albums"
  | "queue"
  | "eq"
  | "settings"
  | `playlist:${string}`;

export function App() {
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [view, setView] = useState<View>("tracks");
  const [query, setQuery] = useState("");
  const [compact, setCompact] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const presentationBusy = useRef(false);
  const [tv, setTv] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasVideo = usePlaybackStore((state) =>
    isVideoItem(state.nowPlaying.item),
  );
  const mediaId = usePlaybackStore((state) => state.nowPlaying.item?.id);
  const videoExpanded = expanded && hasVideo;
  useEffect(() => {
    if (!hasVideo) setExpanded(false);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [hasVideo]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistReady, setPlaylistReady] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [resume, setResume] = useState(
    () => localStorage.getItem("lalin-play:v1:resume") === "true",
  );
  const root = useRef<HTMLDivElement>(null);
  const queue = usePlaybackStore((state) => state.queue);
  const report = useCallback((value: unknown) => setError(String(value)), []);
  const reconcileFullscreen = useCallback(async () => {
    try {
      setFullscreen(await invoke<boolean>("get_compact_fullscreen"));
    } catch (error) {
      report(error);
    }
  }, [report]);
  const changeFullscreen = useCallback(
    async (enabled: boolean) => {
      if (presentationBusy.current) return;
      presentationBusy.current = true;
      setSwitching(true);
      try {
        setFullscreen(
          await invoke<boolean>("set_compact_fullscreen", { enabled }),
        );
      } catch (error) {
        report(error);
        await reconcileFullscreen();
      } finally {
        presentationBusy.current = false;
        setSwitching(false);
      }
    },
    [report, reconcileFullscreen],
  );
  useEffect(() => {
    if (!compact || !fullscreen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !event.repeat) {
        event.preventDefault();
        void changeFullscreen(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [compact, fullscreen, changeFullscreen]);
  useEffect(() => {
    if (compact)
      void invoke("set_surface", { compact: true, video: hasVideo }).catch(
        report,
      );
  }, [compact, hasVideo, report]);
  const refresh = useCallback(() => getLibrary().then(setTracks), []);

  useEffect(() => {
    try {
      setPlaylists(loadPlaylists());
      setPlaylistReady(true);
    } catch (error) {
      report(error);
    }
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const subscriptions = [
      listen("play-library-changed", () => void refresh().catch(report)),
      listen<string>("play-import-error", (event) => report(event.payload)),
    ];
    void refresh().catch(report);
    subscriptions.forEach(
      (subscription) =>
        void subscription
          .then((unlisten) => {
            if (disposed) unlisten();
            else unlisteners.push(unlisten);
          })
          .catch(report),
    );
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [refresh, report]);

  const leaveTv = useCallback(() => {
    void invoke("set_tv", { enabled: false })
      .then(() => setTv(false))
      .catch(report);
  }, [report]);

  useEffect(() => {
    const action = (value: ReturnType<typeof mapTvKey>) => {
      if (!value || !root.current) return;
      if (value === "back") leaveTv();
      else if (value === "confirm") activateTvFocus(root.current);
      else if (value === "menu")
        root.current
          .querySelector<HTMLButtonElement>("[data-tv-exit]")
          ?.focus();
      else moveTvFocus(root.current, value);
    };
    const onKey = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return;
      if (tv) {
        const mapped = mapTvKey(event);
        if (mapped) {
          event.preventDefault();
          action(mapped);
        }
      } else if (
        event.code === "Space" &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        event.preventDefault();
        void usePlaybackStore.getState().togglePlay().catch(report);
      }
    };
    window.addEventListener("keydown", onKey);
    const gamepad = tv ? createGamepadAdapter({ onAction: action }) : null;
    return () => {
      window.removeEventListener("keydown", onKey);
      gamepad?.();
    };
  }, [tv, leaveTv, report]);

  const select = async (folder: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await invoke("select_media", { folder });
      await refresh();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  const switchSurface = async () => {
    if (presentationBusy.current) return;
    presentationBusy.current = true;
    setSwitching(true);
    try {
      await invoke("set_surface", { compact: !compact, video: hasVideo });
      setCompact((value) => !value);
      setFullscreen(false);
      setTv(false);
    } catch (error) {
      report(error);
      await reconcileFullscreen();
    } finally {
      presentationBusy.current = false;
      setSwitching(false);
    }
  };

  const updatePlaylists = (next: Playlist[]) => {
    try {
      savePlaylists(next);
      setPlaylists(next);
    } catch (error) {
      report(error);
    }
  };
  const selectedPlaylist = view.startsWith("playlist:")
    ? playlists.find((item) => `playlist:${item.id}` === view)
    : undefined;
  const filtered = tracks.filter(
    (track) =>
      (!selectedPlaylist || selectedPlaylist.trackIds.includes(track.id)) &&
      `${track.title} ${track.artist ?? ""} ${track.album ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const groups =
    view === "artists" || view === "albums"
      ? [
          ...new Set(
            filtered.map(
              (item) =>
                (view === "artists" ? item.artist : item.album) || "ไม่ระบุ",
            ),
          ),
        ].sort()
      : [""];
  const title =
    selectedPlaylist?.name ||
    (
      {
        tracks: "เพลงของคุณ",
        artists: "ศิลปิน",
        albums: "อัลบั้ม",
        queue: "คิวการเล่น",
        eq: "ปรับเสียง · EQ",
        settings: "ตั้งค่า",
      } as Record<string, string>
    )[view];

  return (
    <div
      ref={root}
      className={`app ${compact ? "compact" : "full"} ${tv ? "tv" : ""} ${hasVideo ? "has-video" : ""} ${videoExpanded ? "video-expanded" : ""} ${view === "queue" || view === "eq" ? "panel-open" : ""}`}
      data-surface={compact ? "compact" : "full"}
    >
      <header className="topbar" hidden={compact}>
        <div className="brand">
          <span className="brand-icon">▶</span>
          <strong>Lalin Play</strong>
          <small>LOCAL MEDIA PLAYER</small>
        </div>
        <div className="top-actions">
          <button disabled={busy} onClick={() => void select(false)}>
            ＋ ไฟล์
          </button>
          {!compact ? (
            <button disabled={busy} onClick={() => void select(true)}>
              ＋ โฟลเดอร์
            </button>
          ) : null}
          <button disabled={switching} onClick={() => void switchSurface()}>
            {compact ? "Full ↗" : "Compact ↙"}
          </button>
          {tv ? (
            <button data-tv-exit onClick={leaveTv}>
              ออก TV
            </button>
          ) : null}
        </div>
      </header>
      {error ? (
        <div className="error" role="alert">
          {error}
          <button aria-label="ปิดข้อความผิดพลาด" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      ) : null}
      <VideoStage
        compact={compact}
        expanded={videoExpanded}
        onExpand={() => setExpanded((value) => !value)}
      />
      <div className="workspace" hidden={compact}>
        {!compact ? (
          <aside>
            {hasVideo ? (
              <button onClick={() => setExpanded(true)}>
                Now Playing · วิดีโอ
              </button>
            ) : null}
            <div className="section-label">คลังเพลง</div>
            {(
              [
                ["tracks", "♫ เพลงทั้งหมด"],
                ["artists", "ศิลปิน"],
                ["albums", "อัลบั้ม"],
                ["queue", "คิวการเล่น"],
                ["eq", "ปรับเสียง EQ"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-current={view === id ? "page" : undefined}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
            <div className="section-label">PLAYLISTS</div>
            {playlists.map((item) => (
              <button
                key={item.id}
                aria-current={
                  view === `playlist:${item.id}` ? "page" : undefined
                }
                onClick={() => setView(`playlist:${item.id}`)}
              >
                {item.name}
              </button>
            ))}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  !playlistName.trim() ||
                  !playlistReady ||
                  playlists.length >= 200
                )
                  return;
                const item = {
                  id: crypto.randomUUID(),
                  name: playlistName.trim(),
                  trackIds: [],
                };
                updatePlaylists([...playlists, item]);
                setPlaylistName("");
              }}
            >
              <input
                aria-label="ชื่อ playlist ใหม่"
                placeholder="ชื่อ playlist ใหม่"
                maxLength={120}
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
              />
              <button disabled={!playlistReady || !playlistName.trim()}>
                ＋ สร้าง playlist
              </button>
            </form>
            <button
              className="settings-link"
              onClick={() => setView("settings")}
            >
              ตั้งค่า
            </button>
            <p className="local-note">
              ไฟล์อยู่ในเครื่อง
              <br />
              ไม่มี AI backend
            </p>
          </aside>
        ) : null}
        <main
          className={
            compact && view !== "queue" && view !== "eq" ? "compact-hidden" : ""
          }
        >
          {!compact ? (
            <div className="page-heading">
              <div>
                <span className="eyebrow">YOUR MUSIC, YOUR SPACE</span>
                <h1>{title}</h1>
                <p>
                  {tracks.length} เพลงในคลัง · {queue.items.length} เพลงในคิว
                </p>
              </div>
              <input
                type="search"
                aria-label="ค้นหาเพลง"
                placeholder="ค้นหาเพลง ศิลปิน อัลบั้ม…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          ) : null}
          {view === "eq" ? (
            <PlaybackEQPanel />
          ) : view === "queue" ? (
            <section aria-label="รายการคิว">
              <div className="list-actions">
                <button
                  disabled={!queue.items.length}
                  onClick={() => usePlaybackStore.getState().clearQueue()}
                >
                  ล้างคิว (ไม่ลบไฟล์)
                </button>
              </div>
              {queue.items.map((item, index) => (
                <div className="track-row" key={`${item.id}:${index}`}>
                  <button
                    className="track-title"
                    onClick={() =>
                      void usePlaybackStore
                        .getState()
                        .playAtIndex(index)
                        .catch(report)
                    }
                  >
                    <span>
                      {queue.currentIndex === index ? "▶" : index + 1}
                    </span>
                    {item.title}
                  </button>
                  <button
                    disabled={!index}
                    aria-label={`เลื่อน ${item.title} ขึ้น`}
                    onClick={() =>
                      usePlaybackStore.getState().reorderQueue(index, index - 1)
                    }
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`นำ ${item.title} ออกจากคิว`}
                    onClick={() =>
                      usePlaybackStore.getState().removeFromQueue(index)
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              {!queue.items.length ? (
                <p className="empty">
                  ยังไม่มีเพลงในคิว · เพิ่มเพลงจากคลังเพื่อเริ่มฟัง
                </p>
              ) : null}
            </section>
          ) : view === "settings" ? (
            <section className="settings">
              <PlaybackSettings report={report} />
              <label>
                <input
                  type="checkbox"
                  checked={resume}
                  onChange={(e) => {
                    try {
                      localStorage.setItem(
                        "lalin-play:v1:resume",
                        String(e.target.checked),
                      );
                      setResume(e.target.checked);
                    } catch (error) {
                      report(error);
                    }
                  }}
                />{" "}
                คืนคิวเมื่อเปิดแอปครั้งถัดไป (ไม่เล่นอัตโนมัติ)
              </label>
              <button
                onClick={() =>
                  void invoke("set_tv", { enabled: true })
                    .then(() => {
                      setTv(true);
                      setView("queue");
                    })
                    .catch(report)
                }
              >
                เปิด TV presentation
              </button>
              <p>
                อัปเดต: ยังไม่เปิดใช้ จนกว่าจะตั้งค่าคีย์และทดสอบ signed release
              </p>
              <p>ปิดหน้าต่างแล้วเพลงเล่นต่อ เปิดกลับได้จาก system tray</p>
              <button onClick={() => void invoke("quit_play").catch(report)}>
                ออกจาก Lalin Play
              </button>
            </section>
          ) : (
            <section>
              {selectedPlaylist ? (
                <div className="list-actions">
                  <button
                    onClick={() => {
                      for (const id of selectedPlaylist.trackIds) {
                        const item = tracks.find((track) => track.id === id);
                        if (item)
                          usePlaybackStore
                            .getState()
                            .addToQueue(mediaItem(item));
                      }
                    }}
                  >
                    เพิ่ม playlist เข้าคิว
                  </button>
                  <button
                    onClick={() => {
                      updatePlaylists(
                        playlists.filter(
                          (item) => item.id !== selectedPlaylist.id,
                        ),
                      );
                      setView("tracks");
                    }}
                  >
                    ลบ playlist (ไม่ลบไฟล์)
                  </button>
                </div>
              ) : null}
              {groups.map((group) => (
                <div key={group}>
                  {group ? <h2>{group}</h2> : null}
                  {filtered
                    .filter(
                      (item) =>
                        !group ||
                        (view === "artists" ? item.artist : item.album) ===
                          group ||
                        (group === "ไม่ระบุ" &&
                          !(view === "artists" ? item.artist : item.album)),
                    )
                    .map((item) => (
                      <div className="track-row" key={item.id}>
                        <button
                          className="track-title"
                          onClick={() =>
                            void usePlaybackStore
                              .getState()
                              .play(mediaItem(item))
                              .catch(report)
                          }
                        >
                          <span className="track-icon">
                            {item.kind === "video" ? "▶" : "♪"}
                          </span>
                          <span>
                            <strong>{item.title}</strong>
                            <small>
                              {item.missing
                                ? "ไม่พบไฟล์ — เพิ่มไฟล์จากตำแหน่งใหม่"
                                : item.artist || "ไม่ระบุศิลปิน"}
                            </small>
                          </span>
                        </button>
                        <span className="album">{item.album || "—"}</span>
                        <time>
                          {item.duration == null
                            ? "—"
                            : formatTime(item.duration)}
                        </time>
                        <button
                          aria-label={`เล่นถัดไป ${item.title}`}
                          title="เล่นถัดไป"
                          onClick={() =>
                            usePlaybackStore
                              .getState()
                              .playNext(mediaItem(item))
                          }
                        >
                          ↳
                        </button>
                        <button
                          aria-label={`เพิ่ม ${item.title} เข้าคิว`}
                          title="เพิ่มเข้าคิว"
                          onClick={() =>
                            usePlaybackStore
                              .getState()
                              .addToQueue(mediaItem(item))
                          }
                        >
                          ＋
                        </button>
                        {playlists.length ? (
                          <select
                            aria-label={`เพิ่ม ${item.title} เข้า playlist`}
                            value=""
                            onChange={(event) => {
                              const id = event.target.value;
                              updatePlaylists(
                                playlists.map((playlist) =>
                                  playlist.id === id
                                    ? {
                                        ...playlist,
                                        trackIds: [
                                          ...new Set([
                                            ...playlist.trackIds,
                                            item.id,
                                          ]),
                                        ],
                                      }
                                    : playlist,
                                ),
                              );
                            }}
                          >
                            <option value="">Playlist…</option>
                            {playlists.map((playlist) => (
                              <option key={playlist.id} value={playlist.id}>
                                {playlist.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          aria-label={`นำ ${item.title} ออกจาก${selectedPlaylist ? " playlist" : "คลัง"}`}
                          onClick={() => {
                            if (selectedPlaylist)
                              updatePlaylists(
                                playlists.map((playlist) =>
                                  playlist.id === selectedPlaylist.id
                                    ? {
                                        ...playlist,
                                        trackIds: playlist.trackIds.filter(
                                          (id) => id !== item.id,
                                        ),
                                      }
                                    : playlist,
                                ),
                              );
                            else
                              void invoke("remove_library_track", {
                                id: item.id,
                              })
                                .then(refresh)
                                .catch(report);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                </div>
              ))}
              {!filtered.length ? (
                <div className="empty">
                  <div className="empty-icon">♫</div>
                  <h2>
                    {tracks.length
                      ? "ไม่พบเพลงในรายการนี้"
                      : "พื้นที่สำหรับเพลงของคุณ"}
                  </h2>
                  <p>
                    เพิ่มไฟล์หรือโฟลเดอร์ แล้วจัดคลังและ playlist ได้ในเครื่อง
                  </p>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void select(false)}
                  >
                    {busy ? "กำลังอ่านไฟล์…" : "เลือกไฟล์เสียง / วิดีโอ"}
                  </button>
                </div>
              ) : null}
            </section>
          )}
        </main>
      </div>
      {compact ? (
        <CompactTransport
          key={mediaId ?? "empty"}
          onFull={() => void switchSurface()}
          switching={switching}
          fullscreen={fullscreen}
          onFullscreen={() => void changeFullscreen(!fullscreen)}
          onOpen={() => void select(false)}
          report={report}
        />
      ) : (
        <Transport report={report} />
      )}
    </div>
  );
}
