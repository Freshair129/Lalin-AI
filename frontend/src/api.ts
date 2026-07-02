// API client สำหรับคุยกับ G-Music backend (FastAPI ที่พอร์ต 8756)

export const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ?? "http://127.0.0.1:8756";

const WS_BASE = API_BASE.replace(/^http/, "ws");

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, opts);
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Brain ─────────────────────────────────────────────────
export interface BrainConfig {
  provider: string;
  model?: string;
  cloud_provider?: string;
  base_url?: string;
  has_api_key?: boolean;
}

export const brain = {
  getConfig: () => req<{ config: BrainConfig; health: any }>("/brain/config"),
  setConfig: (body: Record<string, unknown>) =>
    req<{ config: BrainConfig; health: any }>("/brain/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  translate: (text: string, target_lang: string) =>
    req<{ translation: string }>("/brain/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target_lang }),
    }),
};

// ── Voices ────────────────────────────────────────────────
export interface Voice {
  id: string;
  name: string;
  ref_text: string;
  language: string;
}

export const voices = {
  list: () => req<{ voices: Voice[] }>("/voices"),
  upload: (form: FormData) =>
    req<Voice>("/voices", { method: "POST", body: form }),
  remove: (id: string) =>
    req<{ deleted: string }>(`/voices/${id}`, { method: "DELETE" }),
};

// ── Files ─────────────────────────────────────────────────
export const files = {
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<{ filename: string; path: string }>("/files/upload", {
      method: "POST",
      body: fd,
    });
  },
  downloadUrl: (name: string) => `${API_BASE}/files/download/${name}`,
  inputUrl: (name: string) => `${API_BASE}/files/input/${name}`,
  exportUrl: (name: string, fmt: "wav" | "mp3" = "wav") => `${API_BASE}/files/export/${name}?fmt=${fmt}`,
};

// ── FS (file-manager sandboxed workspace) ─────────────────
export interface FsEntry { name: string; type: "folder" | "file"; size: number; modified: number; ext: string; }
export const fs = {
  list: (path = "") => req<{ path: string; entries: FsEntry[] }>(`/fs?path=${encodeURIComponent(path)}`),
  folder: (path: string, name: string) => req<{ ok: boolean }>("/fs/folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, name }) }),
  rename: (path: string, name: string) => req<{ ok: boolean }>("/fs/rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, name }) }),
  move: (src: string, dst: string) => req<{ ok: boolean }>("/fs/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ src, dst }) }),
  remove: (path: string) => req<{ ok: boolean }>(`/fs?path=${encodeURIComponent(path)}`, { method: "DELETE" }),
};

// ── Pipelines (คืน job_id) ────────────────────────────────
export const tts = {
  synth: (body: Record<string, unknown>) =>
    req<{ job_id: string }>("/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};

export const dubbing = {
  run: (body: Record<string, unknown>) =>
    req<{ job_id: string }>("/dubbing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};

export const mastering = {
  run: (body: Record<string, unknown>) =>
    req<{ job_id: string }>("/mastering", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};

export const music = {
  remix: (body: Record<string, unknown>) =>
    req<{ job_id: string }>("/music/remix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  exportFx: (body: Record<string, unknown>) =>
    req<{ job_id: string }>("/music/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};

// ── Packs ─────────────────────────────────────────────────
export interface Pack {
  id: string; name: string; author: string; size_mb: number;
  color: string; desc: string; installed: boolean;
}
export const packs = {
  list: () => req<{ packs: Pack[] }>("/packs"),
  get: (id: string) => req<Pack>(`/packs/${id}`),
  download: (id: string) =>
    req<{ installed: boolean; id: string }>(`/packs/${id}/download`, { method: "POST" }),
};

// ── Projects (workspace save/load) ────────────────────────
export interface ProjectMeta { id: string; name: string; }
export const projects = {
  list: () => req<{ projects: ProjectMeta[] }>("/projects"),
  save: (name: string, data: Record<string, unknown>) =>
    req<{ id: string; name: string }>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data }),
    }),
  get: (id: string) => req<{ id: string; name: string; data: Record<string, unknown> }>(`/projects/${id}`),
  update: (id: string, name: string, data: Record<string, unknown>) =>
    req<{ id: string; name: string }>(`/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data }),
    }),
  remove: (id: string) =>
    req<{ deleted: string }>(`/projects/${id}`, { method: "DELETE" }),
};

// ── Jobs ──────────────────────────────────────────────────
export interface Job {
  id: string;
  kind: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  message: string;
  result?: {
    output?: string;
    // dubbing: ไฟล์ซับไตเติล + วิดีโอที่รวมเสียงพากย์กลับเข้าไปแล้ว (ถ้าต้นฉบับเป็นวิดีโอ)
    subtitle_srt?: string | null;
    subtitle_vtt?: string | null;
    video_output?: string;
    video_mux_error?: string;
  } & Record<string, unknown>;
  error?: string;
}

export const jobs = {
  get: (id: string) => req<Job>(`/jobs/${id}`),
  // ติดตามความคืบหน้าผ่าน WebSocket
  watch: (id: string, onUpdate: (j: Job) => void) => {
    const ws = new WebSocket(`${WS_BASE}/jobs/ws/${id}`);
    ws.onmessage = (e) => onUpdate(JSON.parse(e.data));
    return () => ws.close();
  },
};

export async function health() {
  return req<{ status: string; brain: any }>("/health");
}
