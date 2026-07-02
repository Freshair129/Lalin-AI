import { useEffect, useState } from "react";
import { tts, voices as voicesApi, type Voice } from "../api";
import { useJob } from "../useJob";
import { JobProgress } from "./JobProgress";

// Voice Cloning: พิมพ์ข้อความ → อ่านออกเสียงด้วยเสียงที่โคลน
export function TTSPanel() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("th");
  const [speed, setSpeed] = useState(1.0);
  const { job, busy, start } = useJob();

  useEffect(() => {
    voicesApi.list().then((r) => {
      setVoices(r.voices);
      if (r.voices[0]) setVoiceId(r.voices[0].id);
    }).catch(() => {});
  }, []);

  const run = () =>
    start(() => tts.synth({ text, voice_id: voiceId, language, speed }));

  return (
    <div className="panel">
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
    </div>
  );
}
