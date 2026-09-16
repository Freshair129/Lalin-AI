import { beforeEach, describe, expect, it } from "vitest";
import { usePlaybackStore } from "./usePlaybackStore";
import { EQ_FREQUENCIES } from "@lalin/contracts";

describe("usePlaybackStore 10-Band EQ Operations", () => {
  beforeEach(() => {
    localStorage.clear();
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
