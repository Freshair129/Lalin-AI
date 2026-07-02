export function Meter({
  value,
  min = -30,
  max = 0,
  label = "LUFS",
  unit = "INTEGRATED",
  height = 110,
  format,
}: {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
  height?: number;
  format?: (v: number) => string;
}) {
  const safeValue = typeof value === "number" && isFinite(value) ? value : min;
  const pct = Math.max(0, Math.min(1, (safeValue - min) / (max - min))) * 100;
  const display = format ? format(safeValue) : safeValue.toFixed(1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      {/* Label */}
      <span
        style={{
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#7e8597",
        }}
      >
        {label}
      </span>

      {/* Vertical bar */}
      <div
        style={{
          width: 14,
          height: height,
          borderRadius: 4,
          background: "#1c1f26",
          border: "1px solid #2a2e38",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Fill */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: `${pct}%`,
            background:
              "linear-gradient(to top, #c7f046 0%, #c7f046 55%, #ffb340 80%, #ff5163 100%)",
          }}
        />
        {/* Level tick line */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: `${pct}%`,
            height: 1,
            background: "#ffffff22",
          }}
        />
      </div>

      {/* Numeric readout */}
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 13,
          fontWeight: 700,
          color: "#e7e9ee",
        }}
      >
        {display}
      </span>

      {/* Unit */}
      <span
        style={{
          fontSize: 8,
          letterSpacing: "0.1em",
          color: "#565d6e",
        }}
      >
        {unit}
      </span>
    </div>
  );
}
