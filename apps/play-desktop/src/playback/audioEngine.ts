// @req FR-16.1 — Non-destructive audio playback from Library/Workspace
// @req FR-16.2 — Transport controls: Play, Pause, Seek, Stop, Volume
// @req FR-16.7 — Non-destructive playback
// @req FR-16.8 — Actionable error reporting on unsupported media
// @req FR-16.13 — Playback speed 0.5x–2.0x
// @req FR-16W.4 — Output device selection
// @req FR-16W.5 — Output device fallback/loss handling
// @req FR-17.1 — Playback EQ in playback signal chain only
// @req FR-17.2 — 10-band EQ (31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz)
// @req FR-17.3 — Gain -12dB to +12dB per band
// @req FR-17.4 — Preamp -12dB to +12dB
// @req FR-17.5 — EQ bypass toggle (true bypass for both preamp and filter stages)
// @req FR-17.9 — Clipping protection with safety limiter
// @req FR-17.10 — Real spectrum analysis via AnalyserNode
// @req FR-17.11 — Real-time EQ parameter updates without restarting media
// @req FR-20.2, FR-21.1 — Media-channel gain and direct stereo path
// @req FR-21.2, FR-21.3, FR-21.4 — HRTF virtual speakers, ramped mode switch and Stereo fallback
// @req PLAY-25, PLAY-26 — Audio-only dual-deck crossfade on the shared graph

import { EQ_FREQUENCIES, clampGain, type PlaybackEQ, type PlaybackMixer, type SpatialMode } from "../contracts";
import { sharedAudioContext } from "./audioContext";

export type AudioEngineEvent =
  | "activeelementchange"
  | "transitionstart"
  | "transitionend"
  | "transitioncancel"
  | "play"
  | "pause"
  | "timeupdate"
  | "ended"
  | "error"
  | "audibletimeupdate"
  | "durationchange"
  | "loading"
  | "devicechange"
  | "devicelost"
  | "spatialfallback";

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
}

export interface AudioListenAttribution {
  mediaId: string;
  queueEntryId: string;
  sessionId: number;
  duration: number;
}

export interface AudibleTimeUpdate extends AudioListenAttribution {
  currentTime: number;
  audible: boolean;
}

export class PlaybackAudioEngine {
  private static instance: PlaybackAudioEngine | null = null;

  private audio: HTMLVideoElement | null = null;
  private secondaryAudio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private secondarySourceNode: MediaElementAudioSourceNode | null = null;
  private deckMixNode: GainNode | null = null;
  private deckGainNodes: Array<GainNode | null> = [null, null];
  private deckPlaying: [boolean, boolean] = [false, false];
  private deckAttribution: [AudioListenAttribution | null, AudioListenAttribution | null] = [null, null];
  private activeDeck: 0 | 1 = 0;
  private transition: {
    outgoing: 0 | 1;
    incoming: 0 | 1;
    timer: number;
    finish: (completed: boolean) => void;
    duration: number;
    progress: number;
    scheduledProgress: number;
    startAt: number;
    paused: boolean;
    manual: boolean;
  } | null = null;
  private transitionGeneration = 0;
  private readinessWaiters = new Map<number, () => void>();
  private mediaGainNode: GainNode | null = null;
  private preampNode: GainNode | null = null;
  private filterNodes: BiquadFilterNode[] = [];
  private eqOutputNode: AudioNode | null = null;
  private directPathGainNode: GainNode | null = null;
  private spatialPathGainNode: GainNode | null = null;
  private spatialPanners: PannerNode[] = [];
  private spatialGraphReady = false;
  private limiterNode: DynamicsCompressorNode | null = null;
  private masterGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private isBypassed = false;
  private currentBandGains: number[] = new Array(EQ_FREQUENCIES.length).fill(0);
  private currentPreamp = 0;
  private currentVolume = 1.0;
  private isMuted = false;
  private mediaGain = 1;
  private mediaMuted = false;
  private spatialMode: SpatialMode = "stereo";
  private activeOutputDeviceId = "";
  private listeners: Map<AudioEngineEvent, Set<(data?: any) => void>> = new Map();

  private constructor() {
    // Lazy setup audio element
    if (typeof window !== "undefined") {
      this.initAudioElement();
      this.initDeviceChangeListener();
    }
  }

  public static getInstance(): PlaybackAudioEngine {
    if (!PlaybackAudioEngine.instance) {
      PlaybackAudioEngine.instance = new PlaybackAudioEngine();
    }
    return PlaybackAudioEngine.instance;
  }

  private initAudioElement() {
    if (!this.audio) {
      this.audio = document.createElement("video");
      this.audio.playsInline = true;
      this.audio.controls = false;
      this.audio.setAttribute("aria-label", "Now Playing video");
      this.audio.preload = "auto";
      this.audio.crossOrigin = "anonymous";
      this.audio.volume = 1.0;
      this.bindMediaElement(this.audio, 0);
    }
    if (!this.secondaryAudio) {
      this.secondaryAudio = document.createElement("audio");
      this.secondaryAudio.preload = "auto";
      this.secondaryAudio.crossOrigin = "anonymous";
      this.secondaryAudio.volume = 1.0;
      this.bindMediaElement(this.secondaryAudio, 1);
    }
  }

