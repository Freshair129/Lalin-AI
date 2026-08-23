// @req NFR-04 — shell + nav ภาษาไทย
// @req NFR-02 — gate ทุกแท็บจนกว่า backend พร้อม (BackendGate)
import { useState } from "react";
import { BrainPanel } from "./components/BrainPanel";
import { VoicesPanel } from "./components/VoicesPanel";
import { TTSPanel } from "./components/TTSPanel";
import { DubbingPanel } from "./components/DubbingPanel";
import { MasteringPanel } from "./components/MasteringPanel";
import { RemixPanel } from "./components/RemixPanel";
import { FileManager } from "./components/FileManager";
import { MarketplacePanel } from "./components/MarketplacePanel";
import { PluginsPanel } from "./components/PluginsPanel";
import { UpdateChecker } from "./components/UpdateChecker";
import { Icon } from "./components/icons";
import { EngineProvider } from "./store/engineContext";
import { StudioDock } from "./components/StudioDock";
import { BatchQueue } from "./components/BatchQueue";
import { useBackendReadiness, type BackendReadiness } from "./hooks/useBackendReadiness";
import { useRuntimeActivity } from "./hooks/useRuntimeActivity";
import { API_BASE, type RuntimeActivityStatus } from "./api";
import { runtimeDeviceWarning } from "./runtimeDevices";

// เวอร์ชันฝังตอน build จาก package.json (ดู vite.config.ts)
declare const __APP_VERSION__: string;
const APP_VERSION = __APP_VERSION__;

type Tab = "workspace" | "voice" | "dubbing" | "arrange" | "mastering" | "library" | "jobs" | "settings";

