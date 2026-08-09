import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getDecoded, regionPeaks, sharedAudioContext, type Decoded } from "../timeline/peaks";

export function Waveform({ src, height = 48 }: { src: string; height?: number }) {
  const [dec, setDec] = useState<Decoded | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);

  // decode ผ่าน shared peaks utility
  useEffect(() => {
    let alive = true;
    setDec(null);
    if (!src) return;
    getDecoded(src).then((d) => { if (alive) setDec(d); }).catch(() => {});
    return () => { alive = false; };
  }, [src]);

  // สร้าง/ทำลาย audio element ตาม src
  useEffect(() => {
    if (!src) return;
    sharedAudioContext(); // ensure context created (unlocks autoplay policies on user gesture)
    const audio = new Audio(src);
    audioRef.current = audio;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => { setPlaying(false); setProgress(0); };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audioRef.current = null;
      setPlaying(false);
      setProgress(0);
    };
  }, [src]);

  // ติดตามความกว้าง container สำหรับ resample bars
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // อัปเดต progress ระหว่างเล่น
  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const audio = audioRef.current;
      if (audio && audio.duration > 0) {
        setProgress(audio.currentTime / audio.duration);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  if (!src) return null;

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const dur = dec?.duration || audio?.duration || 0;
    if (!audio || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * dur;
    setProgress(ratio);
  };

  const dur = dec?.duration || 0;
  const samples = Math.max(2, Math.floor((width || 300) / 2));
  const bars = dec && dur > 0 ? regionPeaks(dec, 0, dur, samples) : [];
  const H = height;
  const progressIdx = bars.length > 0 ? Math.floor(progress * bars.length) : -1;

  const btnStyle: CSSProperties = {
    background: "#181d29",
    border: "1px solid #262d3c",
    color: "#eef1f7",
    borderRadius: 999,
    padding: "6px 14px",
    fontSize: 13,
    cursor: "pointer",
    marginTop: 8,
  };

  return (
    <div>
      <div
        ref={containerRef}
        onClick={handleSeek}
        style={{ position: "relative", height, cursor: dur > 0 ? "pointer" : "default" }}
      >
        <svg className="tl-wave-svg" viewBox={`0 0 ${Math.max(2, bars.length)} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
          {bars.map((v, i) => {
            const h = Math.max(1, v * H);
            const played = i <= progressIdx;
            return (
              <rect
                key={i}
                x={i}
                y={(H - h) / 2}
                width={0.9}
                height={h}
                fill={played ? "#a855f7" : "#8b5cf6"}
              />
            );
          })}
        </svg>
      </div>
      <button style={btnStyle} onClick={handlePlayPause}>
        {playing ? "⏸ หยุด" : "▶ เล่น"}
      </button>
    </div>
  );
}
