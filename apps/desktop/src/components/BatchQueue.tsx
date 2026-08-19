// @req FR-13 — UI คิวประมวลผลชุด
import { useEffect, useState } from "react";
import { voices, type Voice } from "../api";
import { useBatchQueue, type BatchKind, type BatchItem } from "../useBatchQueue";

// แผงคิวประมวลผลแบบชุด (Batch Queue) — เพิ่มงานหลายชิ้น แล้วให้ระบบรันทีละงานตามลำดับ
export function BatchQueue() {
  const queue = useBatchQueue();
  const { items, running } = queue;

  const [kind, setKind] = useState<BatchKind>("tts");
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [sourceAudio, setSourceAudio] = useState("");
  const [referenceAudio, setReferenceAudio] = useState("");
  const [voiceOptions, setVoiceOptions] = useState<Voice[]>([]);

  useEffect(() => {
    voices.list()
      .then((r) => setVoiceOptions(r.voices ?? []))
      .catch(() => setVoiceOptions([]));
  }, []);

  const doneCount = items.filter((it) => it.status === "done").length;
  const total = items.length;

  const buildParams = (): Record<string, unknown> => {
    if (kind === "tts") return { text, voice_id: voiceId, language: "th", speed: 1.0 };
    if (kind === "dubbing") return { source_audio: sourceAudio, voice_id: voiceId, target_lang: "th", translate: true };
    return { source_audio: sourceAudio, reference_audio: referenceAudio || undefined };
  };

  const defaultLabel = (): string => {
    if (kind === "tts") return text ? `พากย์: ${text.slice(0, 24)}${text.length > 24 ? "…" : ""}` : "งานอ่านข้อความ";
    if (kind === "dubbing") return sourceAudio ? `พากย์เสียง: ${sourceAudio}` : "งานพากย์เสียง";
    return sourceAudio ? `mastering: ${sourceAudio}` : "งาน mastering";
  };

  const canAdd =
    kind === "tts" ? !!text && !!voiceId
    : kind === "dubbing" ? !!sourceAudio && !!voiceId
    : !!sourceAudio;

  const addItem = () => {
    if (!canAdd) return;
    queue.enqueue({ kind, label: label.trim() || defaultLabel(), params: buildParams() });
    setLabel("");
  };

  return (
    <div className="panel">
      <h2>📦 คิวประมวลผลชุด (Batch Queue)</h2>
      <p className="hint">เพิ่มงานหลายชิ้นเข้าคิว แล้วให้ระบบรันทีละงานตามลำดับโดยอัตโนมัติ</p>

      {/* ฟอร์มเพิ่มงานใหม่ */}
      <div className="card">
        <div className="row">
          <label className="field"><span>ประเภทงาน</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as BatchKind)}>
              <option value="tts">🗣️ อ่านข้อความ (TTS)</option>
              <option value="dubbing">🎬 พากย์เสียง (Dubbing)</option>
              <option value="mastering">🎚️ Mastering</option>
            </select>
          </label>
          <label className="field grow"><span>ชื่อรายการ (ไม่บังคับ)</span>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="ตั้งชื่อให้จำง่าย…" />
          </label>
        </div>

        {kind === "tts" && (
          <div className="row">
            <label className="field grow"><span>ข้อความ</span>
              <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="พิมพ์ข้อความที่ต้องการให้อ่าน…" />
            </label>
            <label className="field"><span>รหัสเสียง (voice id)</span>
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                <option value="">เลือกเสียง…</option>
                {voiceOptions.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.id} — {voice.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {kind === "dubbing" && (
          <div className="row">
            <label className="field grow"><span>ไฟล์เสียง/วิดีโอต้นฉบับ</span>
              <input type="text" value={sourceAudio} onChange={(e) => setSourceAudio(e.target.value)}
                placeholder="ชื่อไฟล์ที่อัปโหลดแล้ว…" />
            </label>
            <label className="field"><span>รหัสเสียง (voice id)</span>
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                <option value="">เลือกเสียง…</option>
                {voiceOptions.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.id} — {voice.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {kind === "mastering" && (
          <div className="row">
            <label className="field grow"><span>ไฟล์เสียงต้นฉบับ</span>
              <input type="text" value={sourceAudio} onChange={(e) => setSourceAudio(e.target.value)}
                placeholder="ชื่อไฟล์ที่อัปโหลดแล้ว…" />
            </label>
            <label className="field grow"><span>ไฟล์อ้างอิง (ไม่บังคับ)</span>
              <input type="text" value={referenceAudio} onChange={(e) => setReferenceAudio(e.target.value)}
                placeholder="ไฟล์เสียงอ้างอิงสำหรับ mastering…" />
            </label>
          </div>
        )}

        <button className="primary" onClick={addItem} disabled={!canAdd}>
          ＋ เพิ่มเข้าคิว
        </button>
      </div>

      {/* ควบคุมคิว */}
      <div className="row" style={{ alignItems: "center", gap: "0.5rem", margin: "14px 0" }}>
        <button className="primary" onClick={() => queue.run()} disabled={running || items.every((it) => it.status !== "pending")}>
          ▶ รันคิว
        </button>
        <button
          className="primary"
          style={{ background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)" }}
          onClick={() => queue.pause()}
          disabled={!running}
        >
          ⏸ หยุดชั่วคราว
        </button>
        <button
          className="primary"
          style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--border-soft)" }}
          onClick={() => queue.clear()}
          disabled={running || items.length === 0}
        >
          🗑 ล้างคิว
        </button>
        {total > 0 && (
          <span className="hint" style={{ margin: 0 }}>
            เสร็จแล้ว {doneCount}/{total}
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="bar" style={{ marginBottom: 18 }}>
          <div className="bar-fill" style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
          <span className="bar-pct">{total ? Math.round((doneCount / total) * 100) : 0}%</span>
        </div>
      )}

      {/* รายการงานในคิว */}
      {items.length === 0 && <p className="hint">ยังไม่มีงานในคิว — เพิ่มงานด้านบนเพื่อเริ่ม</p>}

      {items.map((it, idx) => (
        <QueueRow
          key={it.id}
          item={it}
          index={idx}
          isFirst={idx === 0}
          isLast={idx === items.length - 1}
          disabled={running}
          onRemove={() => queue.remove(it.id)}
          onUp={() => queue.moveUp(it.id)}
          onDown={() => queue.moveDown(it.id)}
        />
      ))}
    </div>
  );
}

function statusLabel(s: BatchItem["status"]) {
  return { pending: "⏳ รอคิว", running: "⚙️ กำลังทำงาน", done: "✅ เสร็จ", error: "❌ ผิดพลาด" }[s];
}

function kindLabel(k: BatchKind) {
  return { tts: "🗣️ TTS", dubbing: "🎬 Dubbing", mastering: "🎚️ Mastering" }[k];
}

function QueueRow({
  item, index, isFirst, isLast, disabled, onRemove, onUp, onDown,
}: {
  item: BatchItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const pct = Math.round((item.progress ?? 0) * 100);
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <strong>{index + 1}. {item.label}</strong>
          <div className="hint" style={{ margin: "2px 0 0" }}>
            {kindLabel(item.kind)} · {statusLabel(item.status)}
            {item.message ? ` · ${item.message}` : ""}
          </div>
        </div>
        <div className="row" style={{ gap: "0.35rem" }}>
          <button
            className="primary"
            style={{ background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)", padding: "4px 8px" }}
            onClick={onUp}
            disabled={disabled || isFirst}
            title="เลื่อนขึ้น"
          >
            ↑
          </button>
          <button
            className="primary"
            style={{ background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)", padding: "4px 8px" }}
            onClick={onDown}
            disabled={disabled || isLast}
            title="เลื่อนลง"
          >
            ↓
          </button>
          <button
            className="primary"
            style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--border-soft)", padding: "4px 8px" }}
            onClick={onRemove}
            disabled={disabled && item.status === "running"}
            title="ลบออกจากคิว"
          >
            🗑
          </button>
        </div>
      </div>

      {(item.status === "running" || item.status === "pending") && (
        <div className="bar">
          <div className="bar-fill" style={{ width: `${pct}%` }} />
          <span className="bar-pct">{pct}%</span>
        </div>
      )}

      {item.status === "error" && item.error && (
        <p className="hint" style={{ color: "var(--danger, #e05555)" }}>{item.error}</p>
      )}
    </div>
  );
}

export default BatchQueue;
