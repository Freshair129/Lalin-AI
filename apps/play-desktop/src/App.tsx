// @req FR-20.1, FR-20.3, FR-20.5 — Full mixer navigation and existing player owners
// @req FR-22.1, FR-22.2 — Shared ENG/TH UI state across Full and Compact
// @req PLAY-14 — Local listening dashboard and history-based recommendations
// @req PLAY-16 — YouTube entries remain official external links
// @req PLAY-18 — User/offline badges and favorite filtering
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PlaybackEQPanel } from "./components/PlaybackEQPanel";
import { PlaybackSettings } from "./components/PlaybackSettings";
import { PlaybackMixerPanel } from "./components/PlaybackMixerPanel";
import { PlayMigrationImport } from "./components/PlayMigrationImport";
import { VideoStage } from "./components/VideoStage";
import { CompactTransport } from "./components/CompactTransport";
import { Transport, formatTime } from "./components/Transport";
import { addYoutubeLink, getLibrary, importSelectedFile, listDamagedTracks, listYoutubeLinks, mediaItem, openYoutubeLink, removeYoutubeLink, restoreManagedTrack, selectRelinkFile, selectRestoreFile, relinkTrack, isVideoItem, type DamagedTrack, type LocalTrack, type YoutubeLink } from "./native";
import { loadPlaylists, savePlaylists, type Playlist } from "./playlists";
import { usePlaybackStore } from "./playback/usePlaybackStore";
import { PlaybackAudioEngine, type AudibleTimeUpdate } from "./playback/audioEngine";
import { bindHandoffReceiver } from "./handoffReceiver";
import { I18nProvider, useI18n, localizeError } from "./i18n";
import {
  activateTvFocus,
  createGamepadAdapter,
  isTextEditingTarget,
  mapTvKey,
  moveTvFocus,
} from "./playback/tvMode";

type View =
  | "home"
  | "tracks"
  | "favorites"
  | "artists"
  | "albums"
  | "queue"
  | "mixer"
  | "eq"
  | "settings"
  | "youtube"
  | "repair"
  | `playlist:${string}`;

export function App() {
  return <I18nProvider><AppContent /></I18nProvider>;
}

