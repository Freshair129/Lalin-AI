import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { MediaItem } from "./contracts";
import { mediaItem, type LocalTrack } from "./native";
import {
  HANDOFF_MAX_FRAME_BYTES,
  HANDOFF_PROTOCOL,
  HANDOFF_PROTOCOL_VERSION,
  frameSize,
  handoffSnapshot,
  type HandoffAction,
  type HandoffCommandEvent,
  type HandoffSnapshot,
} from "./handoffContract";
import { usePlaybackStore, type PlaybackStoreState } from "./playback/usePlaybackStore";

const OWNER_SESSION = crypto.randomUUID();

function cleanError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text
    .replace(/[A-Za-z]:\\[^\s]*/g, "[local file]")
    .replace(/file:\/\/[^\s]*/gi, "[local file]")
    .slice(0, 512);
}

function fileItem(payload: HandoffCommandEvent): MediaItem {
  const path = payload.file.path;
  const ext = path.split(".").pop()?.toLowerCase();
  const title = payload.file.title?.trim() || path.split(/[\\/]/).pop() || "Local media";
  return {
    kind: ext === "mp4" || ext === "webm" ? "video" : "audio",
    id: path,
    title,
    url: convertFileSrc(path),
    sourceKind: "custom",
    sourcePath: path,
    ext,
  };
}

function projectedSnapshot(
  state: PlaybackStoreState,
  action: HandoffAction,
  item: MediaItem,
): HandoffSnapshot {
  let items = state.queue.items;
  let currentIndex = state.queue.currentIndex;
  let nowPlaying = state.nowPlaying;
  if (action === "play") {
    let index = items.findIndex((entry) => entry.id === item.id || entry.url === item.url);
    if (index < 0) {
      index = items.length;
      items = [...items, item];
    }
    currentIndex = index;
    nowPlaying = {
      ...nowPlaying,
      item,
      state: "loading",
      currentTime: 0,
      duration: item.duration ?? 0,
      error: undefined,
    };
  } else if (action === "play-next") {
    const nextItems = [...items];
    nextItems.splice(currentIndex >= 0 ? currentIndex + 1 : 0, 0, item);
    items = nextItems;
  } else {
    items = [...items, item];
  }
  return handoffSnapshot({
    ...state,
    queue: { ...state.queue, items, currentIndex },
    nowPlaying,
  });
}

async function finish(
  payload: HandoffCommandEvent,
  result: "applied" | "rejected",
  snapshot: HandoffSnapshot,
  error?: unknown,
) {
  await invoke("complete_handoff_command", {
    requestId: payload.requestId,
    completion: {
      result,
      errorCode: error ? "command_rejected" : undefined,
      message: error ? cleanError(error) : undefined,
    },
    snapshot,
  });
}

async function apply(payload: HandoffCommandEvent, onError: (error: unknown) => void) {
  if (
    payload.ownerSession !== OWNER_SESSION ||
    !/^[0-9a-f-]{36}$/i.test(payload.requestId) ||
    !["play", "play-next", "add-to-queue"].includes(payload.action) ||
    typeof payload.file?.path !== "string"
  ) {
    return;
  }

  const current = usePlaybackStore.getState();
  let item: MediaItem;
  try {
    item = fileItem(payload);
    const expected = projectedSnapshot(current, payload.action, item);
    if (frameSize(expected) + 512 > HANDOFF_MAX_FRAME_BYTES) {
      await finish(payload, "rejected", handoffSnapshot(current), "snapshot_too_large");
      return;
    }
    const track = await invoke<LocalTrack>("grant_handoff_media", { path: payload.file.path });
    item = mediaItem(track);
    const store = usePlaybackStore.getState();
    if (payload.action === "play") {
      void store.play(item).catch(onError);
    } else if (payload.action === "play-next") {
      store.playNext(item);
    } else {
      store.addToQueue(item);
    }
    await finish(payload, "applied", handoffSnapshot(usePlaybackStore.getState()));
  } catch (error) {
    onError(error);
    await finish(payload, "rejected", handoffSnapshot(usePlaybackStore.getState()), error);
  }
}

export async function bindHandoffReceiver(onError: (error: unknown) => void): Promise<() => void> {
  const unlisten = await listen<HandoffCommandEvent>("play-handoff-command", (event) => {
    void apply(event.payload, onError).catch(onError);
  });
  let publishTimer: number | undefined;
  const unsubscribe = usePlaybackStore.subscribe((state) => {
    if (publishTimer !== undefined) window.clearTimeout(publishTimer);
    publishTimer = window.setTimeout(() => {
      void invoke("publish_handoff_state", { snapshot: handoffSnapshot(state) }).catch(onError);
      publishTimer = undefined;
    }, 250);
  });
  try {
    await invoke("register_handoff_owner", {
      ownerSession: OWNER_SESSION,
      snapshot: handoffSnapshot(usePlaybackStore.getState()),
    });
  } catch (error) {
    unsubscribe();
    unlisten();
    throw new Error(`ไม่สามารถเริ่ม native Studio handoff ได้: ${cleanError(error)}`);
  }
  return () => {
    if (publishTimer !== undefined) window.clearTimeout(publishTimer);
    unsubscribe();
    unlisten();
  };
}

export const handoffWireIdentity = {
  protocol: HANDOFF_PROTOCOL,
  version: HANDOFF_PROTOCOL_VERSION,
};
