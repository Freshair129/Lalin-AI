// @req FR-16.1 — Playback from Library/Workspace
// @req FR-16.2 — Transport controls
// @req FR-16.3 — Now Playing state
// @req FR-16.4 — Queue management
// @req FR-16.5 — Repeat and Shuffle
// @req FR-16.11 — Player survives route/window changes
// @req FR-16.13 — Playback speed
// @req FR-16.14 — Keyboard shortcuts
// @req FR-16W.1 — Hardware media keys
// @req FR-16W.2 — Windows SMTC metadata integration
// @req FR-16W.4 — Output device selection
// @req FR-16W.5 — Output device fallback/loss handling
// @req FR-16W.6 — Playback continues when minimized or hidden
// @req FR-17.1 — Integrated EQ surface
// @req FR-17.2 — 10-Band Web Audio EQ

import { useEffect, useState } from "react";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { PlaybackEQPanel } from "./PlaybackEQPanel";
import { initMediaSessionAdapter } from "../playback/mediaSessionAdapter";
import { connectPlaybackOwner } from "../playback/playbackOwner";
import {
  minimizeCurrentWindow,
  toggleMaximizeCurrentWindow,
  hideOrCloseCurrentWindow,
  bindPlayWindowClose,
} from "../playback/windowManager";