  private bindMediaElement(element: HTMLMediaElement, deck: 0 | 1): void {
    const isActive = () => this.activeDeck === deck;
    element.addEventListener("playing", () => {
      this.deckPlaying[deck] = true;
      if (isActive()) this.emit("play");
    });
    element.addEventListener("pause", () => {
      this.deckPlaying[deck] = false;
      if (isActive()) this.emit("pause");
    });
    element.addEventListener("ended", () => {
      this.deckPlaying[deck] = false;
      if (!isActive()) {
        if (this.transition?.incoming === deck) this.finishTransition(false);
        return;
      }
      if (this.transition && this.transition.outgoing === deck) {
        this.finishTransition(true);
        return;
      }
      this.emit("ended");
    });
    element.addEventListener("timeupdate", () => {
      if (isActive()) this.emit("timeupdate", element.currentTime);
      const attribution = this.deckAttribution[deck];
      if (!attribution) return;
      const duration = Number.isFinite(element.duration) && element.duration > 0
        ? element.duration
        : attribution.duration;
      this.emit("audibletimeupdate", {
        ...attribution,
        currentTime: element.currentTime,
        duration,
        audible: this.isDeckAudible(deck),
      } satisfies AudibleTimeUpdate);
    });
    element.addEventListener("durationchange", () => { if (isActive()) this.emit("durationchange", Number.isFinite(element.duration) ? element.duration : 0); });
    element.addEventListener("waiting", () => { if (isActive()) this.emit("loading"); });
    element.addEventListener("canplay", () => { if (isActive()) this.emit("timeupdate", element.currentTime); });
    element.addEventListener("error", () => {
      this.deckPlaying[deck] = false;
      if (!isActive()) {
        if (this.transition?.incoming === deck) this.cancelTransition();
        return;
      }
      const err = element.error;
      let msg = "ไม่สามารถเล่นไฟล์สื่อนี้ได้";
      if (err) {
        switch (err.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            msg = "การโหลดไฟล์ถูกยกเลิก";
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            msg = "ข้อผิดพลาดเครือข่ายขณะโหลดไฟล์";
            break;
          case MediaError.MEDIA_ERR_DECODE:
            msg = "ไม่สามารถถอดรหัสสื่อได้ (codec ไม่รองรับหรือไฟล์เสียหาย) กรุณาเลือกไฟล์อื่น";
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            msg = "รูปแบบสื่อนี้ไม่รองรับบนระบบของคุณ กรุณาเลือกไฟล์อื่น";
            break;
        }
      }
      this.emit("error", msg);
    });
  }

  private mediaFor(deck: 0 | 1): HTMLMediaElement | null {
    return deck === 0 ? this.audio : this.secondaryAudio;
  }

  private activeMedia(): HTMLMediaElement | null {
    return this.mediaFor(this.activeDeck);
  }

  private deckAudibleGain(deck: 0 | 1): number {
    const transition = this.transition;
    if (!transition) return deck === this.activeDeck ? 1 : 0;
    let progress = transition.progress;
    if (!transition.manual && !transition.paused && this.ctx) {
      progress = Math.min(
        1,
        Math.max(0, transition.scheduledProgress + (this.ctx.currentTime - transition.startAt) / transition.duration),
      );
    }
    return deck === transition.outgoing
      ? Math.cos(Math.PI * progress / 2)
      : Math.sin(Math.PI * progress / 2);
  }

  private isDeckAudible(deck: 0 | 1): boolean {
    return this.deckPlaying[deck] &&
      !this.isMuted && this.currentVolume > 0 &&
      !this.mediaMuted && this.mediaGain > 0 &&
      this.deckAudibleGain(deck) > 0.001;
  }

  private initDeviceChangeListener(): void {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener("devicechange", async () => {
      this.emit("devicechange");
      // FR-16W.5: Check if the currently active output device disappeared
      if (this.activeOutputDeviceId) {
        const available = await this.getAvailableOutputDevices();
        const stillExists = available.some((d) => d.deviceId === this.activeOutputDeviceId);
        if (!stillExists) {
          const lostId = this.activeOutputDeviceId;
          console.warn(`[audioEngine] Active device ${lostId} disappeared, falling back to default`);
          this.cancelTransition();
          await this.setOutputDevice("");
          this.emit("devicelost", lostId);
        }
      }
    });
  }

