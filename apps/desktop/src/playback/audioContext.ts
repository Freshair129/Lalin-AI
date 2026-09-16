// Shared singleton AudioContext primitive for playback and preview engines
// Inverts dependency so playback-core does not import from studio timeline

let _ctx: AudioContext | null = null;

/**
 * Returns a shared singleton AudioContext instance (lazy-created).
 */
export function sharedAudioContext(): AudioContext {
  if (_ctx === null && typeof window !== "undefined" && window.AudioContext) {
    _ctx = new window.AudioContext();
  }
  return _ctx!;
}

/**
 * Resets the shared AudioContext (useful for test environments).
 */
export function resetSharedAudioContextForTest(): void {
  _ctx = null;
}
