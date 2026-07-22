import { useCallback, useEffect, useRef, useState } from "react";
import { useRemixStore } from "../store/useRemixStore";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { API_BASE, files, music } from "../api";
import { useProjectFile } from "../hooks/useProjectFile";
import { useDialogHost } from "./Dialog";
import { useJob } from "../useJob";
import { Waveform } from "./Waveform";
import { Knob } from "./Knob";
import { Meter } from "./Meter";
import type { TrackView } from "./Timeline";
import { useEngine } from "../store/engineContext";
import { PropertiesPanel } from "./PropertiesPanel";
import { LibraryPanel } from "./LibraryPanel";
import { FxRack } from "./FxRack";
import { NodeDesigner, type CustomNodeConfig } from "./NodeDesigner";
import { Splitter } from "./Splitter";
import { StemMixer, DEFAULT_STEM_GAINS, type StemGains } from "./StemMixer";
import { StudioDock } from "./StudioDock";
import { Icon } from "./icons";

// สี lane (DAW) — ส่งเป็น hex เพราะ SVG attribute ไม่ resolve var()
const C = { vocal: "#9b6cf0", beat: "#3d9be0", master: "#c7f046" };
const KEY_OPTIONS = [
  "auto",
  "C maj", "C min", "C# maj", "C# min", "D maj", "D min", "D# maj", "D# min",
  "E maj", "E min", "F maj", "F min", "F# maj", "F# min", "G maj", "G min",
  "G# maj", "G# min", "A maj", "A min", "A# maj", "A# min", "B maj", "B min",
];

type NodeData = { title: string; sub?: string; body?: React.ReactNode; tone?: "lime" | "purple" | "beat" };
type PatchNodeSnapshot = {
  id: string;
  position: { x: number; y: number };
  custom?: { title: string; sub?: string; tone?: "lime" | "purple" | "beat" };
};
type PatchGraphSnapshot = { nodes: PatchNodeSnapshot[]; edges: Edge[] };
type DeviceDockTab = "fx" | "mix" | null;

function CinemaroNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={`remix-node ${data.tone ?? ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="remix-node-head">
        <span className="remix-node-dot" />
        <div className="remix-toolbar-head">
          <div className="remix-node-title">{data.title}</div>
          {data.sub && <div className="remix-node-sub">{data.sub}</div>}
        </div>
      </div>
      {data.body && <div className="remix-node-body">{data.body}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { cinemaro: CinemaroNode };

const POSITIONS: Record<string, { x: number; y: number }> = {
  source: { x: 0, y: 20 },
  beat: { x: 0, y: 290 },
  stem: { x: 250, y: 20 },
  autotune: { x: 480, y: 20 },
  fx: { x: 710, y: 20 },
  mix: { x: 960, y: 160 },
  master: { x: 1190, y: 160 },
  output: { x: 1420, y: 160 },
};

const INIT_EDGES: Edge[] = [
  { id: "e1", source: "source", target: "stem", animated: true },
  { id: "e2", source: "stem", target: "autotune", animated: true },
  { id: "e3", source: "autotune", target: "fx", animated: true },
  { id: "e4", source: "fx", target: "mix", animated: true },
  { id: "e5", source: "beat", target: "mix", animated: true },
  { id: "e6", source: "mix", target: "master", animated: true },
  { id: "e7", source: "master", target: "output", animated: true },
];

function toPatchSnapshot(nodes: Node<NodeData>[], edges: Edge[]): PatchGraphSnapshot {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      position: node.position,
      custom: node.id.startsWith("custom_")
        ? {
            title: node.data.title,
            sub: node.data.sub,
            tone: node.data.tone,
          }
        : undefined,
    })),
    edges,
  };
}

export function RemixPanel() {
  // ── recipe/master-fx/panel-size/UI-layout state (ย้ายไป Zustand store แล้ว) ──
  const source = useRemixStore((s) => s.source);
  const setSource = useRemixStore((s) => s.setSource);
  const beat = useRemixStore((s) => s.beat);
  const setBeat = useRemixStore((s) => s.setBeat);
  const autotune = useRemixStore((s) => s.autotune);
  const setAutotune = useRemixStore((s) => s.setAutotune);
  const autotuneStrength = useRemixStore((s) => s.autotuneStrength);
  const setAutotuneStrength = useRemixStore((s) => s.setAutotuneStrength);
  const keyOverride = useRemixStore((s) => s.keyOverride);
  const setKeyOverride = useRemixStore((s) => s.setKeyOverride);
  const fx = useRemixStore((s) => s.fx);
  const setFx = useRemixStore((s) => s.setFx);
  const reverb = useRemixStore((s) => s.reverb);
  const setReverb = useRemixStore((s) => s.setReverb);
  const delay = useRemixStore((s) => s.delay);
  const setDelay = useRemixStore((s) => s.setDelay);
  const phraseBars = useRemixStore((s) => s.phraseBars);
  const setPhraseBars = useRemixStore((s) => s.setPhraseBars);
  const offsetAuto = useRemixStore((s) => s.offsetAuto);
  const setOffsetAuto = useRemixStore((s) => s.setOffsetAuto);
  const offsetMs = useRemixStore((s) => s.offsetMs);
  const setOffsetMs = useRemixStore((s) => s.setOffsetMs);
  const lufs = useRemixStore((s) => s.lufs);
  const setLufs = useRemixStore((s) => s.setLufs);

  const mReverb = useRemixStore((s) => s.mReverb);
  const setMReverb = useRemixStore((s) => s.setMReverb);
  const mEcho = useRemixStore((s) => s.mEcho);
  const setMEcho = useRemixStore((s) => s.setMEcho);
  const mComp = useRemixStore((s) => s.mComp);
  const setMComp = useRemixStore((s) => s.setMComp);

  const leftW = useRemixStore((s) => s.leftW);
  const setLeftW = useRemixStore((s) => s.setLeftW);
  // tlH/rackH คงไว้ใน snapshot (ขนาด dock) — dock timeline ย้ายไป StudioDock แล้ว
  const tlH = useRemixStore((s) => s.tlH);
  const rackH = useRemixStore((s) => s.rackH);

  const layout = useRemixStore((s) => s.layout);
  const setLayout = useRemixStore((s) => s.setLayout);
  const leftTab = useRemixStore((s) => s.leftTab);
  const setLeftTab = useRemixStore((s) => s.setLeftTab);
  const showDesigner = useRemixStore((s) => s.showDesigner);
  const setShowDesigner = useRemixStore((s) => s.setShowDesigner);
  const loadRecipe = useRemixStore((s) => s.loadRecipe);

  // stem_gains (WP 3.4 per-stem faders) — เก็บ local state ไม่เข้า store กลาง
  // (store ยังไม่มี field นี้ + ไม่ต้อง persist ข้าม snapshot ตอนนี้)
  const [stemGains, setStemGains] = useState<StemGains>({ ...DEFAULT_STEM_GAINS });
  const [deviceDockTab, setDeviceDockTab] = useState<DeviceDockTab>("fx");
  // stem mixer มีผลจริงเมื่อค่าต่างจาก default อย่างน้อยหนึ่ง stem — ไม่งั้นส่ง undefined
  // ให้ backend ใช้เส้นทาง two-stems=vocals แบบเดิม (เร็วกว่า ไม่ต้องแยก stem เต็ม 4 ทาง)
  const stemGainsActive = (Object.keys(stemGains) as (keyof StemGains)[]).some(
    (k) => Math.abs(stemGains[k] - 1) > 1e-6
  );

  const { job, busy, start } = useJob();

  // ── clip engine (shared ทั้ง workspace ผ่าน EngineProvider) ──
  const engine = useEngine();
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const customSeq = useRef(0);
  const loadingRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [leftBounds, setLeftBounds] = useState({ min: 200, max: 360 });
  const patchGraphRef = useRef<PatchGraphSnapshot>({ nodes: [], edges: INIT_EDGES });

  // ── Adobe-style project file (New/Open/Save/Save As + dirty) ──
  const buildSnapshot = useCallback(() => ({
    source, beat, autotune, autotuneStrength, keyOverride, fx, reverb, delay, phraseBars, offsetAuto, offsetMs, lufs,
    mReverb, mEcho, mComp,
    leftW, tlH, rackH, // ขนาด panel ที่ลากไว้
    project: engine.project,
    patchGraph: patchGraphRef.current,
  }), [source, beat, autotune, autotuneStrength, keyOverride, fx, reverb, delay, phraseBars, offsetAuto, offsetMs, lufs, mReverb, mEcho, mComp, leftW, tlH, rackH, engine.project]);

  const applySnapshot = useCallback((d: Record<string, unknown>) => {
    loadingRef.current = true; // กัน setTrackSource เขียนทับ arrangement ที่โหลด
    if (d.project) engine.loadProject(d.project as Parameters<typeof engine.loadProject>[0]);
    else engine.loadProject({ bpm: 120, key: null, duration: 0, tracks: [
      { id: "vocal", label: "audio-01", color: "#9b6cf0", clips: [], envelopes: [], muted: false, solo: false, locked: false },
      { id: "beat", label: "audio-02", color: "#3d9be0", clips: [], envelopes: [], muted: false, solo: false, locked: false },
      { id: "master", label: "audio-03", color: "#c7f046", clips: [], envelopes: [], muted: false, solo: false, locked: false },
    ] });
    loadRecipe({
      source: (d.source as string | null) ?? null,
      beat: (d.beat as string | null) ?? null,
      autotune: d.autotune == null ? true : Boolean(d.autotune),
      autotuneStrength: Number(d.autotuneStrength ?? 1),
      keyOverride: String(d.keyOverride ?? "auto"),
      fx: d.fx == null ? true : Boolean(d.fx),
      reverb: Number(d.reverb ?? 0.16),
      delay: Number(d.delay ?? 0.12),
      phraseBars: Number(d.phraseBars ?? 0),
      offsetAuto: d.offsetAuto == null ? true : Boolean(d.offsetAuto),
      offsetMs: Number(d.offsetMs ?? 0),
      lufs: Number(d.lufs ?? -14),
      mReverb: Number(d.mReverb ?? 0),
      mEcho: Number(d.mEcho ?? 0),
      mComp: Boolean(d.mComp),
      leftW: Number(d.leftW ?? 230),
      tlH: Number(d.tlH ?? 230),
      rackH: Number(d.rackH ?? 190),
    });
    const graph = d.patchGraph as PatchGraphSnapshot | undefined;
    setNodes(createPatchNodes(graph?.nodes));
    setEdges(graph?.edges ?? INIT_EDGES);
    customSeq.current = Math.max(
      0,
      ...(graph?.nodes ?? [])
        .map((node) => /^custom_(\d+)$/.exec(node.id))
        .filter((match): match is RegExpExecArray => !!match)
        .map((match) => Number(match[1])),
    );
    setTimeout(() => { loadingRef.current = false; }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dialog = useDialogHost();
  const file = useProjectFile({ buildSnapshot, applySnapshot, ui: { prompt: dialog.prompt, confirm: dialog.confirm } });

  const upload = async (f: File | null, set: (s: string) => void) => {
    if (!f) return;
    const r = await files.upload(f);
    set(r.filename);
  };

  const run = () =>
    start(() =>
      music.remix({
        source_audio: source,
        beat_audio: beat,
        do_autotune: autotune,
        autotune_strength: autotuneStrength,
        key_override: keyOverride === "auto" ? null : keyOverride,
        do_fx: fx,
        phrase_bars: phraseBars,
        offset_ms: offsetAuto ? null : offsetMs,
        reverb,
        delay,
        target_lufs: lufs,
        // ส่งเฉพาะตอนมีการปรับ fader จริง — ไม่งั้น backend ใช้เส้นทาง two-stems เดิม (เร็วกว่า)
        stem_gains: stemGainsActive ? stemGains : undefined,
      })
    );

  const outputName =
    job?.status === "done" && job.result?.output
      ? String(job.result.output).split(/[\\/]/).pop() ?? null
      : null;
  const resultLufs =
    job?.status === "done" && typeof job.result?.lufs === "number"
      ? (job.result.lufs as number)
      : null;
  const resultOffset =
    job?.status === "done" && typeof job.result?.offset_ms === "number"
      ? (job.result.offset_ms as number)
      : null;
  const resultKey =
    job?.status === "done"
      ? (
          typeof (job.result?.key as Record<string, unknown> | undefined)?.target === "string"
            ? String((job.result?.key as Record<string, unknown>).target)
            : typeof (job.result?.key as Record<string, unknown> | undefined)?.beat === "string"
              ? String((job.result?.key as Record<string, unknown>).beat)
              : null
        )
      : null;
  const resultStretch =
    job?.status === "done" && typeof (job.result?.bpm as Record<string, unknown> | undefined)?.stretch === "number"
      ? ((job.result?.bpm as Record<string, unknown>).stretch as number)
      : null;

  const previewOffsetSec = offsetAuto ? 0 : (phraseBars * 2) + (offsetMs / 1000);
  const vocalPreviewStart = Math.max(0, previewOffsetSec);
  const beatPreviewStart = Math.max(0, -previewOffsetSec);

  // ── เนื้อหาแต่ละโหนด (เน้น visual: knob/meter/waveform) ─────
  const buildData = (id: string): NodeData => {
    switch (id) {
      case "source":
        return {
          title: "Source", sub: "vocal / เดโม่", tone: "purple",
          body: (
            <>
              <input type="file" accept="audio/*,video/*"
                onChange={(e) => upload(e.target.files?.[0] ?? null, setSource)} />
              {source && <div className="remix-ok">{source}</div>}
            </>
          ),
        };
      case "beat":
        return {
          title: "Beat", sub: "instrumental", tone: "beat",
          body: (
            <>
              <input type="file" accept="audio/*,video/*"
                onChange={(e) => upload(e.target.files?.[0] ?? null, setBeat)} />
              {beat && <div className="remix-ok">{beat}</div>}
            </>
          ),
        };
      case "stem":
        return { title: "Stem Split", sub: "Demucs" };
      case "autotune":
        return {
          title: "Auto-tune", sub: "psola · key match",
          body: (
            <>
              <Knob value={autotuneStrength} min={0} max={1} onChange={setAutotuneStrength}
                label="Strength" color={C.vocal} disabled={!autotune}
                format={(v) => `${Math.round(v * 100)}`} />
              <select value={keyOverride} onChange={(e) => setKeyOverride(e.target.value)}>
                {KEY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt === "auto" ? "Auto key" : opt}</option>
                ))}
              </select>
              <label className="remix-check">
                <input type="checkbox" checked={autotune} onChange={(e) => setAutotune(e.target.checked)} />
                {autotune ? "On" : "Off"}
              </label>
            </>
          ),
        };
      case "fx":
        return {
          title: "Vocal FX", sub: "reverb · delay",
          body: (
            <>
              <div className="remix-knob-row">
                <Knob value={reverb} min={0} max={0.5} onChange={setReverb}
                  label="Reverb" color={C.master} disabled={!fx}
                  format={(v) => `${Math.round(v * 100)}`} />
                <Knob value={delay} min={0} max={0.4} onChange={setDelay}
                  label="Delay" color={C.master} disabled={!fx}
                  format={(v) => `${Math.round(v * 100)}`} />
              </div>
              <label className="remix-check">
                <input type="checkbox" checked={fx} onChange={(e) => setFx(e.target.checked)} />
                {fx ? "On" : "Off"}
              </label>
            </>
          ),
        };
      case "mix":
        return {
          title: "Mix", sub: "vocal ▸ beat",
          body: (
            <>
              <Knob value={offsetMs} min={-1000} max={1000} onChange={(v) => setOffsetMs(Math.round(v))}
                label="Offset ms" color={C.beat} disabled={offsetAuto}
                format={(v) => `${Math.round(v)}`} />
              <select value={phraseBars} onChange={(e) => setPhraseBars(Number(e.target.value))}>
                <option value={0}>Phrase 1</option>
                <option value={1}>Phrase 2</option>
                <option value={2}>Phrase 3</option>
                <option value={3}>Phrase 4</option>
              </select>
              <label className="remix-check">
                <input type="checkbox" checked={offsetAuto} onChange={(e) => setOffsetAuto(e.target.checked)} />
                Auto-sync
              </label>
            </>
          ),
        };
      case "master":
        return {
          title: "Master", sub: "loudness", tone: "lime",
          body: (
            <>
              <Meter value={resultLufs ?? lufs} min={-24} max={-6} label="LUFS"
                unit={resultLufs != null ? "MEASURED" : "TARGET"} height={88} />
              <select value={lufs} onChange={(e) => setLufs(Number(e.target.value))}>
                <option value={-14}>-14 Spotify</option>
                <option value={-16}>-16 Apple</option>
                <option value={-9}>-9 Club</option>
              </select>
            </>
          ),
        };
      case "output":
        return {
          title: "Output", sub: outputName ? "master.wav" : "—", tone: "lime",
          body: outputName ? (
            <>
              <div className="remix-mini-wave">
                <Waveform src={`${API_BASE}/files/download/${outputName}`} height={44} />
              </div>
              <a className="dl" href={`${API_BASE}/files/download/${outputName}`} download>⬇ ดาวน์โหลด</a>
            </>
          ) : (
            <div className="remix-ok" style={{ color: "var(--muted)" }}>
              {busy ? "⚙️ กำลังประมวลผล…" : "ยังไม่มีผลลัพธ์"}
            </div>
          ),
        };
      default:
        return { title: id };
    }
  };

  const createPatchNodes = (saved?: PatchNodeSnapshot[]) => {
    const baseNodes = Object.keys(POSITIONS).map((id) => {
      const snapshot = saved?.find((node) => node.id === id);
      return {
        id,
        type: "cinemaro",
        position: snapshot?.position ?? POSITIONS[id],
        data: buildData(id),
      } satisfies Node<NodeData>;
    });
    const customNodes = (saved ?? [])
      .filter((node) => node.id.startsWith("custom_") && node.custom)
      .map((node) => ({
        id: node.id,
        type: "cinemaro",
        position: node.position,
        data: {
          title: node.custom?.title ?? node.id,
          sub: node.custom?.sub,
          tone: node.custom?.tone ?? "lime",
        },
      } satisfies Node<NodeData>));
    return [...baseNodes, ...customNodes];
  };

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(
    createPatchNodes()
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(INIT_EDGES);

  useEffect(() => {
    setNodes((nds) => nds.map((n) => (n.id.startsWith("custom_") ? n : { ...n, data: buildData(n.id) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, beat, autotune, autotuneStrength, keyOverride, fx, reverb, delay, phraseBars, offsetAuto, offsetMs, lufs, outputName, resultLufs, busy]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((existing) => addEdge({ ...connection, id: `e_${Date.now()}_${existing.length}`, animated: true }, existing));
  }, [setEdges]);

  useEffect(() => {
    patchGraphRef.current = toPatchSnapshot(nodes, edges);
  }, [nodes, edges]);

  // เพิ่ม custom node เข้ากราฟ (จาก Node Designer)
  const addCustomNode = (cfg: CustomNodeConfig) => {
    customSeq.current += 1;
    const id = `custom_${customSeq.current}`;
    setNodes((nds) => [
      ...nds,
      {
        id, type: "cinemaro",
        position: { x: 320 + customSeq.current * 36, y: 360 + customSeq.current * 28 },
        data: { title: cfg.name, sub: `${cfg.skin} · ${cfg.elements.join("+") || "empty"}`, tone: "lime" },
      },
    ]);
  };

  // ── sync source/beat/master เข้า clip engine (ข้ามตอนกำลังโหลด workspace) ──
  useEffect(() => {
    if (!loadingRef.current) {
      engine.setTrackSource(
        "vocal",
        source ? files.inputUrl(source) : null,
        "#9b6cf0",
        { start: vocalPreviewStart },
      );
    }
  }, [source, vocalPreviewStart]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!loadingRef.current) {
      engine.setTrackSource(
        "beat",
        beat ? files.inputUrl(beat) : null,
        "#3d9be0",
        { start: beatPreviewStart },
      );
    }
  }, [beat, beatPreviewStart]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loadingRef.current) engine.setTrackSource("master", outputName ? files.downloadUrl(outputName) : null, "#c7f046"); }, [outputName]); // eslint-disable-line react-hooks/exhaustive-deps

  // เลือก clip → สลับไปแท็บ Track อัตโนมัติ
  useEffect(() => { if (engine.selClip) setLeftTab("track"); }, [engine.selClip]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      const min = Math.max(190, Math.min(240, Math.round(width * 0.18)));
      const max = Math.max(min + 40, Math.min(360, Math.round(width * 0.32)));
      setLeftBounds({ min, max });
      setLeftW((w) => clamp(w, min, max));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setLeftW]);

  // ── คีย์ลัด project-level (Adobe-style) ────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s") { if (typing) return; e.preventDefault(); e.shiftKey ? file.saveAs() : file.save(); }
      else if (k === "o") { if (typing) return; e.preventDefault(); file.openDialog(); }
      else if (k === "n") { if (typing) return; e.preventDefault(); file.newProject(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file]);

  // The shared M0 owns project commands while this panel retains project state.
  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<"new" | "open" | "save" | "saveAs">).detail;
      if (command === "new") file.newProject();
      if (command === "open") file.openDialog();
      if (command === "save") file.save();
      if (command === "saveAs") file.saveAs();
    };
    window.addEventListener("lalin:command", onCommand);
    return () => window.removeEventListener("lalin:command", onCommand);
  }, [file]);

  // track ที่เลือก → properties panel
  const selTrackObj = engine.project.tracks.find((t) => t.id === engine.selTrack);
  const selectedView: TrackView | null = selTrackObj
    ? { id: selTrackObj.id, label: selTrackObj.label, color: selTrackObj.color, muted: selTrackObj.muted, solo: selTrackObj.solo, locked: selTrackObj.locked }
    : null;

  // ── export (bake master FX → ดาวน์โหลด) ───────────────────
  const { job: exJob, busy: exBusy, start: exStart } = useJob();
  useEffect(() => {
    if (exJob?.status === "done" && exJob.result?.output) {
      const name = String(exJob.result.output);
      const a = document.createElement("a");
      a.href = files.downloadUrl(name); a.download = name; a.click();
    }
  }, [exJob]);
  const doExport = (fmt: "wav" | "mp3") => {
    if (!outputName) return;
    exStart(() => music.exportFx({ name: outputName, fmt, reverb: mReverb, echo: mEcho, comp: mComp }));
  };

  return (
    <div className="remix-wrap">
      <div className="remix-toolbar">
        <div className="remix-toolbar-head">
          <div className="remix-toolbar-headline">
            <span className="remix-kicker mono">ARRANGE WORKSPACE</span>
            <span className="remix-workspace-view">Timeline</span>
          </div>
          <span className="hint mono" style={{ margin: 0 }}>
            {job ? job.message || job.error : "Arrange · align · mix · export"}
          </span>
          <div className="remix-head-badges">
            <span className="tool-metric">DAW layout</span>
            <span className="tool-metric">{layout === "standard" ? "Arrange active" : "Patch active"}</span>
            <span className="tool-metric">{source && beat ? "Ready to run" : "Load source + beat"}</span>
          </div>
        </div>
        <div className="remix-toolbar-right">
          <label className={`seg-add tool-chip ${source ? "ready" : ""}`} title={source ? `Source: ${source}` : "โหลดไฟล์เสียงต้นฉบับ (vocal)"}>
            <input type="file" accept="audio/*,video/*" hidden
              onChange={(e) => upload(e.target.files?.[0] ?? null, setSource)} />
            <Icon name="voices" size={14} />
            <span>Source</span>
          </label>
          <label className={`seg-add tool-chip ${beat ? "ready" : ""}`} title={beat ? `Beat: ${beat}` : "โหลดไฟล์บีต (instrumental)"}>
            <input type="file" accept="audio/*,video/*" hidden
              onChange={(e) => upload(e.target.files?.[0] ?? null, setBeat)} />
            <Icon name="remix" size={14} />
            <span>Beat</span>
          </label>
          <span className="remix-tb-sep" />
          <div className="proj-title" title={file.currentId ? `id: ${file.currentId}` : "ยังไม่ได้บันทึก"}>
            <input
              className="proj-name mono"
              value={file.currentName}
              onChange={(e) => file.rename(e.target.value)}
              spellCheck={false}
              size={Math.max(8, file.currentName.length)}
            />
            <span className={`proj-dot ${file.dirty ? "dirty" : "clean"}`} title={file.dirty ? "มีการเปลี่ยนแปลงที่ยังไม่บันทึก" : file.saving ? "กำลังบันทึก…" : "บันทึกแล้ว"}>●</span>
          </div>
          <div className="seg-toggle">
            <button className={layout === "standard" ? "on" : ""} onClick={() => setLayout("standard")}>Arrange</button>
            <button className={layout === "node" ? "on" : ""} onClick={() => setLayout("node")}>Patch</button>
          </div>
          {layout === "node" && (
            <button className="seg-add tool-chip" onClick={() => setShowDesigner(true)} title="Custom Patch Node"><span>+</span><span>Custom</span></button>
          )}
          {job && (job.status === "running" || job.status === "queued") && (
            <div className="bar remix-toolbar-progress" style={{ width: 160 }}>
              <div className="bar-fill" style={{ width: `${Math.round(job.progress * 100)}%` }} />
            </div>
          )}
          {job?.status === "done" && (
            <span className="hint mono tool-metric">
              {resultKey ? `Key ${resultKey}` : "Key -"} · {resultOffset != null ? `Offset ${Math.round(resultOffset)}ms` : "Offset -"} · {resultStretch != null ? `Stretch ${resultStretch.toFixed(3)}x` : "Stretch -"} · {resultLufs != null ? `LUFS ${resultLufs.toFixed(1)}` : "LUFS -"}
            </span>
          )}
          <button className="primary tool-run" onClick={run} disabled={busy || !source || !beat}>
            <Icon name="play" size={15} />
            <span>{busy ? "Rendering…" : "Run"}</span>
          </button>
        </div>
      </div>

      {file.recoverable && (
        <div className="recover-banner">
          <span>พบงานที่ยังไม่ได้บันทึกจาก {new Date(file.recoverable.savedAt).toLocaleTimeString("th-TH")} — กู้คืน / ทิ้ง</span>
          <div className="recover-actions">
            <button className="seg-add tool-chip" onClick={file.recoverDraft}><Icon name="refresh" size={14} /><span>กู้คืน</span></button>
            <button className="seg-add tool-chip" onClick={file.discardDraft}><Icon name="close" size={14} /><span>ทิ้ง</span></button>
          </div>
        </div>
      )}

      <div className="remix-body" ref={bodyRef}>
        <div className="remix-left" style={{ width: leftW }}>
          <div className="remix-lefttabs">
            <button className={leftTab === "library" ? "on" : ""} onClick={() => setLeftTab("library")}>Library</button>
            <button className={leftTab === "track" ? "on" : ""} onClick={() => setLeftTab("track")}>Track</button>
          </div>
          {leftTab === "library" ? (
            <LibraryPanel />
          ) : (
            <PropertiesPanel
              track={selectedView}
              outputName={outputName}
              onToggle={(id, what) => engine.toggleTrack(id, what === "mute" ? "muted" : what === "solo" ? "solo" : "locked")}
              onExport={doExport}
              exporting={exBusy}
            />
          )}
        </div>
        <Splitter
          axis="x"
          onDelta={(d) => setLeftW((w) => clamp(w + d, leftBounds.min, leftBounds.max))}
          onReset={() => setLeftW(clamp(230, leftBounds.min, leftBounds.max))}
        />

        <div className="remix-main">
          {layout === "node" ? (
            <div className="remix-patch-shell">
              <aside className="remix-patch-sidecar">
                <span className="remix-kicker mono">PATCH VIEW</span>
                <strong>Advanced pipeline map</strong>
                <p className="hint" style={{ margin: 0 }}>
                  Drag nodes, connect stages, and keep custom patch notes in the same studio workspace.
                </p>
                <div className="remix-patch-stats">
                  <span className="tool-metric">{nodes.length} modules</span>
                  <span className="tool-metric">{edges.length} links</span>
                </div>
                <div className="remix-patch-tips">
                  <span>Arrange is the default editing surface.</span>
                  <span>Patch is for routing, process visibility, and custom notes.</span>
                  <span>Delete selected items with Backspace or Delete.</span>
                </div>
              </aside>
              <div className="remix-canvas remix-patch-canvas" style={{ flex: 1 }}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  nodeTypes={nodeTypes}
                  fitView
                  nodesConnectable
                  elementsSelectable
                  edgesReconnectable
                  deleteKeyCode={["Backspace", "Delete"]}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={22} color="#1c1f26" />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
            </div>
          ) : (
            <div className="remix-standard">
              <div className="remix-timeline-shell">
                <StudioDock embedded />
              </div>
              <section className={`remix-bottom-dock ${deviceDockTab ?? "closed"}`} aria-label="Device dock">
                <div className="remix-device-tabs" role="tablist" aria-label="Remix processors">
                  <span className="remix-kicker mono">DEVICE DOCK</span>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={deviceDockTab === "fx"}
                    className={deviceDockTab === "fx" ? "on" : ""}
                    onClick={() => setDeviceDockTab((tab) => tab === "fx" ? null : "fx")}
                  >
                    Process
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={deviceDockTab === "mix"}
                    className={deviceDockTab === "mix" ? "on" : ""}
                    onClick={() => setDeviceDockTab((tab) => tab === "mix" ? null : "mix")}
                  >
                    Mix & Master
                  </button>
                  <span className="hint mono remix-device-summary">
                    {deviceDockTab ? "Click the active tab to maximize timeline" : "Timeline maximized"}
                  </span>
                </div>
              <FxRack
                reverb={reverb} setReverb={setReverb}
                delay={delay} setDelay={setDelay}
                autotune={autotune} setAutotune={setAutotune}
                autotuneStrength={autotuneStrength} setAutotuneStrength={setAutotuneStrength}
                keyOverride={keyOverride} setKeyOverride={setKeyOverride}
                fx={fx} setFx={setFx}
                lufs={lufs} setLufs={setLufs}
                offsetAuto={offsetAuto} setOffsetAuto={setOffsetAuto}
                phraseBars={phraseBars} setPhraseBars={setPhraseBars}
                offsetMs={offsetMs} setOffsetMs={setOffsetMs}
                mReverb={mReverb} setMReverb={setMReverb}
                mEcho={mEcho} setMEcho={setMEcho}
                mComp={mComp} setMComp={setMComp}
              />
              <div className="bento-tile glass wide remix-stem-dock">
                <div className="bento-head">
                  <span className="bento-dot" style={{ background: "#e0863d" }} />
                  <b>Stem Mixer</b>
                  <span className="bento-sub">VOCALS · DRUMS · BASS · OTHER</span>
                </div>
                <div style={{ padding: "10px 6px" }}>
                  <StemMixer gains={stemGains} onChange={setStemGains} />
                  <div className="hint" style={{ marginTop: 8, fontSize: 10, color: "var(--amber)" }}>
                    * ใน remix แบบวางเสียงร้องบน beat ใหม่ ตอนนี้ตัวปรับ “ร้อง” มีผลกับผลลัพธ์จริง —
                    drums/bass/other จะมีผลเมื่อผสม instrumental จากเพลงต้นฉบับ (โหมดถัดไป)
                  </div>
                  {!stemGainsActive && (
                    <div className="hint mono" style={{ marginTop: 4, fontSize: 10 }}>
                      ยังไม่ปรับ — ใช้แยก stem แบบเร็ว (vocal/instrumental)
                    </div>
                  )}
                </div>
              </div>
              </section>
            </div>
          )}
        </div>
      </div>

      {showDesigner && (
        <NodeDesigner onCreate={addCustomNode} onClose={() => setShowDesigner(false)} />
      )}
      {file.list && (
        <div className="mkt-overlay" onClick={file.closeDialog}>
          <div className="ws-load glass" onClick={(e) => e.stopPropagation()}>
            <h3><Icon name="folder" size={16} /> เปิดโปรเจกต์</h3>
            {file.list.length === 0 && <p className="hint">ยังไม่มีโปรเจกต์ที่บันทึก</p>}
            {file.list.map((p) => (
              <div key={p.id} className="ws-row">
                <button className="ws-item" onClick={() => file.openProject(p.id)} title="เปิดโปรเจกต์นี้">
                  <span>{p.name}{file.currentId === p.id ? "  • Current" : ""}</span>
                  <span className="mono ws-id">{p.id}</span>
                </button>
                <button className="ws-del" onClick={() => file.removeProject(p.id)} title="ลบ"><Icon name="close" size={14} /></button>
              </div>
            ))}
            <button className="ws-close" onClick={file.closeDialog}>ปิด</button>
          </div>
        </div>
      )}
      {dialog.node}
    </div>
  );
}
