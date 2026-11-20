/**
 * Score by deduction: every sentence starts at 100 and every mistake the checks catch costs points.
 *
 * The evidence comes from the sound model (gop.ts: each expected sound's confidence on the
 * learner's audio), the engine's word verdicts (Azure / ElevenLabs) and the prosody comparison
 * (prosody.ts: pauses, rhythm, melody against the native reading). Nothing is averaged away: three
 * wrong sounds cost three times one wrong sound, whatever the rest of the sentence did.
 *
 * Thresholds are read against each language's native level, because natives match the reference voice
 * less closely in some languages. Point costs and levels are calibrated in scripts/gopcheck.mts.
 */
import type { Span } from "./text";

export interface SoundEvidence {
  /** Index of the word in the target text (-1 when outside every word). */
  word: number;
  /** Expected sound (IPA) and the most likely other sound where it was heard. */
  ref: string;
  rival: string;
  /** GOP margin: log P(expected) − log P(best other sound) at its most confident frame. */
  lpr: number;
}

export interface WordEvidence {
  text: string;
  /** Engine verdict: ok, unclear, mispronounced or omitted. */
  status: string;
}

export interface Evidence {
  lang: string;
  sounds: SoundEvidence[];
  words: WordEvidence[];
  /** 0–100 from prosody.ts, null when not measured. */
  rhythm: number | null;
  intonation: number | null;
  /** Pauses the native reading does not make. */
  hesitations: number;
  /** Native reading's speaking time over the learner's (1 = same tempo, 0.5 = twice as slow). */
  pace: number | null;
}

export type DeductionKind = "sound" | "word" | "pause" | "pace" | "rhythm" | "melody";

export interface Deduction {
  kind: DeductionKind;
  points: number;
  /** Word the mistake belongs to, when it belongs to one. */
  word?: number;
  detail: string;
}

/** Per-language native levels. GOP margins below `soundWeak` / `soundWrong` count as mistakes. */
export interface NativeLevel {
  soundWeak: number;
  soundWrong: number;
  rhythm: number;
  intonation: number;
}

/**
 * Calibrated 2026-11-15 (scripts/gopcheck.mts, labelled natives): `soundWeak` is the 8th and `soundWrong`
 * the 1st percentile of native sounds' GOP margins; rhythm and melody levels are the natives' 10th
 * percentile against the reference voice.
 */
export const NATIVE_LEVEL: Record<string, NativeLevel> = {
  en: { soundWeak: 0.59, soundWrong: -3.11, rhythm: 55, intonation: 65 },
  de: { soundWeak: -1.16, soundWrong: -5.03, rhythm: 53, intonation: 48 },
  es: { soundWeak: -2.83, soundWrong: -6.87, rhythm: 39, intonation: 57 },
  ru: { soundWeak: -2.31, soundWrong: -5.68, rhythm: 46, intonation: 43 },
  sv: { soundWeak: -3.83, soundWrong: -7.02, rhythm: 35, intonation: 46 },
};
const DEFAULT_LEVEL: NativeLevel = { soundWeak: -2.3, soundWrong: -5.7, rhythm: 45, intonation: 50 };

/**
 * Mistakes cost a share of the sentence, so a long sentence is not punished for having more sounds: the
 * costs below are for a typical sentence of REF_SOUNDS sounds and REF_WORDS words, and scale with
 * REF / actual length. Very short phrases count as at least MIN_SOUNDS / MIN_WORDS, so one slip in a
 * two-word phrase does not cost half the score.
 */
export const REF_SOUNDS = 40;
export const REF_WORDS = 10;
const MIN_SOUNDS = 12;
const MIN_WORDS = 3;

/**
 * Points each mistake costs in a typical sentence. Chosen on the labelled set (scripts/tune-deductions.mts): natives median 86–97 per language, strong
 * accents all below 60, Pearson 0.77 with expert ratings on speechocean762 (Azure alone 0.71), native
 * scores independent of sentence length (r = 0.11).
 */
export const COSTS = {
  /** A sound clearly realised as another sound. */
  soundWrong: 6,
  /** A sound noticeably off, though still nearest to the right one. */
  soundWeak: 1,
  /** A word the engine marked mispronounced or missing (on top of its sounds). */
  wordWrong: 5,
  /** A word the engine marked unclear. */
  wordUnclear: 2.5,
  /** Each pause the native reading does not make. */
  pause: 3,
  /** Per point of rhythm / melody below the native level (whole-sentence measures, not scaled). */
  rhythm: 0.32,
  melody: 0.4,
  /** Per 10% of pace below 0.7 (much slower than the native reading). */
  pace: 2,
};
export type Costs = typeof COSTS;

