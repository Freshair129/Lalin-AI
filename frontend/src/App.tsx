import { useEffect, useState } from "react";
import { API_BASE, health } from "./api";
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

// เวอร์ชันฝังตอน build จาก package.json (ดู vite.config.ts)
declare const __APP_VERSION__: string;
const APP_VERSION = __APP_VERSION__;

type Tab = "voices" | "tts" | "dubbing" | "mastering" | "remix" | "files" | "market" | "brain" | "queue" | "plugins";

// แท็บที่แสดง timeline dock ล่าง (พื้น DAW) — เครื่องมือที่ผลิตเสียงลง timeline
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
  const [online, setOnline] = useState<boolean | null>(null);
  const [brainName, setBrainName] = useState("");

  const ping = async () => {
    try {
      const h = await health();
      setOnline(true);
      setBrainName(h.brain?.provider ?? "");
    } catch {
      setOnline(false);
    }
  };
  useEffect(() => {
    ping();
    const t = setInterval(ping, 10000);
    return () => clearInterval(t);
  }, []);

  const current = NAV.find((n) => n.id === tab);

  return (
    <EngineProvider>
    <div className="daw">
      {/* ── Top bar (เต็มกว้าง แบบ DAW) ── */}
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

      {/* ── Body: icon rail + work area ── */}
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
          {tab === "remix" ? (
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
              {tab === "brain" && <BrainPanel onChange={() => ping()} />}
            </div>
          )}
        </main>
      </div>

      {/* ── Timeline dock (พื้น DAW ถาวร) — เห็นบนแท็บ studio ── */}
      {STUDIO_TABS.has(tab) && <StudioDock />}

      {/* ── Status bar (ล่าง, monospace) ── */}
      <footer className="statusbar mono">
        <span className="status-item">
          <span className={`dot ${online ? "up" : online === false ? "down" : ""}`} />
          {online == null ? "CONNECTING" : online ? "ONLINE" : "OFFLINE"}
        </span>
        <span className="status-sep">·</span>
        <span className="status-item">BRAIN: {brainName || "—"}</span>
        <span className="status-spacer" />
        <span className="status-item dim">{API_BASE.replace(/^https?:\/\//, "")}</span>
        <span className="status-sep">·</span>
        <span className="status-item dim">v{APP_VERSION}</span>
      </footer>
    </div>
    </EngineProvider>
  );
}
