// @req FR-09 — แก้พารามิเตอร์/สถานะของ track ที่เลือก (FR-09.5)
import type { TrackView } from "./Timeline";

// Properties dock — แก้พารามิเตอร์ของ track ที่เลือก (แนว AudioNodes)
export function PropertiesPanel({
  track, outputName, onToggle, onExport, exporting,
}: {
  track: TrackView | null;
  outputName: string | null;
  onToggle: (id: string, what: "mute" | "solo" | "lock") => void;
  onExport: (fmt: "wav" | "mp3") => void;
  exporting: boolean;
}) {
  if (!track) {
    return (
      <aside className="props">
        <div className="props-empty">เลือก track บน timeline<br />เพื่อแก้ไขพารามิเตอร์</div>
      </aside>
    );
  }
  return <PropsBody key={track.id} track={track} outputName={outputName} onToggle={onToggle} onExport={onExport} exporting={exporting} />;
}

function PropsBody({
  track, outputName, onToggle, onExport, exporting,
}: {
  track: TrackView;
  outputName: string | null;
  onToggle: (id: string, what: "mute" | "solo" | "lock") => void;
  onExport: (fmt: "wav" | "mp3") => void;
  exporting: boolean;
}) {
  const isMaster = track.id === "master";

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

      {isMaster && outputName && (
        <div className="props-sec props-export">
          <div className="props-label">Export {exporting && "· กำลังเบค…"}</div>
          <div className="props-row">
            <button className="props-dl" disabled={exporting} onClick={() => onExport("wav")}>WAV</button>
            <button className="props-dl" disabled={exporting} onClick={() => onExport("mp3")}>MP3</button>
          </div>
          <div className="props-note" style={{ marginTop: 6 }}>เบค master FX (reverb/echo/comp) ลงไฟล์</div>
        </div>
      )}

      <div className="props-note">การปรับ speed / pitch / fade แบบต่อ clip จะมาในเวอร์ชันถัดไป (ต้องใช้ DSP ต่อ clip)</div>
    </aside>
  );
}
