import { beforeEach, describe, expect, it } from "vitest";
import { PlaybackAudioEngine } from "./audioEngine";
import { usePlaybackStore } from "./usePlaybackStore";

const engine = PlaybackAudioEngine.getInstance();

function getAudioElement(): HTMLAudioElement {
  const audio = (engine as unknown as { audio: HTMLAudioElement | null }).audio;
  if (!audio) throw new Error("PlaybackAudioEngine did not create its audio element");
  return audio;
}

describe("PlaybackAudioEngine media readiness state", () => {
  beforeEach(() => {
    usePlaybackStore.setState((state) => ({
      nowPlaying: {
        ...state.nowPlaying,
        item: null,
        state: "idle",
        currentTime: 0,
        duration: 0,
        error: undefined,
      },
    }));
  });

  it("restores downstream playing state when media becomes playable after buffering", () => {
    const downstreamStates: string[] = [];
    const unsubscribe = usePlaybackStore.subscribe((next, previous) => {
      if (next.nowPlaying.state !== previous.nowPlaying.state) {
        downstreamStates.push(next.nowPlaying.state);
      }
    });
    const audio = getAudioElement();

    for (const eventType of ["play", "waiting", "playing", "waiting", "playing"]) {
      audio.dispatchEvent(new Event(eventType));
    }

    unsubscribe();
    expect(downstreamStates).toEqual(["loading", "playing", "loading", "playing"]);
    expect(usePlaybackStore.getState().nowPlaying.state).toBe("playing");
  });
});