const round1 = (x: number) => Math.round(x * 10) / 10;

export function deduct(
  e: Evidence,
  costs: Costs = COSTS,
  level: NativeLevel = NATIVE_LEVEL[e.lang] ?? DEFAULT_LEVEL,
): { score: number; items: Deduction[] } {
  const n = level;
  const items: Deduction[] = [];
  const perSound = REF_SOUNDS / Math.max(MIN_SOUNDS, e.sounds.length);
  const perWord = REF_WORDS / Math.max(MIN_WORDS, e.words.length || e.sounds.length / 4);
  for (const s of e.sounds) {
    if (s.lpr < n.soundWrong)
      items.push({ kind: "sound", points: round1(costs.soundWrong * perSound), word: s.word, detail: `/${s.ref}/ sounded like /${s.rival}/` });
    else if (s.lpr < n.soundWeak)
      items.push({ kind: "sound", points: round1(costs.soundWeak * perSound), word: s.word, detail: `/${s.ref}/ not quite native` });
  }
  e.words.forEach((w, i) => {
    if (w.status === "mispronounced" || w.status === "omitted")
      items.push({
        kind: "word",
        points: round1(costs.wordWrong * perWord),
        word: i,
        detail: w.status === "omitted" ? "word missing" : "word not recognised as said",
      });
    else if (w.status === "unclear")
      items.push({ kind: "word", points: round1(costs.wordUnclear * perWord), word: i, detail: "word unclear" });
  });
  if (e.hesitations > 0)
    items.push({
      kind: "pause",
      points: round1(e.hesitations * costs.pause * perWord),
      detail: `${e.hesitations} extra pause${e.hesitations > 1 ? "s" : ""}`,
    });
  if (e.pace !== null && e.pace < 0.7)
    items.push({
      kind: "pace",
      points: round1(((0.7 - e.pace) / 0.1) * costs.pace),
      detail: `${Math.round((1 / e.pace - 1) * 100)}% slower than native`,
    });
  if (e.rhythm !== null && e.rhythm < n.rhythm)
    items.push({ kind: "rhythm", points: round1((n.rhythm - e.rhythm) * costs.rhythm), detail: `rhythm ${e.rhythm} (natives ≈${n.rhythm}+)` });
  if (e.intonation !== null && e.intonation < n.intonation)
    items.push({
      kind: "melody",
      points: round1((n.intonation - e.intonation) * costs.melody),
      detail: `melody ${e.intonation} (natives ≈${n.intonation}+)`,
    });
  const lost = items.reduce((s, d) => s + d.points, 0);
  return { score: Math.max(0, Math.round(100 - lost)), items };
}

/** The word each reference sound belongs to: the word whose span contains its time, or the nearest. */
export function soundOwners(times: number[], wordSpans: (Span | null)[]): number[] {
  return times.map((t) => {
    let best = -1;
    let bestDist = Infinity;
    wordSpans.forEach((w, wi) => {
      if (!w) return;
      const d = t < w.start ? w.start - t : t > w.end ? t - w.end : 0;
      if (d < bestDist) {
        bestDist = d;
        best = wi;
      }
    });
    return best;
  });
}

/**
 * The learner's word timings from the forced alignment: each word spans the frames of its sounds.
 * `soundSpans` are frame indices on the learner's audio, `owners` from soundOwners.
 */
export function learnerWordSpans(
  soundSpans: { start: number; end: number }[],
  owners: number[],
  words: number,
  frameSeconds: number,
): (Span | null)[] {
  const out: (Span | null)[] = Array.from({ length: words }, () => null);
  soundSpans.forEach((s, i) => {
    const w = owners[i];
    if (w < 0 || w >= words || !Number.isFinite(s.start)) return;
    const span = { start: s.start * frameSeconds, end: (s.end + 1) * frameSeconds };
    const cur = out[w];
    out[w] = cur ? { start: Math.min(cur.start, span.start), end: Math.max(cur.end, span.end) } : span;
  });
  return out;
}
