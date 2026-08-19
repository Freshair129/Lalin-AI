// @req FR-09 — โมเดล clip timeline (Project/Track/Clip)
/**
 * Clip-based timeline model — โครงสำหรับ editor แบบ DAW ในอนาคต
 * (ลาก/ตัด/slice/clone/undo) อ้างอิงแนว AudioNodes
 *
 * สถานะ: SCAFFOLD — v1 ใช้ 1 clip ต่อ track (เต็มความยาว)
 * ยังไม่มี engine จริงสำหรับลาก/ตัด — โครงนี้รองรับให้ต่อยอดได้
 */

import type { AssetRef } from "./assets";

export type Sec = number;

let _seq = 0;
export function uid(prefix = "id"): string {
  _seq += 1;
  return `${prefix}_${_seq.toString(36)}`;
}

// ── Clip: ก้อนเสียงบน timeline ───────────────────────────────
export interface Clip {
  id: string;
  assetId: string | null; // อ้าง Project.assets — แทนที่ src เดิมที่เป็น URL เต็ม (ผูกกับเครื่อง)
  start: Sec;          // ตำแหน่งบน timeline (วินาที)
  duration: Sec;       // ความยาวที่แสดง
  offset: Sec;         // จุดเริ่มในไฟล์ต้นฉบับ (สำหรับ slice)
  gain: number;        // 0..1
  muted: boolean;
  color: string;
  fadeIn?: number;     // วินาที fade-in จากจุดเริ่ม clip (default 0/undefined)
  fadeOut?: number;    // วินาที fade-out ก่อนจุดจบ clip (default 0/undefined)
}

// ── Envelope: เส้น automation (gain/pitch/pan ตามเวลา) ───────
export type EnvelopeKind = "gain" | "pitch" | "pan";
export interface EnvelopePoint { t: Sec; v: number; }
export interface Envelope {
  id: string;
  kind: EnvelopeKind;
  points: EnvelopePoint[]; // เรียงตามเวลา
}

// ── Track: เลน 1 แถว ─────────────────────────────────────────
export interface Track {
  id: string;
  label: string;
  color: string;
  pan: number;         // -1 (ซ้ายสุด) .. 1 (ขวาสุด) — อยู่ใน model เพื่อให้ save/reload/render ตรงกัน
  clips: Clip[];
  envelopes: Envelope[];
  muted: boolean;
  solo: boolean;
  locked: boolean;
}

// ── Loop region: ช่วงวนซ้ำบน ruler ───────────────────────────
export interface LoopRegion {
  start: Sec;
  end: Sec;
  enabled: boolean;
}

// ── Project: ทั้ง timeline ───────────────────────────────────
export interface Project {
  bpm: number;
  key: string | null;
  timeSig: number;             // จังหวะต่อห้อง (beats per bar) — คุม grid + metronome
  loop: LoopRegion | null;
  duration: Sec;
  assets: Record<string, AssetRef>;  // ตารางไฟล์ที่ project นี้อ้างถึง (พกพาได้)
  tracks: Track[];
}

// ── factory helpers ─────────────────────────────────────────
export function makeClip(assetId: string | null, color: string, duration: Sec = 0): Clip {
  return { id: uid("clip"), assetId, start: 0, duration, offset: 0, gain: 1, muted: false, color };
}

export function makeTrack(label: string, color: string, assetId: string | null = null): Track {
  return {
    id: uid("trk"), label, color, pan: 0,
    clips: [makeClip(assetId, color)],
    envelopes: [], muted: false, solo: false, locked: false,
  };
}

/**
 * Future ops (ยังไม่ implement — วางโครงไว้):
 *   moveClip(project, clipId, deltaSec)
 *   sliceClip(project, clipId, atSec) -> [Clip, Clip]
 *   cloneClip(project, clipId)
 *   deleteClip(project, clipId)
 *   addEnvelopePoint(track, kind, t, v)
 * พร้อม undo history (snapshot ของ Project)
 */
