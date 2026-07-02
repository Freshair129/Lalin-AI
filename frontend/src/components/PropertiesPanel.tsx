import { useState } from "react";
import type { TrackView } from "./Timeline";

// Properties dock — แก้พารามิเตอร์ของ track ที่เลือก (แนว AudioNodes)
// หมายเหตุ: speed/pitch/fade/reverse เป็น scaffold (backend one-shot ยังไม่ apply)
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
  const [fade, setFade] = useState("none");
  const [speed, setSpeed] = useState(100);
  const [pitch, setPitch] = useState(0);
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

      <div className="props-sec">
        <div className="props-label">Fade</div>
        <select value={fade} onChange={(e) => setFade(e.target.value)}>
          <option value="none">None</option>
          <option value="linear">Linear</option>
          <option value="bezier">Bezier</option>
        </select>
      </div>

      <div className="props-sec">
        <div className="props-label">Playback speed <span className="mono props-val">{speed}%</span></div>
        <input type="range" min={50} max={150} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
      </div>

      <div className="props-sec">
        <div className="props-label">Pitch <span className="mono props-val">{pitch > 0 ? "+" : ""}{pitch} st</span></div>
        <input type="range" min={-12} max={12} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} />
      </div>

      <div className="props-sec">
        <div className="props-label">Effects</div>
        <button className="props-apply">↺ Reverse audio</button>
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

      <div className="props-note">* speed / pitch / fade เป็น scaffold — ยังไม่ส่งผลกับ backend</div>
    </aside>
  );
}
