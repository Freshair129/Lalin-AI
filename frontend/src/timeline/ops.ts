/**
 * ops.ts — Pure, immutable operations on the clip-timeline Project model.
 * ไม่มี side effects, ไม่ mutate input — ทุก function คืน Project ใหม่เสมอ
 */

import { type Project, type Clip, uid } from "./clipModel";

// ── snapshot: deep-clone ─────────────────────────────────────────────────────
export function snapshot(p: Project): Project {
  return structuredClone(p);
}

// ── projectDuration: max end time across all clips ───────────────────────────
export function projectDuration(p: Project): number {
  let max = 0;
  for (const track of p.tracks) {
    for (const clip of track.clips) {
      const end = clip.start + clip.duration;
      if (end > max) max = end;
    }
  }
  return max;
}

// ── internal helper: map clips in a specific track ───────────────────────────
function mapTrackClips(
  p: Project,
  trackId: string,
  fn: (clips: Clip[]) => Clip[],
): Project {
  const result = snapshot(p);
  const track = result.tracks.find(t => t.id === trackId);
  if (!track) return result;
  track.clips = fn(track.clips);
  result.duration = projectDuration(result);
  return result;
}

// ── internal helper: find a clip by id in a clip array ──────────────────────
function findClip(clips: Clip[], clipId: string): Clip | undefined {
  return clips.find(c => c.id === clipId);
}

// ── moveClip: move a clip's start; clamp to >= 0 ─────────────────────────────
export function moveClip(
  p: Project,
  trackId: string,
  clipId: string,
  newStart: number,
): Project {
  return mapTrackClips(p, trackId, clips =>
    clips.map(c =>
      c.id === clipId
        ? { ...c, start: Math.max(0, newStart) }
        : c,
    ),
  );
}

// ── sliceClip: split a clip at absolute timeline time atSec ──────────────────
export function sliceClip(
  p: Project,
  trackId: string,
  clipId: string,
  atSec: number,
): Project {
  const track = p.tracks.find(t => t.id === trackId);
  if (!track) return snapshot(p);

  const clip = findClip(track.clips, clipId);
  if (!clip) return snapshot(p);

  // atSec must be strictly inside the clip
  if (atSec <= clip.start || atSec >= clip.start + clip.duration) {
    return snapshot(p);
  }

  const left: Clip = {
    ...clip,
    id: uid("clip"),
    duration: atSec - clip.start,
  };
  const right: Clip = {
    ...clip,
    id: uid("clip"),
    start: atSec,
    offset: clip.offset + (atSec - clip.start),
    duration: clip.start + clip.duration - atSec,
  };

  return mapTrackClips(p, trackId, clips =>
    clips.flatMap(c => (c.id === clipId ? [left, right] : [c])),
  );
}

// ── cloneClip: duplicate a clip placed immediately after the original ─────────
export function cloneClip(
  p: Project,
  trackId: string,
  clipId: string,
): Project {
  const track = p.tracks.find(t => t.id === trackId);
  if (!track) return snapshot(p);

  const clip = findClip(track.clips, clipId);
  if (!clip) return snapshot(p);

  const cloned: Clip = {
    ...clip,
    id: uid("clip"),
    start: clip.start + clip.duration,
  };

  return mapTrackClips(p, trackId, clips =>
    clips.flatMap(c => (c.id === clipId ? [c, cloned] : [c])),
  );
}

// ── deleteClip: remove a clip ────────────────────────────────────────────────
export function deleteClip(
  p: Project,
  trackId: string,
  clipId: string,
): Project {
  return mapTrackClips(p, trackId, clips =>
    clips.filter(c => c.id !== clipId),
  );
}

// ── addClip: เพิ่ม clip เข้า track (ใช้ paste) ────────────────────────────────
export function addClip(
  p: Project,
  trackId: string,
  clip: Clip,
): Project {
  return mapTrackClips(p, trackId, clips => [...clips, clip]);
}

// ── setClipGain: set gain clamped to 0..1 ────────────────────────────────────
export function setClipGain(
  p: Project,
  trackId: string,
  clipId: string,
  gain: number,
): Project {
  const clamped = Math.min(1, Math.max(0, gain));
  return mapTrackClips(p, trackId, clips =>
    clips.map(c => (c.id === clipId ? { ...c, gain: clamped } : c)),
  );
}

// ── toggleClipMute: toggle a clip's muted flag ───────────────────────────────
export function toggleClipMute(
  p: Project,
  trackId: string,
  clipId: string,
): Project {
  return mapTrackClips(p, trackId, clips =>
    clips.map(c => (c.id === clipId ? { ...c, muted: !c.muted } : c)),
  );
}

// ── setClipFade: set fadeIn/fadeOut (seconds, clamped >= 0) ─────────────────
export function setClipFade(
  p: Project,
  trackId: string,
  clipId: string,
  fadeIn: number,
  fadeOut: number,
): Project {
  const fi = Math.max(0, fadeIn);
  const fo = Math.max(0, fadeOut);
  return mapTrackClips(p, trackId, clips =>
    clips.map(c => (c.id === clipId ? { ...c, fadeIn: fi, fadeOut: fo } : c)),
  );
}

// ── toggleTrack: toggle a track-level boolean flag ───────────────────────────
export function toggleTrack(
  p: Project,
  trackId: string,
  what: "muted" | "solo" | "locked",
): Project {
  const result = snapshot(p);
  const track = result.tracks.find(t => t.id === trackId);
  if (!track) return result;
  track[what] = !track[what];
  return result;
}
