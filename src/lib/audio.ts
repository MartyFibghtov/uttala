import type { Span } from "./text";

export const SAMPLE_RATE = 16000;

/** Decode any browser-playable audio into 16 kHz mono PCM. */
export async function decodeToMono16k(data: Blob | ArrayBuffer): Promise<Float32Array> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    void ctx.close();
  }
}

export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

/**
 * Refine token start/end timings against the actual 16 kHz waveform energy envelope.
 * Trims leading/trailing silence bleed while preserving quiet consonant onsets and releases.
 */
export function refineSpansWithAudio(
  samples: Float32Array,
  spans: (Span | null)[],
  sampleRate = SAMPLE_RATE,
): (Span | null)[] {
  if (!samples.length || !spans.length) return spans;
  const frameSamples = Math.round(sampleRate * 0.005); // 5 ms frames
  const totalFrames = Math.floor(samples.length / frameSamples);
  if (totalFrames < 4) return spans;

  const energy = new Float32Array(totalFrames);
  for (let f = 0; f < totalFrames; f++) {
    const offset = f * frameSamples;
    let sum = 0;
    let diffSum = 0;
    for (let i = 0; i < frameSamples; i++) {
      const v = samples[offset + i];
      sum += v * v;
      if (i > 0) {
        const d = v - samples[offset + i - 1];
        diffSum += d * d;
      }
    }
    // Blend RMS energy with high-frequency derivative energy so quiet fricatives (/s/, /f/, /θ/) register clearly.
    energy[f] = Math.sqrt((sum + diffSum * 2.5) / frameSamples);
  }

  const sorted = Float32Array.from(energy).sort();
  const noiseFloor = sorted[Math.floor(totalFrames * 0.1)] ?? 0;
  const p90 = sorted[Math.floor(totalFrames * 0.9)] ?? 0.05;
  const threshold = noiseFloor + Math.max(0.004, (p90 - noiseFloor) * 0.08);
  const frameSec = frameSamples / sampleRate;
  const totalSec = samples.length / sampleRate;

  return spans.map((span, idx) => {
    if (!span) return null;
    const minBound = idx > 0 && spans[idx - 1] ? spans[idx - 1]!.end : 0;
    const maxBound = idx < spans.length - 1 && spans[idx + 1] ? spans[idx + 1]!.start : totalSec;

    const searchStart = Math.max(0, Math.floor(Math.max(minBound, span.start - 0.025) / frameSec));
    const searchEnd = Math.min(totalFrames - 1, Math.ceil(Math.min(maxBound, span.end + 0.035) / frameSec));
    if (searchEnd <= searchStart + 2) return span;

    let firstVoiced = -1;
    let lastVoiced = -1;
    for (let f = searchStart; f <= searchEnd; f++) {
      if (energy[f] >= threshold) {
        if (firstVoiced < 0) firstVoiced = f;
        lastVoiced = f;
      }
    }
    if (firstVoiced < 0 || lastVoiced < firstVoiced) return span;

    // Include 15 ms pre-onset and 20 ms post-offset margin for stop closures and releases.
    const refinedStart = Math.max(minBound, firstVoiced * frameSec - 0.015);
    const refinedEnd = Math.min(maxBound, (lastVoiced + 1) * frameSec + 0.02);

    if (refinedEnd <= refinedStart + 0.03) return span;
    return { start: refinedStart, end: refinedEnd };
  });
}

/** Find the first speech onset in seconds so two recordings can be aligned at voice start. */
export function findSpeechOnset(samples: Float32Array, sampleRate = SAMPLE_RATE): number {
  const frameSamples = Math.round(sampleRate * 0.01); // 10 ms
  const frames = Math.floor(samples.length / frameSamples);
  if (frames < 2) return 0;
  const rms = new Float32Array(frames);
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    let s = 0;
    const o = f * frameSamples;
    for (let i = 0; i < frameSamples; i++) s += samples[o + i] * samples[o + i];
    rms[f] = Math.sqrt(s / frameSamples);
    if (rms[f] > peak) peak = rms[f];
  }
  const thresh = Math.max(0.008, peak * 0.12);
  for (let f = 0; f < frames - 1; f++) {
    if (rms[f] >= thresh && rms[f + 1] >= thresh) {
      return Math.max(0, (f * frameSamples) / sampleRate - 0.02);
    }
  }
  return 0;
}

export interface PitchTrack {
  /** Seconds between frames. */
  hop: number;
  /** Semitones relative to the speaker's median pitch; null where unvoiced. */
  st: (number | null)[];
}

