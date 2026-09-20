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
}

export async function getLibrary(): Promise<LocalTrack[]> {
  const library = await invoke<{ version: number; tracks: LocalTrack[] }>(
    "get_library",
  );
  return library.tracks;
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
