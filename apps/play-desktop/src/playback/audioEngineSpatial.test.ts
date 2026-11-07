// @tested FR-21.1, FR-21.2, FR-21.3, FR-21.4
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultEQ } from "../contracts";
import { PlaybackAudioEngine } from "./audioEngine";
import { resetSharedAudioContextForTest } from "./audioContext";

class FakeNode {
  connections: unknown[][] = [];
  connect(...args: unknown[]) { this.connections.push(args); return this; }
}
class FakeGain extends FakeNode {
  gain = { value: 1, setTargetAtTime: vi.fn() };
}
class FakeFilter extends FakeNode {
  type = "peaking";
  frequency = { value: 0 };
  Q = { value: 1 };
  gain = { value: 0, setTargetAtTime: vi.fn() };
}
class FakeCompressor extends FakeNode {
  threshold = { value: 0 };
  knee = { value: 0 };
  ratio = { value: 0 };
  attack = { value: 0 };
  release = { value: 0 };
}
class FakeAnalyser extends FakeNode {
  fftSize = 0;
  smoothingTimeConstant = 0;
  getByteFrequencyData() {}
}
class FakePanner extends FakeNode {
  panningModel: PanningModelType = "equalpower";
  distanceModel: DistanceModelType = "inverse";
  refDistance = 1;
  maxDistance = 10000;
  rolloffFactor = 1;
  positionX = { value: 0 };
  positionY = { value: 0 };
  positionZ = { value: 0 };
}
class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 1;
  destination = new FakeNode();
  panners: FakePanner[] = [];
  createMediaElementSource() { return new FakeNode(); }
  createGain() { return new FakeGain(); }
  createBiquadFilter() { return new FakeFilter(); }
  createDynamicsCompressor() { return new FakeCompressor(); }
  createAnalyser() { return new FakeAnalyser(); }
  createChannelSplitter() { return new FakeNode(); }
  createPanner() { const node = new FakePanner(); this.panners.push(node); return node; }
}

const engine = PlaybackAudioEngine.getInstance();
const internals = engine as unknown as Record<string, unknown>;
let fakeContext: FakeAudioContext;

function resetEngineGraph() {
  for (const key of [
    "ctx", "sourceNode", "mediaGainNode", "preampNode", "limiterNode", "masterGainNode",
    "analyserNode", "eqOutputNode", "directPathGainNode", "spatialPathGainNode",
  ]) internals[key] = null;
  internals.filterNodes = [];
  internals.spatialPanners = [];
  internals.spatialGraphReady = false;
  internals.spatialMode = "stereo";
}

beforeEach(() => {
  resetEngineGraph();
  fakeContext = new FakeAudioContext();
  vi.stubGlobal("AudioContext", class { constructor() { return fakeContext as unknown as AudioContext; } });
  resetSharedAudioContextForTest();
  engine.applyEQ(createDefaultEQ());
});

afterEach(() => {
  resetEngineGraph();
  resetSharedAudioContextForTest();
  vi.unstubAllGlobals();
});

describe("PlaybackAudioEngine virtual surround path", () => {
  it("keeps direct stereo until selected, then ramps the existing graph into eight HRTF feeds", () => {
    const media = engine.getMediaElement();
    engine.ensureAudioGraphForTest();
    expect(fakeContext.panners).toHaveLength(0);
    expect(engine.getMediaElement()).toBe(media);
    expect(engine.setSpatialMode("virtual-7.1")).toBe(true);
    expect(fakeContext.panners).toHaveLength(8);
    expect((internals.directPathGainNode as FakeGain).gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.015);
    expect((internals.spatialPathGainNode as FakeGain).gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 1, 0.015);
    expect(engine.getSpatialMode()).toBe("virtual-7.1");
    expect(engine.setSpatialMode("stereo")).toBe(true);
    expect((internals.directPathGainNode as FakeGain).gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 1, 0.015);
    expect((internals.spatialPathGainNode as FakeGain).gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.015);
  });

  it("activates a saved virtual mode when the graph is first created", () => {
    engine.applyMixer({ mediaGain: 1.1, mediaMuted: false, spatialMode: "virtual-7.1" });
    engine.ensureAudioGraphForTest();
    expect(fakeContext.panners).toHaveLength(8);
    expect(engine.getSpatialMode()).toBe("virtual-7.1");
    expect(engine.getMediaGain()).toBe(1.1);
  });

  it("falls back to stereo when HRTF nodes cannot be created", () => {
    engine.ensureAudioGraphForTest();
    (fakeContext as unknown as { createPanner?: () => FakePanner }).createPanner = undefined;
    const fallback = vi.fn();
    engine.on("spatialfallback", fallback);
    expect(engine.setSpatialMode("virtual-7.1")).toBe(false);
    expect(engine.getSpatialMode()).toBe("stereo");
    expect(fallback).toHaveBeenCalledOnce();
    engine.off("spatialfallback", fallback);
  });
});
