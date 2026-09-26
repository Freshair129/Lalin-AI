import { describe, expect, it } from "vitest";
import type { PlaybackStoreState } from "./playback/usePlaybackStore";
import { HANDOFF_MAX_FRAME_BYTES, HANDOFF_PROTOCOL, HANDOFF_PROTOCOL_VERSION, frameSize, handoffSnapshot } from "./handoffContract";

describe("native handoff snapshot contract", () => {
  it("keeps the protocol versioned and omits raw local paths from state replies", () => {
    const state = {
      nowPlaying: {
        item: { id: "C:\\media\\private.wav", title: "Private", url: "file:///C:/media/private.wav" },
        state: "playing", currentTime: 2, duration: 4, volume: 0.8, muted: false,
        playbackRate: 1, error: "could not read C:\\media\\private.wav",
      },
      queue: {
        items: [{ id: "C:\\media\\private.wav", title: "Private", url: "file:///C:/media/private.wav" }],
        currentIndex: 0, repeatMode: "off", shuffle: false,
      },
      eq: { enabled: true, preamp: 0, bands: [], currentPreset: "Flat", customPresets: {} },
    } as unknown as PlaybackStoreState;

    const snapshot = handoffSnapshot(state);
    const serialized = JSON.stringify(snapshot);
    expect(HANDOFF_PROTOCOL).toBe("lalin-play");
    expect(HANDOFF_PROTOCOL_VERSION).toBe(1);
    expect(serialized).not.toContain("C:\\\\media");
    expect(serialized).not.toContain("file:///");
    expect(snapshot.nowPlaying.error).toContain("[local file]");
    expect(frameSize(snapshot)).toBeLessThan(HANDOFF_MAX_FRAME_BYTES);
  });
});
