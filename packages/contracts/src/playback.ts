// @req FR-16 — Media Player contracts (Lalin Play)
// @req FR-16W — Windows Integration contracts
// @req FR-17 — Playback EQ contracts

export type PlaybackState = "idle" | "playing" | "paused" | "loading" | "error";
export type PlaybackRepeatMode = "off" | "one" | "all";

export interface MediaItem {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  url: string;
  sourceKind?: "upload" | "workspace" | "output" | "voice" | "custom";
  sourcePath?: string;
  ext?: string;
  artworkUrl?: string;
}

export interface PlaybackQueue {
  items: MediaItem[];
  currentIndex: number;
  repeatMode: PlaybackRepeatMode;
  shuffle: boolean;
}

export interface NowPlaying {
  item: MediaItem | null;
  state: PlaybackState;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  activeOutputDeviceId?: string;
  error?: string;
}

export interface PlaybackEQBand {
  frequency: number;
  gain: number; // dB: -12 to +12
  q?: number;
}

export interface EQPreset {
  name: string;
  preamp: number; // dB: -12 to +12
  gains: number[]; // 10 bands: -12 to +12
}

export interface PlaybackEQ {
  enabled: boolean;
  preamp: number;
  bands: PlaybackEQBand[];
  currentPreset: string;
  customPresets: Record<string, EQPreset>;
}

export const EQ_FREQUENCIES: readonly number[] = [
  31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;

export const DEFAULT_EQ_PRESETS: Record<string, EQPreset> = {
  "Flat": {
    name: "Flat",
    preamp: 0,
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  "Bass Boost": {
    name: "Bass Boost",
    preamp: -3,
    gains: [5, 4, 3, 1, 0, 0, 0, 0, 0, 0],
  },
  "Treble Boost": {
    name: "Treble Boost",
    preamp: -3,
    gains: [0, 0, 0, 0, 0, 1, 2, 3, 4, 5],
  },
  "Vocal": {
    name: "Vocal",
    preamp: -2,
    gains: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
  },
  "Rock": {
    name: "Rock",
    preamp: -3,
    gains: [4, 3, 1, 0, -1, 0, 1, 2, 3, 4],
  },
  "Pop": {
    name: "Pop",
    preamp: -2,
    gains: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  },
  "Classical": {
    name: "Classical",
    preamp: -2,
    gains: [3, 2, 1, 1, -1, -1, 0, 1, 2, 3],
  },
};

export function clampGain(gain: number): number {
  if (Number.isNaN(gain)) return 0;
  return Math.max(-12, Math.min(12, Math.round(gain * 10) / 10));
}

export function createDefaultEQ(): PlaybackEQ {
  return {
    enabled: true,
    preamp: 0,
    bands: EQ_FREQUENCIES.map((freq) => ({
      frequency: freq,
      gain: 0,
    })),
    currentPreset: "Flat",
    customPresets: {},
  };
}
