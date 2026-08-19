// @req FR-14 — Mix Copilot: สัญญาเดียวระหว่าง backend tool schema กับ engine calls (G-05)
// @spec AI-AGT-001
/**
 * mixCopilotOps.ts — pure logic ของ Mix Copilot แยกออกจาก component เพื่อเทสต์ได้ตรง ๆ
 *
 * ก่อนแก้ G-05: backend (agent.py) ส่ง snake_case (clip_id, target_id, track_id) แต่
 * โค้ดฝั่งนี้อ่าน camelCase (clipId, trackId) — ทุก branch จึงคืน false เงียบ ๆ และ
 * UI (MixCopilot.tsx) ก็ไม่เคยเช็ค return value เลย จึงขึ้น "ใช้แล้ว" ไม่ว่าจะสำเร็จจริงไหม
 *
 * ไฟล์นี้แก้สองจุด:
 *  1. canApplyMutation(m) เป็น dry-check ล้วน (ไม่แตะ engine) — ใช้ตัดสินว่าจะโชว์ปุ่ม "ใช้" ไหม
 *  2. applyMutation(engine, m) เรียก engine จริง คืน boolean ตามผลจริง — UI ต้องเช็คค่านี้เสมอ
 * สอง function ใช้ parser ร่วมกันต่อ op (parseXxx) เพื่อไม่ให้ "โชว์ว่า apply ได้" กับ
 * "apply แล้วสำเร็จจริง" หลุดจากกันอีก (สาเหตุเดิมของบั๊ก)
 */
import type { AgentMutation } from "../api";
import type { ClipEngine } from "../timeline/useClipEngine";

// op ที่ engine มีความสามารถรองรับจริง ณ ตอนนี้ — set_fx/set_lufs ยังไม่มีจุดต่อใน engine
// (FR-14.7: ต้องแสดงเป็นข้อเสนออ่านอย่างเดียวถ้า engine ยังไม่รองรับ)
// set_gain(track) ก็ยังไม่มี — ไม่มี track-level gain ใน model (แยกเป็นช่องโหว่ G-24)

function dbToLinear(db: number): number {
  return Math.min(1, Math.max(0, 10 ** (db / 20)));
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/** คืน true ถ้า args ของ mutation นี้ครบพอที่จะ apply ได้จริง — ไม่แตะ engine เลย */
export function canApplyMutation(m: AgentMutation): boolean {
  const a = m.args || {};
  switch (m.op) {
    case "move_clip":
      return str(a.trackId) !== null && str(a.clipId) !== null && num(a.start) !== null;
    case "set_gain":
      // apply อัตโนมัติได้เฉพาะ targetType=clip — track-level ไม่มี engine method (G-24)
      return a.targetType === "clip" && str(a.trackId) !== null && str(a.targetId) !== null && num(a.gain) !== null;
    case "set_pan":
      return str(a.trackId) !== null && num(a.pan) !== null;
    case "mute_clip":
      return str(a.trackId) !== null && str(a.clipId) !== null && bool(a.muted) !== null;
    case "slice_clip":
      return str(a.trackId) !== null && str(a.clipId) !== null && num(a.at) !== null;
    case "reorder_track":
      return str(a.trackId) !== null && str(a.targetTrackId) !== null;
    // set_fx, set_lufs, set_gain(track): ไม่มี engine method ที่ตรงกัน — เสนออ่านอย่างเดียวเสมอ
    default:
      return false;
  }
}

/** เรียก engine จริงตาม mutation — คืน true เฉพาะเมื่อเรียกสำเร็จ (args ครบ + engine ยอมรับ) */
export function applyMutation(engine: ClipEngine, m: AgentMutation): boolean {
  if (!canApplyMutation(m)) return false;
  const a = m.args || {};

  switch (m.op) {
    case "move_clip": {
      engine.move(a.trackId as string, a.clipId as string, a.start as number);
      return true;
    }
    case "set_gain": {
      const unit = a.unit === "db" ? "db" : "linear";
      const gain = unit === "db" ? dbToLinear(a.gain as number) : (a.gain as number);
      engine.setGain(a.trackId as string, a.targetId as string, gain);
      return true;
    }
    case "set_pan": {
      engine.setTrackPan(a.trackId as string, a.pan as number);
      return true;
    }
    case "mute_clip": {
      // engine.muteClip เป็น toggle ล้วน ๆ แต่ tool นี้สื่อว่า "ตั้งเป็นค่านี้" (set ไม่ใช่ toggle)
      // ถ้าเรียก toggle ตรง ๆ โดยไม่เช็คค่าปัจจุบันก่อน จะได้ผลตรงข้ามเมื่อ clip อยู่ในสถานะนั้นแล้ว
      const track = engine.project.tracks.find((t) => t.id === a.trackId);
      const clip = track?.clips.find((c) => c.id === a.clipId);
      if (!clip) return false;               // clip ไม่มีจริง — ตอบ false ตรง ๆ ไม่ใช่ pretend สำเร็จ
      if (clip.muted !== a.muted) engine.muteClip(a.trackId as string, a.clipId as string);
      return true;
    }
    case "slice_clip": {
      engine.slice(a.trackId as string, a.clipId as string, a.at as number);
      return true;
    }
    case "reorder_track": {
      engine.reorderTrack(a.trackId as string, a.targetTrackId as string);
      return true;
    }
    default:
      return false;
  }
}

/** ข้อความอธิบาย mutation ให้ผู้ใช้อ่านก่อนกด "ใช้" — ใช้ได้ทั้ง applicable และไม่ applicable */
export function describeMutation(m: AgentMutation): string {
  const a = m.args || {};
  switch (m.op) {
    case "move_clip":
      return `ย้าย clip ${a.clipId ?? "?"} ไปที่ ${a.start ?? "?"}s (track ${a.trackId ?? "?"})`;
    case "set_gain":
      return `ตั้ง gain ${a.targetType ?? "?"} ${a.targetId ?? "?"} = ${a.gain ?? "?"}${a.unit === "db" ? " dB" : ""}`;
    case "set_pan":
      return `ตั้ง pan track ${a.trackId ?? "?"} = ${a.pan ?? "?"}`;
    case "set_fx":
      return `ตั้งค่า FX ${a.trackId ?? "?"}: ${String(a.fx ?? "")} ${JSON.stringify(a.params ?? {})}`;
    case "set_lufs":
      return `ตั้ง loudness เป้าหมาย = ${a.targetLufs ?? "?"} LUFS`;
    case "mute_clip":
      return `${a.muted ? "mute" : "unmute"} clip ${a.clipId ?? "?"} (track ${a.trackId ?? "?"})`;
    case "slice_clip":
      return `ตัด clip ${a.clipId ?? "?"} ที่ ${a.at ?? "?"}s (track ${a.trackId ?? "?"})`;
    case "reorder_track":
      return `ย้ายแทร็ก ${a.trackId ?? "?"} ไปตำแหน่งของ ${a.targetTrackId ?? "?"}`;
    default:
      return `${m.op} ${JSON.stringify(a)}`;
  }
}
