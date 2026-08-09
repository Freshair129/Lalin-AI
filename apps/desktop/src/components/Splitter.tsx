// เส้นแบ่งลากย่อ/ขยาย panel ด้วยเมาส์ (แบบ Adobe/DAW)
// axis "x" = ลากแนวนอนปรับความกว้าง, "y" = ลากแนวตั้งปรับความสูง
// double-click = reset กลับขนาดเริ่มต้น
export function Splitter({ axis, onDelta, onReset }: { axis: "x" | "y"; onDelta: (d: number) => void; onReset?: () => void }) {
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    let last = axis === "x" ? e.clientX : e.clientY;
    const move = (ev: PointerEvent) => {
      const cur = axis === "x" ? ev.clientX : ev.clientY;
      onDelta(cur - last);
      last = cur;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  };
  return <div className={`splitter splitter-${axis}`} onPointerDown={onDown} onDoubleClick={() => onReset?.()} title="ลากเพื่อปรับขนาด · ดับเบิลคลิกเพื่อรีเซ็ต" />;
}