  private ensureAudioGraph() {
    if (this.ctx && this.sourceNode && this.secondarySourceNode && this.analyserNode) return;
    this.initAudioElement();
    if (!this.audio || !this.secondaryAudio) return;

    this.ctx = sharedAudioContext();
    if (!this.ctx) return;

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    try { this.sourceNode ??= this.ctx.createMediaElementSource(this.audio); } catch { return; }
    try { this.secondarySourceNode ??= this.ctx.createMediaElementSource(this.secondaryAudio); } catch { return; }

    this.deckMixNode = this.ctx.createGain();
    this.deckGainNodes = [this.ctx.createGain(), this.ctx.createGain()];
    this.deckGainNodes[0]!.gain.value = this.activeDeck === 0 ? 1 : 0;
    this.deckGainNodes[1]!.gain.value = this.activeDeck === 1 ? 1 : 0;
    this.sourceNode.connect(this.deckGainNodes[0]!);
    this.secondarySourceNode.connect(this.deckGainNodes[1]!);
    this.deckGainNodes[0]!.connect(this.deckMixNode);
    this.deckGainNodes[1]!.connect(this.deckMixNode);

    // Media channel fader is independent from the existing EQ and master fader.
    this.mediaGainNode = this.ctx.createGain();
    this.mediaGainNode.gain.value = this.mediaMuted ? 0 : this.mediaGain;

    // 1. Preamp (initialized with current preamp value)
    this.preampNode = this.ctx.createGain();
    const initialPreampLinear = this.isBypassed ? 1.0 : Math.pow(10, this.currentPreamp / 20);
    this.preampNode.gain.value = initialPreampLinear;

    // 2. 10 BiquadFilterNodes (peaking) — initialized with current band gains (Fix Bug #1)
    this.filterNodes = EQ_FREQUENCIES.map((freq, index) => {
      const filter = this.ctx!.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = freq;
      filter.Q.value = 1.4; // standard 1-octave Q
      filter.gain.value = this.isBypassed ? 0 : this.currentBandGains[index];
      return filter;
    });

    // 3. Safety Limiter / Compressor (clipping protection)
    this.limiterNode = this.ctx.createDynamicsCompressor();
    this.limiterNode.threshold.value = -1.0; // -1 dBFS threshold
    this.limiterNode.knee.value = 0.0;
    this.limiterNode.ratio.value = 20.0; // hard limiting
    this.limiterNode.attack.value = 0.002; // 2 ms
    this.limiterNode.release.value = 0.05; // 50 ms

    // 4. Master Gain (Volume: single source of truth)
    this.masterGainNode = this.ctx.createGain();
    this.masterGainNode.gain.value = this.isMuted ? 0 : this.currentVolume;

    // 5. Spectrum Analyser
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.8;

    // Both deck gains sum before the shared MEDIA, EQ, spatial, limiter and MASTER chain.
    let lastNode: AudioNode = this.deckMixNode;
    lastNode.connect(this.mediaGainNode);
    lastNode = this.mediaGainNode;
    lastNode.connect(this.preampNode);
    lastNode = this.preampNode;

    for (const filter of this.filterNodes) {
      lastNode.connect(filter);
      lastNode = filter;
    }

    this.eqOutputNode = lastNode;
    this.directPathGainNode = this.ctx.createGain();
    this.directPathGainNode.gain.value = 1;
    this.spatialPathGainNode = this.ctx.createGain();
    this.spatialPathGainNode.gain.value = 0;
    lastNode.connect(this.directPathGainNode);
    this.directPathGainNode.connect(this.limiterNode);
    this.limiterNode.connect(this.masterGainNode);
    this.masterGainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);

