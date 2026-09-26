import type { PlaybackStoreState } from "./playback/usePlaybackStore";

export const HANDOFF_PROTOCOL = "lalin-play";
export const HANDOFF_PROTOCOL_VERSION = 1;
export const HANDOFF_MAX_FRAME_BYTES = 1024 * 1024;

export type HandoffAction = "play" | "play-next" | "add-to-queue";

export interface HandoffFile {
  path: string;
  title?: string;
}

export interface HandoffCommandEvent {
  requestId: string;
  ownerSession: string;
  action: HandoffAction;
  file: HandoffFile;
}

export interface HandoffSnapshot {
  nowPlaying: {
    identity: string | null;
    title: string | null;
    state: string;
    position: number;
    duration: number;
    error: string | null;
  };
  queue: Array<{ identity: string; title: string }>;
  currentIndex: number;
  volume: number;
  muted: boolean;
  eq: PlaybackStoreState["eq"];
}

export function opaqueIdentity(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return `track-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function safeError(error: string | undefined): string | null {
  if (!error) return null;
  return error
    .replace(/[A-Za-z]:\\[^\s]*/g, "[local file]")
    .replace(/file:\/\/[^\s]*/gi, "[local file]")
    .slice(0, 512);
}

export function handoffSnapshot(state: PlaybackStoreState): HandoffSnapshot {
  const current = state.nowPlaying.item;
  return {
    nowPlaying: {
      identity: current ? opaqueIdentity(current.id) : null,
      title: current?.title ?? null,
      state: state.nowPlaying.state,
      position: state.nowPlaying.currentTime,
      duration: state.nowPlaying.duration,
      error: safeError(state.nowPlaying.error),
    },
    queue: state.queue.items.map((item) => ({
      identity: opaqueIdentity(item.id),
      title: item.title,
    })),
    currentIndex: state.queue.currentIndex,
    volume: state.nowPlaying.volume,
    muted: state.nowPlaying.muted,
    eq: state.eq,
  };
}

export function frameSize(snapshot: HandoffSnapshot): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).length;
}
