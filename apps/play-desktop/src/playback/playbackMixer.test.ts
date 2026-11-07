// @tested FR-20.2, FR-20.3, FR-20.4
import { beforeEach, describe, expect, it } from "vitest";
import { loadPersistedMixer, STORAGE_MIXER_KEY, usePlaybackStore } from "./usePlaybackStore";

beforeEach(() => {
  localStorage.clear();
  usePlaybackStore.getState().setMediaGain(1);
  if (usePlaybackStore.getState().mixer.mediaMuted) usePlaybackStore.getState().toggleMediaMute();
  usePlaybackStore.getState().setSpatialMode("stereo");
});

describe("Play mixer settings", () => {
  it("defaults to unity media gain, unmuted, and direct stereo", () => {
    expect(loadPersistedMixer()).toEqual({ mediaGain: 1, mediaMuted: false, spatialMode: "stereo" });
  });

  it("validates persisted gain and spatial mode independently of other playback state", () => {
    localStorage.setItem(STORAGE_MIXER_KEY, JSON.stringify({ mediaGain: 4, mediaMuted: true, spatialMode: "unsupported" }));
    expect(loadPersistedMixer()).toEqual({ mediaGain: 1.5, mediaMuted: true, spatialMode: "stereo" });
    localStorage.setItem(STORAGE_MIXER_KEY, "not-json");
    expect(loadPersistedMixer()).toEqual({ mediaGain: 1, mediaMuted: false, spatialMode: "stereo" });
  });

  it("persists the media fader, media mute, and virtual mode without changing master volume", () => {
    usePlaybackStore.getState().setVolume(0.62);
    usePlaybackStore.getState().setMediaGain(1.25);
    usePlaybackStore.getState().toggleMediaMute();
    expect(usePlaybackStore.getState().setSpatialMode("virtual-7.1")).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_MIXER_KEY)!)).toEqual({
      mediaGain: 1.25,
      mediaMuted: true,
      spatialMode: "virtual-7.1",
    });
    expect(usePlaybackStore.getState().nowPlaying.volume).toBe(0.62);
  });
});