/**
 * Fundamental-frequency tracking by normalised autocorrelation (70–400 Hz),
 * expressed relative to the speaker's own median so that voices of different
 * registers can be compared by melody shape rather than absolute pitch.
 */
export function trackPitch(samples: Float32Array): PitchTrack {
  // Work at 8 kHz: plenty for F0 and four times cheaper.
  const sr = SAMPLE_RATE / 2;
  const x = new Float32Array(Math.floor(samples.length / 2));
  for (let i = 0; i < x.length; i++) x[i] = (samples[2 * i] + samples[2 * i + 1]) / 2;

  const hopN = sr / 100;
  const minLag = Math.floor(sr / 400);
  const maxLag = Math.ceil(sr / 70);
  const win = 320;
  const frames = Math.max(0, Math.floor((x.length - win - maxLag) / hopN));

  const energy = new Float32Array(frames);
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    const o = f * hopN;
    for (let i = 0; i < win; i++) e += x[o + i] * x[o + i];
    energy[f] = e;
    if (e > peak) peak = e;
  }

  const hz: (number | null)[] = new Array(frames).fill(null);
  for (let f = 0; f < frames; f++) {
    if (energy[f] < peak * 0.01) continue;
    const o = f * hopN;
    let best = 0;
    const corr = new Float32Array(maxLag + 1);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let xy = 0;
      let yy = 0;
      for (let i = 0; i < win; i++) {
        xy += x[o + i] * x[o + i + lag];
        yy += x[o + i + lag] * x[o + i + lag];
      }
      const r = xy / Math.sqrt(energy[f] * yy + 1e-12);
      corr[lag] = r;
      if (r > best) best = r;
    }
    if (best < 0.55) continue;
    // Prefer the shortest lag near the maximum to avoid octave-down errors.
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (corr[lag] >= best * 0.92 && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) {
        hz[f] = sr / lag;
        break;
      }
    }
  }

  // Median-of-5 smoothing removes isolated jumps.
  const smooth = hz.map((v, i) => {
    if (v === null) return null;
    const near = hz.slice(Math.max(0, i - 2), i + 3).filter((n): n is number => n !== null);
    near.sort((a, b) => a - b);
    return near[Math.floor(near.length / 2)];
  });
  const voiced = smooth.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const median = voiced.length ? voiced[Math.floor(voiced.length / 2)] : 0;
  return {
    hop: hopN / sr,
    st: smooth.map((v) => (v === null || !median ? null : 12 * Math.log2(v / median))),
  };
}

