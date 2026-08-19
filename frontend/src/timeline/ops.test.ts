import { describe, it, expect } from "vitest";
import {
  moveClip,
  sliceClip,
  cloneClip,
  deleteClip,
  addClip,
  setClipGain,
  toggleClipMute,
  toggleTrack,
  setTrackPan,
  setProjectTempo,
  setProjectLoop,
  projectDuration,
  snapshot,
} from "./ops";
import type { Project, Track, Clip } from "./clipModel";

// ── fixtures ──────────────────────────────────────────────────────────────
function mkClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? "clip-1",
    src: "file:///a.wav",
    start: 0,
    duration: 10,
    offset: 0,
    gain: 1,
    muted: false,
    color: "#ff0000",
    ...overrides,
  };
}

function mkTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: overrides.id ?? "track-1",
    label: "Track 1",
    color: "#00ff00",
    pan: 0,
    clips: overrides.clips ?? [mkClip()],
    envelopes: [],
    muted: false,
    solo: false,
    locked: false,
    ...overrides,
  };
}

function mkProject(overrides: Partial<Project> = {}): Project {
  return {
    bpm: 120,
    key: null,
    timeSig: 4,
    loop: null,
    duration: 10,
    tracks: overrides.tracks ?? [mkTrack()],
    ...overrides,
  };
}

describe("snapshot", () => {
  it("deep-clones the project (nested objects are not the same reference)", () => {
    const p = mkProject();
    const s = snapshot(p);
    expect(s).toEqual(p);
    expect(s).not.toBe(p);
    expect(s.tracks).not.toBe(p.tracks);
    expect(s.tracks[0]).not.toBe(p.tracks[0]);
    expect(s.tracks[0].clips[0]).not.toBe(p.tracks[0].clips[0]);
  });

  it("mutating the clone does not affect the original", () => {
    const p = mkProject();
    const s = snapshot(p);
    s.tracks[0].clips[0].start = 99;
    expect(p.tracks[0].clips[0].start).toBe(0);
  });
});

describe("projectDuration", () => {
  it("returns 0 for a project with no clips", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [] })] });
    expect(projectDuration(p)).toBe(0);
  });

  it("returns the max end time (start + duration) across all clips/tracks", () => {
    const p = mkProject({
      tracks: [
        mkTrack({ id: "t1", clips: [mkClip({ id: "c1", start: 0, duration: 5 })] }),
        mkTrack({ id: "t2", clips: [mkClip({ id: "c2", start: 10, duration: 3 })] }),
      ],
    });
    expect(projectDuration(p)).toBe(13);
  });

  it("does not mutate the input project", () => {
    const p = mkProject();
    const before = snapshot(p);
    projectDuration(p);
    expect(p).toEqual(before);
  });
});

describe("moveClip", () => {
  it("moves a clip's start time", () => {
    const p = mkProject();
    const next = moveClip(p, "track-1", "clip-1", 5);
    expect(next.tracks[0].clips[0].start).toBe(5);
  });

  it("clamps negative newStart to 0", () => {
    const p = mkProject();
    const next = moveClip(p, "track-1", "clip-1", -20);
    expect(next.tracks[0].clips[0].start).toBe(0);
  });

  it("does not mutate the original project", () => {
    const p = mkProject();
    const before = snapshot(p);
    moveClip(p, "track-1", "clip-1", 5);
    expect(p).toEqual(before);
  });

  it("recomputes project.duration after moving", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [mkClip({ duration: 10 })] })] });
    const next = moveClip(p, "track-1", "clip-1", 20);
    expect(next.duration).toBe(30);
  });

  it("returns an unchanged (but cloned) project when trackId does not exist", () => {
    const p = mkProject();
    const next = moveClip(p, "no-such-track", "clip-1", 5);
    expect(next).toEqual(p);
    expect(next).not.toBe(p);
  });

  it("no-ops when clipId does not exist in the track", () => {
    const p = mkProject();
    const next = moveClip(p, "track-1", "no-such-clip", 5);
    expect(next.tracks[0].clips[0].start).toBe(0);
  });
});

