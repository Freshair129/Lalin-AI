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

import { EQ_FREQUENCIES, clampGain, type PlaybackEQ } from "@lalin/contracts";
import { sharedAudioContext } from "./audioContext";

export type AudioEngineEvent =
  | "play"
  | "pause"
  | "timeupdate"
  | "ended"
  | "error"
  | "durationchange"
  | "loading"
  | "devicechange"
  | "devicelost";

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
}

export class PlaybackAudioEngine {
  private static instance: PlaybackAudioEngine | null = null;

  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private preampNode: GainNode | null = null;
  private filterNodes: BiquadFilterNode[] = [];
  private limiterNode: DynamicsCompressorNode | null = null;
  private masterGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private isBypassed = false;
  private currentBandGains: number[] = new Array(EQ_FREQUENCIES.length).fill(0);
  private currentPreamp = 0;
  private currentVolume = 1.0;
  private isMuted = false;
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
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.crossOrigin = "anonymous";
    // Pin audio element volume to 1.0 so masterGainNode is the single source of truth (no double-scaling)
    this.audio.volume = 1.0;

    this.audio.addEventListener("play", () => this.emit("play"));
    this.audio.addEventListener("pause", () => this.emit("pause"));
    this.audio.addEventListener("ended", () => this.emit("ended"));
    this.audio.addEventListener("timeupdate", () => this.emit("timeupdate", this.audio?.currentTime ?? 0));
    this.audio.addEventListener("durationchange", () => this.emit("durationchange", this.audio?.duration ?? 0));
    this.audio.addEventListener("waiting", () => this.emit("loading"));
    this.audio.addEventListener("canplay", () => this.emit("timeupdate", this.audio?.currentTime ?? 0));
    this.audio.addEventListener("error", () => {
      const err = this.audio?.error;
      let msg = "ไม่สามารถเล่นไฟล์เสียงนี้ได้";
      if (err) {
        switch (err.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            msg = "การโหลดไฟล์ถูกยกเลิก";
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            msg = "ข้อผิดพลาดเครือข่ายขณะโหลดไฟล์";
            break;
          case MediaError.MEDIA_ERR_DECODE:
            msg = "ไม่สามารถถอดรหัสไฟล์เสียงได้ (รูปแบบไฟล์ไม่รองรับหรือไฟล์เสียหาย)";
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            msg = "รูปแบบไฟล์เสียงนี้ไม่รองรับบนระบบของคุณ";
            break;
        }
      }
      this.emit("error", msg);
    });
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
          await this.setOutputDevice("");
          this.emit("devicelost", lostId);
        }
      }
    });
  }

  private ensureAudioGraph() {
    if (this.ctx && this.sourceNode) return;
    this.initAudioElement();
    if (!this.audio) return;

    this.ctx = sharedAudioContext();
    if (!this.ctx) return;

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    try {
      this.sourceNode = this.ctx.createMediaElementSource(this.audio);
    } catch {
      // Source node already exists or cannot attach
      return;
    }

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

    // Connect graph:
    // source -> preamp -> filter[0] -> ... -> filter[9] -> limiter -> masterGain -> analyser -> destination
    let lastNode: AudioNode = this.sourceNode;
    lastNode.connect(this.preampNode);
    lastNode = this.preampNode;

    for (const filter of this.filterNodes) {
      lastNode.connect(filter);
      lastNode = filter;
    }

    lastNode.connect(this.limiterNode);
    this.limiterNode.connect(this.masterGainNode);
    this.masterGainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);

    // Apply current bypass settings to newly assembled graph
    this.setBypass(this.isBypassed);
  }

  public async loadAndPlay(url: string, startTime = 0): Promise<void> {
    this.ensureAudioGraph();
    if (!this.audio) return;

    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    this.audio.src = url;
    this.audio.volume = 1.0; // maintain single gain source
    if (startTime > 0) {
      this.audio.currentTime = startTime;
    }
    await this.audio.play();
  }

  public async play(): Promise<void> {
    this.ensureAudioGraph();
    if (!this.audio) return;
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    await this.audio.play();
  }

  public pause(): void {
    if (!this.audio) return;
    try {
      this.audio.pause();
    } catch {}
  }

  public stop(): void {
    if (!this.audio) return;
    try {
      this.audio.pause();
    } catch {}
    this.audio.currentTime = 0;
    this.emit("pause");
    this.emit("timeupdate", 0);
  }

  public seek(timeSec: number): void {
    if (!this.audio) return;
    const dur = this.audio.duration;
    const clamped = Math.max(0, dur && !Number.isNaN(dur) ? Math.min(dur, timeSec) : Math.max(0, timeSec));
    this.audio.currentTime = clamped;
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
    if (this.audio) {
      this.audio.volume = 1.0;
    }
    if (this.masterGainNode && this.ctx) {
      this.masterGainNode.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.audio) {
      this.audio.volume = 1.0;
    }
    if (this.masterGainNode && this.ctx) {
      const targetGain = muted ? 0 : this.currentVolume;
      this.masterGainNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.02);
    }
  }

  public setPlaybackRate(rate: number): void {
    const r = Math.max(0.5, Math.min(2.0, rate));
    if (this.audio) {
      this.audio.playbackRate = r;
    }
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
    if (!this.audio) return false;
    if ("setSinkId" in this.audio && typeof (this.audio as any).setSinkId === "function") {
      try {
        await (this.audio as any).setSinkId(deviceId);
        this.activeOutputDeviceId = deviceId;
        return true;
      } catch (e) {
        console.warn("[audioEngine] setSinkId failed, falling back to default device:", e);
        try {
          await (this.audio as any).setSinkId("");
        } catch {}
        this.activeOutputDeviceId = "";
        return false;
      }
    }
    return false;
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
    return this.audio?.currentTime ?? 0;
  }

  public getDuration(): number {
    return this.audio?.duration && !Number.isNaN(this.audio.duration) ? this.audio.duration : 0;
  }

  public isPaused(): boolean {
    return this.audio?.paused ?? true;
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

  public getIsMuted(): boolean {
    return this.isMuted;
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
