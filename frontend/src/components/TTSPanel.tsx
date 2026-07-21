import { useEffect, useState } from "react";
import { files, tts, voices as voicesApi, type Voice } from "../api";
import { useJob } from "../useJob";
import { JobProgress } from "./JobProgress";
import { useEngine } from "../store/engineContext";
import { makeClip } from "../timeline/clipModel";

// Voice Cloning: พิมพ์ข้อความ → อ่านออกเสียงด้วยเสียงที่โคลน
export function TTSPanel() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("th");
  const [speed, setSpeed] = useState(1.0);
  const { job, busy, start } = useJob();
  const engine = useEngine();
  const [addedMsg, setAddedMsg] = useState(false);

  useEffect(() => {
    voicesApi.list().then((r) => {
      setVoices(r.voices);
      if (r.voices[0]) setVoiceId(r.voices[0].id);
    }).catch(() => {});
  }, []);

  const run = () => {
    setAddedMsg(false);
    start(() => tts.synth({ text, voice_id: voiceId, language, speed }));
  };

  // ส่งเสียงที่สังเคราะห์แล้วลง timeline กลาง (แทร็ก vocal)
  const addToTimeline = () => {
    const output = job?.result?.output;
    if (!output) return;
    const track = engine.project.tracks.find((t) => t.id === "vocal") ?? engine.project.tracks[0];
    if (!track) return;
    const start = track.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
    const clip = makeClip(files.downloadUrl(output), "#9b6cf0");
    clip.start = start;
    engine.addClip(track.id, clip);
    setAddedMsg(true);
  };

  return (
    <div className="panel card">
      <h2>🗣️ อ่านข้อความด้วยเสียงโคลน (Voice Cloning)</h2>
      <p className="hint">พิมพ์ข้อความ เลือกเสียงจากคลัง แล้วให้ AI อ่านด้วยเสียงนั้น</p>

      <label className="field"><span>ข้อความ</span>
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="พิมพ์ข้อความที่ต้องการให้อ่าน…" />
      </label>

      <div className="row">
        <label className="field grow"><span>เสียง</span>
          <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
            {voices.length === 0 && <option value="">— ยังไม่มีเสียง —</option>}
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.language})</option>)}
          </select>
        </label>
        <label className="field"><span>ภาษา</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="th">ไทย</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field"><span>ความเร็ว ×{speed.toFixed(1)}</span>
          <input type="range" min={0.5} max={1.5} step={0.1} value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))} />
        </label>
      </div>

      <button className="primary" onClick={run} disabled={busy || !text || !voiceId}>
        {busy ? "กำลังสังเคราะห์…" : "▶ สร้างเสียง"}
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
