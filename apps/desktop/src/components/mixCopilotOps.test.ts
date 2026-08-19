// @req FR-14 — สัญญาของ Mix Copilot: describeMutation/canApplyMutation/applyMutation (G-05)
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useClipEngine } from "../timeline/useClipEngine";
import { canApplyMutation, applyMutation, describeMutation } from "./mixCopilotOps";
import type { AgentMutation } from "../api";

function setup() {
  return renderHook(() => useClipEngine());
}

describe("canApplyMutation", () => {
  it("accepts move_clip with trackId + clipId + start", () => {
    expect(canApplyMutation({ op: "move_clip", args: { trackId: "vocal", clipId: "c1", start: 2 } })).toBe(true);
  });

  it("rejects move_clip missing trackId (this was the G-05 bug -- backend never sent it)", () => {
    expect(canApplyMutation({ op: "move_clip", args: { clipId: "c1", start: 2 } })).toBe(false);
  });

  it("rejects an unknown op", () => {
    expect(canApplyMutation({ op: "delete_everything", args: {} })).toBe(false);
  });

  it("accepts set_gain only for targetType=clip", () => {
    const clip: AgentMutation = { op: "set_gain", args: { trackId: "vocal", targetId: "c1", targetType: "clip", gain: 0.5 } };
    const track: AgentMutation = { op: "set_gain", args: { trackId: "vocal", targetId: "vocal", targetType: "track", gain: 0.5 } };
    expect(canApplyMutation(clip)).toBe(true);
    expect(canApplyMutation(track)).toBe(false);   // ไม่มี track-level gain ใน engine (G-24, แยกต่างหาก)
  });

  it("accepts set_pan (engine.setTrackPan exists since Phase A)", () => {
    expect(canApplyMutation({ op: "set_pan", args: { trackId: "beat", pan: -0.5 } })).toBe(true);
  });

  it("rejects set_fx and set_lufs -- no engine support exists for either", () => {
    expect(canApplyMutation({ op: "set_fx", args: { trackId: "beat", fx: "reverb" } })).toBe(false);
    expect(canApplyMutation({ op: "set_lufs", args: { targetLufs: -14 } })).toBe(false);
  });

  it("accepts mute_clip and slice_clip and reorder_track with their full field sets", () => {
    expect(canApplyMutation({ op: "mute_clip", args: { trackId: "vocal", clipId: "c1", muted: true } })).toBe(true);
    expect(canApplyMutation({ op: "slice_clip", args: { trackId: "vocal", clipId: "c1", at: 1.5 } })).toBe(true);
    expect(canApplyMutation({ op: "reorder_track", args: { trackId: "vocal", targetTrackId: "beat" } })).toBe(true);
  });
});

