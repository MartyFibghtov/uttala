/**
 * Strict sound scoring from the phone recogniser's raw output (logits), for any language.
 *
 * The greedy comparison in phone-compare.ts asks "which sound was nearest?", so an accented vowel that is
 * still closest to the right vowel passes. The measures here look at how *confidently* and how *closely*
 * the learner's audio matches the native reading:
 *
 * - **Goodness of pronunciation (GOP).** The native reading's sound sequence is forced onto the learner's
 *   audio (CTC Viterbi alignment). For each sound, the model's log-probability of that sound is compared
 *   with its best competing sound. Accented realisations lose confidence long before they flip category.
 * - **Alignment deficit.** How much less likely the native sound sequence is on the learner's audio than
 *   the sequence the model would freely choose, per sound.
 * - **Frame distance.** Dynamic time warping between the learner's and the native reading's per-frame
 *   phone distributions: a continuous measure of how far inside each sound category the learner sits.
 *
 * Pure functions only; running the model lives in sound-check.ts and the evaluation scripts.
 */

export interface Logits {
  /** Row-major [frames x vocab]. */
  data: Float32Array;
  frames: number;
  vocab: number;
}

/** Tokens that are not sounds: CTC blank/padding, sentence markers, word separator, tone numbers. */
export function nonPhoneIds(tokens: string[]): Set<number> {
  const out = new Set<number>();
  tokens.forEach((t, i) => {
    if (t === undefined || ["<pad>", "<s>", "</s>", "<unk>", "|"].includes(t) || /^\d+$/.test(t)) out.add(i);
  });
  return out;
}

/** Log-softmax over each frame. */
export function logSoftmax({ data, frames, vocab }: Logits): Float32Array {
  const out = new Float32Array(data.length);
  for (let t = 0; t < frames; t++) {
    const o = t * vocab;
    let max = -Infinity;
    for (let v = 0; v < vocab; v++) max = Math.max(max, data[o + v]);
    let sum = 0;
    for (let v = 0; v < vocab; v++) sum += Math.exp(data[o + v] - max);
    const lse = max + Math.log(sum);
    for (let v = 0; v < vocab; v++) out[o + v] = data[o + v] - lse;
  }
  return out;
}

/** Greedy CTC decoding into token ids (collapsed, blanks and non-sounds removed) with their frame. */
export function greedyIds(lp: Float32Array, frames: number, vocab: number, skip: Set<number>): { id: number; t: number }[] {
  const out: { id: number; t: number }[] = [];
  let prev = -1;
  for (let t = 0; t < frames; t++) {
    let best = 0;
    for (let v = 1; v < vocab; v++) if (lp[t * vocab + v] > lp[t * vocab + best]) best = v;
    if (best !== prev && !skip.has(best)) out.push({ id: best, t });
    prev = best;
  }
  return out;
}

/**
 * CTC Viterbi forced alignment of `labels` onto log-probabilities. Returns the best path's
 * log-probability and, for each label, the frames it was aligned to (always at least one).
 */
export function forceAlign(
  lp: Float32Array,
  frames: number,
  vocab: number,
  labels: number[],
  blank: number,
): { logProb: number; spans: { start: number; end: number }[] } | null {
  const S = 2 * labels.length + 1;
  if (!labels.length || frames < labels.length) return null;
  const sym = (s: number) => (s % 2 === 0 ? blank : labels[(s - 1) >> 1]);
  const NEG = -1e30;
  let prev = new Float64Array(S).fill(NEG);
  const back = new Int8Array(frames * S); // 0 stay, 1 from s-1, 2 from s-2
  prev[0] = lp[blank];
  if (S > 1) prev[1] = lp[sym(1)];
  for (let t = 1; t < frames; t++) {
    const cur = new Float64Array(S).fill(NEG);
    const o = t * vocab;
    for (let s = 0; s < S; s++) {
      let best = prev[s];
      let from = 0;
      if (s > 0 && prev[s - 1] > best) {
        best = prev[s - 1];
        from = 1;
      }
      if (s > 1 && s % 2 === 1 && sym(s) !== sym(s - 2) && prev[s - 2] > best) {
        best = prev[s - 2];
        from = 2;
      }
      if (best <= NEG) continue;
      cur[s] = best + lp[o + sym(s)];
      back[t * S + s] = from;
    }
    prev = cur;
  }
  let s = S > 1 && prev[S - 2] > prev[S - 1] ? S - 2 : S - 1;
  const logProb = prev[s];
  if (logProb <= NEG / 2) return null;
  const spans = labels.map(() => ({ start: Infinity, end: -1 }));
  for (let t = frames - 1; t >= 0; t--) {
    if (s % 2 === 1) {
      const sp = spans[(s - 1) >> 1];
      sp.start = Math.min(sp.start, t);
      sp.end = Math.max(sp.end, t);
    }
    if (t > 0) s -= back[t * S + s];
  }
  return { logProb, spans };
}

/** Log-probability of the best unconstrained path (each frame's top token). */
export function bestPathLogProb(lp: Float32Array, frames: number, vocab: number): number {
  let sum = 0;
  for (let t = 0; t < frames; t++) {
    let m = -Infinity;
    for (let v = 0; v < vocab; v++) m = Math.max(m, lp[t * vocab + v]);
    sum += m;
  }
  return sum;
}

export interface PhoneGop {
  id: number;
  /** Log-probability ratio of the expected sound against its best competitor at its most confident frame. */
  lpr: number;
  /** Best competing sound (token id) at that frame. */
  rival: number;
}

