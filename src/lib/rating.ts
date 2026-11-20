/**
 * The app's main rating: score by deduction (deductions.ts).
 *
 * Every recording starts at 100 and each mistake the sound model, the engine's word verdicts
 * and the prosody comparison catch costs points. The sound model runs on our server (the recording is
 * analysed in memory and not stored); when it or the native reference is unavailable the engine score is
 * kept and the result says so in its warnings.
 */
import { toast } from "sonner";
import { trackPitch, type PitchTrack } from "./audio";
import { deduct } from "./deductions";
import { statusFor } from "./levels";
import { compareProsody } from "./prosody";
import { applySoundCheck, checkSoundsStrict, type StrictCheck } from "./sound-check";
import type { Span } from "./text";
import type { AssessResult, ProsodyResult } from "./types";

export interface RatingReference {
  samples: Float32Array | null;
  spans: (Span | null)[];
  pitch: PitchTrack | null;
}

const ANALYSIS_WAIT_MS = 30_000;

/** The strict sound check: model inference on our server, the alignment measures here. */
export function strictCheck(learner: Float32Array, reference: Float32Array, spans: (Span | null)[], lang: string): Promise<StrictCheck> {
  return checkSoundsStrict(learner, reference, spans, lang);
}

function timeout<T>(ms: number): Promise<T | null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
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
  const toastId = toast.loading("Checking your sounds…");
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
  } finally {
    toast.dismiss(toastId);
  }
}
