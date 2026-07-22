import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

declare global {
  interface Window { __TAURI_INTERNALS__?: unknown; }
}

type Stage = "idle" | "checking" | "available" | "downloading" | "installing" | "done" | "error" | "latest";

export function UpdateChecker() {
  const [stage, setStage] = useState<Stage>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);

  const checkForUpdate = async () => {
    setStage("checking");
    setError("");
    try {
      const u = await check();
      if (u) {
        setUpdate(u);
        setStage("available");
        setShow(true);
      } else {
        setStage("latest");
        setTimeout(() => setStage("idle"), 3000);
      }
    } catch (e) {
      setError(String(e));
      setStage("error");
    }
  };

  // ตรวจอัปเดตอัตโนมัติตอนเปิดแอป (เฉพาะ production)
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    const timer = setTimeout(checkForUpdate, 3000);
    return () => clearTimeout(timer);
  }, []);

  const doUpdate = async () => {
    if (!update) return;
    setStage("downloading");
    try {
      let totalLen = 0;
      let downloaded = 0;
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started" && ev.data.contentLength) {
          totalLen = ev.data.contentLength;
        } else if (ev.event === "Progress") {
          downloaded += ev.data.chunkLength;
          if (totalLen > 0) setProgress(Math.round((downloaded / totalLen) * 100));
        } else if (ev.event === "Finished") {
          setStage("done");
        }
      });
      setStage("done");
    } catch (e) {
      setError(String(e));
      setStage("error");
    }
  };

  const doRelaunch = async () => {
    await relaunch();
  };

  if (!show && stage !== "available") {
    return (
      <button className="update-btn" onClick={checkForUpdate} disabled={stage === "checking"} title="ตรวจสอบอัปเดต">
        {stage === "checking" ? "กำลังตรวจ…" : stage === "latest" ? "✓ ล่าสุดแล้ว" : "🔄"}
      </button>
    );
  }

  return (
    <div className="update-overlay" onClick={() => stage !== "downloading" && stage !== "installing" && setShow(false)}>
      <div className="update-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>🔄 อัปเดตใหม่</h3>

        {stage === "available" && update && (
          <>
            <p>เวอร์ชัน <strong>{update.version}</strong> พร้อมแล้ว</p>
            {update.body && <div className="update-notes">{update.body}</div>}
            <div className="update-actions">
              <button className="primary" onClick={doUpdate}>ติดตั้งเลย</button>
              <button className="secondary" onClick={() => setShow(false)}>ทีหลัง</button>
            </div>
          </>
        )}

        {stage === "downloading" && (
          <>
            <p>กำลังดาวน์โหลด…</p>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${progress}%` }} />
              <span className="bar-pct">{progress}%</span>
            </div>
          </>
        )}

        {stage === "done" && (
          <>
            <p>ติดตั้งสำเร็จ — รีสตาร์ทเพื่อใช้เวอร์ชันใหม่</p>
            <div className="update-actions">
              <button className="primary" onClick={doRelaunch}>รีสตาร์ท</button>
            </div>
          </>
        )}

        {stage === "error" && (
          <>
            <p className="update-error">เกิดข้อผิดพลาด: {error}</p>
            <div className="update-actions">
              <button className="secondary" onClick={() => { setShow(false); setStage("idle"); }}>ปิด</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
