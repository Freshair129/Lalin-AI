// @req FR-09 — decode audio + waveform peaks (cache ต่อไฟล์ — FR-09.6)
/**
 * browser audio decoding + waveform-peaks utility
 * ใช้สำหรับ clip-based timeline: decode ครั้งเดียว, cache AudioBuffer + peaks array
 */

export interface Decoded {
  buffer: AudioBuffer;   // decoded audio (reused for playback)
  peaks: Float32Array;   // mono absolute-amplitude peaks, fixed resolution
  duration: number;      // seconds
  pps: number;           // peaks-per-second resolution used to build `peaks`
}

// peaks per second — fixed resolution
const PPS = 200;

// module-level singletons
let _ctx: AudioContext | null = null;
const _cache = new Map<string, Promise<Decoded>>();

/**
 * shared singleton AudioContext (lazy-created)
 */
export function sharedAudioContext(): AudioContext {
  if (_ctx === null) {
    _ctx = new window.AudioContext();
  }
  return _ctx;
}

/**
 * decode + peaks, cached by url.
 * Returns the same promise for concurrent calls on the same url.
 * On error: removes cache entry so callers can retry.
 */
export function getDecoded(url: string): Promise<Decoded> {
  const cached = _cache.get(url);
  if (cached !== undefined) {
    return cached;
  }

  const promise = (async (): Promise<Decoded> => {
    const ctx = sharedAudioContext();

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`fetch failed: ${response.status} ${response.statusText} — ${url}`);
    }
    const arrayBuffer = await response.arrayBuffer();

    const buffer = await ctx.decodeAudioData(arrayBuffer);
    const duration = buffer.duration;
    const pps = PPS;

    // build mono peaks from channel 0
    const channelData = buffer.getChannelData(0);
    const totalSamples = channelData.length;
    const totalPeaks = Math.max(1, Math.floor(duration * pps));
    const peaks = new Float32Array(totalPeaks);

    for (let i = 0; i < totalPeaks; i++) {
      // sample range for this bucket
      const startSample = Math.floor((i / totalPeaks) * totalSamples);
      const endSample = Math.floor(((i + 1) / totalPeaks) * totalSamples);
      let maxAbs = 0;
      for (let s = startSample; s < endSample; s++) {
        const abs = Math.abs(channelData[s]);
        if (abs > maxAbs) maxAbs = abs;
      }
      peaks[i] = maxAbs;
    }

    return { buffer, peaks, duration, pps };
  })();

  // cache the promise immediately so concurrent callers share it
  _cache.set(url, promise);

  // on error: remove from cache so callers can retry
  promise.catch(() => {
    _cache.delete(url);
  });

  return promise;
}

/**
 * Return `samples` peak values (0..1) for the region [offsetSec, offsetSec+durationSec)
 * of a Decoded, suitable for drawing a clip's waveform at a given pixel width.
 * Range is clamped to what is available. Empty range returns all-zeros.
 */
export function regionPeaks(
  d: Decoded,
  offsetSec: number,
  durationSec: number,
  samples: number,
): number[] {
  if (samples <= 0) return [];

  const peakLen = d.peaks.length;

  // peak-index range for the requested region
  let startIdx = Math.floor(offsetSec * d.pps);
  let endIdx   = Math.floor((offsetSec + durationSec) * d.pps);

  // clamp to valid range
  startIdx = Math.max(0, Math.min(startIdx, peakLen));
  endIdx   = Math.max(0, Math.min(endIdx,   peakLen));

  const rangeLen = endIdx - startIdx;

  if (rangeLen <= 0) {
    return new Array<number>(samples).fill(0);
  }

  const result = new Array<number>(samples);

  for (let i = 0; i < samples; i++) {
    // map output bucket i → input index range within [startIdx, endIdx)
    const bucketStart = startIdx + Math.floor((i / samples) * rangeLen);
    const bucketEnd   = startIdx + Math.floor(((i + 1) / samples) * rangeLen);

    if (bucketStart >= bucketEnd) {
      // bucket maps to a single index (or nothing) — use nearest
      const idx = Math.min(bucketStart, peakLen - 1);
      result[i] = Math.min(1, Math.max(0, d.peaks[idx]));
    } else {
      let maxVal = 0;
      for (let j = bucketStart; j < bucketEnd; j++) {
        const v = d.peaks[j];
        if (v > maxVal) maxVal = v;
      }
      result[i] = Math.min(1, Math.max(0, maxVal));
    }
  }

  return result;
}
