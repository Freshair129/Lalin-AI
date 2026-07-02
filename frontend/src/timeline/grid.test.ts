import { describe, it, expect } from "vitest";
import { metronomeTicks } from "./grid";

describe("metronomeTicks", () => {
  it("120bpm 4/4 over 2s → 4 ticks at 0/0.5/1/1.5, downbeat accent", () => {
    const r = metronomeTicks(120, 4, 2);
    expect(r.map((x) => x.t)).toEqual([0, 0.5, 1, 1.5]);
    expect(r.map((x) => x.accent)).toEqual([true, false, false, false]);
  });
  it("accents every bar (3/4)", () => {
    const r = metronomeTicks(120, 3, 3.5); // beats at 0..3.0 (7 ticks)
    expect(r.map((x) => x.accent)).toEqual([true, false, false, true, false, false, true]);
  });
  it("guards invalid input", () => {
    expect(metronomeTicks(0, 4, 2)).toEqual([]);
    expect(metronomeTicks(120, 0, 2)).toEqual([]);
    expect(metronomeTicks(120, 4, 0)).toEqual([]);
  });
  it("no accumulation drift over many beats", () => {
    const r = metronomeTicks(120, 4, 100); // 200 beats
    expect(r[200 - 1].t).toBeCloseTo(199 * 0.5, 10);
  });
});