/**
 * Per-sound GOP: for each expected sound, over the frames it was aligned to, the largest margin of
 * log P(expected) over the best other sound. Negative means another sound won everywhere.
 */
export function gopScores(
  lp: Float32Array,
  vocab: number,
  labels: number[],
  spans: { start: number; end: number }[],
  skip: Set<number>,
): PhoneGop[] {
  return labels.map((id, i) => {
    const { start, end } = spans[i];
    let lpr = -Infinity;
    let rival = -1;
    for (let t = start; t <= end; t++) {
      const o = t * vocab;
      let best = -Infinity;
      let who = -1;
      for (let v = 0; v < vocab; v++) {
        if (v === id || skip.has(v)) continue;
        if (lp[o + v] > best) {
          best = lp[o + v];
          who = v;
        }
      }
      const m = lp[o + id] - best;
      if (m > lpr) {
        lpr = m;
        rival = who;
      }
    }
    return { id, lpr, rival };
  });
}

/** Frames trimmed to the speech: from a little before the first sound to a little after the last. */
export function speechFrames(lp: Float32Array, frames: number, vocab: number, skip: Set<number>, pad = 3): [number, number] {
  const ids = greedyIds(lp, frames, vocab, skip);
  if (!ids.length) return [0, frames];
  return [Math.max(0, ids[0].t - pad), Math.min(frames, ids[ids.length - 1].t + pad + 1)];
}

/** Per-frame sound-distribution vectors (log-probabilities of the sounds only, centred and unit length). */
export function frameVectors(lp: Float32Array, vocab: number, from: number, to: number, skip: Set<number>): Float32Array[] {
  const keep: number[] = [];
  for (let v = 0; v < vocab; v++) if (!skip.has(v)) keep.push(v);
  const out: Float32Array[] = [];
  for (let t = from; t < to; t++) {
    const x = new Float32Array(keep.length);
    let mean = 0;
    keep.forEach((v, k) => {
      x[k] = Math.max(lp[t * vocab + v], -20);
      mean += x[k];
    });
    mean /= keep.length;
    let norm = 0;
    for (let k = 0; k < x.length; k++) {
      x[k] -= mean;
      norm += x[k] * x[k];
    }
    norm = Math.sqrt(norm) || 1;
    for (let k = 0; k < x.length; k++) x[k] /= norm;
    out.push(x);
  }
  return out;
}

/** Dynamic time warping between two vector sequences with cosine distance; mean cost along the best path. */
export function dtw(a: Float32Array[], b: Float32Array[]): number {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return 1;
  const D = new Float64Array(n * m);
  const L = new Int32Array(n * m);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    for (let j = 0; j < m; j++) {
      const y = b[j];
      let dot = 0;
      for (let k = 0; k < x.length; k++) dot += x[k] * y[k];
      const c = 1 - dot;
      const at = i * m + j;
      if (i === 0 && j === 0) {
        D[at] = c;
        L[at] = 1;
        continue;
      }
      // Choose the predecessor by mean cost so that long detours are not favoured.
      let best = Infinity;
      for (const k of [i > 0 && j > 0 ? at - m - 1 : -1, i > 0 ? at - m : -1, j > 0 ? at - 1 : -1]) {
        if (k < 0) continue;
        const v = (D[k] + c) / (L[k] + 1);
        if (v < best) {
          best = v;
          D[at] = D[k] + c;
          L[at] = L[k] + 1;
        }
      }
    }
  }
  return D[n * m - 1] / L[n * m - 1];
}

export interface StrictFeatures {
  /** Mean per-sound GOP margin (log-probability ratio). */
  gopMean: number;
  /** Share of expected sounds where another sound was more likely (GOP < 0). */
  gopFail: number;
  /** Tenth-percentile GOP margin: the weakest sounds. */
  gopP10: number;
  /** (best free path − forced native path) log-probability, per sound. 0 = the native sequence fits perfectly. */
  deficit: number;
  /** Mean DTW cosine distance to the native reading's frames. */
  dtw: number;
  phones: PhoneGop[];
  /** Expected sounds' frame spans on the learner's audio. */
  spans: { start: number; end: number }[];
}

/**
 * All strict measures for one learner recording against one native reading.
 * `blank` is the CTC blank token id; `skip` the non-sound token ids (see nonPhoneIds).
 */
export function strictFeatures(learner: Logits, reference: Logits, blank: number, skip: Set<number>): StrictFeatures | null {
  const lpL = logSoftmax(learner);
  const lpR = logSoftmax(reference);
  const V = learner.vocab;
  const labels = greedyIds(lpR, reference.frames, V, skip).map((x) => x.id);
  const fa = forceAlign(lpL, learner.frames, V, labels, blank);
  if (!fa) return null;
  const phones = gopScores(lpL, V, labels, fa.spans, skip);
  const sorted = phones.map((p) => p.lpr).sort((a, b) => a - b);
  const [l0, l1] = speechFrames(lpL, learner.frames, V, skip);
  const [r0, r1] = speechFrames(lpR, reference.frames, V, skip);
  return {
    gopMean: sorted.reduce((s, x) => s + x, 0) / sorted.length,
    gopFail: sorted.filter((x) => x < 0).length / sorted.length,
    gopP10: sorted[Math.floor(sorted.length * 0.1)],
    deficit: (bestPathLogProb(lpL, learner.frames, V) - fa.logProb) / labels.length,
    dtw: dtw(frameVectors(lpL, V, l0, l1, skip), frameVectors(lpR, V, r0, r1, skip)),
    phones,
    spans: fa.spans,
  };
}
