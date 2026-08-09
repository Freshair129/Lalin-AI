// @req FR-09 — level meter + pan ต่อแทร็ก (FR-09.7)
import { useEffect, useRef } from "react";

/**
 * Channel meter + balance ในตัวเดียว — แถบ L/R แนวนอน 2 แถบ
 *  - วิ่งโชว์ระดับเสียงสด (level meter) ตอนเล่น
 *  - ลากซ้าย-ขวาเพื่อปรับ balance (pan -1..1) · ดับเบิลคลิก = กลับกลาง
 */
export function ChannelMeterBalance({
  analyserL,
  analyserR,
  active = false,
  pan = 0,
  onPan,
}: {
  analyserL?: AnalyserNode | null;
  analyserR?: AnalyserNode | null;
  active?: boolean;
  pan?: number; // -1..1
  onPan?: (v: number) => void;
}): JSX.Element {
  const fillLRef = useRef<HTMLDivElement | null>(null);
  const fillRRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const rafId = useRef<number | null>(null);
  const dragging = useRef(false);

  // ── level meter loop (RMS → ความกว้างแถบ) ──────────────────
  useEffect(() => {
    let bufL: Float32Array<ArrayBuffer> | null = null;
    let bufR: Float32Array<ArrayBuffer> | null = null;
    if (analyserL) bufL = new Float32Array(new ArrayBuffer(analyserL.fftSize * 4));
    if (analyserR) bufR = new Float32Array(new ArrayBuffer(analyserR.fftSize * 4));

    const rms = (a: AnalyserNode, b: Float32Array<ArrayBuffer>): number => {
      try {
        a.getFloatTimeDomainData(b);
        let s = 0;
        for (let i = 0; i < b.length; i++) s += b[i] * b[i];
        return Math.min(1, Math.sqrt(s / b.length) * 2.2);
      } catch {
        return 0;
      }
    };

    const loop = () => {
      const lv = analyserL && bufL ? rms(analyserL, bufL) : 0;
      const rv = analyserR && bufR ? rms(analyserR, bufR) : 0;
      if (fillLRef.current) fillLRef.current.style.width = `${lv * 100}%`;
      if (fillRRef.current) fillRRef.current.style.width = `${rv * 100}%`;
      rafId.current = requestAnimationFrame(loop);
    };

    if (active && (analyserL || analyserR)) {
      rafId.current = requestAnimationFrame(loop);
    } else {
      if (fillLRef.current) fillLRef.current.style.width = "0%";
      if (fillRRef.current) fillRRef.current.style.width = "0%";
    }
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
    };
  }, [analyserL, analyserR, active]);

  // ── ลากปรับ balance ────────────────────────────────────────
  const setFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !onPan) return;
    const r = el.getBoundingClientRect();
    let v = ((clientX - r.left) / r.width) * 2 - 1; // 0..1 → -1..1
    v = Math.max(-1, Math.min(1, v));
    if (Math.abs(v) < 0.06) v = 0; // snap กลาง
    onPan(v);
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    setFromX(e.clientX);
  };
  const onMove = (e: React.PointerEvent) => { if (dragging.current) setFromX(e.clientX); };
  const onUp = (e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const panPct = ((pan + 1) / 2) * 100;
  const panLabel = Math.abs(pan) < 0.05 ? "C" : pan < 0 ? `L${Math.round(-pan * 100)}` : `R${Math.round(pan * 100)}`;

  return (
    <div className="cmb" title={`Balance: ${panLabel} — ลากปรับซ้าย-ขวา · ดับเบิลคลิก = กลาง`}>
      <div
        className="cmb-track"
        ref={trackRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onDoubleClick={() => onPan?.(0)}
      >
        <div className="cmb-bar">
          <span className="cmb-lbl">L</span>
          <div ref={fillLRef} className="cmb-fill" />
        </div>
        <div className="cmb-bar">
          <span className="cmb-lbl">R</span>
          <div ref={fillRRef} className="cmb-fill" />
        </div>
        <div className="cmb-center" />
        <div className="cmb-handle" style={{ left: `${panPct}%` }} />
      </div>
      <span className="cmb-val mono">{panLabel}</span>
    </div>
  );
}
