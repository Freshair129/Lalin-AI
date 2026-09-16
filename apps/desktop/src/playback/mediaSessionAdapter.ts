// @req FR-16W.1 — Hardware media keys (Play/Pause, Previous, Next, Stop)
// @req FR-16W.2 — Windows SMTC metadata integration
// @req FR-16W.3 — Command contract routing

import { usePlaybackStore } from "./usePlaybackStore";

let initialized = false;

export function initMediaSessionAdapter(): () => void {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) {
    return () => {};
  }

  if (initialized) return () => {};
  initialized = true;

  const updateMetadata = () => {
    const { nowPlaying } = usePlaybackStore.getState();
    const item = nowPlaying.item;

    if (!item) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title || "Unknown Title",
      artist: item.artist || "Lalin AI",
      album: item.album || "Library",
      artwork: item.artworkUrl
        ? [{ src: item.artworkUrl, sizes: "512x512", type: "image/png" }]
        : [],
    });

    navigator.mediaSession.playbackState =
      nowPlaying.state === "playing" ? "playing" :
      nowPlaying.state === "paused" ? "paused" : "none";
  };

  // Set action handlers
  try {
    navigator.mediaSession.setActionHandler("play", () => {
      usePlaybackStore.getState().togglePlay();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      usePlaybackStore.getState().pause();
    });
    navigator.mediaSession.setActionHandler("stop", () => {
      usePlaybackStore.getState().stop();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      usePlaybackStore.getState().previous();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      usePlaybackStore.getState().next();
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) {
        usePlaybackStore.getState().seek(details.seekTime);
      }
    });
  } catch (e) {
    console.warn("MediaSession action handler registration failed:", e);
  }

  // Subscribe to store updates
  const unsubscribe = usePlaybackStore.subscribe((state, prevState) => {
    if (
      state.nowPlaying.item !== prevState.nowPlaying.item ||
      state.nowPlaying.state !== prevState.nowPlaying.state
    ) {
      updateMetadata();
    }

    if (
      "setPositionState" in navigator.mediaSession &&
      state.nowPlaying.duration > 0 &&
      !Number.isNaN(state.nowPlaying.duration)
    ) {
      try {
        navigator.mediaSession.setPositionState({
          duration: state.nowPlaying.duration,
          playbackRate: state.nowPlaying.playbackRate,
          position: Math.min(state.nowPlaying.currentTime, state.nowPlaying.duration),
        });
      } catch {}
    }
  });

  return () => {
    unsubscribe();
    initialized = false;
  };
}