function formatTime(sec: number): string {
  if (Number.isNaN(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function LalinPlayWindow() {
  const {
    nowPlaying,
    queue,
    togglePlay,
    stop,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    setPlaybackRate,
    setRepeatMode,
    toggleShuffle,
    playAtIndex,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    availableOutputDevices,
    setOutputDevice,
    refreshOutputDevices,
  } = usePlaybackStore();

  const [activeTab, setActiveTab] = useState<"queue" | "eq">("queue");
  const [windowError, setWindowError] = useState<string | null>(null);
  const runWindowAction = (action: () => Promise<void>) => {
    setWindowError(null);
    void action().catch((error: unknown) => setWindowError(`ควบคุมหน้าต่างไม่ได้: ${String(error)}`));
  };

  // Initialize MediaSession adapter for SMTC / media keys
  useEffect(() => {
    return initMediaSessionAdapter();
  }, []);

  // Refresh output devices on mount
  useEffect(() => {
    refreshOutputDevices();
  }, [refreshOutputDevices]);

  // owner อยู่ข้าม effect mount เพื่อกันคำสั่งซ้ำใน StrictMode
  useEffect(() => {
    try { return connectPlaybackOwner(); }
    catch (error) { setWindowError(`เชื่อมต่อ Studio ไม่สำเร็จ: ${String(error)}`); }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unbind: (() => void) | undefined;
    const report = (message: string) => { if (!disposed) setWindowError(message); };
    void bindPlayWindowClose(report).then((cleanup) => {
      if (disposed) cleanup(); else unbind = cleanup;
    }).catch((error: unknown) => report(`ตั้งค่าปิดหน้าต่างไม่ได้: ${String(error)}`));
    return () => { disposed = true; unbind?.(); };
  }, []);

  // Keyboard shortcuts (FR-16.14)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seek(nowPlaying.currentTime + (e.shiftKey ? 15 : 5));
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seek(Math.max(0, nowPlaying.currentTime - (e.shiftKey ? 15 : 5)));
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        setVolume(Math.min(1, nowPlaying.volume + 0.05));
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        setVolume(Math.max(0, nowPlaying.volume - 0.05));
      } else if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
      } else if (e.code === "Escape") {
        e.preventDefault();
        void hideOrCloseCurrentWindow().catch((error: unknown) => setWindowError(`ปิดหน้าต่างไม่ได้: ${String(error)}`));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nowPlaying.currentTime, nowPlaying.volume, togglePlay, seek, setVolume, toggleMute]);

  const currentItem = nowPlaying.item;
  const progressPercent =
    nowPlaying.duration > 0
      ? Math.min(100, (nowPlaying.currentTime / nowPlaying.duration) * 100)
      : 0;

  return (
    <div className="lalin-play-standalone-surface" role="application" aria-label="Lalin Play Window">
      {/* Standalone Window Titlebar */}
      <div className="lalin-play-standalone-titlebar" data-tauri-drag-region>
        <div className="lalin-play-brand" data-tauri-drag-region>
          <span className="brand-mark" />
          <strong className="lalin-play-title">LALIN PLAY</strong>
          <span className="lalin-play-subtitle">
            {currentItem ? currentItem.title : "Windows Media Player + EQ"}
          </span>
        </div>

        <div className="lalin-play-tabs">
          <button
            className={`lalin-tab-btn ${activeTab === "queue" ? "active" : ""}`}
            onClick={() => setActiveTab("queue")}
          >
            Queue ({queue.items.length})
          </button>
          <button
            className={`lalin-tab-btn ${activeTab === "eq" ? "active" : ""}`}
            onClick={() => setActiveTab("eq")}
          >
            10-Band EQ
          </button>
        </div>

        {/* Native Window Controls */}
        <div className="lalin-play-window-controls">
          <button
            className="win-ctrl-btn"
            onClick={() => runWindowAction(minimizeCurrentWindow)}
            title="Minimize"
          >
            —
          </button>
          <button
            className="win-ctrl-btn"
            onClick={() => runWindowAction(toggleMaximizeCurrentWindow)}
            title="Maximize / Restore"
          >
            ◻
          </button>
          <button
            className="win-ctrl-btn close"
            onClick={() => runWindowAction(hideOrCloseCurrentWindow)}
            title="Close / Hide to Background"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      {windowError && <div className="fm-err" role="alert">{windowError}</div>}
      <div className="lalin-play-body standalone">
        {/* Left Column: Now Playing Card & Transport */}
        <div className="lalin-play-left">
          <div className="now-playing-artwork">
            <div className="artwork-inner">
              <span className="artwork-disc" />
              <span className="artwork-title-large">
                {currentItem?.title ? currentItem.title.slice(0, 2).toUpperCase() : "LP"}
              </span>
            </div>
          </div>

          <div className="now-playing-meta">
            <h2 className="now-playing-title" title={currentItem?.title ?? "No media loaded"}>
              {currentItem?.title ?? "No media loaded"}
            </h2>
            <p className="now-playing-artist">
              {currentItem?.artist ?? "Select audio from Library or File Manager"}
            </p>
            {currentItem?.ext && (
              <span className="now-playing-badge">{currentItem.ext.toUpperCase()}</span>
            )}
            {nowPlaying.error && (
              <div className="now-playing-error" role="alert">
                ⚠️ {nowPlaying.error}
              </div>
            )}
          </div>

          {/* Scrubber / Progress Bar */}
          <div className="playback-scrubber-group">
            <div
              className="playback-scrubber-track"
              onClick={(e) => {
                if (!nowPlaying.duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const pct = Math.max(0, Math.min(1, clickX / rect.width));
                seek(pct * nowPlaying.duration);
              }}
            >
              <div
                className="playback-scrubber-progress"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="playback-times">
              <span className="time-cur">{formatTime(nowPlaying.currentTime)}</span>
              <span className="time-dur">{formatTime(nowPlaying.duration)}</span>
            </div>
          </div>

          {/* Transport Controls */}
          <div className="transport-controls">
            <button
              className={`transport-btn ${queue.shuffle ? "active" : ""}`}
              onClick={toggleShuffle}
              title={`Shuffle: ${queue.shuffle ? "ON" : "OFF"}`}
            >
              🔀
            </button>
            <button
              className="transport-btn"
              onClick={previous}
              title="Previous Track (or Restart)"
            >
              ⏮
            </button>
            <button
              className="transport-btn primary"
              onClick={togglePlay}
              title={nowPlaying.state === "playing" ? "Pause (Space)" : "Play (Space)"}
            >
              {nowPlaying.state === "loading"
                ? "⏳"
                : nowPlaying.state === "playing"
                ? "❚❚"
                : "▶"}
            </button>
            <button
              className="transport-btn"
              onClick={stop}
              title="Stop"
            >
              ■
            </button>
            <button
              className="transport-btn"
              onClick={next}
              title="Next Track"
            >
              ⏭
            </button>
            <button
              className={`transport-btn ${queue.repeatMode !== "off" ? "active" : ""}`}
              onClick={() => {
                const nextMode =
                  queue.repeatMode === "off"
                    ? "all"
                    : queue.repeatMode === "all"
                    ? "one"
                    : "off";
                setRepeatMode(nextMode);
              }}
              title={`Repeat: ${queue.repeatMode.toUpperCase()}`}
            >
              {queue.repeatMode === "one" ? "🔂" : "🔁"}
            </button>
          </div>

          {/* Volume, Rate & Output Selector Bar */}
          <div className="playback-extra-bar">
            <div className="volume-group">
              <button
                className="mute-btn"
                onClick={toggleMute}
                title={nowPlaying.muted ? "Unmute (M)" : "Mute (M)"}
              >
                {nowPlaying.muted || nowPlaying.volume === 0 ? "🔇" : nowPlaying.volume < 0.5 ? "🔉" : "🔊"}
              </button>
              <input
                type="range"
                className="volume-slider"
                min={0}
                max={1}
                step={0.01}
                value={nowPlaying.muted ? 0 : nowPlaying.volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
              />
              <span className="vol-text">{Math.round((nowPlaying.muted ? 0 : nowPlaying.volume) * 100)}%</span>
            </div>

            <div className="speed-group">
              <span className="speed-label">Speed:</span>
              <select
                className="speed-select"
                value={nowPlaying.playbackRate}
                onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
              >
                <option value={0.5}>0.5×</option>
                <option value={0.75}>0.75×</option>
                <option value={1.0}>1.0×</option>
                <option value={1.25}>1.25×</option>
                <option value={1.5}>1.5×</option>
                <option value={2.0}>2.0×</option>
              </select>
            </div>

            {availableOutputDevices.length > 1 && (
              <div className="output-device-group">
                <span className="output-device-label">Output:</span>
                <select
                  className="output-device-select"
                  value={nowPlaying.activeOutputDeviceId || ""}
                  onChange={(e) => setOutputDevice(e.target.value)}
                  title="Audio Output Device (FR-16W.4)"
                >
                  {availableOutputDevices.map((d, i) => (
                    <option key={`${d.deviceId}-${i}`} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Queue or EQ Panel */}
        <div className="lalin-play-right">
          {activeTab === "eq" ? (
            <PlaybackEQPanel />
          ) : (
            <div className="queue-panel">
              <div className="queue-bar">
                <span className="queue-count">{queue.items.length} track(s) in queue</span>
                {queue.items.length > 0 && (
                  <button className="queue-clear-btn" onClick={clearQueue} title="Clear all tracks">
                    Clear Queue
                  </button>
                )}
              </div>

              <div className="queue-list">
                {queue.items.length === 0 ? (
                  <div className="queue-empty">
                    <p>Queue is empty</p>
                    <span className="queue-hint">
                      Right-click audio files in File Manager or Library to add them to queue
                    </span>
                  </div>
                ) : (
                  queue.items.map((item, idx) => {
                    const isCurrent = queue.currentIndex === idx;
                    return (
                      <div
                        key={`${item.id}-${idx}`}
                        className={`queue-item ${isCurrent ? "current" : ""}`}
                        onDoubleClick={() => playAtIndex(idx)}
                      >
                        <span className="queue-idx">
                          {isCurrent ? (nowPlaying.state === "playing" ? "▶" : "❚❚") : idx + 1}
                        </span>
                        <div className="queue-item-info">
                          <span className="queue-item-title" title={item.title}>
                            {item.title}
                          </span>
                          <span className="queue-item-artist">{item.artist || "Local File"}</span>
                        </div>
                        {item.duration ? (
                          <span className="queue-item-dur">{formatTime(item.duration)}</span>
                        ) : null}

                        <div className="queue-item-actions">
                          {idx > 0 && (
                            <button
                              className="queue-item-btn"
                              onClick={() => reorderQueue(idx, idx - 1)}
                              title="Move up"
                            >
                              ↑
                            </button>
                          )}
                          {idx < queue.items.length - 1 && (
                            <button
                              className="queue-item-btn"
                              onClick={() => reorderQueue(idx, idx + 1)}
                              title="Move down"
                            >
                              ↓
                            </button>
                          )}
                          <button
                            className="queue-item-btn danger"
                            onClick={() => removeFromQueue(idx)}
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
