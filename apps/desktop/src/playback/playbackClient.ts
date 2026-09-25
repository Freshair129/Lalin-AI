// @req FR-16.3 FR-16.6 — Studio แสดงสถานะจาก playback owner โดยไม่สร้าง audio engine
import { useEffect, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { files } from "../api";
import {
  createPlaybackClient,
  type PlaybackClientState,
  type PlaybackCommand,
} from "./playbackBridge";
import { isTauri, openOrFocusPlayWindow } from "./windowManager";

interface NativeStateFrame {
  ownerSession: string;
  revision: number;
  snapshot: {
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
    eq: unknown;
  };
}

interface NativeReply {
  ack: {
    requestId: string;
    ownerSession: string;
    result: "applied" | "rejected";
    revision: number;
    errorCode?: string;
    message?: string;
  };
  state: NativeStateFrame;
}

let state: PlaybackClientState = { nowPlaying: { item: null, state: "idle" }, error: null, pending: false };
const listeners = new Set<() => void>();
const browserClient = createPlaybackClient({
  open: openOrFocusPlayWindow,
  onState: (next) => { state = next; listeners.forEach((notify) => notify()); },
});
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
let nativeQueue = Promise.resolve();
let nativeBlocked = false;
let nativeErrorActive = false;
let nativePending = 0;
let nativeReconciling = false;
const MAX_NATIVE_QUEUE = 128;

function publishNative(patch: Partial<PlaybackClientState>) {
  state = { ...state, ...patch };
  listeners.forEach((notify) => notify());
}

async function reconcileNative() {
  if (nativeReconciling) return;
  nativeReconciling = true;
  try {
    if (nativeBlocked) {
      const reply = await invoke<NativeReply>("reconcile_playback_handoff");
      nativeBlocked = false;
      nativeErrorActive = reply.ack.result === "rejected";
      publishNative({ error: nativeErrorActive ? reply.ack.message || "Lalin Play ปฏิเสธคำสั่งก่อนหน้า" : null });
      return;
    }
    const frame = await invoke<NativeStateFrame | null>("get_playback_state");
    if (frame) {
      nativeErrorActive = false;
      publishNative({ error: null });
    }
  } catch (error) {
    publishNative({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    nativeReconciling = false;
  }
}

function enqueueNative(command: PlaybackCommand) {
  if (nativePending >= MAX_NATIVE_QUEUE) {
    nativeErrorActive = true;
    publishNative({ error: "คิวส่งไป Lalin Play เต็มแล้ว กรุณารอให้คำสั่งก่อนหน้าจบ" });
    return;
  }
  nativePending += 1;
  publishNative({ pending: true, error: null });
  const requestId = crypto.randomUUID();
  nativeQueue = nativeQueue
    .then(async () => {
      if (command.type === "FOCUS_PLAYER") {
        await invoke("focus_play_window");
        return;
      }
      if (nativeBlocked) {
        throw new Error("มีคำสั่งก่อนหน้าที่ยังยืนยันผลไม่ได้ กรุณากด ‘ตรวจสถานะเครื่องเล่น’ ก่อนสั่งใหม่");
      }
      if (!command.item.sourcePath || !["workspace", "upload", "output"].includes(command.item.sourceKind ?? "")) {
        throw new Error("ไฟล์นี้ยังไม่มี local reference ที่ Studio อนุญาตให้ส่งไป Lalin Play");
      }
      const resolved = await files.resolveForPlayback(
        command.item.sourceKind as "workspace" | "upload" | "output",
        command.item.sourcePath,
      );
      const action = command.type === "PLAY"
        ? "play"
        : command.type === "PLAY_NEXT"
          ? "play-next"
          : "add-to-queue";
      const reply = await invoke<NativeReply>("handoff_playback", {
        requestId,
        action,
        file: { path: resolved.path, title: command.item.title },
      });
      if (reply.ack.result !== "applied") {
        throw new Error(reply.ack.message || "Lalin Play ปฏิเสธคำสั่งนี้");
      }
      nativeErrorActive = false;
      publishNative({ error: null });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("delivery_unknown")) nativeBlocked = true;
      nativeErrorActive = true;
      publishNative({ error: message });
    })
    .finally(() => {
      nativePending = Math.max(0, nativePending - 1);
      publishNative({ pending: nativePending > 0 });
    });
}

export function usePlaybackClient() {
  useEffect(() => browserClient.connect(), []);
  return useSyncExternalStore(subscribe, () => state);
}

export function requestPlayback(command: PlaybackCommand) {
  // Keep the existing Studio-owned player active until standalone parity is proven.
  nativeErrorActive = false;
  void browserClient.send(command).catch(() => {});
}

export function requestStandalonePlayback(command: PlaybackCommand) {
  if (!isTauri()) return;
  enqueueNative(command);
}

export const reconcilePlayback = () => nativeBlocked || nativeErrorActive
  ? reconcileNative()
  : browserClient.reconcile();
