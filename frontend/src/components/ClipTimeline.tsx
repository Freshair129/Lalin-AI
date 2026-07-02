import { useEffect, useRef, useState } from "react";
import type { ClipEngine } from "../timeline/useClipEngine";
import { uid, type Clip } from "../timeline/clipModel";
import { getDecoded, regionPeaks, sharedAudioContext, type Decoded } from "../timeline/peaks";
import { StereoMeter } from "./StereoMeter";
import { ChannelMeterBalance } from "./ChannelMeterBalance";

const HEAD_W = 210;

export type ClipCtx = { trackId: string; clipId: string; atSec: number; x: number; y: number };

// ── clip block (SVG waveform จาก peaks, ลากได้) ───────────────
function ClipBlock({
  clip, trackId, pps, selected, snap, onSelect, onContext, onMove, onHydrate,
}: {
  clip: Clip; trackId: string; pps: number; selected: boolean; snap: number;
  onSelect: (tid: string, cid: string) => void;
  onContext: (c: ClipCtx) => void;
  onMove: (tid: string, cid: string, start: number) => void;
  onHydrate: (tid: string, cid: string, dur: number) => void;
}) {
  const [dec, setDec] = useState<Decoded | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const drag = useRef<{ x0: number; s0: number; moved: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    if (clip.src) getDecoded(clip.src).then((d) => {
      if (!alive) return;
      setDec(d);
      if (clip.duration === 0) onHydrate(trackId, clip.id, d.duration);
    }).catch(() => {});
    return () => { alive = false; };
  }, [clip.src, clip.id, clip.duration, trackId, onHydrate]);

  const dur = clip.duration || dec?.duration || 0;
  const width = Math.max(8, dur * pps);
  const left = (dragStart ?? clip.start) * pps;

  // waveform
  const bars = dec && dur > 0 ? regionPeaks(dec, clip.offset, dur, Math.max(2, Math.floor(width / 2))) : [];
  const H = 40;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, s0: clip.start, moved: false };
    setDragStart(clip.start);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x0;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    setDragStart(Math.max(0, drag.current.s0 + dx / pps));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    const moved = drag.current.moved;
    let finalStart = dragStart ?? clip.start;
    if (moved && snap > 0) finalStart = Math.round(finalStart / snap) * snap; // snap to grid (beat)
    drag.current = null;
    setDragStart(null);
    if (moved) onMove(trackId, clip.id, finalStart);
    else onSelect(trackId, clip.id);
  };

  return (
    <div
      className={`clip ${selected ? "sel" : ""} ${clip.muted ? "muted" : ""}`}
      style={{ left, width, borderColor: clip.color }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => {
        e.preventDefault(); e.stopPropagation();
        const localX = e.clientX - e.currentTarget.getBoundingClientRect().left;
        onContext({ trackId, clipId: clip.id, atSec: clip.start + localX / pps, x: e.clientX, y: e.clientY });
      }}
    >
      <div className="clip-bg" style={{ background: clip.color }} />
      <svg className="clip-wave" viewBox={`0 0 ${Math.max(2, bars.length)} ${H}`} preserveAspectRatio="none">
        {bars.map((v, i) => {
          const h = Math.max(1, v * H);
          return <rect key={i} x={i} y={(H - h) / 2} width={0.9} height={h} fill="rgba(0,0,0,0.42)" />;
        })}
      </svg>
    </div>
  );
}

