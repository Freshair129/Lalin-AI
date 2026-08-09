// @req FR-09 — เฟดเดอร์แยก stem -> stem_gains (FR-09.9)
// StemMixer — เฟดเดอร์ปรับระดับเสียงแยกตาม stem (Demucs htdemucs: vocals/drums/bass/other)
// ใช้คู่กับ run_remix(stem_gains=...) ฝั่ง backend (music.py) — ต้องแยก stem เต็ม 4 ทาง
// ก่อนถึงจะมีผล (ถ้าไม่ส่ง stem_gains เลย backend จะใช้ two-stems=vocals แบบเดิม เร็วกว่า)

export type StemName = "vocals" | "drums" | "bass" | "other";

export type StemGains = Record<StemName, number>;

export const DEFAULT_STEM_GAINS: StemGains = {
  vocals: 1,
  drums: 1,
  bass: 1,
  other: 1,
};

const STEM_META: { key: StemName; label: string; color: string }[] = [
  { key: "vocals", label: "ร้อง", color: "#9b6cf0" },
  { key: "drums", label: "กลอง", color: "#e0863d" },
  { key: "bass", label: "เบส", color: "#3d9be0" },
  { key: "other", label: "อื่นๆ", color: "#c7f046" },
];

const MIN_GAIN = 0;
const MAX_GAIN = 1.5;

function Fader({
  label,
  color,
  value,
  onChange,
}: {
  label: string;
  color: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(((value - MIN_GAIN) / (MAX_GAIN - MIN_GAIN)) * 100);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        width: 56,
      }}
    >
      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#e7e9ee" }}>
        {value.toFixed(2)}
      </span>
      <input
        type="range"
        min={MIN_GAIN}
        max={MAX_GAIN}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          writingMode: "vertical-lr",
          direction: "rtl",
          WebkitAppearance: "slider-vertical",
          width: 24,
          height: 120,
          accentColor: color,
          cursor: "ns-resize",
        } as React.CSSProperties}
        title={`${label}: ${Math.round(value * 100)}%`}
      />
      <span
        style={{
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#7e8597",
          fontFamily: "monospace",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 9, color: "#565b68", fontFamily: "monospace" }}>{pct}%</span>
    </div>
  );
}

/**
 * เฟดเดอร์ 4 แท่ง ปรับระดับเสียงแยกตาม stem (ร้อง/กลอง/เบส/อื่นๆ) ก่อนมิกซ์
 * gains: ค่า 0..1.5 ต่อ stem (1.0 = ปกติ) — controlled component
 */
export function StemMixer({
  gains,
  onChange,
  disabled = false,
}: {
  gains: StemGains;
  onChange: (gains: StemGains) => void;
  disabled?: boolean;
}) {
  const setStem = (key: StemName, v: number) => {
    onChange({ ...gains, [key]: v });
  };

  const resetAll = () => onChange({ ...DEFAULT_STEM_GAINS });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#7e8597",
            fontFamily: "monospace",
          }}
        >
          Stem Mixer
        </span>
        <button
          type="button"
          className="seg-add"
          onClick={resetAll}
          title="รีเซ็ตทุก stem กลับเป็น 100%"
          style={{ fontSize: 10, padding: "2px 6px" }}
        >
          รีเซ็ต
        </button>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {STEM_META.map((s) => (
          <Fader
            key={s.key}
            label={s.label}
            color={s.color}
            value={gains[s.key]}
            onChange={(v) => setStem(s.key, v)}
          />
        ))}
      </div>
    </div>
  );
}
