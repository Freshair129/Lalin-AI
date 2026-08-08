// @req FR-03 — UI พากย์เสียง
import { useEffect, useState } from "react";
import { dubbing, files, voices as voicesApi, type Voice } from "../api";
import { useJob } from "../useJob";
import { JobProgress } from "./JobProgress";
import { useEngine } from "../store/engineContext";
import { makeClip } from "../timeline/clipModel";

// พากย์เสียง: อัปโหลดไฟล์ต้นฉบับ → เลือกเสียง+ภาษา → ถอด/แปล/พากย์
export function DubbingPanel() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [targetLang, setTargetLang] = useState("ไทย");
  const [translate, setTranslate] = useState(true);
  const [source, setSource] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { job, busy, start } = useJob();
  const engine = useEngine();
  const [addedMsg, setAddedMsg] = useState(false);

  // ── เกลาบทให้พอดีเวลา (copilot แยก ไม่ผูกกับ job พากย์หลัก) ──
  const [refineText, setRefineText] = useState("");
  const [refineSec, setRefineSec] = useState(3);
  const [refineTone, setRefineTone] = useState<"formal" | "casual">("formal");
  const [refineResult, setRefineResult] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const run = () => {
    setAddedMsg(false);
    start(() =>
      dubbing.run({
        source_audio: source,
        voice_id: voiceId,
        target_lang: targetLang,
        translate,
      })
    );
  };

  // เรียกสมองให้เกลาบทให้ความยาวคำพูดพอดีกับช่องเวลา
  const runRefine = async () => {
    if (!refineText.trim()) return;
    setRefining(true);
    setRefineError(null);
    setCopied(false);
    try {
      const r = await dubbing.refine({
        text: refineText,
        target_sec: refineSec,
        tone: refineTone,
      });
      setRefineResult(r.refined);
    } catch (e) {
      setRefineError("เกลาบทไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setRefining(false);
    }
  };

  const copyRefined = async () => {
    if (!refineResult) return;
    try {
      await navigator.clipboard.writeText(refineResult);
      setCopied(true);
    } catch {
      /* clipboard ไม่พร้อมใช้งาน — เงียบไว้ */
    }
  };

  // ส่งเสียงพากย์ที่ได้ลง timeline กลาง (แทร็ก vocal)
  const addToTimeline = () => {
    const output = job?.result?.output;
    if (!output) return;
    const track = engine.project.tracks.find((t) => t.id === "vocal") ?? engine.project.tracks[0];
    if (!track) return;
    const start = track.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
    const clip = makeClip(files.downloadUrl(basename(output)), "#9b6cf0");
    clip.start = start;
    engine.addClip(track.id, clip);
    setAddedMsg(true);
  };

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
        <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem", alignItems: "center" }}>
          {job.result.output && (
            <button
              className="primary"
              style={{ background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)" }}
              onClick={addToTimeline}
            >
              ＋ ลง Timeline
            </button>
          )}
          {addedMsg && <span className="hint">✓ เพิ่มลง Timeline แล้ว</span>}
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

      {/* ── เกลาบทให้พอดีเวลา: ตัวช่วยแยก ใช้ตอนคำแปลยาวเกินช่องเวลาเดิม ── */}
      <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border, #333)" }}>
        <h3 style={{ margin: "0 0 0.25rem" }}>✂ เกลาบทให้พอดีเวลา</h3>
        <p className="hint">
          วางประโยคที่แปลแล้วยาวเกินช่องเวลา ให้สมองช่วยตัด/กระชับ โดยคงความหมายเดิม —
          ใช้แก้ปัญหาเสียงพากย์ถูกยืด/บีบมากเกินไปตอน fit ความยาว
        </p>

        <label className="field">
          <span>ประโยค (คำแปล)</span>
          <textarea
            rows={3}
            value={refineText}
            onChange={(e) => setRefineText(e.target.value)}
            placeholder="วางบทพากย์ที่ยาวเกินช่องเวลาตรงนี้…"
          />
        </label>

        <div className="row">
          <label className="field">
            <span>ช่องเวลา (วินาที)</span>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={refineSec}
              onChange={(e) => setRefineSec(Math.max(0.5, Number(e.target.value) || 0.5))}
            />
          </label>
          <label className="field">
            <span>โทนเสียง</span>
            <select value={refineTone} onChange={(e) => setRefineTone(e.target.value as "formal" | "casual")}>
              <option value="formal">ทางการ</option>
              <option value="casual">กันเอง</option>
            </select>
          </label>
        </div>

        <button className="primary" onClick={runRefine} disabled={refining || !refineText.trim()}>
          {refining ? "กำลังเกลาบท…" : "✂ เกลาบทให้พอดีเวลา"}
        </button>

        {refineError && <p className="hint">⚠ {refineError}</p>}

        {refineResult && (
          <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem", alignItems: "flex-start" }}>
            <p style={{ flex: 1, minWidth: "200px", background: "rgba(255,255,255,0.04)", padding: "0.5rem", borderRadius: "6px" }}>
              {refineResult}
            </p>
            <button
              className="primary"
              style={{ background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)" }}
              onClick={copyRefined}
            >
              {copied ? "✓ คัดลอกแล้ว" : "⧉ คัดลอก"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// path เต็ม (จาก backend) → เอาแค่ชื่อไฟล์ ไว้ใช้กับ files.downloadUrl
function basename(p: string) {
  return p.split(/[\\/]/).pop() ?? p;
}
