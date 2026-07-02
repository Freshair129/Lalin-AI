import { useEffect, useRef, useState, type CSSProperties } from "react";
import WaveSurfer from "wavesurfer.js";

export function Waveform({ src, height = 48 }: { src: string; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!src || !containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: src,
      height,
      waveColor: "#8b5cf6",
      progressColor: "#a855f7",
      cursorColor: "#cdf23f",
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
    });

    wsRef.current = ws;

    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [src, height]);

  if (!src) return null;

  const handlePlayPause = () => {
    wsRef.current?.playPause();
  };

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
      <div ref={containerRef} />
      <button style={btnStyle} onClick={handlePlayPause}>
        {playing ? "⏸ หยุด" : "▶ เล่น"}
      </button>
    </div>
  );
}
