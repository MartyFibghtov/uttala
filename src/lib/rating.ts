/**
 * The app's main rating: score by deduction (deductions.ts).
 *
 * Every recording starts at 100 and each mistake the on-device sound model, the engine's word verdicts
 * and the prosody comparison catch costs points. The sound model (about 240 MB) is downloaded once and
 * runs in the browser in a Web Worker (public/sound-model-worker.js); when it or the native reference is unavailable the engine score is kept and
 * the result says so in its warnings.
 */
import { toast } from "sonner";
import { trackPitch, type PitchTrack } from "./audio";
import { deduct } from "./deductions";
import { statusFor } from "./levels";
import { compareProsody } from "./prosody";
import { applySoundCheck, checkSoundsStrict, loadSoundCheck, SOUND_CHECK_DOWNLOAD_MB, type StrictCheck } from "./sound-check";
import type { Span } from "./text";
import type { AssessResult, ProsodyResult } from "./types";

export interface RatingReference {
  samples: Float32Array | null;
  spans: (Span | null)[];
  pitch: PitchTrack | null;
}

const TOAST_ID = "sound-model";
/** First download on a slow connection can take a while; after that the model loads from cache. */
const MODEL_WAIT_MS = 240_000;
const ANALYSIS_WAIT_MS = 45_000;

let progress = 0;
let ready = false;
let model: Promise<unknown> | null = null;
const progressListeners = new Set<(fraction: number) => void>();

/** Follow the model download (0–1). Returns an unsubscribe function. */
export function onModelProgress(listener: (fraction: number) => void): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

/** Start downloading the sound model in the background (safe to call repeatedly). */
export function preloadRatingModel(): Promise<unknown> {
  model ??= loadSoundCheck((f) => {
    progress = f;
    progressListeners.forEach((l) => l(f));
  })
    .then((r) => {
      ready = true;
      return r;
    })
    .catch((err) => {
      model = null;
      throw err;
    });
  return model;
}

/** The strict sound check: model inference in the worker, the alignment measures here. */
export function strictCheck(learner: Float32Array, reference: Float32Array, spans: (Span | null)[], lang: string): Promise<StrictCheck> {
  return checkSoundsStrict(learner, reference, spans, lang);
}

function timeout<T>(ms: number): Promise<T | null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

/** Wait for the model, showing the download progress while it is not ready yet. */
async function waitForModel(): Promise<boolean> {
  const pending = preloadRatingModel().then(
    () => true,
    () => false,
  );
  if (ready) return true;
  const show = () =>
    toast.loading(
      `Downloading the sound model (${Math.round(progress * 100)}% of about ${SOUND_CHECK_DOWNLOAD_MB} MB). This happens once.`,
      { id: TOAST_ID },
    );
  show();
  const timer = setInterval(show, 500);
  try {
    return (await Promise.race([pending, timeout<boolean>(MODEL_WAIT_MS)])) === true;
  } finally {
    clearInterval(timer);
    toast.dismiss(TOAST_ID);
  }
}

/**
 * Rate a recording by deduction. Returns the engine result with `deduction` attached (the overall score),
 * words lowered where the sound model heard a clear difference, and prosody measured on the sound
 * model's word timings. Without the model or reference, returns the engine result unchanged plus a warning.
 */
export async function rateWithDeductions(
  samples: Float32Array,
  engine: AssessResult,
  reference: RatingReference | null,
  lang: string,
): Promise<{ result: AssessResult; prosody: ProsodyResult | null }> {
  const fallback = (why: string) => ({
    result: { ...engine, warnings: [...engine.warnings, `Precise rating unavailable (${why}); showing the engine score.`] },
    prosody: null,
  });
  if (engine.demo) return { result: engine, prosody: null };
  if (!reference?.samples) return fallback("no native reference");
  if (!(await waitForModel())) return fallback("the sound model could not be downloaded");
  try {
    const strict = await Promise.race([
      strictCheck(samples, reference.samples, reference.spans, lang),
      timeout<never>(ANALYSIS_WAIT_MS),
    ]);
    if (!strict) return fallback("the sound check took too long");
    const prosody = compareProsody(strict.wordSpans, reference.spans, trackPitch(samples), reference.pitch);
    const deduction = deduct({
      lang,
      sounds: strict.sounds,
      words: engine.words.map((w) => ({ text: w.text, status: w.status })),
      rhythm: prosody.rhythm,
      intonation: prosody.intonation,
      hesitations: prosody.hesitations,
      pace: prosody.pace,
    });
    const checked = applySoundCheck(engine, strict.check, lang);
    const words = checked.words.map((w) => {
      const s = strict.words[w.index];
      if (!s || w.status === "omitted" || s.score >= w.score) return w;
      return { ...w, score: s.score, status: w.status === "ok" ? statusFor(s.score) : w.status };
    });
    return { result: { ...checked, words, deduction }, prosody };
  } catch (err) {
    console.error("precise rating failed", err);
    return fallback(err instanceof Error ? err.message : "error");
  }
}
