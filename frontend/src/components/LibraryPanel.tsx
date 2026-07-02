import { useEffect, useMemo, useState } from "react";
import { packs, type Pack } from "../api";

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
