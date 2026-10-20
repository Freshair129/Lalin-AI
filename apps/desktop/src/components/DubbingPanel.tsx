// @req FR-03 — UI พากย์เสียง
import { useEffect, useState } from "react";
import { dubbing, files, jobs, voices as voicesApi, type Job, type Voice } from "../api";
import { useJob } from "../useJob";
import { JobProgress } from "./JobProgress";
import {
  DubbingTranscriptPanel,
  type SpeakerSlot,
  type TranscriptResult,
} from "./DubbingTranscriptPanel";
import { useEngine } from "../store/engineContext";
import { makeClip } from "../timeline/clipModel";

// พากย์เสียง: อัปโหลดไฟล์ต้นฉบับ → เลือกเสียง+ภาษา → ถอด/แปล/พากย์
export function DubbingPanel() {
  const [mode, setMode] = useState<"dub" | "transcript">("dub");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [targetLang, setTargetLang] = useState("ไทย");
  const [translate, setTranslate] = useState(true);
  const [source, setSource] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { job, busy, start } = useJob("dubbing");
  const { job: analyzeJob, busy: analyzing, start: startAnalyze } = useJob("dubbing-analyze");
  const { job: renderJob, busy: rendering, start: startRender } = useJob("dubbing-render");
  const [transcript, setTranscript] = useState<TranscriptResult | null>(null);
  const [speakerSlots, setSpeakerSlots] = useState<SpeakerSlot[]>([]);
  const [segmentSpeakers, setSegmentSpeakers] = useState<Record<string, string>>({});
  const [speakerStateJobId, setSpeakerStateJobId] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    const lastJobId = window.localStorage.getItem("lalin:dubbing:transcript-job");
    if (!lastJobId) return;
    jobs.get(lastJobId).then((storedJob) => {
      const restored = transcriptFromJob(storedJob);
      if (!cancelled && restored) setTranscript((current) => current ?? restored);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const completed = transcriptFromJob(analyzeJob);
    if (!completed || !analyzeJob) return;
    setTranscript(completed);
    window.localStorage.setItem("lalin:dubbing:transcript-job", analyzeJob.id);
  }, [analyzeJob]);

  useEffect(() => {
    if (!transcript?.jobId) return;
    const defaultSpeaker: SpeakerSlot = {
      id: "spk_a",
      label: "Speaker A",
      voiceId: voiceId || voices[0]?.id || "",
    };
    let nextSpeakers = [defaultSpeaker];
    let nextAssignments = Object.fromEntries(
      transcript.segments.map((segment) => [segment.id, defaultSpeaker.id]),
    );

    try {
      const saved = JSON.parse(
        window.localStorage.getItem(speakerStorageKey(transcript.jobId)) ?? "null",
      ) as { speakers?: unknown; assignments?: unknown } | null;
      if (saved && Array.isArray(saved.speakers) && saved.speakers.length > 0) {
        const restored = saved.speakers.filter(isSpeakerSlot).map((speaker) => ({
          ...speaker,
          voiceId: voices.length === 0 || voices.some((voice) => voice.id === speaker.voiceId)
            ? speaker.voiceId
            : "",
        }));
        if (restored.length > 0) {
          const validIds = new Set(restored.map((speaker) => speaker.id));
          const restoredAssignments = saved.assignments as Record<string, unknown> | null;
          const assignments = Object.fromEntries(transcript.segments.map((segment) => {
            const speakerId = restoredAssignments?.[segment.id];
            return [segment.id, typeof speakerId === "string" && validIds.has(speakerId)
              ? speakerId
              : restored[0].id];
          }));
          nextSpeakers = restored;
          nextAssignments = assignments;
        }
      }
    } catch {
      // mapping ที่บันทึกไว้ไม่ถูกต้องจะเริ่มด้วย Speaker A ใหม่
    }

    setSpeakerSlots(nextSpeakers);
    setSegmentSpeakers(nextAssignments);
    setSpeakerStateJobId(transcript.jobId);
  }, [transcript?.jobId]);

  useEffect(() => {
    const defaultVoiceId = voiceId || voices[0]?.id;
    if (!defaultVoiceId) return;
    setSpeakerSlots((current) => current.map((speaker) => (
      voices.some((voice) => voice.id === speaker.voiceId)
        ? speaker
        : { ...speaker, voiceId: defaultVoiceId }
    )));
  }, [voiceId, voices]);

  useEffect(() => {
    if (!transcript?.jobId || speakerStateJobId !== transcript.jobId) return;
    try {
      window.localStorage.setItem(
        speakerStorageKey(transcript.jobId),
        JSON.stringify({ speakers: speakerSlots, assignments: segmentSpeakers }),
      );
    } catch {
      // mapping ยังคงใช้ได้ในหน้าปัจจุบันแม้ localStorage เขียนไม่ได้
    }
  }, [transcript?.jobId, speakerStateJobId, speakerSlots, segmentSpeakers]);

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

  const runAnalyze = () => {
    if (!source) return;
    setMode("transcript");
    startAnalyze(() => dubbing.analyze({ source_audio: source }));
  };

  const runMultiSpeaker = () => {
    if (!transcript?.jobId || transcript.sourceAudio !== source || !canRenderMultiSpeaker) return;
    const analysisJobId = transcript.jobId;
    const usedSpeakerIds = new Set(
      transcript.segments.map((segment) => segmentSpeakers[segment.id]),
    );
    startRender(() => dubbing.render({
      analysis_job_id: analysisJobId,
      segment_speakers: transcript.segments.map((segment) => ({
        segment_id: segment.id,
        speaker_id: segmentSpeakers[segment.id],
      })),
      speaker_voices: speakerSlots
        .filter((speaker) => usedSpeakerIds.has(speaker.id))
        .map((speaker) => ({ speaker_id: speaker.id, voice_id: speaker.voiceId })),
      target_lang: targetLang,
      translate,
    }));
  };

  const addSpeaker = () => {
    if (speakerSlots.length >= 32) return;
    const id = `spk_${Math.random().toString(36).slice(2, 10)}`;
    setSpeakerSlots((current) => [
      ...current,
      { id, label: `Speaker ${speakerLabel(current.length)}`, voiceId: voiceId || voices[0]?.id || "" },
    ]);
  };

  const updateSpeaker = (speakerId: string, patch: Partial<SpeakerSlot>) => {
    setSpeakerSlots((current) => current.map((speaker) => (
      speaker.id === speakerId ? { ...speaker, ...patch } : speaker
    )));
  };

  const removeSpeaker = (speakerId: string) => {
    if (speakerSlots.length <= 1) return;
    const fallback = speakerSlots.find((speaker) => speaker.id !== speakerId);
    if (!fallback) return;
    setSpeakerSlots((current) => current.filter((speaker) => speaker.id !== speakerId));
    setSegmentSpeakers((current) => Object.fromEntries(
      Object.entries(current).map(([segmentId, assignedSpeaker]) => [
        segmentId,
        assignedSpeaker === speakerId ? fallback.id : assignedSpeaker,
      ]),
    ));
  };

  const canRenderMultiSpeaker = !!transcript
    && transcript.segments.length > 0
    && transcript.segments.every((segment) => {
      const speakerId = segmentSpeakers[segment.id];
      return !!speakerId && speakerSlots.some((speaker) => speaker.id === speakerId);
    })
    && new Set(transcript.segments.map((segment) => segmentSpeakers[segment.id])).size > 0
    && [...new Set(transcript.segments.map((segment) => segmentSpeakers[segment.id]))]
      .every((speakerId) => {
        const mappedVoiceId = speakerSlots.find((speaker) => speaker.id === speakerId)?.voiceId;
        return !!mappedVoiceId && voices.some((voice) => voice.id === mappedVoiceId);
      });

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
    const id = engine.addAsset("output", basename(output));
    const clip = makeClip(id, "#9b6cf0");
    clip.start = start;
    engine.addClip(track.id, clip);
    setAddedMsg(true);
  };

  return (
    <div className="panel card">
      <h2>🎬 พากย์เสียง (Dubbing)</h2>
      <p className="hint">ถอดเสียงต้นฉบับ → แปลด้วยสมอง → พากย์ทับด้วยเสียงที่โคลน ให้ตรงจังหวะเดิม</p>

      <div className="dubbing-tabs" role="tablist" aria-label="โหมด Dubbing">
        <button
          id="dubbing-tab-dub"
          className="dubbing-tab"
          type="button"
          role="tab"
          aria-selected={mode === "dub"}
          aria-controls="dubbing-panel-dub"
          onClick={() => setMode("dub")}
        >
          Dub
        </button>
        <button
          id="dubbing-tab-transcript"
          className="dubbing-tab"
          type="button"
          role="tab"
          aria-selected={mode === "transcript"}
          aria-controls="dubbing-panel-transcript"
          onClick={() => setMode("transcript")}
        >
          Transcript
        </button>
      </div>

      <section
        id="dubbing-panel-dub"
        role="tabpanel"
        aria-labelledby="dubbing-tab-dub"
        hidden={mode !== "dub"}
      >
          <label className="field"><span>ไฟล์ต้นฉบับ (เสียง/วิดีโอ)</span>
            <input type="file" accept="audio/*,video/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </label>
          {uploading && <p className="hint">กำลังอัปโหลด…</p>}
          {source && <p className="hint">✓ ไฟล์: {source}</p>}
          <button
            className="secondary"
            type="button"
            onClick={runAnalyze}
            disabled={!source || uploading || analyzing}
          >
            {analyzing ? "กำลังวิเคราะห์…" : "วิเคราะห์ Transcript"}
          </button>

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
      </section>
      <DubbingTranscriptPanel
        source={source}
        uploading={uploading}
        analyzing={analyzing}
        job={analyzeJob}
        transcript={transcript}
        voices={voices}
        speakerSlots={speakerSlots}
        segmentSpeakers={segmentSpeakers}
        renderJob={renderJob}
        rendering={rendering}
        renderDisabled={
          !canRenderMultiSpeaker
          || transcript?.sourceAudio !== source
          || uploading
          || analyzing
          || rendering
        }
        targetLang={targetLang}
        translate={translate}
        onAnalyze={runAnalyze}
        onAddSpeaker={addSpeaker}
        onUpdateSpeaker={updateSpeaker}
        onRemoveSpeaker={removeSpeaker}
        onAssignSpeaker={(segmentId, speakerId) => {
          setSegmentSpeakers((current) => ({ ...current, [segmentId]: speakerId }));
        }}
        onRender={runMultiSpeaker}
        active={mode === "transcript"}
      />
    </div>
  );
}

