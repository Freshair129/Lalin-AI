// @req FR-10 — สัญญา: parameter ที่ผู้ใช้ตั้งได้ ต้องรอด save -> reload
/**
 * roundtrip.test.ts — ล็อกไว้ว่า "ตั้งค่า → บันทึก → โหลดกลับ" ต้องได้ค่าเดิม
 *
 * ก่อน Phase A ค่าพวกนี้อยู่ใน useState ของ ClipTimeline/RemixPanel และหายทุก
 * reload (pan, bpm, timeSig, loop, stemGains) — เทสต์นี้คือกันไม่ให้หลุดกลับไปอีก
 *
 * แทนการเช็คด้วยมือในเบราว์เซอร์: เดินผ่าน engine จริง + migrateSnapshot จริง
 * ซึ่งเป็นเส้นทางเดียวกับที่ Open/กู้ draft ใช้
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useClipEngine } from "./useClipEngine";
import { migrateSnapshot, SCHEMA_VERSION } from "./migrate";
import type { Project } from "./clipModel";

/** จำลอง buildSnapshot ของ RemixPanel เฉพาะส่วนที่ Phase A รับผิดชอบ */
function buildSnapshot(project: Project, stemGains: Record<string, number>) {
  return { schemaVersion: SCHEMA_VERSION, stemGains, project };
}

describe("project round-trip: set -> save -> reload", () => {
  it("restores pan, tempo, time signature and loop through a save/load cycle", () => {
    const { result } = renderHook(() => useClipEngine());

    act(() => {
      result.current.setTrackPan("vocal", -0.7);
      result.current.setTempo(90, 3);
      result.current.setLoop({ start: 2, end: 6, enabled: true });
    });

    // ค่าที่ตั้งไปอยู่ใน project จริง (ไม่ใช่ state เงาของ component)
    expect(result.current.project.tracks[0].pan).toBe(-0.7);
    expect(result.current.project.bpm).toBe(90);
    expect(result.current.project.timeSig).toBe(3);
    expect(result.current.project.loop).toEqual({ start: 2, end: 6, enabled: true });

    // save -> ผ่าน JSON (เหมือนไปกลับ backend) -> migrate -> load
    const saved = JSON.parse(JSON.stringify(buildSnapshot(result.current.project, { vocals: 0.5, drums: 1, bass: 1, other: 1 })));
    const migrated = migrateSnapshot(saved);

    const fresh = renderHook(() => useClipEngine());
    act(() => {
      fresh.result.current.loadProject(migrated.project as Project);
    });

    expect(fresh.result.current.project.tracks[0].pan).toBe(-0.7);
    expect(fresh.result.current.project.bpm).toBe(90);
    expect(fresh.result.current.project.timeSig).toBe(3);
    expect(fresh.result.current.project.loop).toEqual({ start: 2, end: 6, enabled: true });
    expect(migrated.stemGains).toEqual({ vocals: 0.5, drums: 1, bass: 1, other: 1 });
  });

  it("opens a legacy v1 project without losing the arrangement", () => {
    // snapshot แบบก่อน Phase A: ไม่มี schemaVersion, ไม่มี pan/timeSig/loop
    const legacy = {
      source: "song.mp3",
      project: {
        bpm: 128, key: "F maj", duration: 12,
        tracks: [
          { id: "vocal", label: "V", color: "#9b6cf0", envelopes: [], muted: false, solo: true, locked: false,
            clips: [{ id: "c1", src: "http://127.0.0.1:8756/files/input/song.mp3", start: 1.5, duration: 4, offset: 0.25, gain: 0.8, muted: false, color: "#9b6cf0" }] },
        ],
      },
    };

    const migrated = migrateSnapshot(legacy);
    const { result } = renderHook(() => useClipEngine());
    act(() => {
      result.current.loadProject(migrated.project as Project);
    });

    const p = result.current.project;
    // ของเดิมต้องอยู่ครบ
    expect(p.bpm).toBe(128);
    expect(p.tracks[0].solo).toBe(true);
    expect(p.tracks[0].clips[0].start).toBe(1.5);
    expect(p.tracks[0].clips[0].offset).toBe(0.25);
    expect(p.tracks[0].clips[0].gain).toBe(0.8);
    // ของใหม่ต้องได้ default ที่ปลอดภัย
    expect(p.tracks[0].pan).toBe(0);
    expect(p.timeSig).toBe(4);
    expect(p.loop).toBeNull();
  });

  it("keeps pan and tempo out of the undo stack", () => {
    const { result } = renderHook(() => useClipEngine());
    expect(result.current.canUndo).toBe(false);

    act(() => {
      result.current.setTrackPan("vocal", 0.5);
      result.current.setTempo(100, 4);
      result.current.setLoop({ start: 0, end: 1, enabled: true });
    });

    // mix/transport state ไม่ควรท่วม history (ลาก balance ทีเดียวได้หลายสิบ event)
    expect(result.current.canUndo).toBe(false);
  });

  it("clamps out-of-range values before they reach the project", () => {
    const { result } = renderHook(() => useClipEngine());

    act(() => {
      result.current.setTrackPan("vocal", 5);
      result.current.setTempo(1000, 4);
    });

    expect(result.current.project.tracks[0].pan).toBe(1);
    expect(result.current.project.bpm).toBe(240);
  });
});
