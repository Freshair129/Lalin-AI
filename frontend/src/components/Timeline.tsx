import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

export type TrackView = {
  id: string;
  label: string;
  color: string;
  src?: string | null;
  muted?: boolean;
  solo?: boolean;
  locked?: boolean;
};

type LaneProps = {
  track: TrackView;
  effMuted: boolean;
  selected: boolean;
  playing: boolean;
  stopSignal: number;
  onSelect: (id: string) => void;
  onToggle: (id: string, what: "mute" | "solo" | "lock") => void;
  onContext: (id: string, x: number, y: number) => void;
  register: (id: string, ws: WaveSurfer | null) => void;
};

function Lane({ track, effMuted, selected, playing, stopSignal, onSelect, onToggle, onContext, register }: LaneProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!ref.current || !track.src) return;
    const ws = WaveSurfer.create({
      container: ref.current,
      url: track.src,
      height: 48,
      waveColor: track.color,
      progressColor: track.color,
      cursorColor: "#c7f046",
      cursorWidth: 1,
      barWidth: 1,
      barGap: 0,
      normalize: true,
    });
    wsRef.current = ws;
    register(track.id, ws);
    return () => {
      register(track.id, null);
      ws.destroy();
      wsRef.current = null;
    };
  }, [track.src, track.color, track.id, register]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (playing) ws.play().catch(() => {});
    else ws.pause();
  }, [playing]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || stopSignal === 0) return;
    ws.pause();
    try { ws.seekTo(0); } catch { /* not ready */ }
  }, [stopSignal]);

  useEffect(() => {
    wsRef.current?.setMuted(effMuted);
  }, [effMuted, playing]);

  const tbtn = (what: "mute" | "solo" | "lock", on: boolean, label: string) => (
    <button
      className={`tl-tbtn ${on ? "on" : ""}`}
      onClick={(e) => { e.stopPropagation(); onToggle(track.id, what); }}
      title={what}
    >{label}</button>
  );

  return (
    <div
      className={`tl-lane ${selected ? "sel" : ""}`}
      onClick={() => onSelect(track.id)}
      onContextMenu={(e) => { e.preventDefault(); onContext(track.id, e.clientX, e.clientY); }}
    >
      <div className="tl-head" style={{ borderLeft: `3px solid ${track.color}` }}>
        <span className="tl-label" style={{ color: track.color }}>{track.label}</span>
        <span className="tl-tbtns">
          {tbtn("mute", !!track.muted, "M")}
          {tbtn("solo", !!track.solo, "S")}
          {tbtn("lock", !!track.locked, track.locked ? "🔒" : "🔓")}
        </span>
      </div>
      <div className="tl-wave" ref={ref}>
        {!track.src && <span className="tl-empty">— ยังไม่มีไฟล์ —</span>}
      </div>
    </div>
  );
}

export function Timeline({
  tracks, selectedId, onSelect, onToggle, onContext,
}: {
  tracks: TrackView[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onToggle?: (id: string, what: "mute" | "solo" | "lock") => void;
  onContext?: (id: string, x: number, y: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [stopSignal, setStopSignal] = useState(0);
  const wsMap = useRef<Map<string, WaveSurfer>>(new Map());
  const lanesRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);

  const hasAudio = tracks.some((t) => t.src);
  const anySolo = tracks.some((t) => t.solo);

  const register = useRef((id: string, ws: WaveSurfer | null) => {
    if (ws) wsMap.current.set(id, ws);
    else wsMap.current.delete(id);
  }).current;

  // playhead — ลากเส้นเดียวผ่านทุก lane (sync จาก ws อ้างอิงตัวแรก)
  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      if (headRef.current) headRef.current.style.opacity = "0";
      return;
    }
    const tick = () => {
      const ref = [...wsMap.current.values()].find((w) => w.getDuration() > 0);
      const lanes = lanesRef.current;
      const head = headRef.current;
      if (ref && lanes && head) {
        const p = ref.getCurrentTime() / ref.getDuration();
        const waveW = lanes.clientWidth - 132; // 132 = ความกว้าง track header
        head.style.left = `${132 + p * waveW}px`;
        head.style.opacity = "1";
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  const stop = () => { setPlaying(false); setStopSignal((s) => s + 1); };

  return (
    <div className="tl">
      <div className="tl-transport">
        <button className="tl-btn play" onClick={() => setPlaying((p) => !p)} disabled={!hasAudio}>
          {playing ? "⏸" : "▶"}
        </button>
        <button className="tl-btn" onClick={stop} disabled={!hasAudio}>⏹</button>
        <div className="tl-ruler">
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className="tl-tick mono">{i + 1}</span>
          ))}
        </div>
      </div>
      <div className="tl-lanes" ref={lanesRef}>
        <div className="tl-playhead" ref={headRef} />
        {tracks.map((t) => (
          <Lane
            key={t.id}
            track={t}
            effMuted={!!t.muted || (anySolo && !t.solo)}
            selected={selectedId === t.id}
            playing={playing}
            stopSignal={stopSignal}
            onSelect={(id) => onSelect?.(id)}
            onToggle={(id, w) => onToggle?.(id, w)}
            onContext={(id, x, y) => onContext?.(id, x, y)}
            register={register}
          />
        ))}
      </div>
    </div>
  );
}