// path เต็ม (จาก backend) → เอาแค่ชื่อไฟล์ ไว้ใช้กับ files.downloadUrl
function basename(p: string) {
  return p.split(/[\\/]/).pop() ?? p;
}

function transcriptFromJob(job: Job | null): TranscriptResult | null {
  if (!job || job.kind !== "dubbing-analyze" || job.status !== "done" || !job.result) {
    return null;
  }
  const result = job.result;
  const sourceAudio = result.source_audio;
  const rawSegments = result.transcript?.segments;
  if (typeof sourceAudio !== "string" || !Array.isArray(rawSegments)) return null;

  const segments = rawSegments.filter((segment) => (
    segment !== null && typeof segment === "object"
    && typeof segment.id === "string"
    && typeof segment.start === "number" && Number.isFinite(segment.start) && segment.start >= 0
    && typeof segment.end === "number" && Number.isFinite(segment.end) && segment.end >= segment.start
    && typeof segment.text === "string"
  ));

  return {
    jobId: job.id,
    sourceAudio,
    detectedLanguage: typeof result.detected_language === "string" ? result.detected_language : null,
    segmentCount: segments.length,
    durationSec: typeof result.duration_sec === "number" && Number.isFinite(result.duration_sec)
      ? result.duration_sec
      : 0,
    segments,
    subtitleSrt: typeof result.subtitle_srt === "string" ? result.subtitle_srt : null,
    subtitleVtt: typeof result.subtitle_vtt === "string" ? result.subtitle_vtt : null,
  };
}

function speakerStorageKey(jobId: string) {
  return `lalin:dubbing:speakers:${jobId}`;
}

function isSpeakerSlot(value: unknown): value is SpeakerSlot {
  if (!value || typeof value !== "object") return false;
  const slot = value as Partial<SpeakerSlot>;
  return typeof slot.id === "string" && slot.id.length > 0
    && typeof slot.label === "string"
    && typeof slot.voiceId === "string";
}

function speakerLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
