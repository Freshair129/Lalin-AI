// @req FR-09 — stereo meter ของ master bus (FR-09.7)
import { useEffect, useRef } from "react";

export function StereoMeter({
  analyserL,
  analyserR,
  height = 90,
  active = false,
  barWidth = 9,
  showLabels = true,
}: {
  analyserL?: AnalyserNode | null;
  analyserR?: AnalyserNode | null;
  height?: number;
  active?: boolean;
  barWidth?: number;
  showLabels?: boolean;
}): JSX.Element {
  // Fill element refs
  const fillLRef = useRef<HTMLDivElement | null>(null);
  const fillRRef = useRef<HTMLDivElement | null>(null);
  // Peak marker refs
  const peakLRef = useRef<HTMLDivElement | null>(null);
  const peakRRef = useRef<HTMLDivElement | null>(null);
  // Runtime state kept in refs to avoid re-renders
  const peakL = useRef(0);
  const peakR = useRef(0);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    // Allocate buffers once per analyser instance
    let bufL: Float32Array<ArrayBuffer> | null = null;
    let bufR: Float32Array<ArrayBuffer> | null = null;

    if (analyserL) bufL = new Float32Array(new ArrayBuffer(analyserL.fftSize * 4));
    if (analyserR) bufR = new Float32Array(new ArrayBuffer(analyserR.fftSize * 4));

    const setChannel = (
      fillEl: HTMLDivElement | null,
      peakEl: HTMLDivElement | null,
      level: number,
      peakRef: { current: number },
    ) => {
      // Update peak hold
      if (level > peakRef.current) {
        peakRef.current = level;
      } else {
        peakRef.current *= 0.96;
      }

      if (fillEl) {
        fillEl.style.height = `${level * 100}%`;
      }
      if (peakEl) {
        peakEl.style.bottom = `${peakRef.current * 100}%`;
      }
    };

    const readRMS = (analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number => {
      try {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          sum += buf[i] * buf[i];
        }
        const rms = Math.sqrt(sum / buf.length);
        return Math.min(1, rms * 2.2);
      } catch {
        return 0;
      }
    };

    const loop = () => {
      const levelL =
        analyserL && bufL ? readRMS(analyserL, bufL) : 0;
      const levelR =
        analyserR && bufR ? readRMS(analyserR, bufR) : 0;

      setChannel(fillLRef.current, peakLRef.current, levelL, peakL);
      setChannel(fillRRef.current, peakRRef.current, levelR, peakR);

      rafId.current = requestAnimationFrame(loop);
    };

    const hasAnalyser = analyserL != null || analyserR != null;

    if (active && hasAnalyser) {
      rafId.current = requestAnimationFrame(loop);
    } else {
      // Zero out the meters when inactive
      setChannel(fillLRef.current, peakLRef.current, 0, peakL);
      setChannel(fillRRef.current, peakRRef.current, 0, peakR);
    }

    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [analyserL, analyserR, active]);

  const barStyle: React.CSSProperties = {
    width: barWidth,
    height,
    borderRadius: 4,
    background: "#1c1f26",
    border: "1px solid #2a2e38",
    position: "relative",
    overflow: "hidden",
  };

  const fillStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "0%",
    background:
      "linear-gradient(to top, #51c46b 0%, #c7f046 60%, #ffb340 82%, #ff5163 100%)",
    borderRadius: 4,
  };

  const peakStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "0%",
    height: 2,
    background: "#ffffff99",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 8,
    color: "#7e8597",
    marginTop: 3,
    textAlign: "center",
    fontFamily: "monospace",
  };

  const channelStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-end",
  };

  return (
    <div style={containerStyle}>
      {/* Left channel */}
      <div style={channelStyle}>
        <div style={barStyle}>
          <div ref={fillLRef} style={fillStyle} />
          <div ref={peakLRef} style={peakStyle} />
        </div>
        {showLabels && <div style={labelStyle}>L</div>}
      </div>

      {/* Right channel */}
      <div style={channelStyle}>
        <div style={barStyle}>
          <div ref={fillRRef} style={fillStyle} />
          <div ref={peakRRef} style={peakStyle} />
        </div>
        {showLabels && <div style={labelStyle}>R</div>}
      </div>
    </div>
  );
}
