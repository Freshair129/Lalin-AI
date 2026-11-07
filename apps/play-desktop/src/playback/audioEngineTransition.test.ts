import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackAudioEngine, type AudibleTimeUpdate, type AudioListenAttribution } from "./audioEngine";
import { resetSharedAudioContextForTest } from "./audioContext";

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

describe("dual-deck transition readiness and attribution", () => {
  it("waits for the incoming deck and reports only its audible attributed time", async () => {
    const outgoing = internal.audio!;
    const incoming = internal.secondaryAudio!;
    const play = vi.spyOn(incoming, "play").mockImplementation(async function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("playing"));
    });
    const updates: AudibleTimeUpdate[] = [];
    const onUpdate = (update: AudibleTimeUpdate) => updates.push(update);
    engine.on("audibletimeupdate", onUpdate);
    await engine.loadAndPlay("asset:outgoing", 0, "audio", {
      mediaId: "outgoing-track",
      queueEntryId: "entry-outgoing",
      sessionId: 7,
      duration: 100,
    });
    const transition = engine.crossfadeTo("asset:incoming", 4, 0, {
      mediaId: "incoming-track",
      queueEntryId: "entry-incoming",
      sessionId: 8,
      duration: 120,
    });

    expect(play).not.toHaveBeenCalled();
    setReadyState(incoming, HTMLMediaElement.HAVE_FUTURE_DATA);
    incoming.dispatchEvent(new Event("canplay"));
    await Promise.resolve();
    await Promise.resolve();
    expect(play).toHaveBeenCalledOnce();
    expect(engine.isTransitioning()).toBe(true);

    outgoing.currentTime = 20;
    outgoing.dispatchEvent(new Event("timeupdate"));
    incoming.currentTime = 12;
    incoming.dispatchEvent(new Event("timeupdate"));
    expect(updates[updates.length - 1]).toMatchObject({
      mediaId: "incoming-track",
      queueEntryId: "entry-incoming",
      sessionId: 8,
      currentTime: 12,
      audible: false,
    });

    internal.ctx!.currentTime = internal.transition!.startAt + internal.transition!.duration / 2;
    outgoing.currentTime = 21;
    incoming.currentTime = 13;
    outgoing.dispatchEvent(new Event("timeupdate"));
    incoming.dispatchEvent(new Event("timeupdate"));
    expect(updates.slice(-2).map((update) => [update.queueEntryId, update.audible])).toEqual([
      ["entry-outgoing", true],
      ["entry-incoming", true],
    ]);

    engine.setMediaMuted(true);
    incoming.currentTime = 14;
    incoming.dispatchEvent(new Event("timeupdate"));
    expect(updates[updates.length - 1]?.audible).toBe(false);

    engine.cancelTransition();
    await expect(transition).resolves.toBe(false);
    expect(internal.activeDeck).toBe(0);
    engine.off("audibletimeupdate", onUpdate);
  });

  it("cancels while waiting for readiness without starting the incoming deck", async () => {
    const incoming = internal.secondaryAudio!;
    const play = vi.spyOn(incoming, "play");
    const transition = engine.crossfadeTo("asset:pending", 4);

    engine.cancelTransition();

    await expect(transition).resolves.toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(engine.isTransitioning()).toBe(false);
    expect(internal.activeDeck).toBe(0);
  });

  it("schedules equal-power Smooth curves with the normalized formula at endpoints and midpoint", async () => {
    await engine.loadAndPlay("asset:outgoing");
    internal.deckGainNodes.forEach((node) => node?.gain.curveCalls.splice(0));
    const incoming = internal.secondaryAudio!;
    setReadyState(incoming, HTMLMediaElement.HAVE_FUTURE_DATA);

    const transition = engine.crossfadeTo("asset:incoming", 4);
    await Promise.resolve();
    await Promise.resolve();

    const outgoingCurve = internal.deckGainNodes[0]!.gain.curveCalls[0]!;
    const incomingCurve = internal.deckGainNodes[1]!.gain.curveCalls[0]!;
    expect(outgoingCurve).toHaveLength(65);
    expect(incomingCurve).toHaveLength(65);
    for (const index of [0, 32, 64]) {
      const x = index / 64;
      expect(outgoingCurve[index]).toBeCloseTo(Math.cos(Math.PI * x / 2), 6);
      expect(incomingCurve[index]).toBeCloseTo(Math.sin(Math.PI * x / 2), 6);
      expect(outgoingCurve[index]! ** 2 + incomingCurve[index]! ** 2).toBeCloseTo(1, 6);
    }

    engine.cancelTransition();
    await expect(transition).resolves.toBe(false);
  });

  it("keeps the outgoing deck active when the incoming deck fails readiness", async () => {
    const incoming = internal.secondaryAudio!;
    const transition = engine.crossfadeTo("asset:broken", 4);

    incoming.dispatchEvent(new Event("error"));

    await expect(transition).resolves.toBe(false);
    expect(engine.isTransitioning()).toBe(false);
    expect(internal.activeDeck).toBe(0);
  });

  it("pauses and resumes a smooth overlap at its current progress", async () => {
    const incoming = internal.secondaryAudio!;
    setReadyState(incoming, HTMLMediaElement.HAVE_FUTURE_DATA);
    const transition = engine.crossfadeTo("asset:incoming", 4);
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.isTransitioning()).toBe(true);

    internal.ctx!.currentTime = internal.transition!.startAt + 1;
    engine.pause();
    expect(internal.transition?.paused).toBe(true);
    expect(internal.transition?.progress).toBeCloseTo(0.25);
    expect(internal.activeDeck).toBe(0);

    const incomingPlay = vi.spyOn(incoming, "play").mockImplementation(async function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("playing"));
    });
    await engine.play();
    expect(incomingPlay).toHaveBeenCalledOnce();
    expect(internal.transition?.paused).toBe(false);
    expect(internal.activeDeck).toBe(0);

    vi.advanceTimersByTime(3100);
    await expect(transition).resolves.toBe(true);
    expect(internal.activeDeck).toBe(1);
    expect(engine.isTransitioning()).toBe(false);
  });

  it("prepares a silent manual deck, follows the fader, and completes at the incoming end", async () => {
    const outgoing = internal.audio!;
    const incoming = internal.secondaryAudio!;
    const updates: AudibleTimeUpdate[] = [];
    const onUpdate = (update: AudibleTimeUpdate) => updates.push(update);
    engine.on("audibletimeupdate", onUpdate);
    setReadyState(outgoing, HTMLMediaElement.HAVE_FUTURE_DATA);
    await engine.loadAndPlay("asset:outgoing", 0, "audio", {
      mediaId: "outgoing-track",
      queueEntryId: "entry-outgoing",
      sessionId: 1,
      duration: 100,
    });

    setReadyState(incoming, HTMLMediaElement.HAVE_FUTURE_DATA);
    await expect(engine.prepareManualDeck("asset:incoming", 12, {
      mediaId: "incoming-track",
      queueEntryId: "entry-incoming",
      sessionId: 2,
      duration: 120,
    })).resolves.toBe(true);

    expect(incoming.currentTime).toBe(12);
    expect(internal.deckGainNodes[1]?.gain.value).toBe(0);
    incoming.currentTime = 12;
    incoming.dispatchEvent(new Event("timeupdate"));
    expect(updates[updates.length - 1]).toMatchObject({ queueEntryId: "entry-incoming", audible: false });

    expect(engine.setManualCrossfader(0.5)).toBe(true);
    expect(internal.deckGainNodes[0]?.gain.value).toBeCloseTo(Math.SQRT1_2, 5);
    expect(internal.deckGainNodes[1]?.gain.value).toBeCloseTo(Math.SQRT1_2, 5);
    outgoing.currentTime = 20;
    incoming.currentTime = 13;
    outgoing.dispatchEvent(new Event("timeupdate"));
    incoming.dispatchEvent(new Event("timeupdate"));
    expect(updates.filter((update) => update.audible).map((update) => update.queueEntryId)).toEqual([
      "entry-outgoing",
      "entry-incoming",
    ]);

    expect(engine.setManualCrossfader(1)).toBe(true);
    expect(internal.activeDeck).toBe(1);
    expect(engine.isTransitioning()).toBe(false);
    expect(internal.deckAttribution[0]).toBeNull();
    engine.off("audibletimeupdate", onUpdate);
  });

  it("keeps a manual deck paused until resumed, preserving the fader position", async () => {
    const outgoing = internal.audio!;
    const incoming = internal.secondaryAudio!;
    setReadyState(outgoing, HTMLMediaElement.HAVE_FUTURE_DATA);
    await engine.loadAndPlay("asset:outgoing");
    setReadyState(incoming, HTMLMediaElement.HAVE_FUTURE_DATA);
    await engine.prepareManualDeck("asset:incoming", 0);
    engine.setManualCrossfader(0.4);

    engine.pause();
    expect(internal.transition?.paused).toBe(true);
    expect(internal.transition?.progress).toBeCloseTo(0.4);
    await engine.play();
    expect(internal.transition?.paused).toBe(false);
    expect(internal.transition?.progress).toBeCloseTo(0.4);
    expect(engine.setManualCrossfader(1)).toBe(true);
    expect(internal.activeDeck).toBe(1);
  });
});