describe("sliceClip", () => {
  it("splits a clip into two at atSec", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [mkClip({ start: 0, duration: 10, offset: 0 })] })] });
    const next = sliceClip(p, "track-1", "clip-1", 4);
    expect(next.tracks[0].clips).toHaveLength(2);
    const [left, right] = next.tracks[0].clips;
    expect(left.start).toBe(0);
    expect(left.duration).toBe(4);
    expect(right.start).toBe(4);
    expect(right.duration).toBe(6);
    expect(right.offset).toBe(4);
  });

  it("assigns new distinct ids to both resulting clips", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [mkClip({ id: "clip-1" })] })] });
    const next = sliceClip(p, "track-1", "clip-1", 4);
    const [left, right] = next.tracks[0].clips;
    expect(left.id).not.toBe("clip-1");
    expect(right.id).not.toBe("clip-1");
    expect(left.id).not.toBe(right.id);
  });

  it("is a no-op when atSec is at or before the clip start (boundary)", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [mkClip({ start: 0, duration: 10 })] })] });
    const next = sliceClip(p, "track-1", "clip-1", 0);
    expect(next.tracks[0].clips).toHaveLength(1);
    expect(next.tracks[0].clips[0]).toEqual(p.tracks[0].clips[0]);
  });

  it("is a no-op when atSec is at or after the clip end (boundary)", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [mkClip({ start: 0, duration: 10 })] })] });
    const next = sliceClip(p, "track-1", "clip-1", 10);
    expect(next.tracks[0].clips).toHaveLength(1);
  });

  it("is a no-op when atSec is entirely outside the clip", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [mkClip({ start: 5, duration: 10 })] })] });
    const next = sliceClip(p, "track-1", "clip-1", 100);
    expect(next.tracks[0].clips).toHaveLength(1);
    expect(next.tracks[0].clips[0]).toEqual(p.tracks[0].clips[0]);
  });

  it("does not mutate the original project", () => {
    const p = mkProject();
    const before = snapshot(p);
    sliceClip(p, "track-1", "clip-1", 4);
    expect(p).toEqual(before);
  });

  it("preserves offset accumulation from the original clip when splitting", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [mkClip({ start: 2, duration: 10, offset: 3 })] })] });
    const next = sliceClip(p, "track-1", "clip-1", 6);
    const [left, right] = next.tracks[0].clips;
    expect(left.offset).toBe(3);
    expect(right.offset).toBe(3 + (6 - 2));
  });
});

describe("cloneClip", () => {
  it("duplicates the clip placed immediately after the original", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [mkClip({ start: 0, duration: 10 })] })] });
    const next = cloneClip(p, "track-1", "clip-1");
    expect(next.tracks[0].clips).toHaveLength(2);
    const [orig, cloned] = next.tracks[0].clips;
    expect(orig.start).toBe(0);
    expect(cloned.start).toBe(10);
  });

  it("assigns the clone a new id distinct from the original", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [mkClip({ id: "clip-1" })] })] });
    const next = cloneClip(p, "track-1", "clip-1");
    const [orig, cloned] = next.tracks[0].clips;
    expect(orig.id).toBe("clip-1");
    expect(cloned.id).not.toBe("clip-1");
  });

  it("does not mutate the original project", () => {
    const p = mkProject();
    const before = snapshot(p);
    cloneClip(p, "track-1", "clip-1");
    expect(p).toEqual(before);
  });

  it("no-ops (clone) when clipId does not exist", () => {
    const p = mkProject();
    const next = cloneClip(p, "track-1", "missing");
    expect(next.tracks[0].clips).toHaveLength(1);
  });
});

describe("deleteClip", () => {
  it("removes the clip with the given id", () => {
    const p = mkProject({
      tracks: [mkTrack({ clips: [mkClip({ id: "c1" }), mkClip({ id: "c2", start: 10 })] })],
    });
    const next = deleteClip(p, "track-1", "c1");
    expect(next.tracks[0].clips).toHaveLength(1);
    expect(next.tracks[0].clips[0].id).toBe("c2");
  });

  it("is a no-op when the clip id is not found", () => {
    const p = mkProject();
    const next = deleteClip(p, "track-1", "missing");
    expect(next.tracks[0].clips).toHaveLength(1);
  });

  it("does not mutate the original project", () => {
    const p = mkProject();
    const before = snapshot(p);
    deleteClip(p, "track-1", "clip-1");
    expect(p).toEqual(before);
  });
});

describe("addClip", () => {
  it("appends a new clip to the track", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [] })] });
    const newClip = mkClip({ id: "new-1", start: 3, duration: 4 });
    const next = addClip(p, "track-1", newClip);
    expect(next.tracks[0].clips).toEqual([newClip]);
  });

  it("does not mutate the original project", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [] })] });
    const before = snapshot(p);
    addClip(p, "track-1", mkClip({ id: "new-1" }));
    expect(p).toEqual(before);
  });

  it("updates project.duration to include the added clip", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [] })], duration: 0 });
    const next = addClip(p, "track-1", mkClip({ start: 5, duration: 5 }));
    expect(next.duration).toBe(10);
  });
});