    // Apply current bypass settings to newly assembled graph
    this.setBypass(this.isBypassed);
    this.applySpatialMode(this.spatialMode);
  }

  public async loadAndPlay(
    url: string,
    startTime = 0,
    kind: "audio" | "video" = "audio",
    attribution?: AudioListenAttribution,
  ): Promise<void> {
    this.cancelTransition();
    this.ensureAudioGraph();
    if (!this.audio || !this.secondaryAudio) return;

    if (kind === "video") {
      this.activeDeck = 0;
      this.secondaryAudio.pause();
      this.setDeckGain(0, 1);
      this.setDeckGain(1, 0);
      this.emit("activeelementchange");
    }
    const media = this.activeMedia();
    if (!media) return;
    this.deckPlaying[this.activeDeck] = false;
    this.deckAttribution[this.activeDeck] = attribution ?? null;

    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    this.mediaFor(this.activeDeck === 0 ? 1 : 0)?.pause();
    this.setDeckGain(this.activeDeck, 1);
    this.setDeckGain(this.activeDeck === 0 ? 1 : 0, 0);
    media.src = url;
    media.volume = 1.0;
    if (startTime > 0) {
      media.currentTime = startTime;
    }
    await media.play();
  }

  public async play(): Promise<void> {
    this.ensureAudioGraph();
    const media = this.activeMedia();
    if (!media) return;
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    const transition = this.transition;
    if (transition?.paused) {
      const outgoing = this.mediaFor(transition.outgoing);
      const incoming = this.mediaFor(transition.incoming);
      if (!outgoing || !incoming || !this.ctx) return;
      try {
        await Promise.all([outgoing.play(), incoming.play()]);
        if (transition.manual) transition.paused = false;
        else this.resumeTransition(transition);
      } catch (error) {
        this.finishTransition(false);
        throw error;
      }
      return;
    }
    await media.play();
  }

  public pause(): void {
    if (this.transition) {
      this.pauseTransition(this.transition);
      return;
    }
    const media = this.activeMedia();
    if (!media) return;
    try {
      media.pause();
      this.deckPlaying[this.activeDeck] = false;
    } catch {}
  }

  public stop(): void {
    this.cancelTransition();
    const media = this.activeMedia();
    if (!media) return;
    try {
      media.pause();
      this.mediaFor(this.activeDeck === 0 ? 1 : 0)?.pause();
    } catch {}
    this.deckPlaying = [false, false];
    media.currentTime = 0;
    this.emit("pause");
    this.emit("timeupdate", 0);
  }

  public seek(timeSec: number): void {
    this.cancelTransition();
    const media = this.activeMedia();
    if (!media) return;
    const dur = media.duration;
    const clamped = Math.max(0, dur && !Number.isNaN(dur) ? Math.min(dur, timeSec) : Math.max(0, timeSec));
    media.currentTime = clamped;
  }

  private waitUntilReady(
    media: HTMLMediaElement,
    timeoutMs = 15_000,
    generation?: number,
  ): Promise<void> {
    if (media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timer);
        media.removeEventListener("canplay", ready);
        media.removeEventListener("error", failed);
        if (generation !== undefined) this.readinessWaiters.delete(generation);
      };
      const ready = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error("Next deck could not decode the selected audio")); };
      const cancelled = () => { cleanup(); reject(new DOMException("Transition cancelled", "AbortError")); };
      const timer = window.setTimeout(() => { cleanup(); reject(new Error("Timed out preparing the next audio deck")); }, timeoutMs);
      if (generation !== undefined) {
        this.readinessWaiters.set(generation, cancelled);
      }
      media.addEventListener("canplay", ready, { once: true });
      media.addEventListener("error", failed, { once: true });
      media.load();
    });
  }

  private setDeckGain(deck: 0 | 1, value: number): void {
    const gain = this.deckGainNodes[deck]?.gain;
    if (!gain || !this.ctx) return;
    const now = this.ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(Math.max(0, Math.min(1, value)), now, 0.008);
  }

  private curve(progress: number): { outgoing: Float32Array; incoming: Float32Array } {
    const outgoing = new Float32Array(65);
    const incoming = new Float32Array(65);
    for (let i = 0; i < outgoing.length; i++) {
      const x = progress + (1 - progress) * i / (outgoing.length - 1);
      outgoing[i] = Math.cos(Math.PI * x / 2);
      incoming[i] = Math.sin(Math.PI * x / 2);
    }
    return { outgoing, incoming };
  }

  private scheduleTransition(transition: NonNullable<PlaybackAudioEngine["transition"]>): void {
    if (!this.ctx || transition.manual) return;
    const remaining = Math.max(0.01, transition.duration * (1 - transition.progress));
    const startAt = this.ctx.currentTime + 0.04;
    const outgoingGain = this.deckGainNodes[transition.outgoing]!.gain;
    const incomingGain = this.deckGainNodes[transition.incoming]!.gain;
    const curves = this.curve(transition.progress);
    outgoingGain.cancelScheduledValues(startAt);
    incomingGain.cancelScheduledValues(startAt);
    outgoingGain.setValueAtTime(Math.cos(Math.PI * transition.progress / 2), startAt);
    incomingGain.setValueAtTime(Math.sin(Math.PI * transition.progress / 2), startAt);
    outgoingGain.setValueCurveAtTime(curves.outgoing, startAt, remaining);
    incomingGain.setValueCurveAtTime(curves.incoming, startAt, remaining);
    transition.startAt = startAt;
    transition.scheduledProgress = transition.progress;
    transition.paused = false;
    window.clearTimeout(transition.timer);
    transition.timer = window.setTimeout(() => this.finishTransition(true), remaining * 1000 + 80);
  }

  private pauseTransition(transition: NonNullable<PlaybackAudioEngine["transition"]>): void {
    if (!this.ctx || transition.paused) return;
    if (transition.manual) {
      transition.paused = true;
      this.mediaFor(transition.outgoing)?.pause();
      this.mediaFor(transition.incoming)?.pause();
      this.deckPlaying[transition.outgoing] = false;
      this.deckPlaying[transition.incoming] = false;
      return;
    }
    const now = this.ctx.currentTime;
    if (now >= transition.startAt) {
      transition.progress = Math.min(1, transition.scheduledProgress + (now - transition.startAt) / transition.duration);
    }
    if (transition.progress >= 1) {
      this.finishTransition(true);
      return;
    }
    const outgoingGain = this.deckGainNodes[transition.outgoing]?.gain;
    const incomingGain = this.deckGainNodes[transition.incoming]?.gain;
    if (outgoingGain && incomingGain) {
      const out = Math.cos(Math.PI * transition.progress / 2);
      const into = Math.sin(Math.PI * transition.progress / 2);
      outgoingGain.cancelScheduledValues(now);
      incomingGain.cancelScheduledValues(now);
      outgoingGain.setValueAtTime(out, now);
      incomingGain.setValueAtTime(into, now);
    }
    window.clearTimeout(transition.timer);
    transition.paused = true;
    this.mediaFor(transition.outgoing)?.pause();
    this.mediaFor(transition.incoming)?.pause();
    this.deckPlaying[transition.outgoing] = false;
    this.deckPlaying[transition.incoming] = false;
  }

  private resumeTransition(transition: NonNullable<PlaybackAudioEngine["transition"]>): void {
    this.scheduleTransition(transition);
  }

  public async crossfadeTo(
    url: string,
    durationSeconds: number,
    incomingStartTime = 0,
    attribution?: AudioListenAttribution,
  ): Promise<boolean> {
    if (!url || !Number.isFinite(durationSeconds)) return false;
    const duration = Math.max(2, Math.min(12, durationSeconds));
    this.cancelTransition();
    const generation = ++this.transitionGeneration;
    this.ensureAudioGraph();
    if (!this.ctx || !this.deckGainNodes[0] || !this.deckGainNodes[1]) return false;

    const outgoing = this.activeDeck;
    const incoming: 0 | 1 = outgoing === 0 ? 1 : 0;
    const media = this.mediaFor(incoming);
    if (!media) return false;
    try {
      media.pause();
      media.removeAttribute("src");
      media.load();
      media.src = url;
      media.volume = 1;
      this.setDeckGain(incoming, 0);
      await this.waitUntilReady(media, 15_000, generation);
      if (generation !== this.transitionGeneration) { media.pause(); return false; }
      media.currentTime = Math.max(0, Number.isFinite(incomingStartTime) ? incomingStartTime : 0);
      if (this.ctx.state === "suspended") await this.ctx.resume();
      if (generation !== this.transitionGeneration) { media.pause(); return false; }
      this.deckPlaying[incoming] = false;
      this.deckAttribution[incoming] = attribution ?? null;
      await media.play();
      if (generation !== this.transitionGeneration) {
        media.pause();
        this.deckAttribution[incoming] = null;
        this.deckPlaying[incoming] = false;
        return false;
      }
    } catch (error) {
      this.mediaFor(incoming)?.pause();
      this.setDeckGain(incoming, 0);
      this.deckAttribution[incoming] = null;
      this.deckPlaying[incoming] = false;
      this.emit("transitioncancel", error);
      return false;
    }

    this.emit("transitionstart", { outgoing, incoming, durationSeconds: duration });

    return new Promise((resolve) => {
      this.transition = { outgoing, incoming, timer: 0, finish: resolve, duration, progress: 0, scheduledProgress: 0, startAt: 0, paused: false, manual: false };
      this.scheduleTransition(this.transition);
    });
  }

  public async prepareManualDeck(
    url: string,
    incomingStartTime = 0,
    attribution?: AudioListenAttribution,
  ): Promise<boolean> {
    if (!url) return false;
    this.cancelTransition();
    const generation = ++this.transitionGeneration;
    this.ensureAudioGraph();
    if (!this.ctx || !this.deckGainNodes[0] || !this.deckGainNodes[1]) return false;
    const outgoing = this.activeDeck;
    const incoming: 0 | 1 = outgoing === 0 ? 1 : 0;
    const media = this.mediaFor(incoming);
    if (!media) return false;
    try {
      media.pause();
      media.removeAttribute("src");
      media.load();
      media.src = url;
      media.volume = 1;
      this.setDeckGain(incoming, 0);
      await this.waitUntilReady(media, 15_000, generation);
      if (generation !== this.transitionGeneration) { media.pause(); return false; }
      media.currentTime = Math.max(0, Number.isFinite(incomingStartTime) ? incomingStartTime : 0);
      if (this.ctx.state === "suspended") await this.ctx.resume();
      if (generation !== this.transitionGeneration) { media.pause(); return false; }
      this.deckPlaying[incoming] = false;
      this.deckAttribution[incoming] = attribution ?? null;
      await media.play();
      if (generation !== this.transitionGeneration) {
        media.pause();
        this.deckAttribution[incoming] = null;
        this.deckPlaying[incoming] = false;
        return false;
      }
    } catch (error) {
      media.pause();
      this.setDeckGain(incoming, 0);
      this.deckAttribution[incoming] = null;
      this.deckPlaying[incoming] = false;
      this.emit("transitioncancel", error);
      return false;
    }
    this.transition = {
      outgoing,
      incoming,
      timer: 0,
      finish: () => undefined,
      duration: 1,
      progress: 0,
      scheduledProgress: 0,
      startAt: 0,
      paused: false,
      manual: true,
    };
    this.emit("transitionstart", { outgoing, incoming, manual: true });
    return true;
  }

  public setManualCrossfader(value: number): boolean {
    const transition = this.transition;
    if (!transition?.manual || transition.paused || !this.ctx) return false;
    const position = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    const now = this.ctx.currentTime;
    const outgoingGain = this.deckGainNodes[transition.outgoing]?.gain;
    const incomingGain = this.deckGainNodes[transition.incoming]?.gain;
    if (!outgoingGain || !incomingGain) return false;
    transition.progress = position;
    outgoingGain.cancelScheduledValues(now);
    incomingGain.cancelScheduledValues(now);
    outgoingGain.setTargetAtTime(Math.cos(Math.PI * position / 2), now, 0.025);
    incomingGain.setTargetAtTime(Math.sin(Math.PI * position / 2), now, 0.025);
    if (position >= 1) this.finishTransition(true);
    return true;
  }

  public cancelTransition(): void {
    this.transitionGeneration++;
    const pendingReadiness = [...this.readinessWaiters.values()];
    this.readinessWaiters.clear();
    pendingReadiness.forEach((cancel) => cancel());
    if (this.transition) this.finishTransition(false);
    else {
      const inactive: 0 | 1 = this.activeDeck === 0 ? 1 : 0;
      this.mediaFor(inactive)?.pause();
      this.deckPlaying[inactive] = false;
      this.deckAttribution[inactive] = null;
      this.setDeckGain(inactive, 0);
    }
  }

  private finishTransition(completed: boolean): void {
    const transition = this.transition;
    if (!transition) return;
    this.transition = null;
    window.clearTimeout(transition.timer);
    if (completed) {
      this.activeDeck = transition.incoming;
      const outgoing = this.mediaFor(transition.outgoing);
      outgoing?.pause();
      if (outgoing) {
        outgoing.currentTime = 0;
        outgoing.removeAttribute("src");
        outgoing.load();
      }
      this.deckPlaying[transition.outgoing] = false;
      this.deckAttribution[transition.outgoing] = null;
      this.setDeckGain(transition.outgoing, 0);
      this.setDeckGain(transition.incoming, 1);
      this.emit("activeelementchange");
      this.emit("transitionend", { outgoing: transition.outgoing, incoming: transition.incoming });
      this.emit("durationchange", this.getDuration());
      this.emit("timeupdate", this.getCurrentTime());
      this.emit("play");
    } else {
      this.mediaFor(transition.incoming)?.pause();
      this.deckPlaying[transition.incoming] = false;
      this.deckAttribution[transition.incoming] = null;
      this.setDeckGain(transition.outgoing, 1);
      this.setDeckGain(transition.incoming, 0);
      this.emit("transitioncancel");
    }
    transition.finish(completed);
  }

  /**
   * Set master playback volume [0.0, 1.0].
   * The audio element's volume is locked at 1.0 to prevent double-gain attenuation.
   * Adjusting volume explicitly un-mutes playback (Fix Bug #2).
   */
  public setVolume(volume: number): void {
    const v = Math.max(0, Math.min(1, volume));
    this.currentVolume = v;
    this.isMuted = false; // Adjusting volume automatically un-mutes
    if (this.audio) this.audio.volume = 1.0;
    if (this.secondaryAudio) this.secondaryAudio.volume = 1.0;
    if (this.masterGainNode && this.ctx) {
      this.masterGainNode.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    }
  }

  public setMediaGain(gain: number): void {
    const value = Math.max(0, Math.min(1.5, Number.isFinite(gain) ? gain : 1));
    this.mediaGain = value;
    if (this.mediaGainNode && this.ctx) {
      this.mediaGainNode.gain.setTargetAtTime(
        this.mediaMuted ? 0 : value,
        this.ctx.currentTime,
        0.02,
      );
    }
  }

  public setMediaMuted(muted: boolean): void {
    this.mediaMuted = muted;
    if (this.mediaGainNode && this.ctx) {
      this.mediaGainNode.gain.setTargetAtTime(
        muted ? 0 : this.mediaGain,
        this.ctx.currentTime,
        0.02,
      );
    }
  }

  public applyMixer(mixer: PlaybackMixer): void {
    this.mediaGain = Math.max(0, Math.min(1.5, mixer.mediaGain));
    this.mediaMuted = mixer.mediaMuted;
    this.spatialMode = mixer.spatialMode;
    this.setMediaGain(this.mediaGain);
    this.setMediaMuted(this.mediaMuted);
    if (this.ctx && this.eqOutputNode) this.applySpatialMode(this.spatialMode);
  }

  public setSpatialMode(mode: SpatialMode): boolean {
    this.spatialMode = mode;
    if (this.ctx && this.eqOutputNode) this.applySpatialMode(mode);
    return this.spatialMode === mode;
  }

  private createSpatialGraph(): boolean {
    if (this.spatialGraphReady) return true;
    if (!this.ctx || !this.eqOutputNode || !this.spatialPathGainNode || !this.limiterNode) return false;
    try {
      const splitter = this.ctx.createChannelSplitter(2);
      this.eqOutputNode.connect(splitter);
      const sum = this.ctx.createGain();
      sum.gain.value = 0.5;
      const makeSpeaker = (
        x: number,
        z: number,
        left: number,
        right: number,
        weight: number,
        lowPass = false,
      ) => {
        const mix = this.ctx!.createGain();
        mix.gain.value = 1;
        const leftGain = this.ctx!.createGain();
        const rightGain = this.ctx!.createGain();
        leftGain.gain.value = left * weight;
        rightGain.gain.value = right * weight;
        splitter.connect(leftGain, 0);
        splitter.connect(rightGain, 1);
        leftGain.connect(mix);
        rightGain.connect(mix);
        let input: AudioNode = mix;
        if (lowPass) {
          const filter = this.ctx!.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = 120;
          filter.Q.value = 0.707;
          mix.connect(filter);
          input = filter;
        }
        const panner = this.ctx!.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 1;
        panner.maxDistance = 1;
        panner.rolloffFactor = 0;
        panner.positionX.value = x;
        panner.positionY.value = 0;
        panner.positionZ.value = z;
        input.connect(panner);
        panner.connect(sum);
        this.spatialPanners.push(panner);
      };

      // Stereo matrix feeds create a virtual 7.1 speaker field; PannerNode renders
      // each virtual speaker to stereo headphone output using HRTF.
      makeSpeaker(-0.75, -1, 1, 0, 0.8); // front left
      makeSpeaker(0.75, -1, 0, 1, 0.8); // front right
      makeSpeaker(0, -1, 0.5, 0.5, 0.55); // center
      makeSpeaker(-1, 0, 1, 0, 0.3); // side left
      makeSpeaker(1, 0, 0, 1, 0.3); // side right
      makeSpeaker(-0.7, 0.7, 1, 0, 0.22); // rear left
      makeSpeaker(0.7, 0.7, 0, 1, 0.22); // rear right
      makeSpeaker(0, -1, 0.5, 0.5, 0.16, true); // low-frequency effects feed
      sum.connect(this.spatialPathGainNode);
      this.spatialPathGainNode.connect(this.limiterNode);
      this.spatialGraphReady = true;
      return true;
    } catch {
      this.spatialPanners = [];
      return false;
    }
  }

  private applySpatialMode(mode: SpatialMode): void {
    if (!this.ctx || !this.directPathGainNode || !this.spatialPathGainNode) return;
    if (mode === "virtual-7.1" && !this.createSpatialGraph()) {
      this.spatialMode = "stereo";
      this.applySpatialMode("stereo");
      this.emit("spatialfallback");
      return;
    }
    const useSpatial = mode === "virtual-7.1" && this.spatialGraphReady;
    const now = this.ctx.currentTime;
    this.directPathGainNode.gain.setTargetAtTime(useSpatial ? 0 : 1, now, 0.015);
    this.spatialPathGainNode.gain.setTargetAtTime(useSpatial ? 1 : 0, now, 0.015);
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.audio) {
      this.audio.volume = 1.0;
    }
    if (this.secondaryAudio) this.secondaryAudio.volume = 1.0;
    if (this.masterGainNode && this.ctx) {
      const targetGain = muted ? 0 : this.currentVolume;
      this.masterGainNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.02);
    }
  }

  public setPlaybackRate(rate: number): void {
    const r = Math.max(0.5, Math.min(2.0, rate));
    const media = this.activeMedia();
    if (media) media.playbackRate = r;
    const other = this.mediaFor(this.activeDeck === 0 ? 1 : 0);
    if (other) other.playbackRate = r;
  }

  public setPreamp(gainDb: number): void {
    const clamped = clampGain(gainDb);
    this.currentPreamp = clamped;
    if (this.preampNode && this.ctx) {
      // If currently bypassed, keep preamp effectively flat (gain = 1.0 / 0 dB)
      const linear = this.isBypassed ? 1.0 : Math.pow(10, clamped / 20);
      this.preampNode.gain.setTargetAtTime(linear, this.ctx.currentTime, 0.03);
    }
  }

  public setBandGain(index: number, gainDb: number): void {
    if (index < 0 || index >= EQ_FREQUENCIES.length) return;
    const clamped = clampGain(gainDb);
    this.currentBandGains[index] = clamped;

    if (!this.isBypassed && this.filterNodes[index] && this.ctx) {
      this.filterNodes[index].gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.03);
    }
  }

  /**
   * True EQ bypass:
   * Smoothly ramps preamp to linear 1.0 (0 dB) AND all 10 peaking filters to 0 dB gain.
   * When un-bypassed, restores preamp and band gains to their active settings.
   */
  public setBypass(bypassed: boolean): void {
    this.isBypassed = bypassed;
    if (!this.ctx) return;

    // 1. Ramp preamp
    if (this.preampNode) {
      const targetPreampLinear = bypassed ? 1.0 : Math.pow(10, this.currentPreamp / 20);
      this.preampNode.gain.setTargetAtTime(targetPreampLinear, this.ctx.currentTime, 0.03);
    }

    // 2. Ramp all 10 filters
    this.filterNodes.forEach((filter, i) => {
      const targetGain = bypassed ? 0 : this.currentBandGains[i];
      filter.gain.setTargetAtTime(targetGain, this.ctx!.currentTime, 0.03);
    });
  }

  public applyEQ(eq: PlaybackEQ): void {
    this.currentPreamp = clampGain(eq.preamp);
    eq.bands.forEach((b, i) => {
      if (i < this.currentBandGains.length) {
        this.currentBandGains[i] = clampGain(b.gain);
      }
    });
    this.setBypass(!eq.enabled);
  }

  /**
   * Enumerate available audio output devices (FR-16W.4).
   */
  public async getAvailableOutputDevices(): Promise<AudioOutputDevice[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return [{ deviceId: "", label: "Default Audio Output" }];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices
        .filter((d) => d.kind === "audiooutput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || (d.deviceId === "" ? "Default Audio Output" : `Audio Output ${i + 1}`),
        }));
      if (outputs.length === 0) {
        return [{ deviceId: "", label: "Default Audio Output" }];
      }
      return outputs;
    } catch {
      return [{ deviceId: "", label: "Default Audio Output" }];
    }
  }

  /**
   * Direct output routing (setSinkId) with graceful fallback (FR-16W.4, FR-16W.5).
   */
  public async setOutputDevice(deviceId: string): Promise<boolean> {
    this.ensureAudioGraph();
    const context = this.ctx as (AudioContext & { setSinkId?: (sinkId: string) => Promise<void> }) | null;
    if (!context?.setSinkId) {
      this.activeOutputDeviceId = "";
      return false;
    }
    try {
      await context.setSinkId(deviceId);
      this.activeOutputDeviceId = deviceId;
      return true;
    } catch (error) {
      console.warn("[audioEngine] AudioContext.setSinkId failed, falling back to default device:", error);
      try { await context.setSinkId(""); } catch {}
      this.activeOutputDeviceId = "";
      return false;
    }
  }

  public getOutputDeviceId(): string {
    return this.activeOutputDeviceId;
  }

  public getByteFrequencyData(array: Uint8Array | any): void {
    if (this.analyserNode) {
      this.analyserNode.getByteFrequencyData(array as any);
    } else {
      array.fill(0);
    }
  }

  public getCurrentTime(): number {
    return this.activeMedia()?.currentTime ?? 0;
  }

  public getMediaElement(): HTMLVideoElement | null {
    return this.audio;
  }

  public getActiveMediaElement(): HTMLMediaElement | null {
    return this.activeMedia();
  }

  public setMediaElementLabel(label: string): void {
    this.audio?.setAttribute("aria-label", label);
  }

  public getDuration(): number {
    const duration = this.activeMedia()?.duration ?? 0;
    return Number.isFinite(duration) ? duration : 0;
  }

  public isPaused(): boolean {
    return this.activeMedia()?.paused ?? true;
  }

  public isTransitioning(): boolean {
    return this.transition !== null;
  }

  // Inspection getters for testing and AudioParam verification
  public ensureAudioGraphForTest(): void {
    this.ensureAudioGraph();
  }

  public getFilterNodes(): BiquadFilterNode[] {
    return [...this.filterNodes];
  }

  public getPreampNode(): GainNode | null {
    return this.preampNode;
  }

  public getMasterGainNode(): GainNode | null {
    return this.masterGainNode;
  }

  public getIsBypassed(): boolean {
    return this.isBypassed;
  }

  public getCurrentPreamp(): number {
    return this.currentPreamp;
  }

  public getCurrentBandGains(): number[] {
    return [...this.currentBandGains];
  }

  public getCurrentVolume(): number {
    return this.currentVolume;
  }

  public getMediaGain(): number { return this.mediaGain; }
  public getMediaMuted(): boolean { return this.mediaMuted; }
  public getSpatialMode(): SpatialMode { return this.spatialMode; }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getPlaybackRate(): number {
    return this.activeMedia()?.playbackRate ?? 1.0;
  }

  public on(event: AudioEngineEvent, handler: (data?: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  public off(event: AudioEngineEvent, handler: (data?: any) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  private emit(event: AudioEngineEvent, data?: any): void {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (e) {
        console.error(`Error in audio engine event handler for ${event}:`, e);
      }
    });
  }
}
