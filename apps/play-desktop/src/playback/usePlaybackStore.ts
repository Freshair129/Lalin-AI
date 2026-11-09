// @req FR-16.1 — Playback from Library/Workspace
// @req FR-16.2 — Transport controls
// @req FR-16.3 — Now Playing state
// @req FR-16.4 — Queue management
// @req FR-16.5 — Repeat and Shuffle
// @req FR-16.6 — Play / Play Next / Add to queue
// @req FR-16.7 — Non-destructive playback
// @req FR-16.8 — Actionable error reporting
// @req FR-16.11 — Player survives route changes
// @req FR-16.12 — Playback session persistence
// @req FR-16.13 — Playback speed
// @req FR-16.14 — Keyboard shortcuts
// @req FR-16W.1 — Hardware media keys
// @req FR-16W.2 — Windows SMTC metadata integration
// @req FR-16W.3 — Command contract routing
// @req FR-16W.4 — Output device selection
// @req FR-16W.5 — Output device fallback/loss handling
// @req FR-16W.6 — Background playback
// @req FR-17.1 — Integrated EQ surface
// @req FR-17.2 — 10-band EQ
// @req FR-17.3 — Band gain clamping
// @req FR-17.4 — Preamp gain
// @req FR-17.5 — EQ Bypass toggle
// @req FR-17.6 — Factory presets
// @req FR-17.7 — User custom presets
// @req FR-17.8 — Persistent EQ state
// @req FR-17.9 — Clipping protection limiter
// @req FR-17.10 — Real spectrum analyser
// @req FR-17.11 — Real-time EQ parameter updates
// @req FR-17.12 — Isolation from mastering parameters
// @req FR-20.2, FR-20.3, FR-20.4 — Single-owner media/master mixer state and persistence
// @req FR-21.3, FR-21.4 — Spatial-mode state and safe fallback reporting
// @req PLAY-14 — Track successful audible listens once per playback session.
// @req PLAY-22, PLAY-25, PLAY-26, PLAY-27 — Stable queue entries and transition coordination

import { create } from "zustand";
import {
  type MediaItem,
  type NowPlaying,
  type PlaybackQueue,
  type PlaybackRepeatMode,
  type PlaybackEQ,
  type PlaybackMixer,
  type SpatialMode,
  type PlaybackTransitionSettings,
  type ExperimentalSettings,
  type SmartMedleyPairDecision,
  type SmartMedleyPlaybackStatus,
  type SmartMedleyUserCueOverride,
  DEFAULT_EQ_PRESETS,
  createDefaultEQ,
  createDefaultExperimentalSettings,
  createIdleSmartMedleyStatus,
  createDefaultMixer,
  createDefaultTransitionSettings,
  clampGain,
  EQ_FREQUENCIES,
} from "../contracts";
import { PlaybackAudioEngine, type AudioOutputDevice } from "./audioEngine";
import {
  analyzeSmartMedleyPair,
  isVideoItem,
  mediaItem,
  resolveMedia,
  type LocalTrack,
} from "../native";

export const STORAGE_QUEUE_KEY = "lalin-play:v1:queue";
export const STORAGE_EQ_KEY = "lalin-play:v1:eq";
export const STORAGE_MIXER_KEY = "lalin-play:v1:mixer";
export const STORAGE_TRANSITION_SETTINGS_KEY = "lalin-play:v1:transition";
export const STORAGE_EXPERIMENTAL_SETTINGS_KEY = "lalin-play:v1:experimental";

