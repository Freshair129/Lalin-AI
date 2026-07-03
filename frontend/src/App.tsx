import { useState } from "react";
import { BrainPanel } from "./components/BrainPanel";
import { VoicesPanel } from "./components/VoicesPanel";
import { TTSPanel } from "./components/TTSPanel";
import { DubbingPanel } from "./components/DubbingPanel";
import { MasteringPanel } from "./components/MasteringPanel";
import { RemixPanel } from "./components/RemixPanel";
import { MarketplacePanel } from "./components/MarketplacePanel";
import { FileManager } from "./components/FileManager";
import { UpdateChecker } from "./components/UpdateChecker";
import { Icon } from "./components/icons";
import { EngineProvider } from "./store/engineContext";
import { StudioDock } from "./components/StudioDock";
import { BatchQueue } from "./components/BatchQueue";
import { PluginsPanel } from "./components/PluginsPanel";
import { useBackendReadiness, type BackendReadiness } from "./hooks/useBackendReadiness";

type Tab = "voices" | "tts" | "dubbing" | "mastering" | "remix" | "files" | "market" | "brain" | "queue" | "plugins";

const STUDIO_TABS = new Set<Tab>(["remix", "tts", "dubbing", "mastering"]);

const NAV: { id: Tab; icon: string; label: string }[] = [
  { id: "voices", icon: "voices", label: "คลังเสียง" },
  { id: "tts", icon: "tts", label: "อ่านข้อความ" },
  { id: "dubbing", icon: "dubbing", label: "พากย์เสียง" },
  { id: "mastering", icon: "mastering", label: "Mastering" },
  { id: "remix", icon: "remix", label: "Remix" },
  { id: "files", icon: "files", label: "Files" },
  { id: "market", icon: "market", label: "Marketplace" },
  { id: "queue", icon: "doc", label: "คิวงาน" },
  { id: "plugins", icon: "audio", label: "ปลั๊กอิน" },
  { id: "brain", icon: "brain", label: "สมอง" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("voices");
  const backend = useBackendReadiness();
  const current = NAV.find((n) => n.id === tab);
  const backendReady = backend.state === "ready";

  return (
    <EngineProvider>
      <div className="daw">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" />
            <span className="brand-name">G-MUSIC</span>
          </div>
          <div className="topbar-ctx">
            <span className="ctx-icon">{current && <Icon name={current.icon} size={16} />}</span>
            <span className="ctx-name">{current?.label}</span>
          </div>
          <div className="topbar-right">
            <UpdateChecker />
          </div>
        </header>

        <div className="daw-body">
          <nav className="rail">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={`rail-btn ${tab === n.id ? "active" : ""}`}
                onClick={() => setTab(n.id)}
                title={n.label}
              >
                <Icon name={n.icon} />
              </button>
            ))}
          </nav>

          <main className="stage">
            {!backendReady ? (
              <BackendGate readiness={backend} />
            ) : tab === "remix" ? (
              <RemixPanel />
            ) : tab === "files" ? (
              <FileManager />
            ) : (
              <div className="stage-pad">
                {tab === "voices" && <VoicesPanel />}
                {tab === "tts" && <TTSPanel />}
                {tab === "dubbing" && <DubbingPanel />}
                {tab === "mastering" && <MasteringPanel />}
                {tab === "market" && <MarketplacePanel />}
                {tab === "queue" && <BatchQueue />}
                {tab === "plugins" && <PluginsPanel />}
                {tab === "brain" && <BrainPanel onChange={backend.retry} />}
              </div>
            )}
          </main>
        </div>

        {backendReady && STUDIO_TABS.has(tab) && <StudioDock />}

        <footer className="statusbar mono">
          <span className="status-item">
            <span className={`dot ${backend.online ? "up" : backend.online === false ? "down" : ""}`} />
            {backend.online == null ? "CONNECTING" : backend.online ? "ONLINE" : "OFFLINE"}
          </span>
          <span className="status-sep">·</span>
          <span className="status-item">BRAIN: {backend.brainName || "—"}</span>
          <span className="status-spacer" />
          <span className="status-item dim">127.0.0.1:8756</span>
          <span className="status-sep">·</span>
          <span className="status-item dim">v0.1.0</span>
        </footer>
      </div>
    </EngineProvider>
  );
}

function BackendGate({ readiness }: { readiness: BackendReadiness }) {
  const waiting = readiness.state === "checking";

  return (
    <div className="backend-gate">
      <div className="backend-gate-card glass">
        <span className={`backend-gate-pulse ${waiting ? "" : "bad"}`} />
        <p className="eyebrow">BACKEND SIDECAR</p>
        <h2>{waiting ? "กำลังปลุกเอนจินเสียง…" : "ยังเชื่อมต่อ backend ไม่ได้"}</h2>
        <p className="hint">
          {waiting
            ? "G-Music กำลังรอ FastAPI sidecar พร้อมใช้งาน ก่อนเปิดเครื่องมือที่ต้องเรียก API"
            : "ถ้าเพิ่งเปิดแอป ให้รอสักครู่ หรือกดลองใหม่หลัง sidecar เริ่มทำงานครบ"}
        </p>
        <div className="backend-gate-meta mono">
          <span>HEALTH /health</span>
          <span>TRY {readiness.attempt}</span>
          <span>127.0.0.1:8756</span>
        </div>
        {readiness.error && <p className="backend-gate-error">{readiness.error}</p>}
        <button className="primary" onClick={readiness.retry}>
          ลองเชื่อมต่ออีกครั้ง
        </button>
      </div>
    </div>
  );
}
