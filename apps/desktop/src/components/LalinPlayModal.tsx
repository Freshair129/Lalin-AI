// @req FR-16.1 — Playback from Library/Workspace
// @req FR-16.2 — Transport controls
// @req FR-16.3 — Now Playing state
// @req FR-16.4 — Queue management
// @req FR-16.5 — Repeat and Shuffle
// @req FR-16.11 — Player survives route changes
// @req FR-16.13 — Playback speed
// @req FR-16.14 — Keyboard shortcuts
// @req FR-17.1 — Integrated EQ surface

import { useEffect, useState } from "react";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { PlaybackEQPanel } from "./PlaybackEQPanel";

function formatTime(sec: number): string {
  if (Number.isNaN(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function LalinPlayModal() {
  const {
    isOpen,
    setOpen,
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
  } = usePlaybackStore();

  const [activeTab, setActiveTab] = useState<"queue" | "eq">("queue");

  // Keyboard shortcuts (FR-16.14)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
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
      } else if (e.code === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, nowPlaying.currentTime, nowPlaying.volume, togglePlay, seek, setVolume, setOpen]);

  if (!isOpen) return null;

  const currentItem = nowPlaying.item;
  const progressPercent =
    nowPlaying.duration > 0
      ? Math.min(100, (nowPlaying.currentTime / nowPlaying.duration) * 100)
      : 0;

  const cycleRepeat = () => {
    if (queue.repeatMode === "off") setRepeatMode("all");
    else if (queue.repeatMode === "all") setRepeatMode("one");
    else setRepeatMode("off");
  };

  return (
    <div className="lalin-play-backdrop" onClick={() => setOpen(false)}>
      <div
        className="lalin-play-window"
        role="dialog"
        aria-modal="true"
        aria-label="Lalin Play — Media Player"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Window Titlebar */}
        <div className="lalin-play-titlebar">
          <div className="lalin-play-brand">
            <span className="brand-mark" />
            <strong className="lalin-play-title">LALIN PLAY</strong>
            <span className="lalin-play-subtitle">Windows Media Player + EQ</span>
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

          <button
            className="icon-close"
            onClick={() => setOpen(false)}
            title="Minimize / Close Player (playback continues)"
          >
            ×
          </button>
        </div>

        {/* Main Content Body */}
        <div className="lalin-play-body">
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
                <span className="now-playing-ext-pill">{currentItem.ext.toUpperCase()}</span>
              )}
              {nowPlaying.error && (
                <div className="now-playing-error-msg">{nowPlaying.error}</div>
              )}
            </div>

            {/* Time & Scrubber */}
            <div className="scrubber-section">
              <div className="scrubber-times">
                <span className="time-mono">{formatTime(nowPlaying.currentTime)}</span>
                <span className="time-mono">{formatTime(nowPlaying.duration)}</span>
              </div>
              <input
                type="range"
                className="scrubber-slider"
                min={0}
                max={nowPlaying.duration || 100}
                step={0.1}
                value={nowPlaying.currentTime}
                disabled={!currentItem}
                onChange={(e) => seek(parseFloat(e.target.value))}
              />
              <div className="scrubber-track-fill" style={{ width: `${progressPercent}%` }} />
            </div>

            {/* Main Transport Bar */}
            <div className="transport-controls">
              <button
                className={`trans-btn ${queue.shuffle ? "active" : ""}`}
                onClick={toggleShuffle}
                title="Shuffle"
              >
                🔀
              </button>
              <button className="trans-btn" onClick={previous} title="Previous (or restart)">
                ⏮
              </button>
              <button
                className="trans-btn-play"
                onClick={togglePlay}
                title={nowPlaying.state === "playing" ? "Pause (Space)" : "Play (Space)"}
              >
                {nowPlaying.state === "playing" ? "⏸" : "▶"}
              </button>
              <button className="trans-btn" onClick={stop} title="Stop">
                ⏹
              </button>
              <button className="trans-btn" onClick={next} title="Next">
                ⏭
              </button>
              <button
                className={`trans-btn ${queue.repeatMode !== "off" ? "active" : ""}`}
                onClick={cycleRepeat}
                title={`Repeat: ${queue.repeatMode}`}
              >
                {queue.repeatMode === "one" ? "🔂" : "🔁"}
              </button>
            </div>

            {/* Secondary Controls: Volume & Speed */}
            <div className="secondary-controls">
              <div className="volume-group">
                <button
                  className="vol-btn"
                  onClick={toggleMute}
                  title={nowPlaying.muted ? "Unmute" : "Mute"}
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
    </div>
  );
}
