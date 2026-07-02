import { useState } from "react";
import { files, mastering } from "../api";
import { useJob } from "../useJob";
import { JobProgress } from "./JobProgress";

// Mastering: อัปโหลดเพลง → (ทางเลือก) เพลงอ้างอิง → มาสเตอร์
export function MasteringPanel() {
  const [source, setSource] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [targetLufs, setTargetLufs] = useState(-14);
  const [format, setFormat] = useState("wav");
  const { job, busy, start } = useJob();

  const upload = async (f: File | null, set: (s: string) => void) => {
    if (!f) return;
    const r = await files.upload(f);
    set(r.filename);
  };

  const run = () =>
    start(() =>
      mastering.run({
        source_audio: source,
        reference_audio: reference,
        target_lufs: targetLufs,
        target_format: format,
      })
    );

  return (
    <div className="panel">
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
    </div>
  );
}
