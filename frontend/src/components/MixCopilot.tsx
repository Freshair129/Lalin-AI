// @req FR-14 — Mix Copilot: คุยกับ agent แล้ว commit mutations แบบ undo ได้
// @spec AI-AGT-001 — ฝั่ง frontend ของ propose-only agent
import { useState } from "react";
import type { CSSProperties } from "react";
import { agent, type AgentMutation } from "../api";
import type { ClipEngine } from "../timeline/useClipEngine";
import { canApplyMutation, applyMutation, describeMutation } from "./mixCopilotOps";

/**
 * MixCopilot — แชทสั่งงาน mix ด้วย LLM (WP 4.3)
 *  - ผู้ใช้พิมพ์คำสั่ง (เช่น "ดันเสียงร้องขึ้น ลด beat ช่วง hook")
 *  - เรียก POST /agent/act ได้ reply + รายการ mutation ที่เสนอ (ยังไม่ execute)
 *  - แต่ละ mutation กด "ใช้" เพื่อแปลงเป็น engine call จริง (ผ่าน commit() ⇒ Ctrl+Z undo ได้)
 *  - op ที่ engine ยังไม่รองรับ (set_fx/set_lufs/set_gain(track)) แสดงผลอย่างเดียว
 *
 * logic ทั้งหมด (describe/canApply/apply) อยู่ใน mixCopilotOps.ts — ไฟล์นี้มีแต่ UI
 * เพื่อกันไม่ให้ "ปุ่มโชว์ว่า apply ได้" กับ "apply แล้วสำเร็จจริง" หลุดจากกันอีก (G-05)
 */
interface ChatEntry {
  id: number;
  role: "user" | "agent";
  text: string;
  mutations?: AgentMutation[];
  applied?: Set<number>;   // index ที่ apply สำเร็จแล้ว
  failed?: Set<number>;    // index ที่กดใช้แล้วแต่ engine ปฏิเสธ (เช่น clip ถูกลบไปแล้ว)
}

/** แปลง {op,args} → เรียก engine method ที่ตรงกัน + อัปเดต applied/failed ตามผลจริง */
function applyOne(engine: ClipEngine, entries: ChatEntry[], entryId: number, idx: number): ChatEntry[] {
  return entries.map((en) => {
    if (en.id !== entryId || !en.mutations) return en;
    const m = en.mutations[idx];
    if (!m || !canApplyMutation(m)) return en;
    const ok = applyMutation(engine, m);
    const applied = new Set(en.applied);
    const failed = new Set(en.failed);
    if (ok) { applied.add(idx); failed.delete(idx); } else { failed.add(idx); }
    return { ...en, applied, failed };
  });
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
  btnFailed: {
    background: "transparent",
    color: "#e05a5a",
    border: "1px solid #e05a5a",
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
        failed: new Set(),
      };
      setEntries((es) => [...es, agentEntry]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onApplyOne = (entryId: number, idx: number) => {
    setEntries((es) => applyOne(engine, es, entryId, idx));
  };

  const onApplyAll = (entryId: number) => {
    setEntries((es) => {
      const entry = es.find((en) => en.id === entryId);
      if (!entry?.mutations) return es;
      let next = es;
      entry.mutations.forEach((m, idx) => {
        if (canApplyMutation(m) && !entry.applied?.has(idx)) {
          next = applyOne(engine, next, entryId, idx);
        }
      });
      return next;
    });
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
                  const applicable = canApplyMutation(m);
                  const done = en.applied?.has(idx);
                  const failed = en.failed?.has(idx);
                  return (
                    <div key={idx} style={styles.mutRow}>
                      <span style={styles.mutText}>{describeMutation(m)}</span>
                      {applicable ? (
                        <button
                          style={done ? styles.btnGhost : failed ? styles.btnFailed : styles.btn}
                          disabled={done}
                          title={failed ? "ครั้งก่อนใช้ไม่สำเร็จ — กดเพื่อลองใหม่" : undefined}
                          onClick={() => onApplyOne(en.id, idx)}
                        >
                          {done ? "ใช้แล้ว" : failed ? "ลองใหม่" : "ใช้"}
                        </button>
                      ) : (
                        <span style={styles.disabledNote}>ยังไม่รองรับการ apply อัตโนมัติ</span>
                      )}
                    </div>
                  );
                })}
                {en.mutations.some((m) => canApplyMutation(m)) && (
                  <button style={styles.btnAll} onClick={() => onApplyAll(en.id)}>
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
