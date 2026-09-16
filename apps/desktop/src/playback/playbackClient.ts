// @req FR-16.3 FR-16.6 — Studio แสดงสถานะจาก Play โดยไม่สร้าง audio engine
import { useEffect, useSyncExternalStore } from "react";
import { createPlaybackClient, type PlaybackClientState, type PlaybackCommand } from "./playbackBridge";
import { openOrFocusPlayWindow } from "./windowManager";

let state: PlaybackClientState = { nowPlaying: { item: null, state: "idle" }, error: null, pending: false };
const listeners = new Set<() => void>();
const client = createPlaybackClient({
  open: openOrFocusPlayWindow,
  onState: (next) => { state = next; listeners.forEach((notify) => notify()); },
});
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };

export function usePlaybackClient() {
  useEffect(() => client.connect(), []);
  return useSyncExternalStore(subscribe, () => state);
}

export function requestPlayback(command: PlaybackCommand) {
  // ผลผิดพลาดอยู่ในสถานะ client และแสดงใน Studio เสมอ
  void client.send(command).catch(() => {});
}
export const reconcilePlayback = () => client.reconcile();