export function ClipTimeline({
  engine, onContext, reverb, echo, comp, onReverb, onEcho, onComp,
}: {
  engine: ClipEngine;
  onContext: (c: ClipCtx) => void;
  reverb: number; echo: number; comp: boolean;
  onReverb: (v: number) => void; onEcho: (v: number) => void; onComp: (v: boolean) => void;
}) {
  const { project } = engine;
  const [pps, setPps] = useState(60);
  const [bpm, setBpm] = useState(120);
  const [sig, setSig] = useState(4); // beats per bar
  const [snapOn, setSnapOn] = useState(true);
  const [panByTrack, setPanByTrack] = useState<Record<string, number>>({});
  const [playing, setPlaying] = useState(false);
  const [posSec, setPosSec] = useState(0);
  const posRef = useRef(0);
  const headRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<AudioBufferSourceNode[]>([]);
  const rafRef = useRef(0);
  const ctxStartRef = useRef(0);
  const seekRef = useRef(0);

  // effects (Web Audio preview chain) — reverb/echo/comp มาจาก props
  const [analysers, setAnalysers] = useState<{ l: AnalyserNode; r: AnalyserNode } | null>(null);
  // per-track channel meter (L/R) — tap หลัง pan ของแต่ละแทร็ก
  const [trackMeters, setTrackMeters] = useState<Record<string, { l: AnalyserNode; r: AnalyserNode }>>({});
  const fxRef = useRef<{ rev?: GainNode; echo?: GainNode } | null>(null);
  const impulseRef = useRef<AudioBuffer | null>(null);

  // responsive header (ยุบเมื่อเลื่อนขวา, ขยายเมื่อ hover / กลับต้น)
  const [collapsed, setCollapsed] = useState(false);
  const [hoverHead, setHoverHead] = useState(false);
  const HEADC = 50;
  const headW = collapsed && !hoverHead ? HEADC : HEAD_W;
  const headWRef = useRef(headW);
  headWRef.current = headW;

  // inline rename
  const [editing, setEditing] = useState<string | null>(null);
  // drag-reorder channel strip (ลากสลับขึ้น/ลง)
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // keyboard shortcuts (Premiere-style)
  const [showKeys, setShowKeys] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const clipboardRef = useRef<Clip | null>(null);

  const duration = Math.max(project.duration, 20);
  const contentW = duration * pps;

  // สร้าง impulse response สำหรับ reverb (cache)
  const makeImpulse = (ctx: AudioContext) => {
    if (impulseRef.current) return impulseRef.current;
    const len = ctx.sampleRate * 2.2;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    impulseRef.current = buf;
    return buf;
  };

  const stopNodes = () => { nodesRef.current.forEach((n) => { try { n.stop(); } catch { /* */ } }); nodesRef.current = []; };

  const pause = () => {
    cancelAnimationFrame(rafRef.current);
    stopNodes();
    setPlaying(false);
  };

  const play = async () => {
    const ctx = sharedAudioContext();
    await ctx.resume();
    let seek = posRef.current;
    if (seek >= project.duration) seek = 0;
    seekRef.current = seek;
    const anySolo = project.tracks.some((t) => t.solo);

    // ── master FX chain: clips → master → [comp] → dry + reverb + echo → meter → out ──
    const master = ctx.createGain();
    let busIn: AudioNode = master;
    if (comp) {
      const cp = ctx.createDynamicsCompressor();
      cp.threshold.value = -18; cp.ratio.value = 3; cp.attack.value = 0.005; cp.release.value = 0.18;
      master.connect(cp); busIn = cp;
    }
    // meter (split L/R)
    const split = ctx.createChannelSplitter(2);
    const aL = ctx.createAnalyser(); aL.fftSize = 1024;
    const aR = ctx.createAnalyser(); aR.fftSize = 1024;
    busIn.connect(split); split.connect(aL, 0); split.connect(aR, 1);
    // dry
    busIn.connect(ctx.destination);
    // reverb send
    const conv = ctx.createConvolver(); conv.buffer = makeImpulse(ctx);
    const revGain = ctx.createGain(); revGain.gain.value = reverb;
    busIn.connect(conv); conv.connect(revGain); revGain.connect(ctx.destination);
    // echo send
    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.3;
    const fb = ctx.createGain(); fb.gain.value = 0.32; delay.connect(fb); fb.connect(delay);
    const echoGain = ctx.createGain(); echoGain.gain.value = echo;
    busIn.connect(delay); delay.connect(echoGain); echoGain.connect(ctx.destination);
    fxRef.current = { rev: revGain, echo: echoGain };
    setAnalysers({ l: aL, r: aR });

    // เตรียม buffer ของทุก src
    const srcs = [...new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.src).filter(Boolean)))] as string[];
    const decs = new Map<string, Decoded>();
    await Promise.all(srcs.map((s) => getDecoded(s).then((d) => decs.set(s, d)).catch(() => {})));

    const meters: Record<string, { l: AnalyserNode; r: AnalyserNode }> = {};
    for (const t of project.tracks) {
      if (t.muted || (anySolo && !t.solo)) continue;
      // per-track pan → master
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, panByTrack[t.id] ?? 0));
      panner.connect(master);
      // per-track channel meter: tap L/R จาก panner
      const tSplit = ctx.createChannelSplitter(2);
      const tL = ctx.createAnalyser(); tL.fftSize = 1024;
      const tR = ctx.createAnalyser(); tR.fftSize = 1024;
      panner.connect(tSplit); tSplit.connect(tL, 0); tSplit.connect(tR, 1);
      meters[t.id] = { l: tL, r: tR };
      for (const c of t.clips) {
        if (!c.src || c.muted) continue;
        const d = decs.get(c.src);
        if (!d) continue;
        const cdur = c.duration || d.duration;
        if (c.start + cdur <= seek) continue;
        const whenOffset = Math.max(0, c.start - seek);
        const into = c.offset + Math.max(0, seek - c.start);
        const playDur = cdur - Math.max(0, seek - c.start);
        if (playDur <= 0) continue;
        const node = ctx.createBufferSource();
        node.buffer = d.buffer;
        const g = ctx.createGain();
        g.gain.value = c.gain;
        node.connect(g).connect(panner);
        try { node.start(ctx.currentTime + whenOffset, into, playDur); } catch { /* */ }
        nodesRef.current.push(node);
      }
    }
    setTrackMeters(meters);
    ctxStartRef.current = ctx.currentTime;
    setPlaying(true);

    const tick = () => {
      const cur = seekRef.current + (ctx.currentTime - ctxStartRef.current);
      posRef.current = cur;
      if (headRef.current) headRef.current.style.left = `${headWRef.current + cur * pps}px`;
      setPosSec(cur);
      if (cur >= duration) { pause(); posRef.current = 0; setPosSec(0); if (headRef.current) headRef.current.style.left = `${headWRef.current}px`; return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // live-update fx ขณะเล่น
  useEffect(() => { if (fxRef.current?.rev) fxRef.current.rev.gain.value = reverb; }, [reverb]);
  useEffect(() => { if (fxRef.current?.echo) fxRef.current.echo.gain.value = echo; }, [echo]);

  const stop = () => { pause(); posRef.current = 0; setPosSec(0); if (headRef.current) headRef.current.style.left = `${headWRef.current}px`; };

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); stopNodes(); }, []);

  // ── helpers สำหรับ keyboard shortcuts ─────────────────────
  // หา clip ที่เลือกอยู่ (+ track ของมัน)
  const findSel = (): { tid: string; clip: Clip } | null => {
    for (const t of project.tracks) {
      const c = t.clips.find((c) => c.id === engine.selClip);
      if (c) return { tid: t.id, clip: c };
    }
    return null;
  };
  // เลื่อน playhead ไปยังเวลา (เล่นต่อถ้ากำลังเล่น)
  const seekTo = (sec: number) => {
    const clamped = Math.max(0, Math.min(duration, sec));
    const wasPlaying = playing;
    if (wasPlaying) pause();
    posRef.current = clamped;
    setPosSec(clamped);
    if (headRef.current) headRef.current.style.left = `${headWRef.current + clamped * pps}px`;
    if (wasPlaying) play();
  };
  // jump ไปจุดตัด clip ก่อนหน้า/ถัดไป (เหมือน Up/Down ใน Premiere)
  const jumpEdit = (dir: 1 | -1) => {
    const set = new Set<number>([0]);
    for (const t of project.tracks) for (const c of t.clips) { set.add(c.start); set.add(c.start + (c.duration || 0)); }
    const es = [...set].sort((a, b) => a - b);
    const cur = posRef.current;
    if (dir > 0) seekTo(es.find((x) => x > cur + 1e-3) ?? duration);
    else seekTo([...es].reverse().find((x) => x < cur - 1e-3) ?? 0);
  };
  // razor: ตัด clip ที่ playhead (clip ที่เลือกก่อน ไม่งั้นหา clip ใต้ playhead)
  const razor = () => {
    const at = posRef.current;
    const s = findSel();
    if (s && at > s.clip.start && at < s.clip.start + s.clip.duration) { engine.slice(s.tid, s.clip.id, at); return; }
    for (const t of project.tracks) {
      const c = t.clips.find((c) => at > c.start && at < c.start + (c.duration || 0));
      if (c) { engine.slice(t.id, c.id, at); return; }
    }
  };
  const zoomFit = () => {
    const el = scrollRef.current;
    if (!el || duration <= 0) return;
    const avail = el.clientWidth - headW - 24;
    if (avail > 0) setPps(Math.max(15, Math.min(200, avail / duration)));
  };
  const copySel = () => { const s = findSel(); if (s) clipboardRef.current = structuredClone(s.clip); };
  const pasteClip = () => {
    const c = clipboardRef.current;
    const tid = engine.selTrack ?? project.tracks[0]?.id;
    if (!c || !tid) return;
    engine.addClip(tid, { ...structuredClone(c), id: uid("clip"), start: posRef.current });
  };
  const cutSel = () => { const s = findSel(); if (!s) return; clipboardRef.current = structuredClone(s.clip); engine.remove(s.tid, s.clip.id); };
  const deleteSel = () => { const s = findSel(); if (s) engine.remove(s.tid, s.clip.id); };
  const dupSel = () => { const s = findSel(); if (s) engine.clone(s.tid, s.clip.id); };
  const muteSel = () => { const s = findSel(); if (s) engine.muteClip(s.tid, s.clip.id); };

  // เก็บ handler ล่าสุดไว้ใน ref → ผูก listener ครั้งเดียว ไม่มี stale closure
  const kb = useRef<Record<string, unknown>>({});
  kb.current = {
    playing, play, pause, seekTo, jumpEdit, razor, zoomFit,
    copySel, pasteClip, cutSel, deleteSel, dupSel, muteSel,
    engine, setPps, setSnapOn, duration, pos: posRef,
  };

  // ── keyboard shortcuts (Premiere-style) ───────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = kb.current as {
        playing: boolean; play: () => void; pause: () => void;
        seekTo: (s: number) => void; jumpEdit: (d: 1 | -1) => void; razor: () => void; zoomFit: () => void;
        copySel: () => void; pasteClip: () => void; cutSel: () => void; deleteSel: () => void; dupSel: () => void; muteSel: () => void;
        engine: ClipEngine; setPps: (f: (p: number) => number) => void; setSnapOn: (f: (v: boolean) => boolean) => void;
        duration: number; pos: { current: number };
      };
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;

      if (mod) {
        if (typing) return; // ให้ field จัดการ Ctrl+Z/C/V ของตัวเอง
        switch (e.key.toLowerCase()) {
          case "z": e.preventDefault(); e.shiftKey ? k.engine.redo() : k.engine.undo(); return;
          case "y": e.preventDefault(); k.engine.redo(); return;
          case "c": e.preventDefault(); k.copySel(); return;
          case "v": e.preventDefault(); k.pasteClip(); return;
          case "x": e.preventDefault(); k.cutSel(); return;
          case "d": e.preventDefault(); k.dupSel(); return;
          case "k": e.preventDefault(); k.razor(); return;
          default: return; // ปล่อย Ctrl+S ฯลฯ ให้ระบบ
        }
      }
      if (typing) return; // คีย์เดี่ยวไม่ทำงานขณะพิมพ์

      switch (e.key) {
        case " ": e.preventDefault(); k.playing ? k.pause() : k.play(); break;
        case "Home": e.preventDefault(); k.seekTo(0); break;
        case "End": e.preventDefault(); k.seekTo(k.duration); break;
        case "ArrowLeft": e.preventDefault(); k.seekTo(k.pos.current - (e.shiftKey ? 1 : 0.2)); break;
        case "ArrowRight": e.preventDefault(); k.seekTo(k.pos.current + (e.shiftKey ? 1 : 0.2)); break;
        case "ArrowUp": e.preventDefault(); k.jumpEdit(-1); break;
        case "ArrowDown": e.preventDefault(); k.jumpEdit(1); break;
        case "Delete": case "Backspace": e.preventDefault(); k.deleteSel(); break;
        case "c": case "C": e.preventDefault(); k.razor(); break;
        case "s": case "S": e.preventDefault(); k.setSnapOn((v) => !v); break;
        case "m": case "M": e.preventDefault(); k.muteSel(); break;
        case "=": case "+": e.preventDefault(); k.setPps((p) => Math.min(200, p + 15)); break;
        case "-": case "_": e.preventDefault(); k.setPps((p) => Math.max(15, p - 15)); break;
        case "\\": e.preventDefault(); k.zoomFit(); break;
        default: break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="cliptl">
      <div className="cliptl-bar">
        <button className="tl-btn play" onClick={() => (playing ? pause() : play())}>{playing ? "⏸" : "▶"}</button>
        <button className="tl-btn" onClick={stop}>⏹</button>
        <span className="cliptl-time mono">{fmt(posSec)} / {fmt(duration)}</span>
        <span className="cliptl-grid-ctl">
          <input className="mono" type="number" min={40} max={240} value={bpm}
            onChange={(e) => setBpm(Math.min(240, Math.max(40, Number(e.target.value) || 120)))} />
          <span className="cliptl-unit">BPM</span>
          <select className="mono" value={sig} onChange={(e) => setSig(Number(e.target.value))}>
            <option value={3}>3/4</option>
            <option value={4}>4/4</option>
            <option value={6}>6/8</option>
            <option value={5}>5/4</option>
          </select>
        </span>
        <span className="cliptl-fx">
          <span className="cliptl-fxk"><span className="cliptl-unit">REV</span>
            <input type="range" min={0} max={1} step={0.01} value={reverb} onChange={(e) => onReverb(Number(e.target.value))} /></span>
          <span className="cliptl-fxk"><span className="cliptl-unit">ECHO</span>
            <input type="range" min={0} max={1} step={0.01} value={echo} onChange={(e) => onEcho(Number(e.target.value))} /></span>
          <button className={`tl-btn ${comp ? "play" : ""}`} onClick={() => onComp(!comp)} title="Compressor">CMP</button>
          <button className={`tl-btn ${snapOn ? "play" : ""}`} onClick={() => setSnapOn((s) => !s)} title="Snap to grid">⊞</button>
        </span>
        <StereoMeter analyserL={analysers?.l} analyserR={analysers?.r} active={playing} height={26} />
        <span className="cliptl-gap" />
        <button className="tl-btn" onClick={engine.undo} disabled={!engine.canUndo} title="Undo (Ctrl+Z)">↶</button>
        <button className="tl-btn" onClick={engine.redo} disabled={!engine.canRedo} title="Redo (Ctrl+Shift+Z)">↷</button>
        <span className="cliptl-zoom">
          <button className="tl-btn" onClick={() => setPps((p) => Math.max(15, p - 15))}>−</button>
          <button className="tl-btn" onClick={() => setPps((p) => Math.min(200, p + 15))}>+</button>
        </span>
        <button className={`tl-btn ${showKeys ? "play" : ""}`} onClick={() => setShowKeys((s) => !s)} title="คีย์ลัด (Premiere-style)">⌨</button>
      </div>

      {showKeys && (
        <div className="kb-pop" onClick={() => setShowKeys(false)}>
          <div className="kb-card glass" onClick={(e) => e.stopPropagation()}>
            <div className="kb-title">⌨ คีย์ลัด · Premiere-style</div>
            <div className="kb-grid">
              {[
                ["Ctrl+N / O / S", "ไฟล์ใหม่ / เปิด / บันทึก"],
                ["Ctrl+Shift+S", "บันทึกเป็น (Save As)"],
                ["Space", "เล่น / หยุด"],
                ["Home / End", "ไปต้น / ท้าย"],
                ["← / →", "ขยับ playhead (Shift = ก้าวใหญ่)"],
                ["↑ / ↓", "ไปจุดตัด clip ก่อน / ถัดไป"],
                ["C  /  Ctrl+K", "ตัด (razor) ที่ playhead"],
                ["Ctrl+Z / Ctrl+Shift+Z", "Undo / Redo"],
                ["Ctrl+C / V / X", "คัดลอก / วาง / ตัด clip"],
                ["Ctrl+D", "ทำซ้ำ clip"],
                ["Delete / Backspace", "ลบ clip ที่เลือก"],
                ["M", "ปิดเสียง clip ที่เลือก"],
                ["S", "สลับ Snap"],
                ["+ / −  ·  \\", "ซูม เข้า/ออก · พอดีจอ"],
              ].map(([k, d]) => (
                <div className="kb-row" key={k}><kbd>{k}</kbd><span>{d}</span></div>
              ))}
            </div>
            <div className="kb-note">* คีย์เดี่ยวไม่ทำงานขณะพิมพ์ในช่อง · เลือก clip ก่อนเพื่อ ลบ/คัดลอก/ตัด</div>
          </div>
        </div>
      )}

      <div className="cliptl-scroll" ref={scrollRef} onScroll={(e) => setCollapsed(e.currentTarget.scrollLeft > 40)}>
        <div className="cliptl-inner" style={{ width: headW + contentW }}>
          {/* ruler */}
          <div className="cliptl-ruler" style={{ paddingLeft: headW }}>
            {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
              <span key={i} className="cliptl-rtick mono" style={{ left: headW + i * pps }}>{i % 2 === 0 ? fmt(i) : ""}</span>
            ))}
          </div>

          {/* dynamic grid (ตาม BPM + time signature) */}
          {(() => {
            const beatPx = (60 / bpm) * pps;
            const barPx = beatPx * sig;
            return (
              <div
                className="cliptl-grid"
                style={{
                  left: headW,
                  backgroundImage:
                    `repeating-linear-gradient(90deg, rgba(255,255,255,0.11) 0 1.5px, transparent 1.5px ${barPx}px),` +
                    `repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px ${beatPx}px)`,
                }}
              />
            );
          })()}

          {/* playhead */}
          <div className="cliptl-playhead" ref={headRef} style={{ left: headW }} />

          {/* tracks */}
          {project.tracks.map((t) => {
            const anySolo = project.tracks.some((x) => x.solo);
            const dim = t.muted || (anySolo && !t.solo);
            return (
              <div
                className={`cliptl-row ${dim ? "dim" : ""} ${dragId === t.id ? "dragging" : ""} ${overId === t.id && dragId && dragId !== t.id ? "drop-target" : ""}`}
                key={t.id}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); if (overId !== t.id) setOverId(t.id); } }}
                onDragEnter={(e) => { if (dragId && dragId !== t.id) { e.preventDefault(); engine.reorderTrack(dragId, t.id); } }}
                onDrop={(e) => { e.preventDefault(); setDragId(null); setOverId(null); }}
              >
                <div
                  className={`cliptl-head gb ${headW === HEADC ? "collapsed" : ""}`}
                  style={{ width: headW, borderLeft: `3px solid ${t.color}` }}
                  onMouseEnter={() => setHoverHead(true)}
                  onMouseLeave={() => setHoverHead(false)}
                >
                  <div className="th-top">
                    <span
                      className="th-grip" title="ลากเพื่อสลับลำดับแทร็ก" draggable
                      onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); }}
                      onDragEnd={() => { setDragId(null); setOverId(null); }}
                    >⋮⋮</span>
                    <label className="th-icon" title="คลิกเพื่อเปลี่ยนสีแทร็ก"
                      style={{ background: `linear-gradient(145deg, ${t.color}, color-mix(in srgb, ${t.color} 40%, #000))` }}>
                      ♪
                      <input type="color" className="th-color" value={t.color}
                        onChange={(e) => engine.setTrackColor(t.id, e.target.value)} />
                    </label>
                    {editing === t.id ? (
                      <input
                        className="cliptl-rename mono" autoFocus defaultValue={t.label}
                        onBlur={(e) => { engine.renameTrack(t.id, e.target.value || t.label); setEditing(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }}
                      />
                    ) : (
                      <span className="th-name" onDoubleClick={() => setEditing(t.id)} title="ดับเบิลคลิกเพื่อเปลี่ยนชื่อ">{t.label}</span>
                    )}
                    <span className="tl-tbtns">
                      <button className={`tl-tbtn ${t.muted ? "on" : ""}`} onClick={() => engine.toggleTrack(t.id, "muted")}>M</button>
                      <button className={`tl-tbtn ${t.solo ? "on" : ""}`} onClick={() => engine.toggleTrack(t.id, "solo")}>S</button>
                    </span>
                  </div>
                  <div className="th-vol-row">
                    <span className="th-vol-ic" title="Volume">🔊</span>
                    <input
                      className="th-vol" type="range" min={0} max={1} step={0.01}
                      value={t.clips[0]?.gain ?? 1} disabled={!t.clips.length}
                      onChange={(e) => t.clips[0] && engine.setGain(t.id, t.clips[0].id, Number(e.target.value))}
                      title="Volume"
                    />
                  </div>
                  <div className="th-bal-row">
                    <ChannelMeterBalance
                      analyserL={trackMeters[t.id]?.l} analyserR={trackMeters[t.id]?.r}
                      active={playing && !dim}
                      pan={panByTrack[t.id] ?? 0}
                      onPan={(v) => setPanByTrack((s) => ({ ...s, [t.id]: v }))}
                    />
                  </div>
                </div>
                <div className="cliptl-lane">
                  {t.clips.map((c) => (
                    <ClipBlock
                      key={c.id} clip={c} trackId={t.id} pps={pps}
                      selected={engine.selClip === c.id}
                      snap={snapOn ? 60 / bpm : 0}
                      onSelect={engine.select}
                      onContext={onContext}
                      onMove={engine.move}
                      onHydrate={engine.hydrateDuration}
                    />
                  ))}
                  {!t.clips.length && <span className="cliptl-empty">— โหลดไฟล์เสียงจากปุ่ม 🎤 Source / 🥁 Beat ด้านบน —</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