const STUDIO_TABS = new Set<Tab>(["arrange", "dubbing", "mastering"]);
const NAV: { id: Tab; icon: string; label: string }[] = [
  { id: "workspace", icon: "grid", label: "Workspace" },
  { id: "voice", icon: "voices", label: "Voice Studio" },
  { id: "dubbing", icon: "dubbing", label: "Dubbing" },
  { id: "arrange", icon: "remix", label: "Arrange" },
  { id: "mastering", icon: "mastering", label: "Mastering" },
  { id: "library", icon: "files", label: "Library" },
  { id: "jobs", icon: "doc", label: "Jobs" },
  { id: "settings", icon: "brain", label: "Settings" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("arrange");
  const [activityOpen, setActivityOpen] = useState(false);
  const [menu, setMenu] = useState<"file" | "edit" | "view" | "help" | null>(null);
  const backend = useBackendReadiness();
  const runtime = useRuntimeActivity(backend.state === "ready");
  const current = NAV.find((item) => item.id === tab);
  const backendReady = backend.state === "ready";

  return (
    <EngineProvider>
      <div className="daw">
        <div className="commandbar" aria-label="Application commands">
          <div className="commandbar-menu">
            <button type="button" onClick={() => setMenu(menu === "file" ? null : "file")}>File</button><button type="button" onClick={() => setMenu(menu === "edit" ? null : "edit")}>Edit</button><button type="button" onClick={() => setMenu(menu === "view" ? null : "view")}>View</button><button type="button" onClick={() => setMenu(menu === "help" ? null : "help")}>Help</button>
          </div>
          <div className="commandbar-actions">
            <button type="button" onClick={() => dispatchCommand("open")}>Open</button>
            <button type="button" onClick={() => dispatchCommand("save")}>Save</button>
            <button type="button" onClick={() => setTab("settings")}>Settings</button>
          </div>
          {menu === "file" && <div className="command-menu"><button onClick={() => { dispatchCommand("new"); setMenu(null); }}>New</button><button onClick={() => { dispatchCommand("open"); setMenu(null); }}>Open…</button><button onClick={() => { dispatchCommand("save"); setMenu(null); }}>Save</button><button onClick={() => { dispatchCommand("saveAs"); setMenu(null); }}>Save As…</button></div>}
          {menu === "edit" && <div className="command-menu muted-menu">Undo / Redo are available in the active editor.</div>}
          {menu === "view" && <div className="command-menu muted-menu">Arrange, Patch, and panel visibility stay in the current workspace.</div>}
          {menu === "help" && <div className="command-menu muted-menu">Use the active tool’s inline help and keyboard shortcuts.</div>}
        </div>
        <header className="topbar">
          <div className="brand"><span className="brand-mark" /><span className="brand-name">LALIN STUDIO</span></div>
          <div className="topbar-ctx"><span>Workspace</span><span className="crumb">›</span><span>Project Alpha</span><span className="crumb">›</span><strong>{current?.label}</strong></div>
          <label className="global-search"><Icon name="search" size={15} /><input placeholder="Search projects, files, presets, devices…" /></label>
          <div className="topbar-meta mono">
            <span className={`topbar-pill ${backend.online ? "live" : backend.online === false ? "down" : ""}`}><span className={`dot ${backend.online ? "up" : backend.online === false ? "down" : ""}`} />{backend.online == null ? "CONNECTING" : backend.online ? "READY" : "OFFLINE"}</span>
            <span className="topbar-pill">{runtime?.runtime.model || backend.brainName || "model N/A"}</span>
            <span className="topbar-version">v{APP_VERSION}</span>
          </div>
          <div className="topbar-right"><UpdateChecker /></div>
        </header>

        <div className="daw-body">
          <nav className="rail" aria-label="Lalin Studio navigation">
            {NAV.map((item) => <button key={item.id} className={`rail-btn ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)} title={item.label}><Icon name={item.icon} /><span>{item.label}</span></button>)}
          </nav>
          <main className={`stage ${backendReady && STUDIO_TABS.has(tab) ? "stage-studio" : ""}`}>
            {!backendReady ? <BackendGate readiness={backend} /> : tab === "arrange" ? <RemixPanel /> : tab === "library" ? <LibraryHub /> : <div className="stage-pad">
              {tab === "workspace" && <WorkspacePanel activity={runtime} onNavigate={setTab} />}
              {tab === "voice" && <VoiceStudioPanel />}
              {tab === "dubbing" && <DubbingPanel />}
              {tab === "mastering" && <MasteringPanel />}
              {tab === "jobs" && <BatchQueue />}
              {tab === "settings" && <BrainPanel onChange={backend.retry} />}
            </div>}
          </main>
        </div>

        {backendReady && STUDIO_TABS.has(tab) && tab !== "arrange" && <StudioDock />}
        <RuntimeFooter status={runtime} onOpenActivity={() => setActivityOpen(true)} />
        {activityOpen && <ActivityOverlay status={runtime} onClose={() => setActivityOpen(false)} onOpenJobs={() => { setTab("jobs"); setActivityOpen(false); }} />}
      </div>
    </EngineProvider>
  );
}

function WorkspacePanel({ activity, onNavigate }: { activity: RuntimeActivityStatus | null; onNavigate: (tab: Tab) => void }) {
  const job = activity?.activity;
  const launchers: { label: string; tab: Tab; note: string }[] = [
    { label: "Voice Studio", tab: "voice", note: "Profiles and TTS" }, { label: "Dubbing", tab: "dubbing", note: "Translate and assign voices" }, { label: "Arrange", tab: "arrange", note: "Timeline and finishing" }, { label: "Mastering", tab: "mastering", note: "Target and export" }, { label: "Import", tab: "library", note: "Browse local media" },
  ];
  return <section className="workspace-grid"><section className="workspace-continue"><p className="eyebrow">CONTINUE WORK</p><h1>Project Alpha</h1><p className="hint">Current local session · Arrange workspace</p><button className="primary" onClick={() => onNavigate("arrange")}>Continue Arrange</button></section><section className="workspace-recents"><div className="section-title"><h2>Recent projects</h2><button onClick={() => onNavigate("library")}>Open library</button></div><p className="hint">No saved recent project is available in this local session.</p></section><section className="workspace-create"><div className="section-title"><h2>Create</h2><span className="hint">Start one focused task</span></div><div className="workspace-launchers">{launchers.map((item) => <button key={item.tab} onClick={() => onNavigate(item.tab)}><strong>{item.label}</strong><span>{item.note}</span></button>)}</div></section><section className="workspace-jobs"><div className="section-title"><h2>Active jobs</h2><button onClick={() => onNavigate("jobs")}>Open Jobs</button></div>{job?.label ? <div className="workspace-job"><strong>{job.label}</strong><span>{job.state} · {formatPercent(job.progress == null ? null : job.progress * 100)}</span></div> : <p className="hint">No active jobs.</p>}</section></section>;
}

function VoiceStudioPanel() {
  const [view, setView] = useState<"library" | "tts" | "agent">("library");
  const [speakReplies, setSpeakReplies] = useState(false);
  return <section className="voice-studio"><div className="panel-tabs"><button className={view === "library" ? "active" : ""} onClick={() => setView("library")}>Profile</button><button className={view === "tts" ? "active" : ""} onClick={() => setView("tts")}>Text to speech</button><button className={view === "agent" ? "active" : ""} onClick={() => setView("agent")}>Agent Voice</button></div>{view === "library" ? <VoicesPanel /> : view === "tts" ? <TTSPanel /> : <section className="agent-voice-panel"><p className="eyebrow">AGENT VOICE</p><h2>Speak replies</h2><p className="hint">เลือก profile ที่ได้รับ consent แล้วจากแท็บ Profile ก่อนเปิดเสียงตอบกลับ. ข้อความยังแสดงปกติเมื่อ runtime เสียงไม่พร้อม.</p><label className="agent-voice-toggle"><input type="checkbox" checked={speakReplies} onChange={(event) => setSpeakReplies(event.target.checked)} /> <span>Speak Lalin replies</span></label><p className="hint">Runtime status: local voice output follows the active TTS engine.</p></section>}</section>;
}

function LibraryHub() {
  const [view, setView] = useState<"files" | "market" | "plugins">("files");
  return <section className="library-hub"><div className="panel-tabs"><button className={view === "files" ? "active" : ""} onClick={() => setView("files")}>Files</button><button className={view === "market" ? "active" : ""} onClick={() => setView("market")}>Marketplace</button><button className={view === "plugins" ? "active" : ""} onClick={() => setView("plugins")}>Plugins</button></div>{view === "files" ? <FileManager /> : view === "market" ? <MarketplacePanel /> : <PluginsPanel />}</section>;
}

function RuntimeFooter({ status, onOpenActivity }: { status: RuntimeActivityStatus | null; onOpenActivity: () => void }) {
  const telemetry = status?.telemetry;
  const activity = status?.activity;
  const warning = runtimeDeviceWarning(status?.runtime.devices.tts)
    ?? runtimeDeviceWarning(status?.runtime.devices.asr);
  return <footer className="runtime-footer mono"><div className="runtime-telemetry"><span>CPU {formatPercent(telemetry?.cpu_percent)}</span><span>RAM {formatMemory(telemetry?.ram_used_bytes)} / {formatMemory(telemetry?.ram_total_bytes)}</span><span>GPU {formatPercent(telemetry?.gpu_percent)}</span><span>VRAM {formatMemory(telemetry?.vram_used_bytes)} / {formatMemory(telemetry?.vram_total_bytes)}</span>{warning && <span title={warning}>CPU FALLBACK</span>}</div><button className="runtime-activity" onClick={onOpenActivity}>{activity?.label ? <><span>{activity.label}</span><strong>{formatPercent(activity.progress == null ? null : activity.progress * 100)}</strong><i><b style={{ width: `${Math.round((activity.progress ?? 0) * 100)}%` }} /></i></> : "No active jobs"}</button><div className="runtime-identity"><span>{status?.runtime.profile ?? "runtime N/A"}</span><span>{status?.runtime.devices.tts.effective ?? status?.runtime.devices.asr.effective ?? "device N/A"}</span><span>{status?.runtime.model ?? "model N/A"}</span><span>Agent {status?.runtime.agent ?? "N/A"}</span><span>{API_BASE.replace(/^https?:\/\//, "")}</span></div></footer>;
}

function ActivityOverlay({ status, onClose, onOpenJobs }: { status: RuntimeActivityStatus | null; onClose: () => void; onOpenJobs: () => void }) {
  const activity = status?.activity;
  return <div className="activity-overlay" role="dialog" aria-modal="true" aria-label="Activity log"><div className="activity-card"><div><p className="eyebrow">ACTIVITY LOG</p><h2>{activity?.label ?? "No active jobs"}</h2><p className="hint">{activity?.state ?? "ระบบไม่มีงานที่กำลังทำอยู่"}</p></div><button className="icon-close" onClick={onClose} aria-label="Close activity log">×</button><div className="activity-progress"><span style={{ width: `${Math.round((activity?.progress ?? 0) * 100)}%` }} /></div><div className="activity-actions"><button onClick={onOpenJobs}>Open Jobs</button><button onClick={onClose}>Close</button></div></div></div>;
}

function formatPercent(value: number | null | undefined) { return value == null ? "N/A" : `${Math.round(value)}%`; }
function formatMemory(value: number | null | undefined) { return value == null ? "N/A" : `${(value / 1024 ** 3).toFixed(1)}GB`; }
function dispatchCommand(command: "new" | "open" | "save" | "saveAs") { window.dispatchEvent(new CustomEvent("lalin:command", { detail: command })); }

function BackendGate({ readiness }: { readiness: BackendReadiness }) {
  const waiting = readiness.state === "checking";
  return <div className="backend-gate"><div className="backend-gate-card glass"><span className={`backend-gate-pulse ${waiting ? "" : "bad"}`} /><p className="eyebrow">BACKEND SIDECAR</p><h2>{waiting ? "กำลังปลุกเอนจินเสียง…" : "ยังเชื่อมต่อ backend ไม่ได้"}</h2><p className="hint">{waiting ? "Lalin กำลังรอ FastAPI sidecar พร้อมใช้งาน" : "ลองเชื่อมต่อใหม่หลัง sidecar เริ่มทำงานครบ"}</p><div className="backend-gate-meta mono"><span>HEALTH /health</span><span>TRY {readiness.attempt}</span><span>127.0.0.1:8756</span></div>{readiness.error && <p className="backend-gate-error">{readiness.error}</p>}<button className="primary" onClick={readiness.retry}>ลองเชื่อมต่ออีกครั้ง</button></div></div>;
}