export function pitchAt(track: PitchTrack, time: number): number | null {
  const centre = Math.round(time / track.hop);
  for (const d of [0, -1, 1, -2, 2]) {
    const v = track.st[centre + d];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

let active: HTMLAudioElement | null = null;
let activeStop: (() => void) | null = null;
const decodedCache = new Map<string, AudioBuffer>();

async function getDecodedBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = decodedCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  const arr = await res.arrayBuffer();
  const decoded = await ctx.decodeAudioData(arr);
  if (decodedCache.size > 40) {
    const oldest = decodedCache.keys().next().value;
    if (oldest) decodedCache.delete(oldest);
  }
  decodedCache.set(url, decoded);
  return decoded;
}

export interface PlayOptions {
  from?: number;
  to?: number;
  rate?: number;
  /** Called on each animation frame with the current playback position in seconds. */
  onProgress?: (currentTime: number, duration: number) => void;
}

/**
 * Play a URL, optionally only a slice of it.
 * Uses sample-accurate Web Audio buffer slicing when `from`/`to` are given so word slices
 * never overshoot into neighbouring words, and HTMLAudioElement with preservesPitch for full readings.
 */
export function play(url: string, opts: PlayOptions = {}): Promise<void> {
  stopPlayback();
  const rate = opts.rate ?? 1;

  // Use sample-accurate Web Audio API when playing a slice so word boundaries are exact to <1ms.
  if (opts.from !== undefined || opts.to !== undefined) {
    return new Promise((resolve) => {
      const ctx = new AudioContext();
      let stopped = false;
      let raf = 0;
      let src: AudioBufferSourceNode | null = null;

      const finish = () => {
        if (stopped) return;
        stopped = true;
        if (raf) cancelAnimationFrame(raf);
        try {
          src?.stop();
        } catch {
          // already stopped
        }
        void ctx.close().catch(() => {});
        if (activeStop === finish) activeStop = null;
        resolve();
      };
      activeStop = finish;

      void getDecodedBuffer(ctx, url)
        .then((buffer) => {
          if (stopped) return;
          const start = Math.max(0, Math.min(buffer.duration, opts.from ?? 0));
          const end = Math.max(start + 0.02, Math.min(buffer.duration, opts.to ?? buffer.duration));
          const duration = end - start;

          src = ctx.createBufferSource();
          src.buffer = buffer;
          src.playbackRate.value = rate;

          // Smooth micro-fade envelope to avoid clicks at slice edges.
          const gain = ctx.createGain();
          const now = ctx.currentTime;
          const playDur = duration / rate;
          const fadeIn = Math.min(0.01, playDur * 0.15);
          const fadeOut = Math.min(0.015, playDur * 0.2);

          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(1, now + fadeIn);
          if (playDur > fadeIn + fadeOut) {
            gain.gain.setValueAtTime(1, now + playDur - fadeOut);
          }
          gain.gain.linearRampToValueAtTime(0.0001, now + playDur);

          src.connect(gain);
          gain.connect(ctx.destination);
          src.onended = finish;
          src.start(now, start, duration);

          if (opts.onProgress) {
            const startedAt = ctx.currentTime;
            const tick = () => {
              if (stopped) return;
              const elapsed = (ctx.currentTime - startedAt) * rate;
              opts.onProgress!( Math.min(end, start + elapsed), buffer.duration);
              raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          }
        })
        .catch(finish);
    });
  }

  const audio = new Audio(url);
  active = audio;
  audio.playbackRate = rate;
  audio.preservesPitch = true;
  return new Promise((resolve) => {
    let raf = 0;
    const done = () => {
      if (raf) cancelAnimationFrame(raf);
      audio.pause();
      if (active === audio) active = null;
      if (activeStop === done) activeStop = null;
      resolve();
    };
    activeStop = done;
    audio.onended = done;
    audio.onerror = done;
    audio.onpause = () => {
      if (raf) cancelAnimationFrame(raf);
      resolve();
    };
    audio.onloadedmetadata = () => {
      if (opts.onProgress) {
        const tick = () => {
          if (active !== audio || audio.paused) return;
          opts.onProgress!(audio.currentTime, audio.duration || 0);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
      void audio.play().catch(done);
    };
  });
}

/**
 * Play Reference and Learner audio simultaneously (onset-aligned in stereo)
 * for shadowing / chorusing comparison.
 */
export function playOverlay(refUrl: string, userUrl: string, rate = 1): Promise<void> {
  stopPlayback();
  return new Promise((resolve) => {
    const ctx = new AudioContext();
    let stopped = false;
    const sources: AudioBufferSourceNode[] = [];

    const finish = () => {
      if (stopped) return;
      stopped = true;
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          // ignore
        }
      }
      void ctx.close().catch(() => {});
      if (activeStop === finish) activeStop = null;
      resolve();
    };
    activeStop = finish;

    void Promise.all([getDecodedBuffer(ctx, refUrl), getDecodedBuffer(ctx, userUrl)])
      .then(([refBuf, userBuf]) => {
        if (stopped) return;
        const refOnset = findSpeechOnset(refBuf.getChannelData(0), refBuf.sampleRate);
        const userOnset = findSpeechOnset(userBuf.getChannelData(0), userBuf.sampleRate);

        const refSrc = ctx.createBufferSource();
        refSrc.buffer = refBuf;
        refSrc.playbackRate.value = rate;

        const userSrc = ctx.createBufferSource();
        userSrc.buffer = userBuf;
        userSrc.playbackRate.value = rate;

        const refGain = ctx.createGain();
        refGain.gain.value = 0.65;
        const userGain = ctx.createGain();
        userGain.gain.value = 1.0;

        if (typeof ctx.createStereoPanner === "function") {
          const refPan = ctx.createStereoPanner();
          refPan.pan.value = -0.35;
          const userPan = ctx.createStereoPanner();
          userPan.pan.value = 0.35;
          refSrc.connect(refGain).connect(refPan).connect(ctx.destination);
          userSrc.connect(userGain).connect(userPan).connect(ctx.destination);
        } else {
          refSrc.connect(refGain).connect(ctx.destination);
          userSrc.connect(userGain).connect(ctx.destination);
        }

        let endedCount = 0;
        const onOneEnded = () => {
          endedCount++;
          if (endedCount >= 2) finish();
        };
        refSrc.onended = onOneEnded;
        userSrc.onended = onOneEnded;

        sources.push(refSrc, userSrc);
        const now = ctx.currentTime + 0.02;
        refSrc.start(now, refOnset);
        userSrc.start(now, userOnset);
      })
      .catch(finish);
  });
}

export function stopPlayback() {
  if (activeStop) {
    const fn = activeStop;
    activeStop = null;
    fn();
  }
  active?.pause();
  active = null;
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}
