// @req FR-04b — ออกแบบ custom node ของ remix canvas
import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type NodeElement = "text" | "subpatch" | "lfo";

export interface CustomNodeConfig {
  name: string;
  width: number;
  height: number;
  skin: "glass" | "flat" | "dark";
  btmHeight: number;
  elements: NodeElement[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ยูทิลิตี้ geometry สำหรับ preview knob (cx=50, cy=50, r=34)
// ─────────────────────────────────────────────────────────────────────────────

const PI = Math.PI;

function polarXY(
  angleDeg: number,
  r: number,
  cx = 50,
  cy = 50
): { x: number; y: number } {
  const rad = (angleDeg - 90) * (PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(a0: number, a1: number, r: number, cx = 50, cy = 50): string {
  const p0 = polarXY(a0, r, cx, cy);
  const p1 = polarXY(a1, r, cx, cy);
  const largeArc = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(3)} ${p0.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ตัวอย่าง label สำหรับแต่ละ element type
// ─────────────────────────────────────────────────────────────────────────────

const ELEMENT_LABELS: Record<NodeElement, string> = {
  text: "≣ Text",
  subpatch: "⋮⋮ Subpatch",
  lfo: "⌁ LFO",
};

const ADD_OPTIONS: { type: NodeElement; label: string }[] = [
  { type: "text", label: "≣ Text" },
  { type: "subpatch", label: "⋮⋮ Subpatch overview" },
  { type: "lfo", label: "⌁ LFO (Knob)" },
];

// ─────────────────────────────────────────────────────────────────────────────
// NodeDesigner component
// ─────────────────────────────────────────────────────────────────────────────

export function NodeDesigner({
  onCreate,
  onClose,
}: {
  onCreate: (config: CustomNodeConfig) => void;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState("Custom Node");
  const [width, setWidth] = useState(96);
  const [height, setHeight] = useState(144);
  const [skin, setSkin] = useState<"glass" | "flat" | "dark">("glass");
  const [btmHeight, setBtmHeight] = useState(24);
  const [elements, setElements] = useState<NodeElement[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // ── handlers ────────────────────────────────────────────────────────────────

  function handleAddElement(type: NodeElement) {
    setElements((prev) => [...prev, type]);
    setDropdownOpen(false);
  }

  function handleCreate() {
    onCreate({ name, width, height, skin, btmHeight, elements });
    onClose();
  }

  // ── preview knob SVG ────────────────────────────────────────────────────────
  // knob fixo a 60 % de frac para decoração
  const ACCENT = "#7cc0f0";
  const frac = 0.6;
  const angle = -135 + 270 * frac; // -135..+135
  const inner = polarXY(angle, 20);
  const outer = polarXY(angle, 32);
  const trackPath = arcPath(-135, 135, 34);
  const valuePath = arcPath(-135, angle, 34);

  // ── inline styles ────────────────────────────────────────────────────────────

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 1500,
    background: "rgba(4,6,11,0.6)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const cardStyle: React.CSSProperties = {
    borderRadius: 16,
    padding: 22,
    width: 420,
    color: "#e7e9ee",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  const titleRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 700,
    margin: 0,
  };

  const closeBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "#7e8597",
    fontSize: 18,
    cursor: "pointer",
    lineHeight: 1,
    padding: "0 2px",
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 7,
    padding: "8px 10px",
    color: "#e7e9ee",
    width: "100%",
    boxSizing: "border-box",
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
  };

  const previewBoxStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.03)",
    border: "1px dashed rgba(255,255,255,0.12)",
    borderRadius: 12,
    height: 120,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: "14px 0",
  };

  const chipRowStyle: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
    justifyContent: "center",
  };

  const chipStyle: React.CSSProperties = {
    background: "rgba(124,192,240,0.12)",
    border: "1px solid rgba(124,192,240,0.28)",
    borderRadius: 5,
    padding: "2px 7px",
    fontSize: 10,
    color: ACCENT,
    lineHeight: 1.6,
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 14,
  };

  const fieldWrapStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#7e8597",
    fontFamily: "monospace",
  };

  const numberInputStyle: React.CSSProperties = {
    ...inputStyle,
    width: "100%",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    width: "100%",
    appearance: "none" as React.CSSProperties["appearance"],
    cursor: "pointer",
  };

  const addRowStyle: React.CSSProperties = {
    position: "relative",
    marginTop: 14,
  };

  const addBtnStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 7,
    color: "#e7e9ee",
    fontSize: 12,
    padding: "7px 14px",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const dropdownStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    background: "#1a1d26",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    overflow: "hidden",
    zIndex: 10,
    minWidth: 200,
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  };

