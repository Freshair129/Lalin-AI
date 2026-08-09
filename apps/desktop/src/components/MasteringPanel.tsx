// @req FR-04 — UI mastering
import { useState } from "react";
import { files, mastering } from "../api";
import { useJob } from "../useJob";
import { JobProgress } from "./JobProgress";
import { useEngine } from "../store/engineContext";
import { makeClip } from "../timeline/clipModel";

// Mastering: อัปโหลดเพลง → (ทางเลือก) เพลงอ้างอิง → มาสเตอร์
export function MasteringPanel() {
  const [source, setSource] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [targetLufs, setTargetLufs] = useState(-14);
  const [format, setFormat] = useState("wav");
  const { job, busy, start } = useJob();
  const engine = useEngine();
  const [addedMsg, setAddedMsg] = useState(false);

  const upload = async (f: File | null, set: (s: string) => void) => {
    if (!f) return;
    const r = await files.upload(f);
    set(r.filename);
  };

  const run = () => {
    setAddedMsg(false);
    start(() =>
      mastering.run({
        source_audio: source,
        reference_audio: reference,
        target_lufs: targetLufs,
        target_format: format,
      })
    );
  };

  // ส่งเพลงที่มาสเตอร์แล้วลง timeline กลาง (แทร็ก master)
  const addToTimeline = () => {
    const output = job?.result?.output;
    if (!output) return;
    const track = engine.project.tracks.find((t) => t.id === "master") ?? engine.project.tracks[0];
    if (!track) return;
    const start = track.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
    const clip = makeClip(files.downloadUrl(output), "#c7f046");
    clip.start = start;
    engine.addClip(track.id, clip);
    setAddedMsg(true);
  };

  return (
    <div className="panel card">
      <h2>🎚️ Mastering เพลง</h2>
      <p className="hint">
        มี 2 โหมด: ใส่เพลงอ้างอิง → ปรับให้ "เหมือน" เพลงนั้น (Matchering),
        หรือเว้นว่าง → มาสเตอร์อัตโนมัติไปที่ความดังมาตรฐาน
      </p>

      <label className="field"><span>เพลงของคุณ</span>
        <input type="file" accept="audio/*" onChange={(e) => upload(e.target.files?.[0] ?? null, setSource)} />
      </label>
      {source && <p className="hint">✓ {source}</p>}

      <label className="field"><span>เพลงอ้างอิง (ไม่บังคับ)</span>
        <input type="file" accept="audio/*" onChange={(e) => upload(e.target.files?.[0] ?? null, setReference)} />
      </label>
      {reference && <p className="hint">✓ อ้างอิง: {reference}</p>}

      <div className="row">
        <label className="field"><span>ความดังเป้าหมาย (LUFS)</span>
          <select value={targetLufs} onChange={(e) => setTargetLufs(Number(e.target.value))}>
            <option value={-14}>-14 (Spotify/YouTube)</option>
            <option value={-16}>-16 (Apple Music)</option>
            <option value={-9}>-9 (ดังมาก/club)</option>
          </select>
        </label>
        <label className="field"><span>ฟอร์แมต</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="wav">WAV</option>
            <option value="mp3">MP3</option>
          </select>
        </label>
      </div>

      <button className="primary" onClick={run} disabled={busy || !source}>
        {busy ? "กำลังมาสเตอร์…" : "▶ เริ่ม Mastering"}
      </button>

      <JobProgress job={job} />

      {job?.status === "done" && job.result?.output && (
        <div className="row" style={{ gap: "0.5rem", marginTop: "0.5rem", alignItems: "center" }}>
          <button
            className="primary"
            style={{ background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)" }}
            onClick={addToTimeline}
          >
            ＋ ลง Timeline
          </button>
          {addedMsg && <span className="hint">✓ เพิ่มลง Timeline แล้ว</span>}
        </div>
      )}
    </div>
  );
}
