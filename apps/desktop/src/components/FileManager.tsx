import { useCallback, useEffect, useState } from "react";
import { fs, type FsEntry } from "../api";
import { requestPlayback } from "../playback/playbackClient";
import type { MediaItem } from "@lalin/contracts";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { Icon } from "./icons";

const AUDIO = ["mp3", "wav", "m4a", "ogg", "flac", "aac", "opus"];
function iconFor(e: FsEntry): string {
  if (e.type === "folder") return "folder";
  if (AUDIO.includes(e.ext)) return "audio";
  return "doc";
}
function join(path: string, name: string) { return path ? `${path}/${name}` : name; }
function fmtSize(n: number) { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`; }

// Adobe-style file manager (browse/create/rename/delete/move ใน workspace)
// @req FR-16.6 — Library/File Manager มี action Play, Play next, Add to queue
// @req FR-16W.1 — Production Phase 1: Bridge commands to Secondary Play Window
export function FileManager() {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [ctx, setCtx] = useState<{ x: number; y: number; entry?: FsEntry } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const toMediaItem = useCallback((e: FsEntry): MediaItem => {
    const filePath = join(path, e.name);
    return {
      id: `workspace:${filePath}`,
      title: e.name,
      artist: "Workspace",
      url: fs.fileUrl(filePath),
      sourceKind: "workspace",
      sourcePath: filePath,
      ext: e.ext,
    };
  }, [path]);

  const handlePlay = useCallback((e: FsEntry) => {
    const item = toMediaItem(e);
    requestPlayback({ type: "PLAY", item });
  }, [toMediaItem]);

  const handlePlayNext = useCallback((e: FsEntry) => {
    const item = toMediaItem(e);
    requestPlayback({ type: "PLAY_NEXT", item });
  }, [toMediaItem]);

  const handleAddToQueue = useCallback((e: FsEntry) => {
    const item = toMediaItem(e);
    requestPlayback({ type: "ADD_TO_QUEUE", item });
  }, [toMediaItem]);

  const load = useCallback((p: string) => {
    fs.list(p).then((r) => { setEntries(r.entries); setErr(""); }).catch((e) => setErr(String(e.message ?? e)));
  }, []);
  useEffect(() => { load(path); setSel(null); }, [path, load]);

  const crumbs = path ? path.split("/") : [];
  const newFolder = async () => {
    const name = window.prompt("ชื่อโฟลเดอร์ใหม่", "New Folder");
    if (!name) return;
    try { await fs.folder(path, name); load(path); } catch (e: any) { setErr(String(e.message ?? e)); }
  };
  const doRename = async (e: FsEntry, name: string) => {
    setRenaming(null);
    if (!name || name === e.name) return;
    try { await fs.rename(join(path, e.name), name); load(path); } catch (er: any) { setErr(String(er.message ?? er)); }
  };
  const doDelete = async (e: FsEntry) => {
    if (!window.confirm(`ลบ "${e.name}"?`)) return;
    try { await fs.remove(join(path, e.name)); load(path); } catch (er: any) { setErr(String(er.message ?? er)); }
  };
  const openEntry = (e: FsEntry) => {
    if (e.type === "folder") {
      setPath(join(path, e.name));
    } else if (AUDIO.includes(e.ext)) {
      handlePlay(e);
    }
  };

  const itemMenu = (e: FsEntry): MenuItem[] => [
    ...(e.type === "folder" ? [{ label: "Open", icon: "📂", onClick: () => openEntry(e) } as MenuItem, { type: "sep" } as MenuItem] : []),
    ...(AUDIO.includes(e.ext)
      ? [
          { label: "Play", icon: "▶", onClick: () => handlePlay(e) } as MenuItem,
          { label: "Play Next", icon: "⏭", onClick: () => handlePlayNext(e) } as MenuItem,
          { label: "Add to Queue", icon: "➕", onClick: () => handleAddToQueue(e) } as MenuItem,
          { type: "sep" } as MenuItem,
        ]
      : []),
    { label: "Rename", icon: "✎", shortcut: "F2", onClick: () => setRenaming(e.name) },
    { label: "Delete", icon: "🗑", danger: true, shortcut: "Del", onClick: () => doDelete(e) },
  ];
  const bgMenu: MenuItem[] = [{ label: "New Folder", icon: "📁", onClick: newFolder }, { type: "sep" }, { label: "Refresh", icon: "↻", onClick: () => load(path) }];

  return (
    <div className="fm" onContextMenu={(ev) => { ev.preventDefault(); setCtx({ x: ev.clientX, y: ev.clientY }); }}>
      <div className="fm-bar">
        <button className="fm-btn" disabled={!path} onClick={() => setPath(crumbs.slice(0, -1).join("/"))} title="ขึ้นบน">↑</button>
        <div className="fm-crumbs">
          <button className="fm-crumb" onClick={() => setPath("")}>workspace</button>
          {crumbs.map((c, i) => (
            <span key={i}><span className="fm-sep">/</span>
              <button className="fm-crumb" onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}>{c}</button>
            </span>
          ))}
        </div>
        <button className="fm-btn" onClick={newFolder} title="โฟลเดอร์ใหม่">＋ Folder</button>
        <button className="fm-btn" onClick={() => setView((v) => (v === "grid" ? "list" : "grid"))} title="สลับมุมมอง">{view === "grid" ? "☰" : "▦"}</button>
      </div>

      {err && <div className="fm-err">{err}</div>}

      <div className={`fm-body ${view}`}>
        {entries.length === 0 && <div className="fm-empty">โฟลเดอร์ว่าง — คลิกขวาเพื่อสร้างโฟลเดอร์</div>}
        {entries.map((e) => (
          <div
            key={e.name}
            className={`fm-item ${sel === e.name ? "sel" : ""}`}
            onClick={() => setSel(e.name)}
            onDoubleClick={() => openEntry(e)}
            onContextMenu={(ev) => { ev.preventDefault(); ev.stopPropagation(); setSel(e.name); setCtx({ x: ev.clientX, y: ev.clientY, entry: e }); }}
          >
            <span className={`fm-ic ${e.type}`}><Icon name={iconFor(e)} size={view === "grid" ? 30 : 18} /></span>
            {renaming === e.name ? (
              <input
                className="fm-rename" autoFocus defaultValue={e.name}
                onBlur={(ev) => doRename(e, ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); if (ev.key === "Escape") setRenaming(null); }}
                onClick={(ev) => ev.stopPropagation()}
              />
            ) : (
              <span className="fm-name">{e.name}</span>
            )}
            {view === "list" && <span className="fm-meta mono">{e.type === "folder" ? "—" : fmtSize(e.size)}</span>}
          </div>
        ))}
      </div>

      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={ctx.entry ? itemMenu(ctx.entry) : bgMenu} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}
