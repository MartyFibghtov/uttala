/**
 * Sound-by-sound comparison against a native reference, for any language.
 *
 * A multilingual phone recogniser (wav2vec2 trained on espeak IPA) transcribes both the learner's
 * recording and the native reference recording of the same text into sounds. The two sound sequences
 * are aligned, and every difference is attributed to the word it falls in using the reference's word
 * timings. Running the same recogniser on both sides cancels most of its own biases: only the sounds
 * where the learner differs from the native reading remain.
 *
 * This module is pure: decoding, alignment and scoring only. Loading the model lives elsewhere.
 */

/** Seconds per output frame of wav2vec2 at 16 kHz (a 320-sample stride). */
export const FRAME_SECONDS = 0.02;

export interface TimedPhone {
  p: string;
  /** Time of the frame where the sound was emitted, in seconds. */
  t: number;
}

const SPECIAL = new Set(["<pad>", "<s>", "</s>", "<unk>", "|"]);
// The recogniser also emits tone numbers learnt from tonal languages; they are not sounds.
const TONE = /^\d+$/;

/** Greedy CTC decoding of logits [T x V] into sounds with times. */
export function decodeCtc(logits: ArrayLike<number>, frames: number, vocabSize: number, tokens: string[]): TimedPhone[] {
  const out: TimedPhone[] = [];
  let prev = -1;
  for (let t = 0; t < frames; t++) {
    let best = 0;
    let bestValue = -Infinity;
    for (let v = 0; v < vocabSize; v++) {
      const x = logits[t * vocabSize + v];
      if (x > bestValue) {
        bestValue = x;
        best = v;
      }
    }
    if (best !== prev) {
      const tok = tokens[best];
      if (tok && !SPECIAL.has(tok) && !TONE.test(tok)) out.push({ p: tok, t: t * FRAME_SECONDS });
    }
    prev = best;
  }
  return out;
}

const VOWEL = /[aeiouyæøœɐɑɒɔəɘɚɛɜɞɤɨɪɯɵɶʉʊʌʏ]/;
const base = (p: string) => p.normalize("NFD").replace(/[ːˑ̀-ͯʰ-˿]/g, "");
const isVowel = (p: string) => VOWEL.test(base(p));

/** Cost of hearing `b` where the native said `a` (0 = same sound, 1 = a different sound). */
function substitution(a: string, b: string): number {
  if (a === b) return 0;
  // Same sound with a different length or diacritic, e.g. e / eː, t / tʰ: a minor difference.
  if (base(a) === base(b)) return 0.35;
  if (isVowel(a) && isVowel(b)) return 0.8;
  return 1;
}

export type PhoneOp =
  | { kind: "same"; ref: string; heard: string; refIdx: number }
  | { kind: "sub"; ref: string; heard: string; refIdx: number; cost: number }
  | { kind: "del"; ref: string; refIdx: number }
  | { kind: "ins"; heard: string; nearRefIdx: number };

const GAP = 0.75;

/** Weighted edit-distance alignment of the native sounds with the learner's. */
export function alignPhones(ref: string[], heard: string[]): PhoneOp[] {
  const n = ref.length;
  const m = heard.length;
  const d = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++) d[i][0] = i * GAP;
  for (let j = 1; j <= m; j++) d[0][j] = j * GAP;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j - 1] + substitution(ref[i - 1], heard[j - 1]), d[i - 1][j] + GAP, d[i][j - 1] + GAP);
    }
  }
  const ops: PhoneOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + substitution(ref[i - 1], heard[j - 1])) {
      const cost = substitution(ref[i - 1], heard[j - 1]);
      ops.push(
        cost === 0
          ? { kind: "same", ref: ref[i - 1], heard: heard[j - 1], refIdx: i - 1 }
          : { kind: "sub", ref: ref[i - 1], heard: heard[j - 1], refIdx: i - 1, cost },
      );
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + GAP) {
      ops.push({ kind: "del", ref: ref[i - 1], refIdx: i - 1 });
      i--;
    } else {
      ops.push({ kind: "ins", heard: heard[j - 1], nearRefIdx: Math.max(0, i - 1) });
      j--;
    }
  }
  return ops.reverse();
}

export interface WordSoundCheck {
  /** Index of the word in the target text. */
  index: number;
  /** The native reference's sounds for this word. */
  ref: string[];
  /** The learner's sounds aligned to this word. */
  heard: string[];
  /** 0–100: how closely the learner's sounds matched the native reading. */
  match: number;
  /** Clear differences: a sound replaced by a different one, or left out. */
  issues: { ref: string; heard: string | null }[];
}

export interface SoundCheck {
  words: WordSoundCheck[];
  /** 0–100 over the whole recording. */
  match: number;
}

/**
 * Compare a learner's sounds with a native reading of the same text.
 *
 * @param refPhones   sounds recognised in the native reference
 * @param refWords    the reference's time span for each word of the text (null when unknown)
 * @param heardPhones sounds recognised in the learner's recording
 */
export function compareSounds(
  refPhones: TimedPhone[],
  refWords: ({ start: number; end: number } | null)[],
  heardPhones: TimedPhone[],
): SoundCheck {
  // Attribute each reference sound to the word whose span contains it, or the nearest one.
  const owner = refPhones.map(({ t }) => {
    let best = -1;
    let bestDist = Infinity;
    refWords.forEach((w, wi) => {
      if (!w) return;
      const dist = t < w.start ? w.start - t : t > w.end ? t - w.end : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = wi;
      }
    });
    return best;
  });

  const ops = alignPhones(
    refPhones.map((p) => p.p),
    heardPhones.map((p) => p.p),
  );
  const words: WordSoundCheck[] = refWords.map((_, index) => ({ index, ref: [], heard: [], match: 100, issues: [] }));
  const cost = new Float64Array(words.length);
  let total = 0;
  for (const op of ops) {
    const wi = owner[op.kind === "ins" ? op.nearRefIdx : op.refIdx];
    const w = words[wi];
    if (!w) continue;
    if (op.kind !== "ins") w.ref.push(op.ref);
    if (op.kind !== "del") w.heard.push(op.heard);
    const c = op.kind === "same" ? 0 : op.kind === "sub" ? op.cost : GAP;
    cost[wi] += c;
    total += c;
    if ((op.kind === "sub" && op.cost >= 0.8) || op.kind === "del") {
      w.issues.push({ ref: op.ref, heard: op.kind === "sub" ? op.heard : null });
    }
  }
  for (const w of words) {
    w.match = w.ref.length ? Math.max(0, Math.round(100 * (1 - cost[w.index] / w.ref.length))) : 100;
  }
  return {
    words,
    match: refPhones.length ? Math.max(0, Math.round(100 * (1 - total / refPhones.length))) : 100,
  };
}
