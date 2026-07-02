/**
 * Clip-based timeline model — โครงสำหรับ editor แบบ DAW ในอนาคต
 * (ลาก/ตัด/slice/clone/undo) อ้างอิงแนว AudioNodes
 *
 * สถานะ: SCAFFOLD — v1 ใช้ 1 clip ต่อ track (เต็มความยาว)
 * ยังไม่มี engine จริงสำหรับลาก/ตัด — โครงนี้รองรับให้ต่อยอดได้
 */

export type Sec = number;

let _seq = 0;
export function uid(prefix = "id"): string {
  _seq += 1;
  return `${prefix}_${_seq.toString(36)}`;
}

// ── Clip: ก้อนเสียงบน timeline ───────────────────────────────
export interface Clip {
  id: string;
  src: string | null; // URL ไฟล์เสียง
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
  clips: Clip[];
  envelopes: Envelope[];
  muted: boolean;
  solo: boolean;
  locked: boolean;
}

// ── Project: ทั้ง timeline ───────────────────────────────────
export interface Project {
  bpm: number;
  key: string | null;
  duration: Sec;
  tracks: Track[];
}

// ── factory helpers ─────────────────────────────────────────
export function makeClip(src: string | null, color: string, duration: Sec = 0): Clip {
  return { id: uid("clip"), src, start: 0, duration, offset: 0, gain: 1, muted: false, color };
}

export function makeTrack(label: string, color: string, src: string | null = null): Track {
  return {
    id: uid("trk"), label, color,
    clips: src !== null || true ? [makeClip(src, color)] : [],
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
