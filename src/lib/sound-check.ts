/**
 * Precise sound check, run on the server.
 *
 * A multilingual phone recogniser (about 240 MB, loaded once on the server) compares the learner's sounds
 * with the native reference of the same text. Nothing is downloaded by the learner. See
 * src/lib/phone-compare.ts for the comparison itself.
 */
import { learnerWordSpans, soundOwners, type SoundEvidence } from "./deductions";
import { nonPhoneIds, strictFeatures, type Logits, type StrictFeatures } from "./gop";
import { statusFor } from "./levels";
import { compareSounds, decodeCtc, FRAME_SECONDS, type SoundCheck } from "./phone-compare";
import type { AssessResult } from "./types";

interface Recognizer {
  phones: (samples: Float32Array) => Promise<ReturnType<typeof decodeCtc>>;
  /** Raw per-frame output, for the strict measures in gop.ts. */
  logits: (samples: Float32Array) => Promise<Logits>;
  tokens: string[];
}

let loading: Promise<Recognizer> | null = null;

/** Float32 logits arrive as base64 text from /api/sound-check. */
function fromBase64(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/**
 * The model runs on the server (src/lib/server/phone-model.ts). Loading is a warm-up request that returns the
 * sound inventory; each recording is sent as raw 16 kHz Float32 samples and the per-frame scores come back.
 */
async function startRemote(onProgress?: (fraction: number) => void): Promise<Recognizer> {
  const res = await fetch("/api/sound-check", { credentials: "same-origin" });
  if (!res.ok) throw new Error("The sound model is not available.");
  const { tokens } = (await res.json()) as { tokens: string[] };
  onProgress?.(1);
  const logits = async (samples: Float32Array): Promise<Logits> => {
    const r = await fetch("/api/sound-check", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Blob([samples as BlobPart]),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; data?: string; frames?: number; vocab?: number };
    if (!r.ok || !j.data) throw new Error(j.error ?? "The sound check failed.");
    return { data: fromBase64(j.data), frames: j.frames!, vocab: j.vocab! };
  };
  return {
    tokens,
    logits,
    phones: async (samples: Float32Array) => {
      const l = await logits(samples);
      return decodeCtc(l.data, l.frames, l.vocab, tokens);
    },
  };
}

/** Connect to the server-side recogniser (a warm-up request). Progress is reported from 0 to 1. */
export function loadSoundCheck(onProgress?: (fraction: number) => void): Promise<Recognizer> {
  loading ??= startRemote(onProgress).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/**
 * Compare the learner's recording with the native reference, sound by sound.
 * Both are 16 kHz mono samples; `referenceSpans` are the reference's word timings.
 */
export async function checkSounds(
  learner: Float32Array,
  reference: Float32Array,
  referenceSpans: ({ start: number; end: number } | null)[],
): Promise<SoundCheck> {
  const recognizer = await loadSoundCheck();
  const refPhones = await recognizer.phones(reference);
  const heard = await recognizer.phones(learner);
  return compareSounds(refPhones, referenceSpans, heard);
}

export interface StrictWord {
  /** Weakest expected sound in the word and its GOP margin (negative: another sound was more likely). */
  weakest: { ref: string; rival: string; lpr: number } | null;
  /** 0–100, from the word's weakest sound, read against the native level. */
  score: number;
}

export interface StrictCheck {
  check: SoundCheck;
  features: StrictFeatures;
  /** 0–100 sentence score from the device alone. */
  score: number;
  words: StrictWord[];
  /** Every expected sound with its word, for deduction scoring (deductions.ts). */
  sounds: SoundEvidence[];
  /** The learner's word timings from the forced alignment (seconds). */
  wordSpans: ({ start: number; end: number } | null)[];
}

/**
 * Native levels of the strict measures per language (median of native news speech against the reference
 * voice, scripts/gopcheck.mts, 2026-11-15). Natives match the reference voice less closely in some
 * languages, so every measure is read relative to its native level.
 */
export const STRICT_NATIVE: Record<string, { p10: number; deficit: number; match: number }> = {
  en: { p10: 1.0, deficit: 0.16, match: 96 },
  de: { p10: -0.78, deficit: 0.51, match: 82 },
  es: { p10: -1.97, deficit: 0.93, match: 78 },
  ru: { p10: -1.59, deficit: 1.18, match: 68 },
  sv: { p10: -2.89, deficit: 1.5, match: 61 },
};
const STRICT_DEFAULT = { p10: -1.5, deficit: 0.9, match: 75 };
const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

/**
 * Strict sentence score. On real speech (speechocean762, n=96) it tracks expert ratings at Pearson 0.74,
 * above Azure alone (0.71); voices reading a language they do not speak land at a median of 13–60.
 * Each GOP unit below the native level costs 8 points, each deficit unit 20, each match point 1.5.
 */
export function strictScore(f: Pick<StrictFeatures, "gopP10" | "deficit">, match: number, lang: string): number {
  const n = STRICT_NATIVE[lang] ?? STRICT_DEFAULT;
  const gop = 95 - 8 * Math.max(0, n.p10 - f.gopP10);
  const def = 95 - 20 * Math.max(0, f.deficit - n.deficit);
  const gate = 106 - 1.5 * Math.max(0, n.match - match);
  return clamp100(Math.min((gop + def) / 2, gate));
}

/**
 * Sound check plus the strict measures: one model pass per recording, both computed from it.
 * `referenceSpans` are the reference's word timings in seconds.
 */
export async function checkSoundsStrict(
  learner: Float32Array,
  reference: Float32Array,
  referenceSpans: ({ start: number; end: number } | null)[],
  lang: string,
): Promise<StrictCheck> {
  const r = await loadSoundCheck();
  const [L, R] = [await r.logits(learner), await r.logits(reference)];
  const refPhones = decodeCtc(R.data, R.frames, R.vocab, r.tokens);
  const check = compareSounds(refPhones, referenceSpans, decodeCtc(L.data, L.frames, L.vocab, r.tokens));
  const features = strictFeatures(L, R, r.tokens.indexOf("<pad>"), nonPhoneIds(r.tokens));
  if (!features) throw new Error("Could not line your recording up with the native reading.");
  const level = (STRICT_NATIVE[lang] ?? STRICT_DEFAULT).p10;
  // features.phones follow the reference's sounds in order, as refPhones do; attribute them to words by time.
  const words: StrictWord[] = referenceSpans.map(() => ({ weakest: null, score: 100 }));
  features.phones.forEach((p, i) => {
    const t = refPhones[i]?.t ?? i * FRAME_SECONDS;
    let wi = -1;
    let best = Infinity;
    referenceSpans.forEach((s, k) => {
      if (!s) return;
      const d = t < s.start ? s.start - t : t > s.end ? t - s.end : 0;
      if (d < best) {
        best = d;
        wi = k;
      }
    });
    const w = words[wi];
    if (!w || (w.weakest && w.weakest.lpr <= p.lpr)) return;
    w.weakest = { ref: r.tokens[p.id], rival: r.tokens[p.rival] ?? "?", lpr: p.lpr };
    w.score = clamp100(95 - 8 * Math.max(0, level - 1.5 - p.lpr));
  });
  const owners = soundOwners(
    refPhones.map((p) => p.t),
    referenceSpans,
  );
  const sounds = features.phones.map((p, i) => ({
    word: owners[i] ?? -1,
    ref: r.tokens[p.id],
    rival: r.tokens[p.rival] ?? "?",
    lpr: p.lpr,
  }));
  const wordSpans = learnerWordSpans(features.spans, owners, referenceSpans.length, FRAME_SECONDS);
  return { check, features, words, sounds, wordSpans, score: strictScore(features, check.match, lang) };
}

/**
 * Below this match a word's sounds differ clearly from the native reading. Set from the real-speech
 * evaluation (scripts/phonecheck.mts) so that native news speech is almost never flagged.
 */
export const FLAG_BELOW = 50;

/**
 * Median sound match of native news speech against the reference voice, per language. Natives match the
 * reference less closely in some languages (regional variety, speaking style), so the match is read
 * relative to this level rather than as an absolute number.
 */
export const NATIVE_MATCH: Record<string, number> = { en: 96, de: 82, es: 79, ru: 67, sv: 61 };
const DEFAULT_NATIVE_MATCH = 82;

/** Sound match re-anchored so the native median reads 96; each point below it costs 1.5. */
export function nativeMatch(match: number, lang: string): number {
  return Math.max(0, Math.min(100, Math.round(96 - 1.5 * ((NATIVE_MATCH[lang] ?? DEFAULT_NATIVE_MATCH) - match))));
}
/** Share of the sentence sound score that comes from the comparison (the rest is the engine score). */
export const MATCH_WEIGHT = 0.25;

/**
 * Attach the comparison to each word and let clear sound differences lower its score. The engine score
 * stays when the sounds match: this check only ever adds evidence of a difference, never forgives one.
 */
export function applySoundCheck(result: AssessResult, check: SoundCheck, lang: string): AssessResult {
  // Word flags move with the native level too: where natives match the reference less, flag less eagerly.
  const flagBelow = FLAG_BELOW - (96 - (NATIVE_MATCH[lang] ?? DEFAULT_NATIVE_MATCH));
  const words = result.words.map((w) => {
    const c = check.words[w.index];
    if (!c || !c.ref.length || w.status === "omitted") return w;
    const native = { match: c.match, ref: c.ref.join(""), heard: c.heard.join(""), issues: c.issues };
    if (c.match >= flagBelow || !c.issues.length) return { ...w, native };
    const score = Math.min(w.score, Math.round(40 + c.match / 2));
    return { ...w, native, score, status: w.status === "ok" ? statusFor(score) : w.status };
  });
  // On real speech, 75% engine + 25% sound match tracked expert ratings best (Pearson 0.78 vs 0.71 alone).
  const wordMean = words.length ? words.reduce((s, w) => s + (w.status === "omitted" ? 0 : w.score), 0) / words.length : 0;
  // Matching the reference better than natives typically do is not evidence of sounding native (short,
  // easy phrases match closely for everyone), so the check can only hold the score or lower it.
  const accuracy = words.length
    ? Math.min(
        result.scores.accuracy,
        Math.round((1 - MATCH_WEIGHT) * wordMean + MATCH_WEIGHT * Math.min(96, nativeMatch(check.match, lang))),
      )
    : result.scores.accuracy;
  return { ...result, depth: "sound", words, scores: { ...result.scores, accuracy } };
}
