// @req FR-11 — คลัง asset/pack ที่ลากลง timeline ได้ (FR-11.4)
// @req FR-16.6 — Library มี action Play ใน Lalin Play
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { packs, files, type Pack } from "../api";
import { requestPlayback } from "../playback/playbackClient";
import { Icon } from "./icons";

// payload ที่ใส่ใน dataTransfer ตอนลาก item จาก Library ไปวางบน timeline
// (drop handler อยู่ในเลนของ StudioDock/ClipTimeline — worker อื่นรับผิดชอบ)
export const CLIP_DRAG_MIME = "text/gmusic-clip";
export interface LibraryDragPayload { kind: "upload"; name: string; label: string; color: string; }

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
      <div className="lib-subtitle">
        <Icon name="search" size={12} /> Packs · loops · reference audio
      </div>

      {/* preview */}
      <div className="lib-preview">
        <div className="lib-cover" style={{ background: sel ? `radial-gradient(circle at 50% 38%, ${sel.color}, #0c0d11)` : "#16181d" }} />
        <div className="lib-cover-name">{sel?.name ?? "—"}</div>
        {sel && (
          <div className="lib-cover-actions">
            <button
              className="lib-play-btn"
              type="button"
              onClick={() => {
                const item = {
                  id: `pack:${sel.id}`,
                  title: sel.name,
                  artist: sel.author || "Library Pack",
                  url: files.inputUrl(sel.id),
                  sourceKind: "upload" as const,
                  sourcePath: sel.id,
                  ext: "wav",
                };
                requestPlayback({ type: "PLAY", item });
              }}
              title="Play in Lalin Play"
            >
              ▶ Play in Lalin Play
            </button>
          </div>
        )}
      </div>

      {/* search */}
      <div className="lib-search">
        <span className="lib-search-ic"><Icon name="search" size={13} /></span>
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
            {p.installed && <span className="lib-tag">Ready</span>}
          </button>
        ))}
        {filtered.length === 0 && <div className="lib-empty">ไม่พบ</div>}
      </div>
    </aside>
  );
}

// ตั้งค่า dataTransfer ตอนเริ่มลาก sound/pack จาก Library
// name: ชื่อไฟล์ของ pack ใน uploads/ (สมมติว่า pack id = ชื่อไฟล์ที่ดาวน์โหลด/ติดตั้งแล้ว)
// TODO(G-13): packs.download() ยังเป็น mock (mark-installed เฉย ๆ ไม่มีไฟล์จริงถูกเขียนลง
// uploads/) — asset นี้จึงยัง resolve ไม่เจอจนกว่า marketplace จะดาวน์โหลดไฟล์จริง
function onDragStart(e: DragEvent<HTMLButtonElement>, p: Pack) {
  const payload: LibraryDragPayload = {
    kind: "upload",
    name: p.id,
    label: p.name,
    color: p.color || "#9b6cf0",
  };
  e.dataTransfer.effectAllowed = "copy";
  e.dataTransfer.setData(CLIP_DRAG_MIME, JSON.stringify(payload));
}
