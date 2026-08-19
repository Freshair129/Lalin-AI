// @req FR-09 — timeline engine: Project state + undo/redo + selection
import { useCallback, useRef, useState } from "react";
import { type Project, type Clip, uid } from "./clipModel";
import { type AssetKind, assetId as computeAssetId, addAsset as addAssetToTable } from "./assets";
import * as ops from "./ops";

// ── engine: Project state + undo/redo + selection ────────────
// (playback อยู่ใน ClipTimeline เพราะต้องใช้ DOM/rAF)

function emptyProject(): Project {
  const mk = (id: string, label: string, color: string) => ({
    id, label, color, pan: 0, clips: [] as Clip[], envelopes: [], muted: false, solo: false, locked: false,
  });
  return {
    bpm: 120, key: null, timeSig: 4, loop: null, duration: 0, assets: {},
    tracks: [
      mk("vocal", "audio-01", "#9b6cf0"),
      mk("beat", "audio-02", "#3d9be0"),
      mk("master", "audio-03", "#c7f046"),
    ],
  };
}

export type ClipEngine = ReturnType<typeof useClipEngine>;

export function useClipEngine() {
  const [project, setProject] = useState<Project>(emptyProject);
  const [selTrack, setSelTrack] = useState<string | null>(null);
  const [selClip, setSelClip] = useState<string | null>(null);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const [histTick, setHistTick] = useState(0); // บังคับ re-render เมื่อ stack เปลี่ยน

  // apply op + push history
  const commit = useCallback((next: Project) => {
    setProject((cur) => {
      past.current.push(cur);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      return next;
    });
    setHistTick((t) => t + 1);
  }, []);

  // อัปเดตแบบไม่ลง history (เช่น hydrate duration หลัง decode)
  const silent = useCallback((fn: (p: Project) => Project) => {
    setProject((cur) => fn(cur));
  }, []);

  // ── source sync (จาก RemixPanel) ──────────────────────────
  // ref = {kind, name} ของไฟล์ใน uploads/outputs — ไม่ใช่ URL อีกต่อไป (พกพาข้ามเครื่องได้)
  const setTrackSource = useCallback((
    trackId: string,
    ref: { kind: AssetKind; name: string } | null,
    color: string,
  ) => {
    silent((p) => {
      if (!ref) {
        return { ...p, tracks: p.tracks.map((t) => (t.id !== trackId ? t : { ...t, clips: [] })) };
      }
      const { assets, id } = addAssetToTable(p.assets, ref.kind, ref.name);
      return {
        ...p, assets,
        tracks: p.tracks.map((t) =>
          t.id !== trackId ? t :
            { ...t, clips: [{ id: uid("clip"), assetId: id, start: 0, duration: 0, offset: 0, gain: 1, muted: false, color }] }
        ),
      };
    });
  }, [silent]);

  // ลงทะเบียนไฟล์เป็น asset ของ project แล้วคืน id (idempotent — ไฟล์เดิมได้ id เดิม)
  const addAsset = useCallback((kind: AssetKind, name: string): string => {
    const id = computeAssetId(kind, name);
    silent((p) => (p.assets[id] ? p : { ...p, assets: addAssetToTable(p.assets, kind, name).assets }));
    return id;
  }, [silent]);

  const hydrateDuration = useCallback((trackId: string, clipId: string, dur: number) => {
    silent((p) => ({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id !== trackId ? t :
          { ...t, clips: t.clips.map((c) => (c.id === clipId && c.duration === 0 ? { ...c, duration: dur } : c)) }
      ),
      duration: Math.max(p.duration, dur),
    }));
  }, [silent]);

  // ── editing ops (ลง history) ──────────────────────────────
  const move = useCallback((tid: string, cid: string, start: number) => commit(ops.moveClip(project, tid, cid, start)), [commit, project]);
  const slice = useCallback((tid: string, cid: string, at: number) => commit(ops.sliceClip(project, tid, cid, at)), [commit, project]);
  const clone = useCallback((tid: string, cid: string) => commit(ops.cloneClip(project, tid, cid)), [commit, project]);
  const remove = useCallback((tid: string, cid: string) => { commit(ops.deleteClip(project, tid, cid)); if (selClip === cid) setSelClip(null); }, [commit, project, selClip]);
  const muteClip = useCallback((tid: string, cid: string) => commit(ops.toggleClipMute(project, tid, cid)), [commit, project]);
  const addClip = useCallback((tid: string, clip: Clip) => commit(ops.addClip(project, tid, clip)), [commit, project]);
  const setGain = useCallback((tid: string, cid: string, g: number) => commit(ops.setClipGain(project, tid, cid, g)), [commit, project]);
  const setFade = useCallback((tid: string, cid: string, fadeIn: number, fadeOut: number) => commit(ops.setClipFade(project, tid, cid, fadeIn, fadeOut)), [commit, project]);
  const toggleTrack = useCallback((tid: string, what: "muted" | "solo" | "locked") => commit(ops.toggleTrack(project, tid, what)), [commit, project]);

  // ── undo/redo ─────────────────────────────────────────────
  const undo = useCallback(() => {
    if (!past.current.length) return;
    setProject((cur) => { future.current.push(cur); return past.current.pop() as Project; });
    setHistTick((t) => t + 1);
  }, []);
  const redo = useCallback(() => {
    if (!future.current.length) return;
    setProject((cur) => { past.current.push(cur); return future.current.pop() as Project; });
    setHistTick((t) => t + 1);
  }, []);

  const select = useCallback((tid: string | null, cid: string | null) => { setSelTrack(tid); setSelClip(cid); }, []);

  const renameTrack = useCallback((tid: string, name: string) => {
    silent((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === tid ? { ...t, label: name } : t)) }));
  }, [silent]);

  // เปลี่ยนสีแทร็ก (อัปเดต clip ในแทร็กให้สีตรงกันด้วย)
  const setTrackColor = useCallback((tid: string, color: string) => {
    silent((p) => ({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id !== tid ? t : { ...t, color, clips: t.clips.map((c) => ({ ...c, color })) }
      ),
    }));
  }, [silent]);

  // pan / tempo / loop — mix+transport state: ใช้ silent() เหมือน rename/color
  // (ไม่ลง undo history เพื่อไม่ให้การลาก balance ท่วม stack)
  const setTrackPan = useCallback((tid: string, pan: number) => {
    silent((p) => ops.setTrackPan(p, tid, pan));
  }, [silent]);

  const setTempo = useCallback((bpm: number, timeSig: number) => {
    silent((p) => ops.setProjectTempo(p, bpm, timeSig));
  }, [silent]);

  const setLoop = useCallback((loop: Project["loop"]) => {
    silent((p) => ops.setProjectLoop(p, loop));
  }, [silent]);

  // ลากสลับลำดับแทร็ก (channel strip ขึ้น/ลง) — ย้าย fromId ไปอยู่ตำแหน่งของ toId
  const reorderTrack = useCallback((fromId: string, toId: string) => {
    silent((p) => {
      const from = p.tracks.findIndex((t) => t.id === fromId);
      const to = p.tracks.findIndex((t) => t.id === toId);
      if (from < 0 || to < 0 || from === to) return p;
      const tracks = [...p.tracks];
      const [moved] = tracks.splice(from, 1);
      tracks.splice(to, 0, moved);
      return { ...p, tracks };
    });
  }, [silent]);

  // โหลด project ทั้งก้อน (จาก workspace) — แทนที่ทั้งหมด
  const loadProject = useCallback((p: Project) => {
    past.current = []; future.current = [];
    setProject(p);
    setHistTick((t) => t + 1);
  }, []);

  return {
    project, selTrack, selClip,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0, histTick,
    setTrackSource, hydrateDuration, addAsset,
    move, slice, clone, remove, muteClip, addClip, setGain, setFade, toggleTrack, renameTrack, setTrackColor, reorderTrack,
    setTrackPan, setTempo, setLoop,
    undo, redo, select, loadProject,
  };
}
