// @req FR-04b — ลูกบิดปรับพารามิเตอร์ของ remix/FX
import { useRef, useState, useCallback } from "react";

// ────────────────────────────────────────────────────────────
// ยูทิลิตี้ geometry
// ────────────────────────────────────────────────────────────
const PI = Math.PI;

/** แปลง fraction 0..1 → องศา (-135 … +135) */
function fracToAngle(frac: number): number {
  return -135 + 270 * frac;
}

/** แปลงองศา → XY บน arc (cx=cy=26, r=21) */
function polarXY(angleDeg: number, r: number = 21, cx: number = 26, cy: number = 26) {
  const rad = (angleDeg - 90) * (PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** สร้าง SVG arc path จาก a0 ถึง a1 บนวงกลม r */
function arcPath(a0: number, a1: number, r: number = 21, cx: number = 26, cy: number = 26): string {
  const p0 = polarXY(a0, r, cx, cy);
  const p1 = polarXY(a1, r, cx, cy);
  const largeArc = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;
}

// ────────────────────────────────────────────────────────────
// State ของ drag (เก็บไว้ใน ref เพื่อไม่ re-render)
// ────────────────────────────────────────────────────────────
interface DragState {
  startY: number;
  startValue: number;
}

// ────────────────────────────────────────────────────────────
// Knob component
// ────────────────────────────────────────────────────────────
export function Knob({
  value,
  min = 0,
  max = 1,
  onChange,
  label,
  color = "#c7f046",
  format,
  size = 52,
  disabled = false,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  label?: string;
  color?: string;
  format?: (v: number) => string;
  size?: number;
  disabled?: boolean;
}) {
  // ใช้ ref เก็บ drag state — ไม่ต้องการ re-render ระหว่างลาก
  const dragRef = useRef<DragState | null>(null);
  // isDragging state สำหรับ cursor เท่านั้น
  const [dragging, setDragging] = useState(false);

  // clamp + fraction
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const frac = clamp((value - min) / (max - min));
  const angle = fracToAngle(frac);

  // pointer indicator: เส้นชี้ตำแหน่ง ตั้งแต่ r=14 ถึง r=20
  const inner = polarXY(angle, 14);
  const outer = polarXY(angle, 20);

  // arc paths (viewBox 52×52, arc r=21)
  const trackPath = arcPath(-135, 135);
  // ถ้า frac=0 ไม่วาด value arc (ป้องกัน path ศูนย์ความยาว)
  const valuePath = frac > 0 ? arcPath(-135, angle) : null;

  // ────── drag handlers ──────
  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (disabled) return;
      e.preventDefault();
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      dragRef.current = { startY: e.clientY, startValue: value };
      setDragging(true);
    },
    [disabled, value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragRef.current) return;
      const dy = dragRef.current.startY - e.clientY; // ขึ้น = บวก
      const delta = (dy / 150) * (max - min);
      const newVal = clamp(dragRef.current.startValue + delta);
      onChange(newVal);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [max, min, onChange],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
      dragRef.current = null;
      setDragging(false);
    },
    [],
  );

  // ────── render ──────
  const displayVal = format ? format(value) : value.toFixed(2);

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    opacity: disabled ? 0.4 : 1,
    userSelect: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#7e8597",
    fontFamily: "monospace",
    lineHeight: 1,
  };

  const readoutStyle: React.CSSProperties = {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#e7e9ee",
    marginTop: 3,
    lineHeight: 1,
  };

  const svgStyle: React.CSSProperties = {
    cursor: disabled ? "default" : dragging ? "grabbing" : "ns-resize",
    display: "block",
    touchAction: "none",
  };

  return (
    <div style={containerStyle}>
      {label && <span style={labelStyle}>{label}</span>}

      <svg
        width={size}
        height={size}
        viewBox="0 0 52 52"
        style={svgStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* พื้นหลังวงกลม */}
        <circle
          cx={26}
          cy={26}
          r={24}
          fill="#1c1f26"
          stroke="#2a2e38"
          strokeWidth={1.5}
        />

        {/* track arc (เต็มช่วง -135°→135°) */}
        <path
          d={trackPath}
          fill="none"
          stroke="#2a2e38"
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* value arc */}
        {valuePath && (
          <path
            d={valuePath}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}

        {/* pointer indicator line */}
        <line
          x1={inner.x}
          y1={inner.y}
          x2={outer.x}
          y2={outer.y}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </svg>

      {/* readout ตัวเลข */}
      <span style={readoutStyle}>{displayVal}</span>
    </div>
  );
}
