import { useEffect, useState } from "react";
import { dubbing, files, voices as voicesApi, type Voice } from "../api";
import { useJob } from "../useJob";
import { JobProgress } from "./JobProgress";

// พากย์เสียง: อัปโหลดไฟล์ต้นฉบับ → เลือกเสียง+ภาษา → ถอด/แปล/พากย์
export function DubbingPanel() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [targetLang, setTargetLang] = useState("ไทย");
  const [translate, setTranslate] = useState(true);
  const [source, setSource] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { job, busy, start } = useJob();

  useEffect(() => {
    voicesApi.list().then((r) => {
      setVoices(r.voices);
      if (r.voices[0]) setVoiceId(r.voices[0].id);
    }).catch(() => {});
  }, []);

  const onFile = async (f: File | null) => {
    if (!f) return;
    setUploading(true);
    try {
      const r = await files.upload(f);
      setSource(r.filename);
    } finally {
      setUploading(false);
    }
  };

  const run = () =>
    start(() =>
      dubbing.run({
        source_audio: source,
        voice_id: voiceId,
        target_lang: targetLang,
        translate,
      })
    );

  return (
    <div className="panel">
      <h2>🎬 พากย์เสียง (Dubbing)</h2>
      <p className="hint">ถอดเสียงต้นฉบับ → แปลด้วยสมอง → พากย์ทับด้วยเสียงที่โคลน ให้ตรงจังหวะเดิม</p>

      <label className="field"><span>ไฟล์ต้นฉบับ (เสียง/วิดีโอ)</span>
        <input type="file" accept="audio/*,video/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </label>
      {uploading && <p className="hint">กำลังอัปโหลด…</p>}
      {source && <p className="hint">✓ ไฟล์: {source}</p>}

      <div className="row">
        <label className="field grow"><span>เสียงที่ใช้พากย์</span>
          <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
            {voices.length === 0 && <option value="">— ยังไม่มีเสียง (ไปเพิ่มที่คลังเสียง) —</option>}
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.language})</option>)}
          </select>
        </label>
        <label className="field"><span>ภาษาปลายทาง</span>
          <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
            <option value="ไทย">ไทย</option>
            <option value="English">English</option>
          </select>
        </label>
      </div>

      <label className="check">
        <input type="checkbox" checked={translate} onChange={(e) => setTranslate(e.target.checked)} />
        แปลข้อความก่อนพากย์ (ปิดถ้าต้องการพากย์ภาษาเดิม)
      </label>

      <button className="primary" onClick={run} disabled={busy || !source || !voiceId}>
        {busy ? "กำลังพากย์…" : "▶ เริ่มพากย์เสียง"}
      </button>

      <JobProgress job={job} />

      {job?.status === "done" && job.result && (
        <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
          {job.result.video_output && (
            <a
              className="dl"
              href={files.downloadUrl(basename(job.result.video_output))}
              download
            >
              ⬇ วิดีโอพากย์เสียง (.mp4)
            </a>
          )}
          {job.result.subtitle_srt && (
            <a className="dl" href={files.downloadUrl(job.result.subtitle_srt)} download>
              ⬇ SRT
            </a>
          )}
          {job.result.subtitle_vtt && (
            <a className="dl" href={files.downloadUrl(job.result.subtitle_vtt)} download>
              ⬇ VTT
            </a>
          )}
          {job.result.video_mux_error && (
            <p className="hint">⚠ {job.result.video_mux_error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// path เต็ม (จาก backend) → เอาแค่ชื่อไฟล์ ไว้ใช้กับ files.downloadUrl
function basename(p: string) {
  return p.split(/[\\/]/).pop() ?? p;
}