  const dropItemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "none",
    border: "none",
    color: "#e7e9ee",
    fontSize: 12,
    padding: "9px 14px",
    cursor: "pointer",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  const footerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
  };

  const cancelBtnStyle: React.CSSProperties = {
    background: "none",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#7e8597",
    fontSize: 13,
    padding: "9px 18px",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const createBtnStyle: React.CSSProperties = {
    background: ACCENT,
    border: "none",
    borderRadius: 8,
    color: "#0b1420",
    fontSize: 13,
    padding: "9px 18px",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={overlayStyle}
      onClick={onClose}
    >
      {/* หยุดการ propagation เมื่อคลิกบนการ์ด */}
      <div
        className="glass"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Title row ── */}
        <div style={titleRowStyle}>
          <span style={titleStyle}>Custom Node Designer</span>
          <button style={closeBtnStyle} onClick={onClose} type="button">
            ✕
          </button>
        </div>

        {/* ── Name input ── */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
          placeholder="ชื่อ Node"
        />

        {/* ── Preview area ── */}
        <div style={previewBoxStyle}>
          <svg width={100} height={100} viewBox="0 0 100 100">
            {/* พื้นหลังวงกลม */}
            <circle cx={50} cy={50} r={38} fill="#1c1f26" stroke="#2a2e38" strokeWidth={1.5} />
            {/* track arc */}
            <path
              d={trackPath}
              fill="none"
              stroke="#2a2e38"
              strokeWidth={4}
              strokeLinecap="round"
            />
            {/* value arc */}
            <path
              d={valuePath}
              fill="none"
              stroke={ACCENT}
              strokeWidth={4}
              strokeLinecap="round"
            />
            {/* indicator line */}
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={ACCENT}
              strokeWidth={3}
              strokeLinecap="round"
            />
          </svg>

          {/* chips แสดง elements ที่เพิ่มแล้ว */}
          {elements.length > 0 && (
            <div style={chipRowStyle}>
              {elements.map((el, i) => (
                <span key={i} style={chipStyle}>
                  {ELEMENT_LABELS[el]}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Grid fields ── */}
        <div style={gridStyle}>
          {/* Width */}
          <div style={fieldWrapStyle}>
            <span style={fieldLabelStyle}>Width</span>
            <input
              type="number"
              value={width}
              min={32}
              max={512}
              onChange={(e) => setWidth(parseInt(e.target.value, 10) || 96)}
              style={numberInputStyle}
            />
          </div>

          {/* Height */}
          <div style={fieldWrapStyle}>
            <span style={fieldLabelStyle}>Height</span>
            <input
              type="number"
              value={height}
              min={32}
              max={512}
              onChange={(e) => setHeight(parseInt(e.target.value, 10) || 144)}
              style={numberInputStyle}
            />
          </div>

          {/* Skin */}
          <div style={fieldWrapStyle}>
            <span style={fieldLabelStyle}>Skin</span>
            <select
              value={skin}
              onChange={(e) => setSkin(e.target.value as "glass" | "flat" | "dark")}
              style={selectStyle}
            >
              <option value="glass">Glass</option>
              <option value="flat">Flat</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          {/* Btm Height */}
          <div style={fieldWrapStyle}>
            <span style={fieldLabelStyle}>Btm Height</span>
            <input
              type="number"
              value={btmHeight}
              min={0}
              max={128}
              onChange={(e) => setBtmHeight(parseInt(e.target.value, 10) || 24)}
              style={numberInputStyle}
            />
          </div>
        </div>

        {/* ── Add element row ── */}
        <div style={addRowStyle}>
          <button
            type="button"
            style={addBtnStyle}
            onClick={() => setDropdownOpen((v) => !v)}
          >
            + Add
          </button>

          {dropdownOpen && (
            <div style={dropdownStyle}>
              {ADD_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  style={dropItemStyle}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(255,255,255,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "none";
                  }}
                  onClick={() => handleAddElement(opt.type)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={footerStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={createBtnStyle} onClick={handleCreate}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
