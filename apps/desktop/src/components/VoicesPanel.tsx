import { useEffect, useRef, useState } from "react";
import { speech, voices, type SpeechConfig, type Voice } from "../api";

// คลังเสียง: อัปโหลดตัวอย่างเสียงเพื่อใช้โคลน
export function VoicesPanel({ onChange }: { onChange?: (v: Voice[]) => void }) {
  const [list, setList] = useState<Voice[]>([]);
  const [name, setName] = useState("");
  const [refText, setRefText] = useState("");
  const [language, setLanguage] = useState("th");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [speechConfig, setSpeechConfig] = useState<SpeechConfig | null>(null);
  const [changingModel, setChangingModel] = useState(false);
  const [recording, setRecording] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  const load = async () => {
    const r = await voices.list();
    setList(r.voices);
    onChange?.(r.voices);
  };
  useEffect(() => {
    load().catch(() => {});
    speech.getConfig().then(setSpeechConfig).catch(() => {});
  }, []);

  const upload = async () => {
    if (!file || !name || !consent) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("ref_text", refText);
      fd.append("language", language);
      fd.append("consent", "true");
      fd.append("source", file.name === "voice-profile.webm" ? "microphone" : "upload");
      fd.append("file", file);
      await voices.upload(fd);
      setName(""); setRefText(""); setFile(null); setConsent(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    if (recorder.current) {
      recorder.current.stop();
      return;
    }
    setCaptureError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setFile(new File([new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" })], "voice-profile.webm", { type: mediaRecorder.mimeType || "audio/webm" }));
        recorder.current = null;
        setRecording(false);
      };
      recorder.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch {
      setCaptureError("ไม่สามารถเข้าถึงไมโครโฟนได้ — ตรวจสอบสิทธิ์ของแอปหรืออุปกรณ์");
    }
  };

  const editProfile = async (voice: Voice) => {
    const nextName = window.prompt("ชื่อ voice profile", voice.name);
    if (nextName === null || !nextName.trim() || nextName.trim() === voice.name) return;
    await voices.update(voice.id, { name: nextName.trim(), ref_text: voice.ref_text, language: voice.language });
    await load();
  };

  const changeASRModel = async (model: string) => {
    setChangingModel(true);
    try {
      const result = await speech.setASRModel(model);
      if (result.ok) setSpeechConfig((current) => current ? { ...current, asr_model: model } : current);
    } finally {
      setChangingModel(false);
    }
  };

  return (
    <div className="panel card">
      <h2>🎤 คลังเสียง (Voice Library)</h2>
      <p className="hint">อัปโหลดตัวอย่างเสียง 6–15 วินาที พูดชัด ไม่มีเสียงรบกวน เพื่อใช้โคลน</p>

      <label className="field"><span>ชื่อเสียง</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น เสียงผู้บรรยาย A" />
      </label>
      <label className="field"><span>ข้อความในไฟล์ (ref text)</span>
        <input value={refText} onChange={(e) => setRefText(e.target.value)} placeholder="พิมพ์สิ่งที่พูดในไฟล์ (ช่วยให้ F5-TTS แม่นขึ้น)" />
      </label>
      <div className="row">
        <label className="field"><span>ภาษา</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="th">ไทย</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field grow"><span>ไฟล์เสียง (.wav)</span>
          <input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className="row">
        <button type="button" className="secondary" onClick={toggleRecording} disabled={busy}>
          {recording ? "■ หยุดบันทึกเสียง" : "● บันทึกจากไมโครโฟน"}
        </button>
        {file?.name === "voice-profile.webm" && <span className="hint">บันทึกเสียงแล้ว — กรอกชื่อและข้อความอ้างอิงก่อนเพิ่ม</span>}
      </div>
      {captureError && <p className="error">{captureError}</p>}
      <label className="remix-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>ฉันยืนยันว่ามีสิทธิ์ใช้เสียงนี้เพื่อสร้าง voice profile</span>
      </label>
      <button className="primary" onClick={upload} disabled={busy || !file || !name || !consent}>
        {busy ? "กำลังอัปโหลด…" : "+ เพิ่มเสียง"}
      </button>

      {speechConfig && (
        <section className="voice-speech-settings" aria-label="Whisper model settings">
          <strong>Whisper size</strong>
          <label className="field">
            <span>{speechConfig.asr_available ? `${speechConfig.asr_device} · เปลี่ยนก่อนเริ่มงานถอดเสียง` : "Lite runtime: ไม่พร้อมใช้งาน"}</span>
            <select value={speechConfig.asr_model} disabled={!speechConfig.asr_available || changingModel} onChange={(e) => changeASRModel(e.target.value)}>
              {speechConfig.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} — {profile.note}</option>)}
            </select>
          </label>
        </section>
      )}
      <div className="voice-list">
        {list.length === 0 && <p className="hint">ยังไม่มีเสียงในคลัง</p>}
        {list.map((v) => (
          <div className="voice-item" key={v.id}>
            <div>
              <strong>{v.name}</strong> <span className="tag">{v.language}</span>
              <div className="hint">{v.source === "microphone" ? "ไมโครโฟน" : "อัปโหลด"} · {v.id}</div>
            </div>
            <button className="secondary" onClick={() => editProfile(v)}>แก้ชื่อ</button>
            <button className="danger" onClick={() => voices.remove(v.id).then(load)}>ลบ</button>
          </div>
        ))}
      </div>
    </div>
  );
}
