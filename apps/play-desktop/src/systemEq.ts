// CR-009 Scope A: send Play's EQ curve to a user-installed Equalizer APO so the
// same EQ applies to every app on the chosen output device. Play never touches
// other apps' audio; it only rewrites its own APO include file.
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { PlaybackEQ } from "./contracts";
import { PlaybackAudioEngine } from "./playback/audioEngine";
import { usePlaybackStore } from "./playback/usePlaybackStore";

export type EqOutput = "app" | "system";

export interface SystemEqStatus {
  installed: boolean;
  configDir: string | null;
  linked: boolean;
  writable: boolean;
}

export interface SystemEqCurve {
  enabled: boolean;
  preamp: number;
  gains: number[];
}

export const STORAGE_EQ_OUTPUT_KEY = "lalin-play:v1:eq-output";
export const SYSTEM_EQ_DEBOUNCE_MS = 150;
export const EQUALIZER_APO_URL = "https://sourceforge.net/projects/equalizerapo/";

const NOT_FOUND: SystemEqStatus = { installed: false, configDir: null, linked: false, writable: false };

export function curveFromEQ(eq: PlaybackEQ): SystemEqCurve {
  return { enabled: eq.enabled, preamp: eq.preamp, gains: eq.bands.map((band) => band.gain) };
}

export function systemEqReady(status: SystemEqStatus | null): boolean {
  return Boolean(status?.installed && status.linked && status.writable);
}

function loadOutput(): EqOutput {
  try {
    return localStorage.getItem(STORAGE_EQ_OUTPUT_KEY) === "system" ? "system" : "app";
  } catch {
    return "app";
  }
}

function saveOutput(output: EqOutput) {
  try {
    localStorage.setItem(STORAGE_EQ_OUTPUT_KEY, output);
  } catch {}
}

interface SystemEqState {
  output: EqOutput;
  status: SystemEqStatus | null;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<SystemEqStatus>;
  selectOutput: (output: EqOutput) => Promise<void>;
  removeFromApo: () => Promise<void>;
}

let pending: ReturnType<typeof setTimeout> | null = null;

function engine() {
  return PlaybackAudioEngine.getInstance();
}

async function writeCurve(curve: SystemEqCurve) {
  await invoke("apply_system_eq", { curve });
}

function scheduleWrite(eq: PlaybackEQ) {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    writeCurve(curveFromEQ(eq)).catch((error) => useSystemEq.setState({ error: String(error) }));
  }, SYSTEM_EQ_DEBOUNCE_MS);
}

function active(state: Pick<SystemEqState, "output" | "status">) {
  return state.output === "system" && systemEqReady(state.status);
}

export const useSystemEq = create<SystemEqState>((set, get) => ({
  output: loadOutput(),
  status: null,
  busy: false,
  error: null,

  refresh: async () => {
    const status = await invoke<SystemEqStatus>("get_system_eq_status").catch(() => NOT_FOUND);
    set({ status: status ?? NOT_FOUND });
    return status ?? NOT_FOUND;
  },

  selectOutput: async (output) => {
    set({ busy: true, error: null });
    try {
      if (output === "app") {
        if (pending) clearTimeout(pending);
        pending = null;
        engine().setExternalEQ(false);
        set({ output });
        saveOutput(output);
        // Leave APO flat so other apps return to their unprocessed sound.
        if (systemEqReady(get().status)) await writeCurve({ enabled: false, preamp: 0, gains: [] });
        return;
      }
      let status = await get().refresh();
      if (!status.installed) throw new Error("not-installed");
      if (!systemEqReady(status)) {
        status = await invoke<SystemEqStatus>("setup_system_eq");
        set({ status });
      }
      if (!systemEqReady(status)) throw new Error("setup-failed");
      set({ output });
      saveOutput(output);
      engine().setExternalEQ(true);
      await writeCurve(curveFromEQ(usePlaybackStore.getState().eq));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ busy: false });
    }
  },

  removeFromApo: async () => {
    set({ busy: true, error: null });
    try {
      engine().setExternalEQ(false);
      const status = await invoke<SystemEqStatus>("remove_system_eq");
      set({ status, output: "app" });
      saveOutput("app");
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ busy: false });
    }
  },
}));

let started = false;

/** Applies the saved EQ output at startup and keeps APO in step with EQ edits. */
export function initSystemEqSync(): () => void {
  if (started) return () => {};
  started = true;
  const state = useSystemEq.getState();
  // Assume the saved choice until the status check answers, so local audio is never EQ'd twice.
  if (state.output === "system") engine().setExternalEQ(true);
  void state.refresh().then((status) => {
    const current = useSystemEq.getState();
    if (current.output !== "system") return;
    if (systemEqReady(status)) {
      scheduleWrite(usePlaybackStore.getState().eq);
    } else {
      // APO was removed or unlinked outside Play: fall back to the in-app EQ.
      engine().setExternalEQ(false);
      useSystemEq.setState({ output: "app" });
      saveOutput("app");
    }
  });
  const unsubscribe = usePlaybackStore.subscribe((next, previous) => {
    if (next.eq !== previous.eq && active(useSystemEq.getState())) scheduleWrite(next.eq);
  });
  return () => {
    unsubscribe();
    started = false;
  };
}
