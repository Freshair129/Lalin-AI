// @req FR-11 — UI marketplace (sample packs — FR-11.4)
import { useEffect, useState } from "react";
import { packs, type Pack } from "../api";
import { Tilt } from "./Tilt";

// สถานะดาวน์โหลดจริง — ไม่มี progress % จำลอง (backend ไม่ได้ stream ความคืบหน้า)
type DlState = "downloading" | "error";

// Marketplace — โหลด sample pack (glass + bento + tilt)
export function MarketplacePanel() {
  const [list, setList] = useState<Pack[]>([]);
  const [sel, setSel] = useState<Pack | null>(null);
  const [dl, setDl] = useState<{ id: string; state: DlState } | null>(null);

  const load = () => packs.list().then((r) => setList(r.packs)).catch(() => {});
  useEffect(() => { load(); }, []);

  const download = async (p: Pack) => {
    setDl({ id: p.id, state: "downloading" });
    try {
      await packs.download(p.id);
      await load();
      setSel((s) => (s && s.id === p.id ? { ...s, installed: true } : s));
      setDl(null);
    } catch {
      setDl({ id: p.id, state: "error" });
    }
  };

  const installed = list.filter((p) => p.installed);
  const sizeTotal = installed.reduce((a, p) => a + p.size_mb, 0);

  return (
    <div className="panel mkt">
      {/* แถบวิ่งไม่หยุด (indeterminate) แทน progress % ปลอม — backend ไม่ stream ความคืบหน้าจริง */}
      <style>{`
        .mkt-prog-fill-anim { position: absolute; top: 0; bottom: 0; width: 35%; left: -35%; animation: mkt-indeterminate 1.1s ease-in-out infinite; }
        @keyframes mkt-indeterminate { 0% { left: -35%; } 100% { left: 100%; } }
      `}</style>
      <h2>🛒 Marketplace</h2>
      <p className="hint">โหลด sample pack มาใช้ใน Remix · ติดตั้งแล้ว {installed.length} pack · {sizeTotal.toFixed(1)}MB</p>

      <div className="mkt-grid">
        {list.map((p) => (
          <Tilt key={p.id} className="mkt-card glass" max={10} scale={1.03}>
            <div className="mkt-cover" style={{ background: `radial-gradient(circle at 50% 35%, ${p.color}, #0d0e11)` }} onClick={() => setSel(p)}>
              {p.installed && <span className="mkt-badge">✓</span>}
            </div>
            <div className="mkt-name">{p.name}</div>
            <div className="mkt-meta mono">{p.size_mb}MB</div>
          </Tilt>
        ))}
      </div>

      {sel && (
        <div className="mkt-overlay" onClick={() => setSel(null)}>
          <div className="mkt-detail glass" onClick={(e) => e.stopPropagation()}>
            <button className="mkt-close" onClick={() => setSel(null)}>✕</button>
            <div className="mkt-cover lg" style={{ background: `radial-gradient(circle at 50% 35%, ${sel.color}, #0d0e11)` }} />
            <div className="mkt-dname">{sel.name}</div>
            <p className="mkt-desc">{sel.desc}</p>
            <div className="mkt-dmeta mono">{sel.size_mb}MB · {sel.author}</div>
            {dl && dl.id === sel.id && dl.state === "downloading" ? (
              <div className="mkt-prog mkt-prog-indeterminate">
                <div className="mkt-prog-fill mkt-prog-fill-anim" />
                <span className="mono">กำลังดาวน์โหลด…</span>
              </div>
            ) : dl && dl.id === sel.id && dl.state === "error" ? (
              <div className="mkt-prog" style={{ justifyContent: "space-between", padding: "0 12px", gap: 10 }}>
                <span className="mono" style={{ color: "#e05a5a" }}>ดาวน์โหลดไม่สำเร็จ</span>
                <button className="primary" onClick={() => download(sel)}>ลองใหม่</button>
              </div>
            ) : sel.installed ? (
              <button className="primary" disabled>✓ ติดตั้งแล้ว</button>
            ) : (
              <button className="primary" onClick={() => download(sel)}>⬇ Download</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
