// @req FR-16.4 FR-16.6 FR-16W.3 — module นี้โหลดเฉพาะ Play surface
import { createPlaybackOwner } from "./playbackBridge";
import { usePlaybackStore } from "./usePlaybackStore";

export const playbackOwner = createPlaybackOwner({
  getSnapshot: () => {
    const { item, state, error } = usePlaybackStore.getState().nowPlaying;
    return { item, state, error };
  },
  execute: (command) => {
    const store = usePlaybackStore.getState();
    if (command.type === "PLAY") return store.play(command.item);
    if (command.type === "PLAY_NEXT") store.playNext(command.item);
    if (command.type === "ADD_TO_QUEUE") store.addToQueue(command.item);
  },
});

export function connectPlaybackOwner() {
  const disconnect = playbackOwner.connect();
  const unsubscribe = usePlaybackStore.subscribe((next, previous) => {
    const a = next.nowPlaying;
    const b = previous.nowPlaying;
    if (a.item !== b.item || a.state !== b.state || a.error !== b.error) playbackOwner.publish();
  });
  return () => { unsubscribe(); disconnect(); };
}
