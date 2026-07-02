import { useState } from "react";
import type { CSSProperties } from "react";
import { agent, type AgentMutation } from "../api";
import type { ClipEngine } from "../timeline/useClipEngine";

/**
 * MixCopilot — แชทสั่งงาน mix ด้วย LLM (WP 4.3)
 *  - ผู้ใช้พิมพ์คำสั่ง (เช่น "ดันเสียงร้องขึ้น ลด beat ช่วง hook")
 *  - เรียก POST /agent/act ได้ reply + รายการ mutation ที่เสนอ (ยังไม่ execute)
 *  - แต่ละ mutation กด "ใช้" เพื่อแปลงเป็น engine call จริง (ผ่าน commit() ⇒ Ctrl+Z undo ได้)
 *  - op ที่ไม่มี engine method ตรง ๆ (set_pan/set_fx/set_lufs) แสดงผลอย่างเดียว
 */

// op ที่ apply ผ่าน engine ได้จริง
const APPLICABLE_OPS = new Set([
  "move_clip",
  "set_gain",
  "mute_clip",
  "slice_clip",
  "reorder_track",
]);

interface ChatEntry {
  id: number;
  role: "user" | "agent";
  text: string;
  mutations?: AgentMutation[];
  applied?: Set<number>; // index ของ mutation ที่ apply ไปแล้ว
}

function describeMutation(m: AgentMutation): string {
  const a = m.args || {};
  switch (m.op) {
    case "move_clip":
      return `ย้าย clip ${a.clipId ?? "?"} ไปที่ ${a.start ?? "?"}s (track ${a.trackId ?? "?"})`;
    case "set_gain":
      return `ตั้ง gain track/clip ${a.trackId ?? a.clipId ?? "?"} = ${a.gain ?? "?"}`;
    case "set_pan":
      return `ตั้ง pan ${a.trackId ?? "?"} = ${a.pan ?? "?"}`;
    case "set_fx":
      return `ตั้งค่า FX ${a.trackId ?? "?"}: ${JSON.stringify(a.fx ?? a)}`;
    case "set_lufs":
      return `ตั้ง loudness เป้าหมาย = ${a.lufs ?? "?"} LUFS`;
    case "mute_clip":
      return `mute/unmute clip ${a.clipId ?? "?"} (track ${a.trackId ?? "?"})`;
    case "slice_clip":
      return `ตัด clip ${a.clipId ?? "?"} ที่ ${a.at ?? "?"}s (track ${a.trackId ?? "?"})`;
    case "reorder_track":
      return `ย้ายแทร็ก ${a.fromId ?? "?"} ไปตำแหน่งของ ${a.toId ?? "?"}`;
    default:
      return `${m.op} ${JSON.stringify(a)}`;
  }
}

/** แปลง {op,args} → เรียก engine method ที่ตรงกัน (ผ่าน commit ⇒ undo-able) */
function applyMutation(engine: ClipEngine, m: AgentMutation): boolean {
  const a = m.args || {};
  switch (m.op) {
    case "move_clip":
      if (typeof a.trackId === "string" && typeof a.clipId === "string" && typeof a.start === "number") {
        engine.move(a.trackId, a.clipId, a.start);
        return true;
      }
      return false;
    case "set_gain": {
      const trackId = a.trackId as string | undefined;
      const clipId = a.clipId as string | undefined;
      const gain = a.gain as number | undefined;
      if (typeof trackId === "string" && typeof clipId === "string" && typeof gain === "number") {
        engine.setGain(trackId, clipId, gain);
        return true;
      }
      return false;
    }
    case "mute_clip":
      if (typeof a.trackId === "string" && typeof a.clipId === "string") {
        engine.muteClip(a.trackId, a.clipId);
        return true;
      }
      return false;
    case "slice_clip":
      if (typeof a.trackId === "string" && typeof a.clipId === "string" && typeof a.at === "number") {
        engine.slice(a.trackId, a.clipId, a.at);
        return true;
      }
      return false;
    case "reorder_track":
      if (typeof a.fromId === "string" && typeof a.toId === "string") {
        engine.reorderTrack(a.fromId, a.toId);
        return true;
      }
      return false;
    default:
      return false;
  }
}

