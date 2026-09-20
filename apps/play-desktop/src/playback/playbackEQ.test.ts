import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaybackStore } from "./usePlaybackStore";
import { PlaybackAudioEngine } from "./audioEngine";
import { resetSharedAudioContextForTest } from "./audioContext";
import { EQ_FREQUENCIES } from "../contracts";

class MockAudioParam {
  value: number;
  constructor(defaultValue = 0) {
    this.value = defaultValue;
  }
  setTargetAtTime(val: number) {
    this.value = val;
  }
}

class MockAudioNode {
  connect() {}
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam(1);
}

class MockBiquadFilterNode extends MockAudioNode {
  type = "peaking";
  frequency = new MockAudioParam(1000);
  Q = new MockAudioParam(1.4);
  gain = new MockAudioParam(0);
}

class MockDynamicsCompressorNode extends MockAudioNode {
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
  createGain() {
    return new MockGainNode();
  }
  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }
  createDynamicsCompressor() {
    return new MockDynamicsCompressorNode();
  }
  createAnalyser() {
    return new MockAnalyserNode();
  }
  createMediaElementSource() {
    return new MockAudioNode();
  }
}

// Install mock AudioContext on window
if (typeof window !== "undefined") {
  (window as any).AudioContext = MockAudioContext;
}

describe("usePlaybackStore 10-Band EQ Operations", () => {
  beforeEach(() => {
    localStorage.clear();
    resetSharedAudioContextForTest();
    usePlaybackStore.getState().resetEQ();
  });

  it("initializes with 10 bands at 0 dB and Flat preset", () => {
    const { eq } = usePlaybackStore.getState();
    expect(eq.bands).toHaveLength(10);
    expect(eq.bands.map((b) => b.frequency)).toEqual(EQ_FREQUENCIES);
    expect(eq.bands.every((b) => b.gain === 0)).toBe(true);
    expect(eq.preamp).toBe(0);
    expect(eq.enabled).toBe(true);
    expect(eq.currentPreset).toBe("Flat");
  });

  it("clamps band gain between -12 and +12 dB", () => {
    usePlaybackStore.getState().setBandGain(0, 15);
    expect(usePlaybackStore.getState().eq.bands[0].gain).toBe(12);

    usePlaybackStore.getState().setBandGain(1, -20);
    expect(usePlaybackStore.getState().eq.bands[1].gain).toBe(-12);

    expect(usePlaybackStore.getState().eq.currentPreset).toBe("Custom");
  });

  it("clamps preamp between -12 and +12 dB", () => {
    usePlaybackStore.getState().setPreamp(25);
    expect(usePlaybackStore.getState().eq.preamp).toBe(12);

    usePlaybackStore.getState().setPreamp(-18);
    expect(usePlaybackStore.getState().eq.preamp).toBe(-12);
  });

  it("toggles EQ bypass", () => {
    expect(usePlaybackStore.getState().eq.enabled).toBe(true);
    usePlaybackStore.getState().toggleEQBypass();
    expect(usePlaybackStore.getState().eq.enabled).toBe(false);
    usePlaybackStore.getState().toggleEQBypass();
    expect(usePlaybackStore.getState().eq.enabled).toBe(true);
  });

  it("selects standard presets", () => {
    usePlaybackStore.getState().selectPreset("Bass Boost");
    const { eq } = usePlaybackStore.getState();
    expect(eq.currentPreset).toBe("Bass Boost");
    expect(eq.preamp).toBe(-3);
    expect(eq.bands[0].gain).toBe(5);
    expect(eq.bands[1].gain).toBe(4);
  });

  it("creates, applies, and deletes custom presets", () => {
    usePlaybackStore.getState().setBandGain(4, 6);
    usePlaybackStore.getState().setPreamp(3);
    usePlaybackStore.getState().saveCustomPreset("Vocal Warmth");

    let { eq } = usePlaybackStore.getState();
    expect(eq.currentPreset).toBe("Vocal Warmth");
    expect(eq.customPresets["Vocal Warmth"]).toBeDefined();
    expect(eq.customPresets["Vocal Warmth"].preamp).toBe(3);

    // Switch away and switch back
    usePlaybackStore.getState().selectPreset("Flat");
    expect(usePlaybackStore.getState().eq.bands[4].gain).toBe(0);

    usePlaybackStore.getState().selectPreset("Vocal Warmth");
    expect(usePlaybackStore.getState().eq.bands[4].gain).toBe(6);

    // Delete custom preset
    usePlaybackStore.getState().deleteCustomPreset("Vocal Warmth");
    eq = usePlaybackStore.getState().eq;
    expect(eq.customPresets["Vocal Warmth"]).toBeUndefined();
    expect(eq.currentPreset).toBe("Flat");
  });

  it("resets EQ to defaults", () => {
    usePlaybackStore.getState().selectPreset("Rock");
    usePlaybackStore.getState().resetEQ();

    const { eq } = usePlaybackStore.getState();
    expect(eq.currentPreset).toBe("Flat");
    expect(eq.preamp).toBe(0);
    expect(eq.bands.every((b) => b.gain === 0)).toBe(true);
  });
});

