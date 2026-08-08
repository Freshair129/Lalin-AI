// @req FR-09 — มุมมอง timeline (waveform track view)
import { useEffect, useRef, useState } from "react";
import { getDecoded, regionPeaks, sharedAudioContext, type Decoded } from "../timeline/peaks";

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
  register: (id: string, audio: HTMLAudioElement | null) => void;
};

function Lane({ track, effMuted, selected, playing, stopSignal, onSelect, onToggle, onContext, register }: LaneProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [dec, setDec] = useState<Decoded | null>(null);
  const [width, setWidth] = useState(0);

  // decode peaks
  useEffect(() => {
    let alive = true;
    setDec(null);
    if (!track.src) return;
    getDecoded(track.src).then((d) => { if (alive) setDec(d); }).catch(() => {});
    return () => { alive = false; };
  }, [track.src]);

  // audio element lifecycle
  useEffect(() => {
    if (!track.src) return;
    sharedAudioContext();
    const audio = new Audio(track.src);
    audio.muted = effMuted;
    audioRef.current = audio;
    register(track.id, audio);
    return () => {
      register(track.id, null);
      audio.pause();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.src, track.id, register]);

  // track container width for resampling bars
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.play().catch(() => {});
    else audio.pause();
  }, [playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || stopSignal === 0) return;
    audio.pause();
    audio.currentTime = 0;
  }, [stopSignal]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = effMuted;
  }, [effMuted, playing]);

  const tbtn = (what: "mute" | "solo" | "lock", on: boolean, label: string) => (
    <button
      className={`tl-tbtn ${on ? "on" : ""}`}
      onClick={(e) => { e.stopPropagation(); onToggle(track.id, what); }}
      title={what}
    >{label}</button>
  );

  const dur = dec?.duration || 0;
  const samples = Math.max(2, Math.floor((width || 200) / 1));
  const bars = dec && dur > 0 ? regionPeaks(dec, 0, dur, samples) : [];
  const H = 48;

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
        {track.src && (
          <svg className="tl-wave-svg" viewBox={`0 0 ${Math.max(2, bars.length)} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
            {bars.map((v, i) => {
              const h = Math.max(1, v * H);
              return <rect key={i} x={i} y={(H - h) / 2} width={0.9} height={h} fill={track.color} />;
            })}
          </svg>
        )}
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
  const audioMap = useRef<Map<string, HTMLAudioElement>>(new Map());
  const lanesRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);

  const hasAudio = tracks.some((t) => t.src);
  const anySolo = tracks.some((t) => t.solo);

  const register = useRef((id: string, audio: HTMLAudioElement | null) => {
    if (audio) audioMap.current.set(id, audio);
    else audioMap.current.delete(id);
  }).current;

  // playhead — ลากเส้นเดียวผ่านทุก lane (sync จาก audio อ้างอิงตัวแรก)
  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      if (headRef.current) headRef.current.style.opacity = "0";
      return;
    }
    const tick = () => {
      const ref = [...audioMap.current.values()].find((a) => a.duration > 0);
      const lanes = lanesRef.current;
      const head = headRef.current;
      if (ref && lanes && head) {
        const p = ref.currentTime / ref.duration;
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