describe("setClipGain", () => {
  it("sets the gain value", () => {
    const p = mkProject();
    const next = setClipGain(p, "track-1", "clip-1", 0.5);
    expect(next.tracks[0].clips[0].gain).toBe(0.5);
  });

  it("clamps gain above 1 down to 1", () => {
    const p = mkProject();
    const next = setClipGain(p, "track-1", "clip-1", 5);
    expect(next.tracks[0].clips[0].gain).toBe(1);
  });

  it("clamps gain below 0 up to 0", () => {
    const p = mkProject();
    const next = setClipGain(p, "track-1", "clip-1", -5);
    expect(next.tracks[0].clips[0].gain).toBe(0);
  });

  it("does not mutate the original project", () => {
    const p = mkProject();
    const before = snapshot(p);
    setClipGain(p, "track-1", "clip-1", 0.2);
    expect(p).toEqual(before);
  });
});

describe("toggleClipMute", () => {
  it("toggles muted from false to true", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [mkClip({ muted: false })] })] });
    const next = toggleClipMute(p, "track-1", "clip-1");
    expect(next.tracks[0].clips[0].muted).toBe(true);
  });

  it("toggles muted from true back to false", () => {
    const p = mkProject({ tracks: [mkTrack({ clips: [mkClip({ muted: true })] })] });
    const next = toggleClipMute(p, "track-1", "clip-1");
    expect(next.tracks[0].clips[0].muted).toBe(false);
  });

  it("does not mutate the original project", () => {
    const p = mkProject();
    const before = snapshot(p);
    toggleClipMute(p, "track-1", "clip-1");
    expect(p).toEqual(before);
  });
});

describe("toggleTrack", () => {
  it("toggles the muted flag", () => {
    const p = mkProject({ tracks: [mkTrack({ muted: false })] });
    const next = toggleTrack(p, "track-1", "muted");
    expect(next.tracks[0].muted).toBe(true);
  });

  it("toggles the solo flag", () => {
    const p = mkProject({ tracks: [mkTrack({ solo: false })] });
    const next = toggleTrack(p, "track-1", "solo");
    expect(next.tracks[0].solo).toBe(true);
  });

  it("toggles the locked flag", () => {
    const p = mkProject({ tracks: [mkTrack({ locked: false })] });
    const next = toggleTrack(p, "track-1", "locked");
    expect(next.tracks[0].locked).toBe(true);
  });

  it("does not mutate the original project", () => {
    const p = mkProject();
    const before = snapshot(p);
    toggleTrack(p, "track-1", "solo");
    expect(p).toEqual(before);
  });

  it("returns an unchanged clone when trackId is not found", () => {
    const p = mkProject();
    const next = toggleTrack(p, "missing-track", "muted");
    expect(next).toEqual(p);
    expect(next).not.toBe(p);
  });
});

// ── pan / tempo / loop (ย้ายจาก useState ของ ClipTimeline เข้ามาใน model) ────
describe("setTrackPan", () => {
  it("sets pan on the named track only", () => {
    const p = mkProject({ tracks: [mkTrack({ id: "a" }), mkTrack({ id: "b" })] });
    const next = setTrackPan(p, "a", -0.5);
    expect(next.tracks[0].pan).toBe(-0.5);
    expect(next.tracks[1].pan).toBe(0);
  });

  it("clamps pan to -1..1", () => {
    const p = mkProject({ tracks: [mkTrack({ id: "a" })] });
    expect(setTrackPan(p, "a", -9).tracks[0].pan).toBe(-1);
    expect(setTrackPan(p, "a", 9).tracks[0].pan).toBe(1);
  });

  it("does not mutate the input", () => {
    const p = mkProject({ tracks: [mkTrack({ id: "a" })] });
    setTrackPan(p, "a", 1);
    expect(p.tracks[0].pan).toBe(0);
  });

  it("returns an equal copy for a missing track", () => {
    const p = mkProject();
    const next = setTrackPan(p, "missing-track", 1);
    expect(next).toEqual(p);
    expect(next).not.toBe(p);
  });
});

describe("setProjectTempo", () => {
  it("sets bpm and timeSig", () => {
    const next = setProjectTempo(mkProject(), 90, 3);
    expect(next.bpm).toBe(90);
    expect(next.timeSig).toBe(3);
  });

  it("clamps bpm to 40..240", () => {
    expect(setProjectTempo(mkProject(), 5, 4).bpm).toBe(40);
    expect(setProjectTempo(mkProject(), 500, 4).bpm).toBe(240);
  });

  it("does not mutate the input", () => {
    const p = mkProject();
    setProjectTempo(p, 90, 3);
    expect(p.bpm).toBe(120);
    expect(p.timeSig).toBe(4);
  });
});

describe("setProjectLoop", () => {
  it("stores and clears the loop region", () => {
    const withLoop = setProjectLoop(mkProject(), { start: 1, end: 4, enabled: true });
    expect(withLoop.loop).toEqual({ start: 1, end: 4, enabled: true });
    expect(setProjectLoop(withLoop, null).loop).toBeNull();
  });

  it("does not mutate the input", () => {
    const p = mkProject();
    setProjectLoop(p, { start: 0, end: 2, enabled: true });
    expect(p.loop).toBeNull();
  });
});
