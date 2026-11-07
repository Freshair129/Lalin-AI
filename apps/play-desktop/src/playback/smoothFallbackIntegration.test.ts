import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackAudioEngine, type AudioListenAttribution } from "./audioEngine";
import { resetSharedAudioContextForTest } from "./audioContext";
import { usePlaybackStore } from "./usePlaybackStore";
vi.mock("../native", () => ({
  isVideoItem: () => false,
  resolveMedia: vi.fn(async (item: { id: string }) => `asset:${item.id}`),
}));

class MockAudioParam {
  value: number;
  curveCalls: Float32Array[] = [];
  constructor(value = 0) { this.value = value; }
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
  setValueCurveAtTime(values: Float32Array) {
    this.curveCalls.push(values);
    this.value = values[values.length - 1] ?? this.value;
  }
  cancelScheduledValues() {}
}

class MockAudioNode {
  connect() {}
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam(1);
}

class MockFilterNode extends MockAudioNode {
  type = "peaking";
  frequency = new MockAudioParam(1000);
  Q = new MockAudioParam(1.4);
  gain = new MockAudioParam(0);
}

class MockCompressorNode extends MockAudioNode {
  threshold = new MockAudioParam(-1);
  knee = new MockAudioParam(0);
  ratio = new MockAudioParam(20);
  attack = new MockAudioParam(0.002);
  release = new MockAudioParam(0.05);
}

class MockAnalyserNode extends MockAudioNode {
  fftSize = 256;
  smoothingTimeConstant = 0.8;
  getByteFrequencyData() {}
}

class MockAudioContext {
  state = "running";
  currentTime = 0;
  destination = new MockAudioNode();
  resume = vi.fn().mockResolvedValue(undefined);
  createGain() { return new MockGainNode(); }
  createBiquadFilter() { return new MockFilterNode(); }
  createDynamicsCompressor() { return new MockCompressorNode(); }
  createAnalyser() { return new MockAnalyserNode(); }
  createMediaElementSource() { return new MockAudioNode(); }
}

const originalAudioContext = window.AudioContext;
const engine = PlaybackAudioEngine.getInstance();
const internal = engine as unknown as {
  audio: HTMLMediaElement | null;
  secondaryAudio: HTMLMediaElement | null;
  ctx: MockAudioContext | null;
  activeDeck: 0 | 1;
  deckGainNodes: Array<MockGainNode | null>;
  deckPlaying: [boolean, boolean];
  deckAttribution: [AudioListenAttribution | null, AudioListenAttribution | null];
  transition: {
    outgoing: 0 | 1;
    incoming: 0 | 1;
    paused: boolean;
    manual: boolean;
    progress: number;
    startAt: number;
    duration: number;
    finish: (completed: boolean) => void;
  } | null;
};

function setReadyState(media: HTMLMediaElement, readyState: number): void {
  Object.defineProperty(media, "readyState", {
    configurable: true,
    value: readyState,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("AudioContext", MockAudioContext);
  resetSharedAudioContextForTest();
  const AudioContextForWindow = MockAudioContext as unknown as typeof AudioContext;
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: AudioContextForWindow,
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("playing"));
  });
  vi.spyOn(internal.audio!, "play").mockImplementation(async function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("playing"));
  });
  vi.spyOn(internal.secondaryAudio!, "play").mockImplementation(async function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("playing"));
  });
  setReadyState(internal.audio!, HTMLMediaElement.HAVE_FUTURE_DATA);
  setReadyState(internal.secondaryAudio!, 0);
  engine.setMuted(false);
  engine.setVolume(1);
  engine.setMediaMuted(false);
  engine.setMediaGain(1);
  engine.cancelTransition();
  internal.activeDeck = 0;
  internal.deckPlaying = [false, false];
  internal.deckAttribution = [null, null];
  internal.transition = null;
});

afterEach(() => {
  engine.cancelTransition();
  vi.restoreAllMocks();
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: originalAudioContext,
  });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("integrated Smooth decoder failure fallback", () => {
  it("retains the outgoing entry after decoder failure and advances once on end", async () => {
    const items = [
      { id: "a", title: "A", url: "asset:a", duration: 100, queueEntryId: "a1" },
      { id: "b", title: "B", url: "asset:b", duration: 120, queueEntryId: "b1" },
    ];
    await engine.loadAndPlay("asset:a");
    usePlaybackStore.setState(state => ({
      queue: { items, currentIndex: 0, repeatMode: "off", shuffle: false, revision: 40 },
      transitionSettings: { mode: "smooth", durationSeconds: 5 },
      nowPlaying: { ...state.nowPlaying, item: items[0], state: "playing", duration: 100 },
      playSession: 1,
    }));
    const outgoing = internal.audio!;
    const incoming = internal.secondaryAudio!;
    Object.defineProperty(outgoing, "duration", { configurable: true, value: 100 });
    outgoing.currentTime = 96;
    outgoing.dispatchEvent(new Event("timeupdate"));
    await Promise.resolve(); await Promise.resolve();
    incoming.dispatchEvent(new Event("error"));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(0);
    expect(usePlaybackStore.getState().transitionTargetQueueEntryId).toBeNull();
    expect(internal.activeDeck).toBe(0);
    outgoing.dispatchEvent(new Event("ended"));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(usePlaybackStore.getState().queue.currentIndex).toBe(1);
    expect(usePlaybackStore.getState().queue.revision).toBe(41);
    expect(usePlaybackStore.getState().nowPlaying.item?.id).toBe("b");
  });
});