const styles: Record<string, CSSProperties> = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: 320,
    maxHeight: "100%",
    padding: 10,
    background: "#14151a",
    border: "1px solid #2a2c33",
    borderRadius: 8,
    color: "#e6e6e6",
    fontSize: 12,
    overflow: "hidden",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 600 },
  log: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, minHeight: 80, maxHeight: 260 },
  bubbleUser: { alignSelf: "flex-end", background: "#2a3d1f", borderRadius: 6, padding: "6px 8px", maxWidth: "90%" },
  bubbleAgent: { alignSelf: "flex-start", background: "#20222a", borderRadius: 6, padding: "6px 8px", maxWidth: "95%" },
  mutList: { display: "flex", flexDirection: "column", gap: 4, marginTop: 6 },
  mutRow: { display: "flex", alignItems: "center", gap: 6, background: "#1b1c22", borderRadius: 4, padding: "4px 6px" },
  mutText: { flex: 1, wordBreak: "break-word" as const },
  btn: {
    background: "#c7f046",
    color: "#14151a",
    border: "none",
    borderRadius: 4,
    padding: "3px 8px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 11,
  },
  btnGhost: {
    background: "transparent",
    color: "#8a8d97",
    border: "1px solid #33353d",
    borderRadius: 4,
    padding: "3px 8px",
    cursor: "pointer",
    fontSize: 11,
  },
  btnAll: {
    background: "#3d9be0",
    color: "#0c1116",
    border: "none",
    borderRadius: 4,
    padding: "4px 8px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 11,
    alignSelf: "flex-start",
  },
  inputRow: { display: "flex", gap: 6 },
  input: {
    flex: 1,
    background: "#1b1c22",
    border: "1px solid #33353d",
    borderRadius: 6,
    color: "#e6e6e6",
    padding: "6px 8px",
    fontSize: 12,
  },
  disabledNote: { color: "#8a8d97", fontStyle: "italic" as const },
};

export function MixCopilot({ engine }: { engine: ClipEngine }) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    setError(null);
    const userEntry: ChatEntry = { id: Date.now(), role: "user", text: message };
    setEntries((es) => [...es, userEntry]);
    setBusy(true);
    try {
      const res = await agent.act(message, engine.project as unknown as Record<string, unknown>);
      const agentEntry: ChatEntry = {
        id: Date.now() + 1,
        role: "agent",
        text: res.reply,
        mutations: res.mutations || [],
        applied: new Set(),
      };
      setEntries((es) => [...es, agentEntry]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyOne = (entryId: number, idx: number) => {
    setEntries((es) =>
      es.map((en) => {
        if (en.id !== entryId || !en.mutations) return en;
        const m = en.mutations[idx];
        if (!m || !APPLICABLE_OPS.has(m.op)) return en;
        applyMutation(engine, m);
        const applied = new Set(en.applied);
        applied.add(idx);
        return { ...en, applied };
      })
    );
  };

  const applyAll = (entryId: number) => {
    setEntries((es) =>
      es.map((en) => {
        if (en.id !== entryId || !en.mutations) return en;
        const applied = new Set(en.applied);
        en.mutations.forEach((m, idx) => {
          if (APPLICABLE_OPS.has(m.op) && !applied.has(idx)) {
            applyMutation(engine, m);
            applied.add(idx);
          }
        });
        return { ...en, applied };
      })
    );
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span>🤖 Mix Copilot</span>
      </div>
      <div style={styles.log}>
        {entries.length === 0 && (
          <div style={styles.disabledNote}>
            พิมพ์คำสั่งผสมเสียง เช่น "ดันเสียงร้องขึ้น ลด beat ช่วง hook"
          </div>
        )}
        {entries.map((en) => (
          <div key={en.id} style={en.role === "user" ? styles.bubbleUser : styles.bubbleAgent}>
            <div>{en.text}</div>
            {en.mutations && en.mutations.length > 0 && (
              <div style={styles.mutList}>
                {en.mutations.map((m, idx) => {
                  const applicable = APPLICABLE_OPS.has(m.op);
                  const done = en.applied?.has(idx);
                  return (
                    <div key={idx} style={styles.mutRow}>
                      <span style={styles.mutText}>{describeMutation(m)}</span>
                      {applicable ? (
                        <button
                          style={done ? styles.btnGhost : styles.btn}
                          disabled={done}
                          onClick={() => applyOne(en.id, idx)}
                        >
                          {done ? "ใช้แล้ว" : "ใช้"}
                        </button>
                      ) : (
                        <span style={styles.disabledNote}>ยังไม่รองรับการ apply อัตโนมัติ</span>
                      )}
                    </div>
                  );
                })}
                {en.mutations.some((m) => APPLICABLE_OPS.has(m.op)) && (
                  <button style={styles.btnAll} onClick={() => applyAll(en.id)}>
                    ใช้ทั้งหมด
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {error && <div style={{ color: "#e05a5a" }}>ผิดพลาด: {error}</div>}
      </div>
      <div style={styles.inputRow}>
        <input
          style={styles.input}
          value={text}
          placeholder="สั่งงาน mix..."
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button style={styles.btn} onClick={send} disabled={busy || !text.trim()}>
          {busy ? "..." : "ส่ง"}
        </button>
      </div>
    </div>
  );
}
