// @req FR-09 — workspace dock: timeline + เครื่องมือรอบข้าง
import { useState } from "react";
import { ClipTimeline, type ClipCtx } from "./ClipTimeline";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { Splitter } from "./Splitter";
import { MixCopilot } from "./MixCopilot";
import { useEngine } from "../store/engineContext";
import { useRemixStore } from "../store/useRemixStore";

/**
 * StudioDock — timeline + transport เป็น "พื้น" ถาวรของทั้งแอป (เห็นทุกแท็บ)
 *  - ใช้ engine ตัวเดียวกับทั้ง workspace (จาก EngineProvider)
 *  - master-fx (reverb/echo/comp) อ่านจาก useRemixStore โดยตรง
 *  - context menu ของ clip ย้ายมาอยู่ที่นี่ (เดิมอยู่ใน RemixPanel)
 */
export function StudioDock() {
  const engine = useEngine();
  const mReverb = useRemixStore((s) => s.mReverb);
  const mEcho = useRemixStore((s) => s.mEcho);
  const mComp = useRemixStore((s) => s.mComp);
  const setMReverb = useRemixStore((s) => s.setMReverb);
  const setMEcho = useRemixStore((s) => s.setMEcho);
  const setMComp = useRemixStore((s) => s.setMComp);
  const tlH = useRemixStore((s) => s.tlH);
  const setTlH = useRemixStore((s) => s.setTlH);

  const [ctxMenu, setCtxMenu] = useState<ClipCtx | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  const ctxItems = (c: ClipCtx): MenuItem[] => [
    { label: "Mute clip", icon: "🔇", shortcut: "Ctrl+M", onClick: () => engine.muteClip(c.trackId, c.clipId) },
    { label: "Clip settings…", icon: "⚙", onClick: () => engine.select(c.trackId, c.clipId) },
    { type: "sep" },
    { label: "Clone clip", icon: "❏", shortcut: "Ctrl+D", onClick: () => engine.clone(c.trackId, c.clipId) },
    { label: "Slice clip here", icon: "▥", shortcut: "Shift", onClick: () => engine.slice(c.trackId, c.clipId, c.atSec) },
    { type: "sep" },
    { label: "Delete clip", icon: "🗑", danger: true, onClick: () => engine.remove(c.trackId, c.clipId) },
  ];

  return (
    <div className="studio-dock" style={{ height: tlH, position: "relative", display: "flex" }}>
      <Splitter axis="y" onDelta={(d) => setTlH((h) => clamp(h - d, 130, 620))} onReset={() => setTlH(230)} />
      <button
        title="Mix Copilot"
        onClick={() => setCopilotOpen((v) => !v)}
        style={{
          position: "absolute",
          top: 6,
          right: copilotOpen ? 332 : 8,
          zIndex: 5,
          background: copilotOpen ? "#c7f046" : "#1b1c22",
          color: copilotOpen ? "#14151a" : "#e6e6e6",
          border: "1px solid #33353d",
          borderRadius: 6,
          padding: "4px 8px",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        🤖
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <ClipTimeline
          engine={engine} onContext={setCtxMenu}
          reverb={mReverb} echo={mEcho} comp={mComp}
          onReverb={setMReverb} onEcho={setMEcho} onComp={setMComp}
        />
      </div>
      {copilotOpen && (
        <div style={{ flexShrink: 0, height: "100%", padding: "4px 4px 4px 0" }}>
          <MixCopilot engine={engine} />
        </div>
      )}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems(ctxMenu)} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  );
}
