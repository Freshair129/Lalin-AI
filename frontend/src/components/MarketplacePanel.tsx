import { useEffect, useState } from "react";
import { packs, type Pack } from "../api";
import { Tilt } from "./Tilt";

// Marketplace — โหลด sample pack (glass + bento + tilt)
export function MarketplacePanel() {
  const [list, setList] = useState<Pack[]>([]);
  const [sel, setSel] = useState<Pack | null>(null);
  const [dl, setDl] = useState<{ id: string; pct: number } | null>(null);

  const load = () => packs.list().then((r) => setList(r.packs)).catch(() => {});
  useEffect(() => { load(); }, []);

  const download = async (p: Pack) => {
    setDl({ id: p.id, pct: 0 });
    // จำลอง progress (backend ติดตั้งทันที)
    const timer = setInterval(() => {
      setDl((d) => (d && d.pct < 90 ? { ...d, pct: d.pct + 10 } : d));
    }, 120);
    try {
      await packs.download(p.id);
      await load();
    } finally {
      clearInterval(timer);
      setDl({ id: p.id, pct: 100 });
      setTimeout(() => setDl(null), 500);
      setSel((s) => (s && s.id === p.id ? { ...s, installed: true } : s));
    }
  };

  const installed = list.filter((p) => p.installed);
  const sizeTotal = installed.reduce((a, p) => a + p.size_mb, 0);

  return (
    <div className="panel mkt">
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
            {dl && dl.id === sel.id ? (
              <div className="mkt-prog"><div className="mkt-prog-fill" style={{ width: `${dl.pct}%` }} /><span className="mono">{dl.pct}%</span></div>
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
