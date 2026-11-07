// @req PLAY-15 — Native catalog reads are served by GenesisBlockDB.
// @req PLAY-16 — YouTube references use the official external-link commands.
// @req PLAY-18 — Persisted favorite and source metadata are exposed to the UI.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { MediaItem } from "./contracts";

export interface LocalTrack {
  kind?: "audio" | "video";
  id: string;
  path: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  missing: boolean;
  sourceKind?: string;
  storageKind?: string;
  sourcePath?: string | null;
  contentHash?: string | null;
  favorite?: boolean;
  playCount?: number;
  lastPlayedAt?: number | null;
}

export interface YoutubeLink {
  id: string;
  url: string;
  title: string;
  addedAt: number;
}

export async function getLibrary(): Promise<LocalTrack[]> {
  const library = await invoke<{ version: number; tracks: LocalTrack[] }>(
    "get_library",
  );
  return library.tracks;
}

export async function selectRelinkFile(id: string): Promise<string | null> {
  return invoke<string | null>("select_relink_file", { id });
}

export async function relinkTrack(
  id: string,
  path: string,
  acceptDifferentContent: boolean,
): Promise<LocalTrack> {
  return invoke<LocalTrack>("relink_track", { id, path, acceptDifferentContent });
}

export async function listYoutubeLinks(): Promise<YoutubeLink[]> {
  return invoke<YoutubeLink[]>("list_youtube_links");
}

export async function addYoutubeLink(url: string, title: string): Promise<YoutubeLink> {
  return invoke<YoutubeLink>("add_youtube_link", { url, title });
}

export async function removeYoutubeLink(id: string): Promise<void> {
  await invoke("remove_youtube_link", { id });
}

export async function openYoutubeLink(id: string): Promise<void> {
  await invoke("open_youtube_link", { id });
}

export function mediaItem(track: LocalTrack): MediaItem {
  return {
    kind: track.kind ?? (isVideoPath(track.path) ? "video" : "audio"),
    id: track.id,
    title: track.title,
    artist: track.artist ?? undefined,
    album: track.album ?? undefined,
    duration: track.duration ?? undefined,
    sourceKind: "custom",
    sourcePath: track.path,
    url: convertFileSrc(track.path),
  };
}

function isVideoPath(path: string): boolean {
  return /\.(mp4|webm)$/i.test(path);
}

// ชนิดใช้แสดงผลเท่านั้น; native resolver ยังคงเป็นผู้อนุญาตการอ่านไฟล์
export function isVideoItem(item: MediaItem | null): boolean {
  return (
    !!item &&
    (item.kind === "video" ||
      (!item.kind && isVideoPath(item.sourcePath ?? item.id)))
  );
}

export async function resolveMedia(item: MediaItem): Promise<string> {
  const path = await invoke<string>("resolve_media", { id: item.id });
  return convertFileSrc(path);
}