function AppContent() {
  const { locale, setLocale, t, tPlural } = useI18n();
  useEffect(() => {
    PlaybackAudioEngine.getInstance().setMediaElementLabel(t("video.label"));
  }, [locale, t]);
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [damagedTracks, setDamagedTracks] = useState<DamagedTrack[]>([]);
  const [view, setView] = useState<View>("home");
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
  const currentTrack = tracks.find((track) => track.id === mediaId);
  const canRelinkCurrent = currentTrack != null && currentTrack.storageKind !== "managed";
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
  const [showRepairLink, setShowRepairLink] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistReady, setPlaylistReady] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [youtubeLinks, setYoutubeLinks] = useState<YoutubeLink[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [resume, setResume] = useState(
    () => localStorage.getItem("lalin-play:v1:resume") === "true",
  );
  const root = useRef<HTMLDivElement>(null);
  const queue = usePlaybackStore((state) => state.queue);
  const listenProgress = useRef(new Map<string, {
    lastTime: number | null;
    heardSeconds: number;
    recorded: boolean;
  }>());
  const report = useCallback((value: unknown) => {
    setError(String(value));
    setShowRepairLink(false);
  }, []);
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window) && !("__TAURI__" in window)) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    void bindHandoffReceiver(report)
      .then((dispose) => {
        if (active) cleanup = dispose;
        else dispose();
      })
      .catch(report);
    return () => {
      active = false;
      cleanup?.();
    };
  }, [report]);
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
  const refresh = useCallback(async () => {
    const [library, damaged] = await Promise.all([getLibrary(), listDamagedTracks()]);
    setTracks(library);
    setDamagedTracks(damaged);
  }, []);
  const refreshYoutubeLinks = useCallback(() => listYoutubeLinks().then(setYoutubeLinks), []);

  useEffect(() => {
    const engine = PlaybackAudioEngine.getInstance();
    const onAudibleTimeUpdate = (update: AudibleTimeUpdate) => {
      const key = `${update.queueEntryId}:${update.sessionId}`;
      const progress = listenProgress.current.get(key) ?? {
        lastTime: null,
        heardSeconds: 0,
        recorded: false,
      };
      if (!update.audible) {
        progress.lastTime = null;
        listenProgress.current.set(key, progress);
        return;
      }
      if (progress.lastTime !== null) {
        const elapsed = update.currentTime - progress.lastTime;
        // Ignore seeks, decoder jumps and suspended-tab gaps; count only audible deck time.
        if (elapsed > 0 && elapsed <= 2.5) progress.heardSeconds += elapsed;
      }
      progress.lastTime = update.currentTime;
      const threshold = update.duration > 0 && update.duration <= 30
        ? update.duration / 2
        : 30;
      if (!progress.recorded && progress.heardSeconds >= threshold) {
        progress.recorded = true;
        void invoke("record_listen", { id: update.mediaId })
          .then(() => refresh())
          .catch(report);
      }
      listenProgress.current.set(key, progress);
    };
    engine.on("audibletimeupdate", onAudibleTimeUpdate);
    return () => engine.off("audibletimeupdate", onAudibleTimeUpdate);
  }, [refresh, report]);

  useEffect(() => {
    void refreshYoutubeLinks().catch(report);
  }, [refreshYoutubeLinks, report]);

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
    setShowRepairLink(false);
    setNotice(null);
    try {
      await invoke("select_media", { folder, path: null });
      await refresh();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  const relink = async (id: string) => {
    setBusy(true);
    setError(null);
    setShowRepairLink(false);
    setNotice(null);
    try {
      const path = await selectRelinkFile(id);
      if (path === null) return;
      let track: LocalTrack;
      try {
        track = await relinkTrack(id, path, false);
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error)
          .replace(/^Error:\s*/, "");
        if (message !== "relink:different-content") throw error;
        if (!window.confirm(t("relink.confirmDifferentContent"))) return;
        track = await relinkTrack(id, path, true);
      }
      setTracks((current) => current.some((item) => item.id === id)
        ? current.map((item) => item.id === id ? track : item)
        : [...current, track]);
      usePlaybackStore.getState().applyRelinkedTrack(track);
      setNotice(t("relink.success"));
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id: string) => {
    setBusy(true);
    setError(null);
    setShowRepairLink(false);
    setNotice(null);
    try {
      const path = await selectRestoreFile(id);
      if (path === null) return;
      try {
        await restoreManagedTrack(id, path);
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error)
          .replace(/^Error:\s*/, "");
        if (message !== "recovery:content-mismatch") throw error;
        if (!window.confirm(t("recovery.importMismatchConfirm"))) return;
        await importSelectedFile(path);
        await refresh();
        setNotice(t("recovery.importedNew"));
        return;
      }
      await refresh();
      setNotice(t("recovery.success"));
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
  const matchesQuery = (track: LocalTrack) =>
    `${track.title} ${track.artist ?? ""} ${track.album ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase());
  const filtered = tracks.filter(
    (track) =>
      (!selectedPlaylist || selectedPlaylist.trackIds.includes(track.id)) &&
      (view !== "favorites" || track.favorite === true) &&
      matchesQuery(track),
  );
  const recentlyPlayed = [...tracks]
    .filter((track) => track.lastPlayedAt != null && matchesQuery(track))
    .sort((left, right) => (right.lastPlayedAt ?? 0) - (left.lastPlayedAt ?? 0))
    .slice(0, 8);
  const mostPlayed = [...tracks]
    .filter((track) => (track.playCount ?? 0) > 0 && matchesQuery(track))
    .sort((left, right) => (right.playCount ?? 0) - (left.playCount ?? 0) || left.title.localeCompare(right.title))
    .slice(0, 8);
  const artistAffinity = new Map<string, number>();
  const albumAffinity = new Map<string, number>();
  for (const track of tracks) {
    const affinity = (track.playCount ?? 0) + (track.favorite ? 3 : 0);
    if (!affinity) continue;
    if (track.artist) artistAffinity.set(track.artist, (artistAffinity.get(track.artist) ?? 0) + affinity);
    if (track.album) albumAffinity.set(track.album, (albumAffinity.get(track.album) ?? 0) + affinity);
  }
  const recommended = tracks
    .filter((track) => !track.missing && !track.favorite && matchesQuery(track))
    .map((track) => ({
      track,
      score: (artistAffinity.get(track.artist ?? "") ?? 0) + (albumAffinity.get(track.album ?? "") ?? 0) - Math.log2((track.playCount ?? 0) + 1),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.track.title.localeCompare(right.track.title))
    .slice(0, 8)
    .map(({ track }) => track);
  const groups =
    view === "artists" || view === "albums"
      ? [
          ...new Set(
            filtered.map(
              (item) =>
                (view === "artists" ? item.artist : item.album) || t("app.unspecifiedArtist"),
            ),
          ),
        ].sort()
      : [""];
  const title =
    selectedPlaylist?.name ||
    (
      {
        home: t("app.homeTitle"),
        tracks: t("app.tracksTitle"),
        favorites: t("app.favorites"),
        artists: t("app.artists"),
        albums: t("app.albums"),
        queue: t("app.queueTitle"),
        mixer: t("app.mixerTitle"),
        eq: t("app.eqTitle"),
        settings: t("app.settingsTitle"),
        youtube: t("app.youtubeLinksTitle"),
        repair: t("recovery.panelTitle"),
      } as Record<string, string>
    )[view];

  const renderTrackRows = (items: LocalTrack[]) => items.map((item) => (
    <div className="track-row" key={item.id}>
      <button
        className="track-title"
        onClick={() => void usePlaybackStore.getState().play(mediaItem(item)).catch(report)}
      >
        <span className="track-icon">{item.kind === "video" ? "▶" : "♪"}</span>
        <span>
          <strong>{item.title}</strong>
          <small>
            {item.missing ? t("app.missingFile") : item.artist || t("app.unspecifiedArtist")}
            {(item.playCount ?? 0) > 0 ? ` · ${t("app.playCount", { count: item.playCount ?? 0 })}` : ""}
          </small>
        </span>
      </button>
      <div className="track-badges" aria-label={`${item.sourceKind === "user" || !item.sourceKind ? t("app.badgeUser") : item.sourceKind} ${item.storageKind === "managed" ? t("app.badgeOffline") : ""}`}>
        {item.sourceKind === "user" || !item.sourceKind ? <span className="source-badge">{t("app.badgeUser")}</span> : null}
        {item.storageKind === "managed" ? <span className="source-badge offline-badge">{t("app.badgeOffline")}</span> : null}
      </div>
      {item.missing && item.storageKind !== "managed" ? (
        <button
          type="button"
          title={t("relink.pickerTitle")}
          disabled={busy}
          onClick={() => void relink(item.id)}
        >
          {t("relink.button")}
        </button>
      ) : null}
      <span className="album">{item.album || "—"}</span>
      <time>{item.duration == null ? "—" : formatTime(item.duration)}</time>
      <button
        className={`favorite-button ${item.favorite ? "is-favorite" : ""}`}
        aria-label={item.favorite ? t("app.unfavoriteTrack", { title: item.title }) : t("app.favoriteTrack", { title: item.title })}
        aria-pressed={item.favorite === true}
        onClick={() => void invoke("set_track_favorite", { id: item.id, favorite: !item.favorite }).then(refresh).catch(report)}
      >★</button>
      <button aria-label={`${t("app.playNext")} ${item.title}`} title={t("app.playNext")} onClick={() => usePlaybackStore.getState().playNext(mediaItem(item))}>↳</button>
      <button aria-label={`${t("app.addToQueue")} ${item.title}`} title={t("app.addToQueue")} onClick={() => usePlaybackStore.getState().addToQueue(mediaItem(item))}>＋</button>
      {playlists.length ? (
        <select
          aria-label={t("app.addToPlaylist", { title: item.title })}
          value=""
          onChange={(event) => {
            const id = event.target.value;
            updatePlaylists(playlists.map((playlist) => playlist.id === id
              ? { ...playlist, trackIds: [...new Set([...playlist.trackIds, item.id])] }
              : playlist));
          }}
        >
          <option value="">{t("app.playlistOption")}</option>
          {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
        </select>
      ) : null}
      <button
        aria-label={selectedPlaylist ? t("app.removeFromPlaylist", { title: item.title }) : t("app.removeFromLibrary", { title: item.title })}
        onClick={() => {
          if (selectedPlaylist) updatePlaylists(playlists.map((playlist) => playlist.id === selectedPlaylist.id
            ? { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== item.id) }
            : playlist));
          else void invoke("remove_library_track", { id: item.id }).then(refresh).catch(report);
        }}
      >×</button>
    </div>
  ));

  return (
    <div
      ref={root}
      className={`app ${compact ? "compact" : "full"} ${tv ? "tv" : ""} ${hasVideo ? "has-video" : ""} ${videoExpanded ? "video-expanded" : ""} ${view === "queue" || view === "eq" || view === "mixer" || view === "repair" ? "panel-open" : ""}`}
      data-surface={compact ? "compact" : "full"}
    >
      <header className="topbar" hidden={compact}>
        <div className="brand">
          <span className="brand-icon">▶</span>
          <strong>Lalin Play</strong>
          <small>{t("app.localPlayer")}</small>
        </div>
        <div className="top-actions">
          <button disabled={busy} onClick={() => void select(false)}>
            {t("app.addFile")}
          </button>
          {!compact ? (
            <button disabled={busy} onClick={() => void select(true)}>
              {t("app.addFolder")}
            </button>
          ) : null}
          <button disabled={switching} onClick={() => void switchSurface()}>
            {compact ? t("app.switchFull") : t("app.switchCompact")}
          </button>
          <div className="language-switch" role="group" aria-label={t("language.label")}>
            <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")} title={t("language.english")}>ENG</button>
            <button type="button" aria-pressed={locale === "th"} onClick={() => setLocale("th")} title={t("language.thai")}>TH</button>
          </div>
          {tv ? (
            <button data-tv-exit onClick={leaveTv}>
              {t("app.exitTv")}
            </button>
          ) : null}
        </div>
      </header>
      {error ? (
        <div className="error" role="alert">
          {localizeError(error, locale)}
          {showRepairLink ? (
            <button
              type="button"
              className="recovery-error-link"
              onClick={() => {
                setError(null);
                setShowRepairLink(false);
                setView("repair");
              }}
            >
              {t("recovery.openPanel")}
            </button>
          ) : null}
          <button aria-label={t("app.dismissError")} onClick={() => {
            setError(null);
            setShowRepairLink(false);
          }}>
            ×
          </button>
        </div>
      ) : null}
      {notice ? <div className="notice" role="status">{notice}</div> : null}
      {!compact && damagedTracks.length ? (
        <div className="recovery-notice" role="status">
          <span>{tPlural("recovery.notice", damagedTracks.length)}</span>
          <button type="button" onClick={() => setView("repair")}>
            {t("recovery.openPanel")}
          </button>
        </div>
      ) : null}
      {compact && damagedTracks.length ? (
        <div className="compact-recovery-hint" role="status">
          {tPlural("recovery.compactHint", damagedTracks.length)}
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
                {t("app.videoNowPlaying")}
              </button>
            ) : null}
            <div className="section-label">{t("app.library")}</div>
            {(
              [
                ["home", t("app.home")],
                ["tracks", t("app.allTracks")],
                ["favorites", t("app.favorites")],
                ["artists", t("app.artists")],
                ["albums", t("app.albums")],
                ["queue", t("app.queue")],
                ["mixer", t("app.mixer")],
                ["eq", t("app.eq")],
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
            {damagedTracks.length ? (
              <button
                aria-current={view === "repair" ? "page" : undefined}
                onClick={() => setView("repair")}
              >
                {t("recovery.panelTitle")} · {damagedTracks.length}
              </button>
            ) : null}
            <button aria-current={view === "youtube" ? "page" : undefined} onClick={() => setView("youtube")}>
              {t("app.youtubeLinks")}
            </button>
            <div className="section-label">{t("app.playlists")}</div>
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
                aria-label={t("app.newPlaylistName")}
                placeholder={t("app.newPlaylistName")}
                maxLength={120}
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
              />
              <button disabled={!playlistReady || !playlistName.trim()}>
                {t("app.createPlaylist")}
              </button>
            </form>
            <button
              className="settings-link"
              onClick={() => setView("settings")}
            >
              {t("app.settings")}
            </button>
            <p className="local-note">
              {t("app.localNote")}
              <br />
              {t("app.noAiBackend")}
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
                  <span className="eyebrow">{t("app.tagline")}</span>
                <h1>{title}</h1>
                <p>
                  {t("app.libraryCounts", { tracks: tracks.length, queued: queue.items.length })}
                </p>
              </div>
              <input
                type="search"
                aria-label={t("app.searchLabel")}
                placeholder={t("app.search")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          ) : null}
          {view === "home" ? (
            <section className="dashboard">
              <div className="dashboard-welcome">
                <div>
                  <span className="eyebrow">LALIN PLAY</span>
                  <h2>{t("app.homeTitle")}</h2>
                  <p>{t("app.dashboardSubtitle")}</p>
                </div>
                <button className="primary" disabled={busy} onClick={() => void select(false)}>
                  {busy ? t("app.readingFiles") : t("app.chooseMedia")}
                </button>
              </div>
              <div className="dashboard-stats">
                <div><strong>{tracks.length}</strong><span>{t("app.allTracks")}</span></div>
                <div><strong>{tracks.reduce((count, track) => count + (track.playCount ?? 0), 0)}</strong><span>{t("app.totalPlays")}</span></div>
                <div><strong>{tracks.filter((track) => track.favorite).length}</strong><span>{t("app.favorites")}</span></div>
              </div>
              <section className="dashboard-section">
                <h2>{t("app.recentlyPlayed")}</h2>
                {recentlyPlayed.length ? renderTrackRows(recentlyPlayed) : <p className="empty">{t("app.noListeningHistory")}</p>}
              </section>
              <section className="dashboard-section">
                <h2>{t("app.mostPlayed")}</h2>
                {mostPlayed.length ? renderTrackRows(mostPlayed) : <p className="empty">{t("app.noListeningHistory")}</p>}
              </section>
              <section className="dashboard-section">
                <h2>{t("app.recommended")}</h2>
                {recommended.length ? renderTrackRows(recommended) : <p className="empty">{t("app.noRecommendations")}</p>}
              </section>
            </section>
          ) : view === "eq" ? (
            <PlaybackEQPanel />
          ) : view === "mixer" ? (
            <PlaybackMixerPanel onOpenEQ={() => setView("eq")} report={report} />
          ) : view === "repair" ? (
            <section className="recovery-panel" aria-label={t("recovery.panelTitle")}>
              <h2>{t("recovery.panelTitle")}</h2>
              {damagedTracks.map((damaged) => (
                <article className="recovery-item" key={damaged.id}>
                  <div className="recovery-details">
                    <strong>{damaged.title}</strong>
                    <small>
                      {t(damaged.reason === "missing" ? "recovery.reasonMissing" : "recovery.reasonCorrupt")}
                      {damaged.artist ? ` · ${damaged.artist}` : ""}
                      {damaged.album ? ` · ${damaged.album}` : ""}
                    </small>
                    <code>{damaged.sourcePath || t("recovery.noSourcePath")}</code>
                  </div>
                  <button type="button" disabled={busy} onClick={() => void restore(damaged.id)}>
                    {busy ? t("app.readingFiles") : t("recovery.restore")}
                  </button>
                </article>
              ))}
              {!damagedTracks.length ? <p className="empty">{t("recovery.empty")}</p> : null}
            </section>
          ) : view === "queue" ? (
            <section aria-label={t("app.queueLabel")}>
              <div className="list-actions">
                <button
                  disabled={!queue.items.length}
                  onClick={() => usePlaybackStore.getState().clearQueue()}
                >
                  {t("app.clearQueue")}
                </button>
              </div>
              {queue.items.map((item, index) => (
                <div className="track-row" key={item.queueEntryId ?? `${item.id}:${index}`}>
                  <button
                    className="track-title"
                    onClick={() => {
                      if (damagedTracks.some((damaged) => damaged.id === item.id)) {
                        setError(t("app.missingFile"));
                        setShowRepairLink(true);
                        return;
                      }
                      setShowRepairLink(false);
                      void usePlaybackStore.getState().playAtIndex(index).catch(report);
                    }}
                  >
                    <span>
                      {queue.currentIndex === index ? "▶" : index + 1}
                    </span>
                    {item.title}
                  </button>
                  <button
                    disabled={!index}
                    aria-label={t("app.moveTrackUp", { title: item.title })}
                    onClick={() =>
                      usePlaybackStore.getState().reorderQueue(index, index - 1)
                    }
                  >
                    ↑
                  </button>
                  <button
                    aria-label={t("app.removeFromQueue", { title: item.title })}
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
                  {t("app.queueEmpty")}
                </p>
              ) : null}
            </section>
          ) : view === "settings" ? (
            <section className="settings">
              <PlaybackSettings report={report} />
              <PlayMigrationImport onChanged={() => {
                setResume(localStorage.getItem("lalin-play:v1:resume") === "true");
                void refresh().catch(report);
              }} />
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
                {t("app.restoreQueue")}
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
                {t("app.tvPresentation")}
              </button>
              <p>{t("app.trayPlayback")}</p>
              <button onClick={() => void invoke("quit_play").catch(report)}>
                {t("app.quit")}
              </button>
            </section>
          ) : view === "youtube" ? (
            <section className="youtube-library">
              <p>{t("app.youtubeLinksHelp")}</p>
              <form
                className="youtube-link-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addYoutubeLink(youtubeUrl, youtubeTitle)
                    .then(() => refreshYoutubeLinks())
                    .then(() => {
                      setYoutubeUrl("");
                      setYoutubeTitle("");
                    })
                    .catch(report);
                }}
              >
                <input type="url" required maxLength={2048} aria-label={t("app.youtubeUrl")} placeholder={t("app.youtubeUrl")} value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} />
                <input type="text" required maxLength={240} aria-label={t("app.youtubeTitle")} placeholder={t("app.youtubeTitle")} value={youtubeTitle} onChange={(event) => setYoutubeTitle(event.target.value)} />
                <button className="primary" disabled={!youtubeUrl.trim() || !youtubeTitle.trim()}>{t("app.addYoutubeLink")}</button>
              </form>
              {youtubeLinks.map((link) => (
                <div className="youtube-row" key={link.id}>
                  <span className="source-badge youtube-badge">{t("app.badgeYoutube")}</span>
                  <strong>{link.title}</strong>
                  <button onClick={() => void openYoutubeLink(link.id).catch(report)}>{t("app.openYoutube")}</button>
                  <button aria-label={`${t("app.removeYoutube")} ${link.title}`} onClick={() => void removeYoutubeLink(link.id).then(() => refreshYoutubeLinks()).catch(report)}>×</button>
                </div>
              ))}
              {!youtubeLinks.length ? <p className="empty">{t("app.noYoutubeLinks")}</p> : null}
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
                    {t("app.addPlaylistToQueue")}
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
                    {t("app.deletePlaylist")}
                  </button>
                </div>
              ) : null}
              {groups.map((group) => (
                <div key={group}>
                  {group ? <h2>{group}</h2> : null}
                  {renderTrackRows(filtered.filter((item) =>
                    !group ||
                    (view === "artists" ? item.artist : item.album) === group ||
                    (group === t("app.unspecifiedArtist") && !(view === "artists" ? item.artist : item.album)),
                  ))}
                </div>
              ))}
              {!filtered.length ? (
                <div className="empty">
                  <div className="empty-icon">♫</div>
                  <h2>
                    {view === "favorites" && tracks.length
                      ? t("app.noFavorites")
                      : tracks.length
                        ? t("app.noTracksFound")
                      : t("app.emptyLibraryTitle")}
                  </h2>
                  <p>
                    {t("app.emptyLibraryBody")}
                  </p>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void select(false)}
                  >
                    {busy ? t("app.readingFiles") : t("app.chooseMedia")}
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
          relinkHint={canRelinkCurrent}
          report={report}
        />
      ) : (
        <Transport
          report={report}
          onRelink={canRelinkCurrent ? () => void relink(currentTrack.id) : undefined}
          relinkTitle={t("relink.pickerTitle")}
        />
      )}
    </div>
  );
}
