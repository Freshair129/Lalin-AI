import { useEffect, useState } from "react";
import { plugins, type PluginInfo, type PluginInstallInfo } from "../api";

// แผงจัดการปลั๊กอินเสริม (BYOM) — pedalboard/psola/matchering
// deps เหล่านี้เป็น optional + มีสัญญาอนุญาตแบบ GPL จึงไม่ bundle มาให้อัตโนมัติ
// ผู้ใช้ต้องรันคำสั่ง pip เองใน venv ของ backend แล้วรีสตาร์ต backend
export function PluginsPanel() {
  const [list, setList] = useState<Record<string, PluginInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installInfo, setInstallInfo] = useState<Record<string, PluginInstallInfo>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await plugins.list();
      setList(r);
    } catch (e: any) {
      setError(e?.message ?? "โหลดสถานะปลั๊กอินไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const showInstall = async (name: string) => {
    setBusy(name);
    try {
      const info = await plugins.installCommand(name);
      setInstallInfo((m) => ({ ...m, [name]: info }));
    } catch (e: any) {
      setError(e?.message ?? `ดึงคำสั่งติดตั้ง '${name}' ไม่สำเร็จ`);
    } finally {
      setBusy(null);
    }
  };

  const copyCommand = async (name: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(name);
      setTimeout(() => setCopied((c) => (c === name ? null : c)), 1500);
    } catch {
      /* ไม่มี clipboard API ก็ปล่อยผ่าน — ผู้ใช้เลือกคัดลอกเองจากกล่องได้ */
    }
  };

  const entries = Object.entries(list);

  return (
    <div className="panel">
      <h2>🧩 ปลั๊กอินเสริม (BYOM)</h2>
      <p className="hint">
        ฟีเจอร์เสริมบางอย่าง (เอฟเฟกต์เสียง / auto-tune / mastering แบบอ้างอิงเพลง) ใช้ไลบรารีที่มีสัญญาอนุญาตแบบ GPL
        จึงไม่ได้ติดตั้งมาให้อัตโนมัติ — เลือกติดตั้งเองได้ตามต้องการ (Bring-Your-Own-Model/plugin)
      </p>

      {loading && <p className="hint">กำลังโหลดสถานะ…</p>}
      {error && (
        <div className="status bad">
          🔴 {error}
        </div>
      )}

      {!loading && entries.map(([name, info]) => (
        <div className="card" key={name}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{info.label}</div>
              <div className="hint" style={{ margin: "4px 0 8px" }}>{info.unlocks}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: "1px solid #b8862b",
                    color: "#e0a83f",
                    background: "rgba(184,134,43,0.12)",
                  }}
                  title="สัญญาอนุญาตแบบ copyleft — ตรวจสอบก่อนใช้เชิงพาณิชย์ (ดู docs/ROADMAP_MUSIC.md)"
                >
                  ⚠ {info.license}
                </span>
                {info.available ? (
                  <span className="mono" style={{ fontSize: 12, color: "var(--green, #4caf6d)" }}>
                    ✅ ติดตั้งแล้ว
                  </span>
                ) : (
                  <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
                    ⬇ ยังไม่ติดตั้ง
                  </span>
                )}
              </div>
            </div>

            {!info.available && (
              <button
                className="primary"
                onClick={() => showInstall(name)}
                disabled={busy === name}
                style={{ whiteSpace: "nowrap" }}
              >
                {busy === name ? "กำลังดึงคำสั่ง…" : "ดูวิธีติดตั้ง"}
              </button>
            )}
          </div>

          {installInfo[name] && !info.available && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--border-soft, #333)", paddingTop: 12 }}>
              <div className="hint" style={{ margin: "0 0 6px" }}>
                รันคำสั่งนี้เองใน terminal ที่เปิด venv ของ backend ไว้ (เช่น <code className="mono">backend\.venv\Scripts\Activate.ps1</code>)
                แล้วรีสตาร์ต backend — ระบบยังไม่ได้ต่อการติดตั้งอัตโนมัติ
              </div>
              <div
                className="mono"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  background: "var(--panel2, #1a1a1e)",
                  border: "1px solid var(--border, #333)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 13,
                }}
              >
                <span style={{ overflowX: "auto", whiteSpace: "pre" }}>{installInfo[name].command}</span>
                <button
                  className="primary"
                  style={{ padding: "6px 12px", fontSize: 12 }}
                  onClick={() => copyCommand(name, installInfo[name].command)}
                >
                  {copied === name ? "คัดลอกแล้ว ✓" : "คัดลอก"}
                </button>
              </div>
              <p className="hint" style={{ margin: "8px 0 0" }}>{installInfo[name].note}</p>
            </div>
          )}
        </div>
      ))}

      <button className="primary" onClick={load} disabled={loading} style={{ marginTop: 4 }}>
        {loading ? "กำลังรีเฟรช…" : "🔄 รีเฟรชสถานะ"}
      </button>
    </div>
  );
}
