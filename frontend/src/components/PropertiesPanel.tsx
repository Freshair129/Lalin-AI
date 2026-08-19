import type { TrackView } from "./Timeline";

// Properties dock — แก้พารามิเตอร์ของ track ที่เลือก (แนว AudioNodes)
export function PropertiesPanel({
  track, onToggle,
}: {
  track: TrackView | null;
  onToggle: (id: string, what: "mute" | "solo" | "lock") => void;
}) {
  if (!track) {
    return (
      <aside className="props">
        <div className="props-empty">เลือก track บน timeline<br />เพื่อแก้ไขพารามิเตอร์</div>
      </aside>
    );
  }
  return <PropsBody key={track.id} track={track} onToggle={onToggle} />;
}

function PropsBody({
  track, onToggle,
}: {
  track: TrackView;
  onToggle: (id: string, what: "mute" | "solo" | "lock") => void;
}) {
  return (
    <aside className="props">
      <div className="props-head">
        <span className="props-dot" style={{ background: track.color }} />
        <span className="props-title">{track.label}</span>
      </div>

      <div className="props-row">
        <button className={`props-tg ${track.muted ? "on" : ""}`} onClick={() => onToggle(track.id, "mute")}>Mute</button>
        <button className={`props-tg ${track.solo ? "on" : ""}`} onClick={() => onToggle(track.id, "solo")}>Solo</button>
        <button className={`props-tg ${track.locked ? "on" : ""}`} onClick={() => onToggle(track.id, "lock")}>Lock</button>
      </div>

      <div className="props-note">gain / fade / mute / pan ที่ตั้งไว้จะถูก render ลงไฟล์ตอน export แล้ว · speed / pitch ต่อ clip ยังไม่รองรับ</div>
    </aside>
  );
}
