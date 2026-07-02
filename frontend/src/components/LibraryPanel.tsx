import { useEffect, useMemo, useState, type DragEvent } from "react";
import { files, packs, type Pack } from "../api";

// payload ที่ใส่ใน dataTransfer ตอนลาก item จาก Library ไปวางบน timeline
// (drop handler อยู่ในเลนของ StudioDock/ClipTimeline — worker อื่นรับผิดชอบ)
export const CLIP_DRAG_MIME = "text/gmusic-clip";
export interface LibraryDragPayload { src: string; label: string; color: string; }

// Library (left sector) — เลือก sound/pack แบบ GarageBand
export function LibraryPanel() {
  const [list, setList] = useState<Pack[]>([]);
  const [sel, setSel] = useState<Pack | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    packs.list().then((r) => { setList(r.packs); setSel(r.packs[0] ?? null); }).catch(() => {});
  }, []);

  const filtered = useMemo(
    () => list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
    [list, q]
  );

  return (
    <aside className="lib">
      <div className="lib-title">Library</div>

      {/* preview */}
      <div className="lib-preview">
        <div className="lib-cover" style={{ background: sel ? `radial-gradient(circle at 50% 38%, ${sel.color}, #0c0d11)` : "#16181d" }} />
        <div className="lib-cover-name">{sel?.name ?? "—"}</div>
      </div>

      {/* search */}
      <div className="lib-search">
        <span className="lib-search-ic">🔍</span>
        <input placeholder="Search Library" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* list */}
      <div className="lib-list">
        {filtered.map((p) => (
          <button
            key={p.id}
            className={`lib-item ${sel?.id === p.id ? "on" : ""}`}
            onClick={() => setSel(p)}
            draggable
            title="ลากลง timeline ได้"
            style={{ cursor: "grab" }}
            onDragStart={(e) => onDragStart(e, p)}
          >
            <span className="lib-dot" style={{ background: p.color }} />
            <span className="lib-name">{p.name}</span>
            {p.installed && <span className="lib-tag">✓</span>}
          </button>
        ))}
        {filtered.length === 0 && <div className="lib-empty">ไม่พบ</div>}
      </div>
    </aside>
  );
}

// ตั้งค่า dataTransfer ตอนเริ่มลาก sound/pack จาก Library
// src: URL ไฟล์เสียงของ pack (สมมติชื่อไฟล์ = pack id ที่ดาวน์โหลด/ติดตั้งแล้วในโฟลเดอร์ input)
function onDragStart(e: DragEvent<HTMLButtonElement>, p: Pack) {
  const payload: LibraryDragPayload = {
    src: files.inputUrl(p.id),
    label: p.name,
    color: p.color || "#9b6cf0",
  };
  e.dataTransfer.effectAllowed = "copy";
  e.dataTransfer.setData(CLIP_DRAG_MIME, JSON.stringify(payload));
}
