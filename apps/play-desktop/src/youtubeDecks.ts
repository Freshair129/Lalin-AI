// CR-010 (personal builds only): state and IPC for the two youtube.com decks.
// In a normal build the deck commands do not exist, `available` stays false
// and no deck UI is shown.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";

export interface DeckInfo {
  loaded: boolean;
  title: string;
  time: number;
  duration: number;
  paused: boolean;
  volume: number;
  ad: boolean;
}

export interface DecksSnapshot {
  open: boolean;
  decks: [DeckInfo, DeckInfo];
  active: number;
  auto: boolean;
  fadeSeconds: number;
  fading: boolean;
  mix: number;
  extensionsDir: string;
}

interface DecksStore {
  available: boolean;
  snapshot: DecksSnapshot | null;
  error: string | null;
  init: () => Promise<() => void>;
  run: (command: string, args?: Record<string, unknown>) => Promise<void>;
}

export const useYoutubeDecks = create<DecksStore>((set) => ({
  available: false,
  snapshot: null,
  error: null,

  init: async () => {
    try {
      const snapshot = await invoke<DecksSnapshot>("deck_status");
      if (!snapshot) return () => {};
      set({ available: true, snapshot });
    } catch {
      set({ available: false });
      return () => {};
    }
    return listen<DecksSnapshot>("decks-changed", (event) => set({ snapshot: event.payload }));
  },

  run: async (command, args) => {
    set({ error: null });
    try {
      const result = await invoke<DecksSnapshot | void>(command, args);
      if (result) set({ snapshot: result });
    } catch (error) {
      set({ error: String(error) });
    }
  },
}));

export const deckName = (deck: number) => (deck === 0 ? "A" : "B");

export function formatDeckTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