function createQueueEntryId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {}
  return `queue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function ensureQueueEntryIds(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  return items.map((item) => {
    let queueEntryId = item.queueEntryId;
    if (!queueEntryId || seen.has(queueEntryId)) queueEntryId = createQueueEntryId();
    seen.add(queueEntryId);
    return queueEntryId === item.queueEntryId ? item : { ...item, queueEntryId };
  });
}

function withUniqueQueueEntryId(item: MediaItem, items: MediaItem[]): MediaItem {
  const ids = new Set(items.map((entry) => entry.queueEntryId).filter((id): id is string => !!id));
  return item.queueEntryId && !ids.has(item.queueEntryId)
    ? item
    : { ...item, queueEntryId: createQueueEntryId() };
}

function nextQueueRevision(queue: PlaybackQueue): number {
  return (Number.isSafeInteger(queue.revision) && (queue.revision ?? 0) >= 0 ? queue.revision! : 0) + 1;
}

export function loadPersistedExperimentalSettings(): ExperimentalSettings {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_EXPERIMENTAL_SETTINGS_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      return { smartMedley: parsed.smartMedley === true };
    }
  } catch {}
  return createDefaultExperimentalSettings();
}

function persistExperimentalSettings(settings: ExperimentalSettings): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_EXPERIMENTAL_SETTINGS_KEY, JSON.stringify(settings));
    }
  } catch {}
}

export function loadPersistedTransitionSettings(
  experimental = loadPersistedExperimentalSettings(),
): PlaybackTransitionSettings {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_TRANSITION_SETTINGS_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      const durationSeconds = typeof parsed.durationSeconds === "number" && Number.isFinite(parsed.durationSeconds)
        ? Math.max(2, Math.min(12, Math.round(parsed.durationSeconds)))
        : 5;
      const mode = parsed.mode === "smart"
        ? experimental.smartMedley ? "smart" : "smooth"
        : parsed.mode === "smooth" || parsed.mode === "manual" || parsed.mode === "medley"
          ? parsed.mode
          : "off";
      return { mode, durationSeconds };
    }
  } catch {}
  return createDefaultTransitionSettings();
}

function persistTransitionSettings(settings: PlaybackTransitionSettings): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_TRANSITION_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

export function loadPersistedMixer(): PlaybackMixer {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_MIXER_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        mediaGain: typeof parsed.mediaGain === "number" && Number.isFinite(parsed.mediaGain)
          ? Math.max(0, Math.min(1.5, parsed.mediaGain)) : 1,
        mediaMuted: Boolean(parsed.mediaMuted),
        spatialMode: parsed.spatialMode === "virtual-7.1" ? "virtual-7.1" : "stereo",
      };
    }
  } catch {}
  return createDefaultMixer();
}

function persistMixer(mixer: PlaybackMixer) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_MIXER_KEY, JSON.stringify(mixer));
  } catch {}
}

export function loadPersistedQueue(): PlaybackQueue {
  try {
    if (localStorage.getItem("lalin-play:v1:resume") !== "true") {
      return { items: [], currentIndex: -1, repeatMode: "off", shuffle: false, revision: 0 };
    }
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_QUEUE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.items)) {
        const validItems: MediaItem[] = ensureQueueEntryIds(parsed.items.filter(
          (it: any) => it && typeof it.id === "string" && typeof it.url === "string"
        ));
        let idx = typeof parsed.currentIndex === "number" ? parsed.currentIndex : -1;
        if (validItems.length === 0 || idx < 0 || idx >= validItems.length) {
          idx = -1;
        }
        return {
          items: validItems,
          currentIndex: idx,
          repeatMode: parsed.repeatMode === "one" || parsed.repeatMode === "all" ? parsed.repeatMode : "off",
          shuffle: Boolean(parsed.shuffle),
          revision: Number.isSafeInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0,
        };
      }
    }
  } catch {}
  return {
    items: [],
    currentIndex: -1,
    repeatMode: "off",
    shuffle: false,
    revision: 0,
  };
}

export function loadPersistedEQ(): PlaybackEQ {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_EQ_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.bands) && parsed.bands.length === EQ_FREQUENCIES.length) {
        const validBands = parsed.bands.every(
          (b: any) => typeof b === "object" && b !== null && typeof b.frequency === "number" && typeof b.gain === "number"
        );
        if (validBands) {
          return {
            enabled: Boolean(parsed.enabled),
            preamp: typeof parsed.preamp === "number" ? clampGain(parsed.preamp) : 0,
            bands: parsed.bands.map((b: any, idx: number) => ({
              frequency: EQ_FREQUENCIES[idx],
              gain: clampGain(b.gain),
            })),
            currentPreset: typeof parsed.currentPreset === "string" ? parsed.currentPreset : "Flat",
            customPresets: typeof parsed.customPresets === "object" && parsed.customPresets !== null ? parsed.customPresets : {},
          };
        }
      }
    }
  } catch {}
  return createDefaultEQ();
}

export function persistQueue(queue: PlaybackQueue) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch {}
}

export function persistEQ(eq: PlaybackEQ) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_EQ_KEY, JSON.stringify(eq));
    }
  } catch {}
}

export interface PlaybackStoreState {
  queue: PlaybackQueue;
  nowPlaying: NowPlaying;
  playSession: number;
  eq: PlaybackEQ;
  mixer: PlaybackMixer;
  experimental: ExperimentalSettings;
  smartMedleyStatus: SmartMedleyPlaybackStatus;
  spatialNotice: "fallback-stereo" | null;
  isOpen: boolean;
  availableOutputDevices: AudioOutputDevice[];

  // Actions
  setOpen: (open: boolean) => void;
  play: (item: MediaItem) => Promise<void>;
  applyRelinkedTrack: (track: LocalTrack) => void;
  playNext: (item: MediaItem) => void;
  addToQueue: (item: MediaItem) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  playAtIndex: (index: number) => Promise<void>;
  replaceFromMigration: (queue: PlaybackQueue, eq: PlaybackEQ) => void;

  togglePlay: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (timeSec: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (r: number) => void;
  setRepeatMode: (mode: PlaybackRepeatMode) => void;
  toggleShuffle: () => void;
  refreshOutputDevices: () => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<boolean>;
  transitionSettings: PlaybackTransitionSettings;
  isTransitioning: boolean;
  crossfader: number;
  transitionTargetQueueEntryId: string | null;
  setTransitionSettings: (settings: PlaybackTransitionSettings) => void;
  setExperimentalSmartMedley: (enabled: boolean) => void;
  prepareNextDeck: (targetIndex?: number) => Promise<void>;
  setCrossfader: (value: number) => void;
  setCuePoints: (index: number, cueInSeconds: number | undefined, cueOutSeconds: number | undefined) => void;

  // EQ Actions
  setBandGain: (index: number, db: number) => void;
  setPreamp: (db: number) => void;
  toggleEQBypass: () => void;
  selectPreset: (name: string) => void;
  saveCustomPreset: (name: string) => void;
  deleteCustomPreset: (name: string) => void;
  resetEQ: () => void;
  setMediaGain: (gain: number) => void;
  toggleMediaMute: () => void;
  setSpatialMode: (mode: SpatialMode) => boolean;
}

const initialQueue = loadPersistedQueue();
const initialEQ = loadPersistedEQ();
const initialMixer = loadPersistedMixer();
const initialExperimentalSettings = loadPersistedExperimentalSettings();
const initialTransitionSettings = loadPersistedTransitionSettings(initialExperimentalSettings);
const engine = PlaybackAudioEngine.getInstance();
let loadGeneration = 0;
let relinkedCurrentNeedsLoad = false;
let smoothTransitionGeneration = 0;
let smoothTransitionTarget: { token: number; outgoingEntryId: string; incomingEntryId: string; key: string } | null = null;
let blockedTransitionKey: string | null = null;
let shuffleTargetCache: { key: string; index: number } | null = null;
let smartMedleyRequestInFlight: { key: string } | null = null;
let smartMedleyDesiredKey: string | null = null;

function cancelPlannedTransition(): void {
  smoothTransitionGeneration++;
  smoothTransitionTarget = null;
  blockedTransitionKey = null;
  shuffleTargetCache = null;
  engine.cancelTransition();
  usePlaybackStore.setState({ isTransitioning: false, crossfader: 0, transitionTargetQueueEntryId: null });
}

function nextSmoothQueueIndex(queue: PlaybackQueue): number | null {
  if (queue.repeatMode === "one" || queue.items.length < 2) return null;
  if (queue.shuffle) {
    const key = `${queue.items[queue.currentIndex]?.queueEntryId ?? "none"}:${queue.revision ?? 0}`;
    if (shuffleTargetCache?.key === key) return shuffleTargetCache.index;
    const candidates = queue.items.map((_, index) => index).filter((index) => index !== queue.currentIndex);
    const index = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    shuffleTargetCache = index === null ? null : { key, index };
    return index;
  }
  const nextIndex = queue.currentIndex + 1;
  if (nextIndex < queue.items.length) return nextIndex;
  return queue.repeatMode === "all" ? 0 : null;
}

interface SmartMedleyPairContext {
  key: string;
  current: MediaItem;
  next: MediaItem;
  currentUserCues: SmartMedleyUserCueOverride;
  nextUserCues: SmartMedleyUserCueOverride;
}

function userCueOverride(item: MediaItem): SmartMedleyUserCueOverride {
  return {
    cueInSeconds: item.cueInSeconds,
    cueOutSeconds: item.cueOutSeconds,
  };
}

function smartMedleyPairContext(state: PlaybackStoreState): SmartMedleyPairContext | null {
  const current = state.queue.items[state.queue.currentIndex];
  const nextIndex = nextSmoothQueueIndex(state.queue);
  const next = nextIndex === null ? undefined : state.queue.items[nextIndex];
  if (!current?.queueEntryId || !next?.queueEntryId) return null;
  const currentUserCues = userCueOverride(current);
  const nextUserCues = userCueOverride(next);
  const cueKey = JSON.stringify([
    currentUserCues.cueInSeconds ?? null,
    currentUserCues.cueOutSeconds ?? null,
    nextUserCues.cueInSeconds ?? null,
    nextUserCues.cueOutSeconds ?? null,
  ]);
  return {
    key: `${current.queueEntryId}:${next.queueEntryId}:${state.queue.revision ?? 0}:${cueKey}`,
    current,
    next,
    currentUserCues,
    nextUserCues,
  };
}

function setSmartMedleyStatus(status: SmartMedleyPlaybackStatus): void {
  const current = usePlaybackStore.getState().smartMedleyStatus;
  if (
    current.phase === status.phase &&
    current.key === status.key &&
    current.reason === status.reason &&
    current.decision === status.decision &&
    current.currentEntryId === status.currentEntryId &&
    current.nextEntryId === status.nextEntryId
  ) return;
  usePlaybackStore.setState({ smartMedleyStatus: status });
}

function scheduleSmartMedleyAnalysis(state: PlaybackStoreState): void {
  if (state.transitionSettings.mode !== "smart" || !state.experimental.smartMedley) {
    smartMedleyDesiredKey = null;
    if (state.smartMedleyStatus.phase !== "idle" || state.smartMedleyStatus.key !== null) {
      setSmartMedleyStatus(createIdleSmartMedleyStatus());
    }
    return;
  }

  const pair = smartMedleyPairContext(state);
  if (!pair) {
    smartMedleyDesiredKey = null;
    setSmartMedleyStatus({ phase: "fallback", key: null, reason: "next-track-unavailable" });
    return;
  }

  smartMedleyDesiredKey = pair.key;
  const currentEntryId = pair.current.queueEntryId!;
  const nextEntryId = pair.next.queueEntryId!;
  const supported =
    !isVideoItem(pair.current) &&
    !isVideoItem(pair.next) &&
    pair.current.sourceKind === "custom" &&
    !!pair.current.sourcePath &&
    pair.next.sourceKind === "custom" &&
    !!pair.next.sourcePath;
  if (!supported) {
    setSmartMedleyStatus({
      phase: "fallback",
      key: pair.key,
      currentEntryId,
      nextEntryId,
      reason: "unsupported-media",
    });
    return;
  }

  const previous = state.smartMedleyStatus;
  if (previous.key === pair.key && (previous.phase === "match" || previous.phase === "fallback")) return;

  if (smartMedleyRequestInFlight) {
    if (previous.key !== pair.key || previous.phase !== "analyzing") {
      setSmartMedleyStatus({ phase: "analyzing", key: pair.key, currentEntryId, nextEntryId });
    }
    return;
  }

  if (state.nowPlaying.state !== "playing") {
    setSmartMedleyStatus({ phase: "idle", key: pair.key, currentEntryId, nextEntryId });
    return;
  }

  smartMedleyRequestInFlight = { key: pair.key };
  setSmartMedleyStatus({ phase: "analyzing", key: pair.key, currentEntryId, nextEntryId });
  void analyzeSmartMedleyPair(
    pair.current.id,
    pair.next.id,
    true,
    pair.currentUserCues,
    pair.nextUserCues,
  ).then((decision: SmartMedleyPairDecision) => {
    const latest = usePlaybackStore.getState();
    const latestPair = smartMedleyPairContext(latest);
    if (
      smartMedleyDesiredKey !== pair.key ||
      latest.transitionSettings.mode !== "smart" ||
      !latest.experimental.smartMedley ||
      latestPair?.key !== pair.key
    ) return;
    if (
      decision.eligible &&
      decision.mode === "smart-medley" &&
      decision.currentTrackId === pair.current.id &&
      decision.nextTrackId === pair.next.id
    ) {
      setSmartMedleyStatus({
        phase: "match",
        key: pair.key,
        currentEntryId,
        nextEntryId,
        decision,
      });
    } else {
      setSmartMedleyStatus({
        phase: "fallback",
        key: pair.key,
        currentEntryId,
        nextEntryId,
        reason: decision.reason || "analysis-unavailable",
        decision,
      });
    }
  }).catch(() => {
    const latest = usePlaybackStore.getState();
    if (smartMedleyDesiredKey !== pair.key || smartMedleyPairContext(latest)?.key !== pair.key) return;
    setSmartMedleyStatus({
      phase: "fallback",
      key: pair.key,
      currentEntryId,
      nextEntryId,
      reason: "analysis-unavailable",
    });
  }).finally(() => {
    if (smartMedleyRequestInFlight?.key === pair.key) smartMedleyRequestInFlight = null;
    scheduleSmartMedleyAnalysis(usePlaybackStore.getState());
  });
}

function maybeStartSmoothTransition(time: number, state: PlaybackStoreState): void {
  const current = state.queue.items[state.queue.currentIndex];
  const nextIndex = nextSmoothQueueIndex(state.queue);
  if (
    (state.transitionSettings.mode !== "smooth" && state.transitionSettings.mode !== "medley" && state.transitionSettings.mode !== "smart") ||
    state.nowPlaying.state !== "playing" ||
    !current?.queueEntryId ||
    isVideoItem(current) ||
    nextIndex === null ||
    smoothTransitionTarget
  ) return;
  const next = state.queue.items[nextIndex];
  if (!next?.queueEntryId || isVideoItem(next)) return;
  const smartPair = state.transitionSettings.mode === "smart" ? smartMedleyPairContext(state) : null;
  let smartDecision = smartPair &&
    state.smartMedleyStatus.key === smartPair.key &&
    state.smartMedleyStatus.phase === "match" &&
    state.smartMedleyStatus.decision?.eligible === true &&
    state.smartMedleyStatus.decision.mode === "smart-medley" &&
    state.smartMedleyStatus.decision.currentTrackId === current.id &&
    state.smartMedleyStatus.decision.nextTrackId === next.id
      ? state.smartMedleyStatus.decision
      : null;
  const attemptKey = state.transitionSettings.mode === "smart"
    ? smartPair?.key ?? `${current.queueEntryId}:${next.queueEntryId}:smart:${state.queue.revision ?? 0}`
    : `${current.queueEntryId}:${next.queueEntryId}:${state.transitionSettings.mode}:${state.queue.revision ?? 0}`;
  if (blockedTransitionKey === attemptKey) return;
  const duration = engine.getDuration() || state.nowPlaying.duration;
  const smartCueOut = smartDecision?.currentCueOutSeconds;
  let cueOut = smartDecision && Number.isFinite(smartCueOut) && duration > 0
    ? Math.max(0, Math.min(duration, smartCueOut!))
    : state.transitionSettings.mode === "medley"
      ? Math.min(duration, Number.isFinite(current.cueOutSeconds) ? current.cueOutSeconds! : duration)
      : duration;
  let remaining = cueOut - time;
  if (smartDecision && Number.isFinite(remaining) && remaining < 2) {
    setSmartMedleyStatus({
      phase: "fallback",
      key: smartPair!.key,
      currentEntryId: current.queueEntryId,
      nextEntryId: next.queueEntryId,
      reason: "cue-window-passed",
    });
    smartDecision = null;
    cueOut = duration;
    remaining = cueOut - time;
  }
  if (!Number.isFinite(remaining) || remaining < 2 || remaining > state.transitionSettings.durationSeconds) return;

  const token = ++smoothTransitionGeneration;
  smoothTransitionTarget = {
    token,
    outgoingEntryId: current.queueEntryId,
    incomingEntryId: next.queueEntryId,
    key: attemptKey,
  };
  usePlaybackStore.setState({ transitionTargetQueueEntryId: next.queueEntryId });
  const fadeSeconds = Math.max(2, Math.min(state.transitionSettings.durationSeconds, remaining));
  const nextDuration = Number.isFinite(next.duration) && (next.duration ?? 0) > 0 ? next.duration! : Number.MAX_SAFE_INTEGER;
  const smartCueIn = smartDecision?.nextCueInSeconds;
  const cueIn = smartDecision && Number.isFinite(smartCueIn) ? smartCueIn! : next.cueInSeconds;
  const incomingStartTime = state.transitionSettings.mode === "medley" || smartDecision
    ? Math.max(0, Math.min(Math.max(0, nextDuration - 0.1), (Number.isFinite(cueIn) ? cueIn! : 0)))
    : 0;
  void resolveMedia(next).then((url) => {
    const latest = usePlaybackStore.getState();
    if (
      token !== smoothTransitionGeneration ||
      (latest.transitionSettings.mode !== "smooth" && latest.transitionSettings.mode !== "medley" && latest.transitionSettings.mode !== "smart") ||
      (state.transitionSettings.mode === "smart" && (!latest.experimental.smartMedley || smartMedleyPairContext(latest)?.key !== smartPair?.key)) ||
      latest.queue.items[latest.queue.currentIndex]?.queueEntryId !== current.queueEntryId ||
      !latest.queue.items.some((item) => item.queueEntryId === next.queueEntryId) ||
      latest.nowPlaying.state !== "playing"
    ) return;
    return engine.crossfadeTo(url, fadeSeconds, incomingStartTime, {
      mediaId: next.id,
      queueEntryId: next.queueEntryId!,
      sessionId: state.playSession + 1,
      duration: next.duration ?? 0,
    }).then((completed) => {
      if (!completed && token === smoothTransitionGeneration) {
        smoothTransitionTarget = null;
        blockedTransitionKey = attemptKey;
        usePlaybackStore.setState({ isTransitioning: false, transitionTargetQueueEntryId: null });
      }
    });
  }).catch(() => {
    if (token === smoothTransitionGeneration) {
      smoothTransitionTarget = null;
      blockedTransitionKey = attemptKey;
      usePlaybackStore.setState({ isTransitioning: false, transitionTargetQueueEntryId: null });
    }
  });
}

async function loadItem(item: MediaItem) {
  const generation = ++loadGeneration;
  try {
    const url = await resolveMedia(item);
    if (generation !== loadGeneration) return;
    await engine.loadAndPlay(url, 0, isVideoItem(item) ? "video" : "audio", {
      mediaId: item.id,
      queueEntryId: item.queueEntryId ?? item.id,
      sessionId: usePlaybackStore.getState().playSession,
      duration: item.duration ?? 0,
    });
  } catch (error) {
    if (generation === loadGeneration) throw error;
  }
}

// Apply initial EQ to engine (stored in engine state and applied on graph creation)
engine.applyEQ(initialEQ);
engine.applyMixer(initialMixer);
try {
  if (typeof localStorage !== "undefined" && localStorage.getItem("lalin-play:v1:resume") === "true" && initialQueue.items.length > 0) {
    persistQueue(initialQueue);
  }
} catch {}
persistTransitionSettings(initialTransitionSettings);
persistExperimentalSettings(initialExperimentalSettings);

export const usePlaybackStore = create<PlaybackStoreState>((set, get) => {
  // Attach audio engine events
  engine.on("play", () => {
    set((state) => ({
      nowPlaying: { ...state.nowPlaying, state: "playing", error: undefined },
    }));
  });

  engine.on("pause", () => {
    set((state) => ({
      nowPlaying: { ...state.nowPlaying, state: state.nowPlaying.state === "idle" ? "idle" : "paused" },
    }));
  });

  engine.on("loading", () => {
    set((state) => ({
      nowPlaying: { ...state.nowPlaying, state: "loading" },
    }));
  });

  engine.on("timeupdate", (time: number) => {
    set((state) => ({
      nowPlaying: {
        ...state.nowPlaying,
        currentTime: time,
        duration: engine.getDuration() || state.nowPlaying.duration,
      },
    }));
    maybeStartSmoothTransition(time, get());
  });

  engine.on("durationchange", (duration: number) => {
    set((state) => ({
      nowPlaying: { ...state.nowPlaying, duration },
    }));
  });

  engine.on("error", (errorMsg: string) => {
    set((state) => ({
      nowPlaying: { ...state.nowPlaying, state: "error", error: errorMsg },
    }));
  });

  engine.on("devicechange", () => {
    get().refreshOutputDevices();
  });

  engine.on("devicelost", () => {
    cancelPlannedTransition();
    set((state) => ({
      nowPlaying: {
        ...state.nowPlaying,
        activeOutputDeviceId: "",
      },
    }));
    get().refreshOutputDevices();
  });

  engine.on("spatialfallback", () => {
    const mixer = { ...get().mixer, spatialMode: "stereo" as const };
    persistMixer(mixer);
    set({ mixer, spatialNotice: "fallback-stereo" });
  });

  engine.on("transitionstart", () => set({ isTransitioning: true }));

  engine.on("transitioncancel", () => {
    if (smoothTransitionTarget) blockedTransitionKey = smoothTransitionTarget.key;
    smoothTransitionGeneration++;
    smoothTransitionTarget = null;
    set({ isTransitioning: false, crossfader: 0, transitionTargetQueueEntryId: null });
  });

  engine.on("transitionend", () => {
    const plan = smoothTransitionTarget;
    smoothTransitionTarget = null;
    smoothTransitionGeneration++;
    const { queue } = get();
    const incomingIndex = plan
      ? queue.items.findIndex((item) => item.queueEntryId === plan.incomingEntryId)
      : -1;
    const stillOnOutgoing = plan && queue.items[queue.currentIndex]?.queueEntryId === plan.outgoingEntryId;
    if (plan && stillOnOutgoing && incomingIndex >= 0) {
      const item = queue.items[incomingIndex];
      const nextQueue: PlaybackQueue = {
        ...queue,
        currentIndex: incomingIndex,
        revision: nextQueueRevision(queue),
      };
      persistQueue(nextQueue);
      set((state) => ({
        queue: nextQueue,
        playSession: state.playSession + 1,
        isTransitioning: false,
        crossfader: 0,
        transitionTargetQueueEntryId: null,
        nowPlaying: {
          ...state.nowPlaying,
          item,
          state: "playing",
          currentTime: engine.getCurrentTime(),
          duration: engine.getDuration() || item.duration || 0,
          error: undefined,
        },
      }));
      return;
    }
    set({ isTransitioning: false, crossfader: 0, transitionTargetQueueEntryId: null });
  });

  engine.on("ended", () => {
    cancelPlannedTransition();
    set({ isTransitioning: false });
    const { queue } = get();
    if (queue.repeatMode === "one") {
      set((state) => ({ playSession: state.playSession + 1 }));
      engine.seek(0);
      engine.play().catch(() => {});
      return;
    }

    if (queue.items.length === 0) return;

    if (queue.shuffle) {
      const nextIdx = Math.floor(Math.random() * queue.items.length);
      get().playAtIndex(nextIdx);
      return;
    }

    const nextIndex = queue.currentIndex + 1;
    if (nextIndex < queue.items.length) {
      get().playAtIndex(nextIndex);
    } else if (queue.repeatMode === "all") {
      get().playAtIndex(0);
    } else {
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, state: "idle", currentTime: 0 },
      }));
    }
  });

  return {
    queue: initialQueue,
    nowPlaying: {
      item:
        initialQueue.currentIndex >= 0 && initialQueue.items[initialQueue.currentIndex]
          ? initialQueue.items[initialQueue.currentIndex]
          : null,
      state: "idle",
      currentTime: 0,
      duration: 0,
      volume: 1,
      muted: false,
      playbackRate: 1,
      activeOutputDeviceId: "",
    },
    playSession: 0,
    eq: initialEQ,
    mixer: initialMixer,
    experimental: initialExperimentalSettings,
    smartMedleyStatus: createIdleSmartMedleyStatus(),
    transitionSettings: initialTransitionSettings,
    isTransitioning: false,
    crossfader: 0,
    transitionTargetQueueEntryId: null,
    spatialNotice: null,
    isOpen: false,
    availableOutputDevices: [{ deviceId: "", label: "Default Audio Output" }],

    setOpen: (open: boolean) => set({ isOpen: open }),

    setTransitionSettings: (settings: PlaybackTransitionSettings) => {
      cancelPlannedTransition();
      const nextSettings: PlaybackTransitionSettings = {
        mode: settings.mode === "smart"
          ? get().experimental.smartMedley ? "smart" : "smooth"
          : settings.mode === "smooth" || settings.mode === "manual" || settings.mode === "medley"
            ? settings.mode
            : "off",
        durationSeconds: Number.isFinite(settings.durationSeconds)
          ? Math.max(2, Math.min(12, Math.round(settings.durationSeconds)))
          : 5,
      };
      persistTransitionSettings(nextSettings);
      set({ transitionSettings: nextSettings, isTransitioning: false });
    },

    setExperimentalSmartMedley: (enabled: boolean) => {
      cancelPlannedTransition();
      const experimental = { smartMedley: enabled };
      const current = get().transitionSettings;
      const transitionSettings = !enabled && current.mode === "smart"
        ? { ...current, mode: "smooth" as const }
        : current;
      persistExperimentalSettings(experimental);
      if (transitionSettings !== current) persistTransitionSettings(transitionSettings);
      set({ experimental, transitionSettings, isTransitioning: false });
    },

    prepareNextDeck: async (targetIndex?: number) => {
      const { queue, transitionSettings, nowPlaying } = get();
      if (transitionSettings.mode !== "manual" || nowPlaying.state !== "playing" || smoothTransitionTarget) return;
      const current = queue.items[queue.currentIndex];
      const nextIndex = Number.isInteger(targetIndex) && targetIndex! >= 0 && targetIndex! < queue.items.length && targetIndex !== queue.currentIndex
        ? targetIndex!
        : nextSmoothQueueIndex(queue);
      if (!current?.queueEntryId || isVideoItem(current) || nextIndex === null) return;
      const next = queue.items[nextIndex];
      if (!next?.queueEntryId || isVideoItem(next)) return;
      const token = ++smoothTransitionGeneration;
      const attemptKey = `${current.queueEntryId}:${next.queueEntryId}:manual:${queue.revision ?? 0}`;
      smoothTransitionTarget = { token, outgoingEntryId: current.queueEntryId, incomingEntryId: next.queueEntryId, key: attemptKey };
      set({ crossfader: 0, transitionTargetQueueEntryId: next.queueEntryId });
      try {
        const url = await resolveMedia(next);
        const latest = get();
        if (
          token !== smoothTransitionGeneration ||
          latest.transitionSettings.mode !== "manual" ||
          latest.queue.items[latest.queue.currentIndex]?.queueEntryId !== current.queueEntryId ||
          !latest.queue.items.some((item) => item.queueEntryId === next.queueEntryId) ||
          latest.nowPlaying.state !== "playing"
        ) return;
        const nextDuration = Number.isFinite(next.duration) && (next.duration ?? 0) > 0 ? next.duration! : Number.MAX_SAFE_INTEGER;
        const cueIn = Math.max(0, Math.min(Math.max(0, nextDuration - 0.1), (Number.isFinite(next.cueInSeconds) ? next.cueInSeconds! : 0)));
        const ready = await engine.prepareManualDeck(url, cueIn, {
          mediaId: next.id,
          queueEntryId: next.queueEntryId,
          sessionId: get().playSession + 1,
          duration: next.duration ?? 0,
        });
        if (!ready && token === smoothTransitionGeneration) {
          smoothTransitionTarget = null;
          set({ transitionTargetQueueEntryId: null });
        }
      } catch {
        if (token === smoothTransitionGeneration) {
          smoothTransitionTarget = null;
          set({ transitionTargetQueueEntryId: null });
        }
      }
    },

    setCrossfader: (value: number) => {
      if (get().nowPlaying.state !== "playing") return;
      const crossfader = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
      set({ crossfader });
      engine.setManualCrossfader(crossfader);
    },

    setCuePoints: (index: number, cueInSeconds: number | undefined, cueOutSeconds: number | undefined) => {
      const { queue } = get();
      if (index < 0 || index >= queue.items.length) return;
      cancelPlannedTransition();
      const item = queue.items[index];
      const max = Number.isFinite(item.duration) && (item.duration ?? 0) > 0 ? item.duration! : Number.MAX_SAFE_INTEGER;
      let cueIn = Number.isFinite(cueInSeconds) ? Math.max(0, Math.min(Math.max(0, max - 0.1), cueInSeconds!)) : undefined;
      let cueOut = Number.isFinite(cueOutSeconds) ? Math.max(Math.min(max, 2), Math.min(max, Math.max(0, cueOutSeconds!))) : undefined;
      if (cueIn !== undefined && cueOut !== undefined && cueOut <= cueIn) cueIn = Math.max(0, cueOut - 0.1);
      const items = queue.items.map((entry, entryIndex) => entryIndex === index
        ? { ...entry, cueInSeconds: cueIn, cueOutSeconds: cueOut }
        : entry);
      const nextQueue = { ...queue, items, revision: nextQueueRevision(queue) };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
    },

    play: async (item: MediaItem) => {
      relinkedCurrentNeedsLoad = false;
      cancelPlannedTransition();
      engine.stop();
      const { queue } = get();
      const existingIdx = item.queueEntryId
        ? queue.items.findIndex((entry) => entry.queueEntryId === item.queueEntryId)
        : queue.items.findIndex((entry) => entry.id === item.id || entry.url === item.url);
      let nextQueue: PlaybackQueue;
      let targetIdx: number;
      let queuedItem: MediaItem;

      if (existingIdx !== -1) {
        targetIdx = existingIdx;
        queuedItem = queue.items[targetIdx];
        nextQueue = { ...queue, currentIndex: targetIdx, revision: nextQueueRevision(queue) };
      } else {
        targetIdx = queue.items.length;
        queuedItem = withUniqueQueueEntryId(item, queue.items);
        nextQueue = {
          ...queue,
          items: [...queue.items, queuedItem],
          currentIndex: targetIdx,
          revision: nextQueueRevision(queue),
        };
      }

      persistQueue(nextQueue);
      set({
        queue: nextQueue,
        playSession: get().playSession + 1,
        nowPlaying: {
          ...get().nowPlaying,
          item: queuedItem,
          state: "loading",
          currentTime: 0,
          duration: item.duration ?? 0,
          error: undefined,
        },
      });

      try {
        await loadItem(queuedItem);
      } catch (err: any) {
        set((state) => ({
          nowPlaying: { ...state.nowPlaying, state: "error", error: String(err?.message ?? err) },
        }));
      }
    },

    applyRelinkedTrack: (track: LocalTrack) => {
      const state = get();
      const replacement = mediaItem(track);
      const hasQueueOccurrence = state.queue.items.some((item) => item.id === track.id);
      const queueItems = state.queue.items.map((item) => item.id === track.id
        ? {
            ...item,
            kind: replacement.kind,
            sourcePath: replacement.sourcePath,
            url: replacement.url,
          }
        : item);
      const nextQueue = hasQueueOccurrence
        ? { ...state.queue, items: queueItems, revision: nextQueueRevision(state.queue) }
        : state.queue;
      if (hasQueueOccurrence) {
        cancelPlannedTransition();
      }
      persistQueue(nextQueue);
      const currentItem = state.nowPlaying.item;
      const currentFailed = currentItem?.id === track.id && state.nowPlaying.state === "error";
      if (currentFailed) relinkedCurrentNeedsLoad = true;
      const nextNowPlaying = currentItem?.id === track.id
        ? {
            ...state.nowPlaying,
            item: {
              ...currentItem,
              kind: replacement.kind,
              sourcePath: replacement.sourcePath,
              url: replacement.url,
            },
            ...(currentFailed
              ? { state: "paused" as const, currentTime: 0, error: undefined }
              : {}),
          }
        : state.nowPlaying;
      set({ queue: nextQueue, nowPlaying: nextNowPlaying });
    },

    playNext: (item: MediaItem) => {
      cancelPlannedTransition();
      const { queue } = get();
      const insertAt = queue.currentIndex >= 0 ? queue.currentIndex + 1 : 0;
      const nextItems = [...queue.items];
      nextItems.splice(insertAt, 0, withUniqueQueueEntryId(item, queue.items));
      const nextQueue = { ...queue, items: nextItems, revision: nextQueueRevision(queue) };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
    },

    /**
     * Adds an item to queue without modifying currentIndex or nowPlaying if playback hasn't started.
     * When queue has items but nothing is playing, currentIndex remains -1 and nowPlaying.item remains null.
     */
    addToQueue: (item: MediaItem) => {
      cancelPlannedTransition();
      const { queue } = get();
      const nextQueue = {
        ...queue,
        items: [...queue.items, withUniqueQueueEntryId(item, queue.items)],
        revision: nextQueueRevision(queue),
      };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
    },

    /**
     * Removes an item from the queue while maintaining the invariant:
     * If currentIndex >= 0 and queue has items, queue.items[currentIndex].id === nowPlaying.item.id
     */
    removeFromQueue: (index: number) => {
      const { queue, nowPlaying } = get();
      if (index < 0 || index >= queue.items.length) return;
      cancelPlannedTransition();

      const nextItems = queue.items.filter((_, i) => i !== index);

      // Case 1: Removed item was before the currently playing item
      if (index < queue.currentIndex) {
        const nextIndex = queue.currentIndex - 1;
        const nextQueue = { ...queue, items: nextItems, currentIndex: nextIndex, revision: nextQueueRevision(queue) };
        persistQueue(nextQueue);
        set({ queue: nextQueue });
        return;
      }

      // Case 2: Removed item was after the currently playing item
      if (index > queue.currentIndex) {
        const nextQueue = { ...queue, items: nextItems, revision: nextQueueRevision(queue) };
        persistQueue(nextQueue);
        set({ queue: nextQueue });
        return;
      }

      // Case 3: Removed item is the currently playing item (index === queue.currentIndex)
      if (nextItems.length === 0) {
        // Queue is completely empty now
        loadGeneration++;
        engine.stop();
        const nextQueue: PlaybackQueue = { ...queue, items: [], currentIndex: -1, revision: nextQueueRevision(queue) };
        persistQueue(nextQueue);
        set({
          queue: nextQueue,
          nowPlaying: {
            ...nowPlaying,
            item: null,
            state: "idle",
            currentTime: 0,
            duration: 0,
            error: undefined,
          },
        });
        return;
      }

      // Clamp nextIndex if removing the last item
      let nextIndex = queue.currentIndex;
      if (nextIndex >= nextItems.length) {
        nextIndex = nextItems.length - 1;
      }
      const nextItem = nextItems[nextIndex];
      const nextQueue = { ...queue, items: nextItems, currentIndex: nextIndex, revision: nextQueueRevision(queue) };
      persistQueue(nextQueue);

      const wasActive = nowPlaying.state === "playing" || nowPlaying.state === "loading";
      engine.stop();
      set({
        queue: nextQueue,
        ...(wasActive ? { playSession: get().playSession + 1 } : {}),
        nowPlaying: {
          ...nowPlaying,
          item: nextItem,
          currentTime: 0,
          duration: nextItem.duration ?? 0,
          state: wasActive ? "loading" : "idle",
          error: undefined,
        },
      });

      if (wasActive) {
        loadItem(nextItem).catch((err: any) => {
          set((state) => ({
            nowPlaying: { ...state.nowPlaying, state: "error", error: String(err?.message ?? err) },
          }));
        });
      } else {
        loadGeneration++;
        engine.stop();
      }
    },

    reorderQueue: (fromIndex: number, toIndex: number) => {
      const { queue } = get();
      if (
        fromIndex < 0 || fromIndex >= queue.items.length ||
        toIndex < 0 || toIndex >= queue.items.length
      ) return;
      cancelPlannedTransition();

      const nextItems = [...queue.items];
      const [moved] = nextItems.splice(fromIndex, 1);
      nextItems.splice(toIndex, 0, moved);

      let nextCurrentIndex = queue.currentIndex;
      if (queue.currentIndex === fromIndex) {
        nextCurrentIndex = toIndex;
      } else if (fromIndex < queue.currentIndex && toIndex >= queue.currentIndex) {
        nextCurrentIndex--;
      } else if (fromIndex > queue.currentIndex && toIndex <= queue.currentIndex) {
        nextCurrentIndex++;
      }

      const nextQueue = { ...queue, items: nextItems, currentIndex: nextCurrentIndex, revision: nextQueueRevision(queue) };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
    },

    clearQueue: () => {
      cancelPlannedTransition();
      loadGeneration++;
      engine.stop();
      const nextQueue: PlaybackQueue = {
        items: [],
        currentIndex: -1,
        repeatMode: "off",
        shuffle: false,
        revision: nextQueueRevision(get().queue),
      };
      persistQueue(nextQueue);
      set({
        queue: nextQueue,
        nowPlaying: {
          ...get().nowPlaying,
          item: null,
          state: "idle",
          currentTime: 0,
          duration: 0,
          error: undefined,
        },
      });
    },

    playAtIndex: async (index: number) => {
      relinkedCurrentNeedsLoad = false;
      cancelPlannedTransition();
      const { queue } = get();
      if (index < 0 || index >= queue.items.length) return;
      engine.stop();
      const item = queue.items[index];
      const nextQueue = { ...queue, currentIndex: index, revision: nextQueueRevision(queue) };
      persistQueue(nextQueue);

      set({
        queue: nextQueue,
        playSession: get().playSession + 1,
        nowPlaying: {
          ...get().nowPlaying,
          item,
          state: "loading",
          currentTime: 0,
          duration: item.duration ?? 0,
          error: undefined,
        },
      });

      try {
        await loadItem(item);
      } catch (err: any) {
        set((state) => ({
          nowPlaying: { ...state.nowPlaying, state: "error", error: String(err?.message ?? err) },
        }));
      }
    },

    togglePlay: async () => {
      const { nowPlaying, queue } = get();
      if (nowPlaying.state === "playing") {
        engine.pause();
      } else if (nowPlaying.item && nowPlaying.state === "paused") {
        if (relinkedCurrentNeedsLoad) {
          relinkedCurrentNeedsLoad = false;
          const currentIndex = queue.items.findIndex((item) =>
            nowPlaying.item?.queueEntryId
              ? item.queueEntryId === nowPlaying.item.queueEntryId
              : item.id === nowPlaying.item?.id,
          );
          if (currentIndex >= 0) await get().playAtIndex(currentIndex);
          else await get().play(nowPlaying.item);
        } else {
          await engine.play();
        }
      } else if (queue.items.length > 0) {
        const targetIdx = queue.currentIndex >= 0 ? queue.currentIndex : 0;
        await get().playAtIndex(targetIdx);
      }
    },

    pause: () => {
      loadGeneration++;
      if (!engine.isTransitioning()) cancelPlannedTransition();
      const loading = get().nowPlaying.state === "loading";
      engine.pause();
      if (loading) set(state => ({ nowPlaying: { ...state.nowPlaying, state: "idle" } }));
    },

    stop: () => {
      relinkedCurrentNeedsLoad = false;
      cancelPlannedTransition();
      loadGeneration++;
      engine.stop();
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, state: "idle", currentTime: 0 },
      }));
    },

    replaceFromMigration: (queue: PlaybackQueue, eq: PlaybackEQ) => {
      cancelPlannedTransition();
      loadGeneration++;
      engine.stop();
      engine.applyEQ(eq);
      const items = ensureQueueEntryIds(queue.items);
      const nextQueue = { ...queue, items, revision: nextQueueRevision(get().queue) };
      persistQueue(nextQueue);
      set((state) => ({
        queue: nextQueue,
        eq,
        nowPlaying: {
          ...state.nowPlaying,
          item: nextQueue.items[nextQueue.currentIndex] ?? null,
          state: "idle",
          currentTime: 0,
          duration: nextQueue.items[nextQueue.currentIndex]?.duration ?? 0,
          error: undefined,
        },
      }));
    },

    next: async () => {
      const { queue } = get();
      if (queue.items.length === 0) return;
      if (queue.shuffle) {
        const nextIdx = Math.floor(Math.random() * queue.items.length);
        await get().playAtIndex(nextIdx);
        return;
      }
      const nextIndex = queue.currentIndex + 1;
      if (nextIndex < queue.items.length) {
        await get().playAtIndex(nextIndex);
      } else if (queue.repeatMode === "all") {
        await get().playAtIndex(0);
      }
    },

    previous: async () => {
      const { queue, nowPlaying } = get();
      if (queue.items.length === 0) return;
      // If played more than 3 seconds, restart current track
      if (nowPlaying.currentTime > 3) {
        set((state) => ({ playSession: state.playSession + 1 }));
        engine.seek(0);
        return;
      }
      const prevIndex = queue.currentIndex - 1;
      if (prevIndex >= 0) {
        await get().playAtIndex(prevIndex);
      } else if (queue.repeatMode === "all") {
        await get().playAtIndex(queue.items.length - 1);
      }
    },

    seek: (timeSec: number) => {
      cancelPlannedTransition();
      const dur = get().nowPlaying.duration || 0;
      const clamped = Math.max(0, dur > 0 ? Math.min(dur, timeSec) : Math.max(0, timeSec));
      engine.seek(clamped);
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, currentTime: clamped },
      }));
    },

    setVolume: (v: number) => {
      const vol = Math.max(0, Math.min(1, v));
      engine.setVolume(vol); // adjusting volume automatically un-mutes
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, volume: vol, muted: false },
      }));
    },

    toggleMute: () => {
      const { nowPlaying } = get();
      const nextMuted = !nowPlaying.muted;
      engine.setMuted(nextMuted);
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, muted: nextMuted },
      }));
    },

    setPlaybackRate: (r: number) => {
      const rate = Math.max(0.5, Math.min(2.0, r));
      engine.setPlaybackRate(rate);
      set((state) => ({
        nowPlaying: { ...state.nowPlaying, playbackRate: rate },
      }));
    },

    setRepeatMode: (mode: PlaybackRepeatMode) => {
      cancelPlannedTransition();
      const { queue } = get();
      const nextQueue = { ...queue, repeatMode: mode, revision: nextQueueRevision(queue) };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
    },

    toggleShuffle: () => {
      cancelPlannedTransition();
      const { queue } = get();
      const nextQueue = { ...queue, shuffle: !queue.shuffle, revision: nextQueueRevision(queue) };
      persistQueue(nextQueue);
      set({ queue: nextQueue });
    },

    refreshOutputDevices: async () => {
      const devices = await engine.getAvailableOutputDevices();
      set({ availableOutputDevices: devices });
    },

    setOutputDevice: async (deviceId: string): Promise<boolean> => {
      const ok = await engine.setOutputDevice(deviceId);
      set((state) => ({
        nowPlaying: {
          ...state.nowPlaying,
          activeOutputDeviceId: ok ? deviceId : "",
        },
      }));
      return ok;
    },

    // ── EQ Operations ──────────────────────────────────────────
    setBandGain: (index: number, db: number) => {
      const { eq } = get();
      const clamped = clampGain(db);
      const nextBands = eq.bands.map((band, i) =>
        i === index ? { ...band, gain: clamped } : band
      );
      const nextEQ: PlaybackEQ = {
        ...eq,
        bands: nextBands,
        currentPreset: "Custom",
      };
      engine.setBandGain(index, clamped);
      persistEQ(nextEQ);
      set({ eq: nextEQ });
    },

    setPreamp: (db: number) => {
      const { eq } = get();
      const clamped = clampGain(db);
      const nextEQ: PlaybackEQ = {
        ...eq,
        preamp: clamped,
        currentPreset: "Custom",
      };
      engine.setPreamp(clamped);
      persistEQ(nextEQ);
      set({ eq: nextEQ });
    },

    toggleEQBypass: () => {
      const { eq } = get();
      const nextEnabled = !eq.enabled;
      const nextEQ: PlaybackEQ = { ...eq, enabled: nextEnabled };
      engine.setBypass(!nextEnabled);
      persistEQ(nextEQ);
      set({ eq: nextEQ });
    },

    selectPreset: (name: string) => {
      const { eq } = get();
      const preset = DEFAULT_EQ_PRESETS[name] || eq.customPresets[name];
      if (!preset) return;

      const nextBands = eq.bands.map((band, i) => ({
        ...band,
        gain: preset.gains[i] ?? 0,
      }));
      const nextEQ: PlaybackEQ = {
        ...eq,
        preamp: preset.preamp,
        bands: nextBands,
        currentPreset: name,
      };

      engine.applyEQ(nextEQ);
      persistEQ(nextEQ);
      set({ eq: nextEQ });
    },

    saveCustomPreset: (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const { eq } = get();
      const nextCustomPresets = {
        ...eq.customPresets,
        [trimmed]: {
          name: trimmed,
          preamp: eq.preamp,
          gains: eq.bands.map((b) => b.gain),
        },
      };
      const nextEQ: PlaybackEQ = {
        ...eq,
        currentPreset: trimmed,
        customPresets: nextCustomPresets,
      };
      persistEQ(nextEQ);
      set({ eq: nextEQ });
    },

    deleteCustomPreset: (name: string) => {
      const { eq } = get();
      const nextCustomPresets = { ...eq.customPresets };
      delete nextCustomPresets[name];
      const nextEQ: PlaybackEQ = {
        ...eq,
        currentPreset: eq.currentPreset === name ? "Flat" : eq.currentPreset,
        customPresets: nextCustomPresets,
      };
      persistEQ(nextEQ);
      set({ eq: nextEQ });
      if (eq.currentPreset === name) {
        get().selectPreset("Flat");
      }
    },

    resetEQ: () => {
      const defaultEQ = createDefaultEQ();
      engine.applyEQ(defaultEQ);
      persistEQ(defaultEQ);
      set({ eq: defaultEQ });
    },

    setMediaGain: (gain: number) => {
      const mixer = { ...get().mixer, mediaGain: Math.max(0, Math.min(1.5, Number.isFinite(gain) ? gain : 1)) };
      engine.setMediaGain(mixer.mediaGain);
      persistMixer(mixer);
      set({ mixer });
    },

    toggleMediaMute: () => {
      const mixer = { ...get().mixer, mediaMuted: !get().mixer.mediaMuted };
      engine.setMediaMuted(mixer.mediaMuted);
      persistMixer(mixer);
      set({ mixer });
    },

    setSpatialMode: (mode: SpatialMode) => {
      const ok = engine.setSpatialMode(mode);
      const nextMode = ok ? mode : "stereo";
      const mixer = { ...get().mixer, spatialMode: nextMode };
      persistMixer(mixer);
      set({ mixer, spatialNotice: ok ? null : "fallback-stereo" });
      return ok;
    },
  };
});

usePlaybackStore.subscribe((state) => scheduleSmartMedleyAnalysis(state));