describe("applyMutation", () => {
  it("move_clip moves the clip on the named track", () => {
    const { result } = setup();
    act(() => { result.current.setTrackSource("vocal", { kind: "upload", name: "a.wav" }, "#fff"); });
    const clipId = result.current.project.tracks[0].clips[0].id;

    let ok = false;
    act(() => {
      ok = applyMutation(result.current, { op: "move_clip", args: { trackId: "vocal", clipId, start: 5 } });
    });
    expect(ok).toBe(true);
    expect(result.current.project.tracks[0].clips[0].start).toBe(5);
  });

  it("move_clip on a nonexistent track is a safe no-op but still reports success", () => {
    // ตรงกับพฤติกรรมเดิมของ ops.moveClip: track ไม่เจอ -> คืน snapshot เดิมเงียบ ๆ
    // "success" ที่นี่แปลว่า "เรียก engine แล้ว" ไม่ใช่ "state เปลี่ยนจริง"
    const { result } = setup();
    let ok = false;
    act(() => {
      ok = applyMutation(result.current, { op: "move_clip", args: { trackId: "no-such", clipId: "c1", start: 5 } });
    });
    expect(ok).toBe(true);
  });

  it("set_gain(clip) sets the clip's gain via the parent track", () => {
    const { result } = setup();
    act(() => { result.current.setTrackSource("vocal", { kind: "upload", name: "a.wav" }, "#fff"); });
    const clipId = result.current.project.tracks[0].clips[0].id;

    act(() => {
      applyMutation(result.current, {
        op: "set_gain",
        args: { trackId: "vocal", targetId: clipId, targetType: "clip", gain: 0.3 },
      });
    });
    expect(result.current.project.tracks[0].clips[0].gain).toBeCloseTo(0.3);
  });

  it("set_gain converts dB to linear when unit=db", () => {
    const { result } = setup();
    act(() => { result.current.setTrackSource("vocal", { kind: "upload", name: "a.wav" }, "#fff"); });
    const clipId = result.current.project.tracks[0].clips[0].id;

    act(() => {
      applyMutation(result.current, {
        op: "set_gain",
        args: { trackId: "vocal", targetId: clipId, targetType: "clip", gain: -6, unit: "db" },
      });
    });
    // -6dB ~= 0.501 linear
    expect(result.current.project.tracks[0].clips[0].gain).toBeCloseTo(10 ** (-6 / 20), 3);
  });

  it("set_gain(track) is refused -- no engine method exists, must not silently no-op as success", () => {
    const { result } = setup();
    let ok = true;
    act(() => {
      ok = applyMutation(result.current, {
        op: "set_gain",
        args: { trackId: "vocal", targetId: "vocal", targetType: "track", gain: 0.5 },
      });
    });
    expect(ok).toBe(false);
  });

  it("set_pan sets the track's pan", () => {
    const { result } = setup();
    act(() => {
      applyMutation(result.current, { op: "set_pan", args: { trackId: "beat", pan: -0.7 } });
    });
    expect(result.current.project.tracks.find((t) => t.id === "beat")?.pan).toBeCloseTo(-0.7);
  });

  it("mute_clip sets muted to exactly the requested value, not a toggle", () => {
    // นี่คือบั๊กที่พบระหว่างแก้ G-05: engine.muteClip เป็น toggle แท้ ๆ ไม่ใช่ "set"
    // ถ้าเรียก toggle ตรง ๆ ตอน args บอก muted:true แต่ clip mute อยู่แล้ว จะกลายเป็น unmute แทน
    const { result } = setup();
    act(() => { result.current.setTrackSource("vocal", { kind: "upload", name: "a.wav" }, "#fff"); });
    const clipId = result.current.project.tracks[0].clips[0].id;

    act(() => { applyMutation(result.current, { op: "mute_clip", args: { trackId: "vocal", clipId, muted: true } }); });
    expect(result.current.project.tracks[0].clips[0].muted).toBe(true);

    // เรียกซ้ำด้วย muted:true อีกครั้ง -- ต้องยังเป็น true (ไม่ใช่ toggle กลับเป็น false)
    act(() => { applyMutation(result.current, { op: "mute_clip", args: { trackId: "vocal", clipId, muted: true } }); });
    expect(result.current.project.tracks[0].clips[0].muted).toBe(true);

    act(() => { applyMutation(result.current, { op: "mute_clip", args: { trackId: "vocal", clipId, muted: false } }); });
    expect(result.current.project.tracks[0].clips[0].muted).toBe(false);
  });

  it("mute_clip on a nonexistent clip is refused, not a silent success", () => {
    const { result } = setup();
    let ok = true;
    act(() => {
      ok = applyMutation(result.current, { op: "mute_clip", args: { trackId: "vocal", clipId: "no-such", muted: true } });
    });
    expect(ok).toBe(false);
  });

  it("slice_clip slices at the given time", () => {
    const { result } = setup();
    act(() => { result.current.setTrackSource("vocal", { kind: "upload", name: "a.wav" }, "#fff"); });
    act(() => { result.current.hydrateDuration("vocal", result.current.project.tracks[0].clips[0].id, 10); });
    const clipId = result.current.project.tracks[0].clips[0].id;

    act(() => {
      applyMutation(result.current, { op: "slice_clip", args: { trackId: "vocal", clipId, at: 4 } });
    });
    expect(result.current.project.tracks[0].clips).toHaveLength(2);
  });

  it("reorder_track moves trackId to targetTrackId's position", () => {
    const { result } = setup();
    act(() => {
      applyMutation(result.current, { op: "reorder_track", args: { trackId: "vocal", targetTrackId: "master" } });
    });
    expect(result.current.project.tracks.map((t) => t.id)).toEqual(["beat", "master", "vocal"]);
  });

  it("set_fx and set_lufs are refused -- describeMutation still explains what was proposed", () => {
    const { result } = setup();
    let ok = true;
    act(() => { ok = applyMutation(result.current, { op: "set_fx", args: { trackId: "beat", fx: "reverb" } }); });
    expect(ok).toBe(false);
    expect(describeMutation({ op: "set_fx", args: { trackId: "beat", fx: "reverb" } })).toContain("reverb");
  });
});