describe("PlaybackAudioEngine True Bypass & Volume Control", () => {
  const engine = PlaybackAudioEngine.getInstance();

  it("sets and unsets true bypass, preserving preamp and band values", () => {
    engine.setPreamp(6);
    engine.setBandGain(0, 4);
    engine.setBandGain(1, -3);

    expect(engine.getCurrentPreamp()).toBe(6);
    expect(engine.getCurrentBandGains()[0]).toBe(4);
    expect(engine.getCurrentBandGains()[1]).toBe(-3);
    expect(engine.getIsBypassed()).toBe(false);

    // Bypass enabled
    engine.setBypass(true);
    expect(engine.getIsBypassed()).toBe(true);
    // Configured parameters are retained in state for restoration
    expect(engine.getCurrentPreamp()).toBe(6);
    expect(engine.getCurrentBandGains()[0]).toBe(4);

    // Bypass disabled
    engine.setBypass(false);
    expect(engine.getIsBypassed()).toBe(false);
  });

  it("controls volume with master gain single source of truth", () => {
    engine.setVolume(0.75);
    expect(engine.getCurrentVolume()).toBe(0.75);

    // Clamping
    engine.setVolume(1.8);
    expect(engine.getCurrentVolume()).toBe(1.0);

    engine.setVolume(-0.5);
    expect(engine.getCurrentVolume()).toBe(0.0);

    // Mute
    engine.setVolume(0.6);
    engine.setMuted(true);
    expect(engine.getIsMuted()).toBe(true);
    expect(engine.getCurrentVolume()).toBe(0.6); // volume level preserved

    engine.setMuted(false);
    expect(engine.getIsMuted()).toBe(false);
  });

  it("applies persisted EQ band gains and preamp directly into AudioNodes when graph is created (Fix Bug #1)", () => {
    // Simulate persisted EQ state (Bass Boost: preamp -3, bands: [5, 4, 3, 1, ...])
    engine.applyEQ({
      enabled: true,
      currentPreset: "Bass Boost",
      preamp: -3,
      customPresets: {},
      bands: [
        { frequency: 31, gain: 5 },
        { frequency: 62, gain: 4 },
        { frequency: 125, gain: 3 },
        { frequency: 250, gain: 1 },
        { frequency: 500, gain: 0 },
        { frequency: 1000, gain: 0 },
        { frequency: 2000, gain: 0 },
        { frequency: 4000, gain: 0 },
        { frequency: 8000, gain: 0 },
        { frequency: 16000, gain: 0 },
      ],
    });

    // Trigger audio graph initialization
    engine.ensureAudioGraphForTest();

    // Verify actual AudioParam values on the filter and preamp nodes
    const filters = engine.getFilterNodes();
    expect(filters).toHaveLength(10);
    expect(filters[0].gain.value).toBe(5);
    expect(filters[1].gain.value).toBe(4);
    expect(filters[2].gain.value).toBe(3);
    expect(filters[3].gain.value).toBe(1);
    expect(filters[4].gain.value).toBe(0);

    const preampNode = engine.getPreampNode();
    expect(preampNode).not.toBeNull();
    const expectedPreampLinear = Math.pow(10, -3 / 20);
    expect(preampNode!.gain.value).toBeCloseTo(expectedPreampLinear, 4);
  });

  it("unmutes in both engine and store when adjusting volume while muted (Fix Bug #2)", () => {
    // 1. Mute audio
    usePlaybackStore.getState().setVolume(0.5);
    usePlaybackStore.getState().toggleMute();

    expect(usePlaybackStore.getState().nowPlaying.muted).toBe(true);
    expect(engine.getIsMuted()).toBe(true);

    // 2. User adjusts volume slider to 0.7
    usePlaybackStore.getState().setVolume(0.7);

    // 3. Verify store and engine are both unmuted with matching volume
    expect(usePlaybackStore.getState().nowPlaying.muted).toBe(false);
    expect(usePlaybackStore.getState().nowPlaying.volume).toBe(0.7);
    expect(engine.getIsMuted()).toBe(false);
    expect(engine.getCurrentVolume()).toBe(0.7);
  });

  it("prevents phantom device state in output environment without setSinkId()", async () => {
    // 1. Calling setOutputDevice on store returns false and does NOT store a phantom ID in nowPlaying
    const storeResult = await usePlaybackStore.getState().setOutputDevice("phantom-dac-usb-99");
    expect(storeResult).toBe(false);
    expect(usePlaybackStore.getState().nowPlaying.activeOutputDeviceId).toBe("");

    // 2. Direct engine call also returns false and does NOT retain phantom device ID
    const engineResult = await engine.setOutputDevice("phantom-bluetooth-77");
    expect(engineResult).toBe(false);
    expect(engine.getOutputDeviceId()).toBe("");
    expect(engine.getOutputDeviceId()).not.toBe("phantom-bluetooth-77");
  });

  it("clamps playback rate: 3.0 -> 2.0 and 0.1 -> 0.5 without state divergence in store and engine", () => {
    // Case 1: 3.0 -> clamped to 2.0
    usePlaybackStore.getState().setPlaybackRate(3.0);
    expect(usePlaybackStore.getState().nowPlaying.playbackRate).toBe(2.0);
    expect(engine.getPlaybackRate()).toBe(2.0);

    // Case 2: 0.1 -> clamped to 0.5
    usePlaybackStore.getState().setPlaybackRate(0.1);
    expect(usePlaybackStore.getState().nowPlaying.playbackRate).toBe(0.5);
    expect(engine.getPlaybackRate()).toBe(0.5);

    // Case 3: Valid rate within range remains exact
    usePlaybackStore.getState().setPlaybackRate(1.25);
    expect(usePlaybackStore.getState().nowPlaying.playbackRate).toBe(1.25);
    expect(engine.getPlaybackRate()).toBe(1.25);

    // Case 4: Direct engine calls also clamp correctly
    engine.setPlaybackRate(3.0);
    expect(engine.getPlaybackRate()).toBe(2.0);

    engine.setPlaybackRate(0.1);
    expect(engine.getPlaybackRate()).toBe(0.5);
  });
});
