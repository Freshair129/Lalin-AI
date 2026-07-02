import { useEffect, useState } from "react";
import { voices, type Voice } from "../api";

// คลังเสียง: อัปโหลดตัวอย่างเสียงเพื่อใช้โคลน
export function VoicesPanel({ onChange }: { onChange?: (v: Voice[]) => void }) {
  const [list, setList] = useState<Voice[]>([]);
  const [name, setName] = useState("");
  const [refText, setRefText] = useState("");
  const [language, setLanguage] = useState("th");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await voices.list();
    setList(r.voices);
    onChange?.(r.voices);
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const upload = async () => {
    if (!file || !name) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("ref_text", refText);
      fd.append("language", language);
      fd.append("file", file);
      await voices.upload(fd);
      setName(""); setRefText(""); setFile(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
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
      <button className="primary" onClick={upload} disabled={busy || !file || !name}>
        {busy ? "กำลังอัปโหลด…" : "+ เพิ่มเสียง"}
      </button>

      <div className="voice-list">
        {list.length === 0 && <p className="hint">ยังไม่มีเสียงในคลัง</p>}
        {list.map((v) => (
          <div className="voice-item" key={v.id}>
            <div>
              <strong>{v.name}</strong> <span className="tag">{v.language}</span>
              <div className="hint">{v.id}</div>
            </div>
            <button className="danger" onClick={() => voices.remove(v.id).then(load)}>ลบ</button>
          </div>
        ))}
      </div>
    </div>
  );
}
