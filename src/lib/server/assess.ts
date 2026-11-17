import { getLanguage } from "../languages";
import { SCORE_SCALE, statusFor, toNativeScale } from "../levels";
import { enrichWordDiagnostics, extractFocusSounds } from "../phonetics";
import { align, normalize, sameWord, similarity, timeTokens, tokenize, type Token } from "../text";
import type { AssessResult, CheckDepth, WordResult } from "../types";
import { assessWithAzure, hasAzure, type AzureAssessment } from "./azure";
import { forcedAlign, hasElevenLabs, transcribe, type ForcedAlignment, type Transcript } from "./elevenlabs";
import { assessWithOpenAi, hasOpenAi, type OpenAiAssessment } from "./openai";

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Alignment loss → 0..1 "acoustic fit". Measured native ElevenLabs forced alignment
 * losses typically sit around 0.25–0.70, so we shift and soften the decay curve.
 */
const FIT_SCALE = Number(process.env.ALIGNMENT_LOSS_SCALE ?? 0.75);
const fitFromLoss = (loss: number) => Math.min(1, Math.exp(-Math.max(0, loss - 0.25) * FIT_SCALE));

/** No speech was recognised in the recording, so there is nothing fair to score. */
export class NoSpeechError extends Error {
  constructor() {
    super("We didn't catch any speech in that recording. Check your microphone and try again, speaking a little louder.");
    this.name = "NoSpeechError";
  }
}

interface Heard {
  norm: string;
  text: string;
  start: number;
  end: number;
  conf?: number;
}

/** Re-tokenise recogniser output with our own segmenter so both sides split words the same way. */
function heardTokens(t: Transcript, locale: string): Heard[] {
  const out: Heard[] = [];
  for (const w of t.words) {
    const parts = tokenize(w.text, locale);
    const span = (w.end - w.start) / Math.max(1, parts.length);
    parts.forEach((p, k) =>
      out.push({
        norm: p.norm,
        text: p.text,
        start: w.start + k * span,
        end: w.start + (k + 1) * span,
        conf: typeof w.logprob === "number" ? Math.exp(w.logprob) : undefined,
      }),
    );
  }
  return out;
}

export function buildResult(
  text: string,
  lang: string,
  duration: number,
  parts: {
    fa?: ForcedAlignment;
    stt?: Transcript;
    azure?: AzureAssessment;
    openai?: OpenAiAssessment;
  },
  warnings: string[],
): AssessResult {
  const tokens = tokenize(text, lang);
  const { fa, stt, azure, openai } = parts;
  const words: WordResult[] = tokens.map((t, index) => ({
    index,
    text: t.text,
    from: t.from,
    to: t.to,
    status: "ok",
    score: 0,
  }));

  // 1. Timings and acoustic fit from forced alignment (combining DP char alignment and word alignment).
  const charSpans = fa ? timeTokens(fa.chars, tokens, lang) : tokens.map(() => null);
  const fit: (number | undefined)[] = tokens.map(() => undefined);
  const faLosses: (number | undefined)[] = tokens.map(() => undefined);

  if (fa) {
    // Align fa.words to tokens by sequence rather than only loose time overlap.
    const faWordNorms = fa.words.map((w) => normalize(w.text, lang));
    const faOps = align(
      tokens.map((t) => t.norm),
      faWordNorms,
    );
    const matchedFaWord: (ForcedAlignment["words"][number] | undefined)[] = tokens.map(() => undefined);
    for (const op of faOps) {
      if (op.type === "match" || op.type === "sub") {
        matchedFaWord[op.ti] = fa.words[op.hi];
      }
    }

    tokens.forEach((_, i) => {
      const cs = charSpans[i];
      const fw = matchedFaWord[i];
      if (cs && fw && fw.end > fw.start) {
        // Tighten boundaries when both char-level DP and word-level FA agree, trimming silence bleed.
        const overlap = Math.min(cs.end, fw.end) - Math.max(cs.start, fw.start);
        if (overlap > 0) {
          words[i].start = Math.max(cs.start, fw.start);
          words[i].end = Math.min(cs.end, fw.end);
        } else {
          words[i].start = cs.start;
          words[i].end = cs.end;
        }
        faLosses[i] = fw.loss;
        fit[i] = fitFromLoss(fw.loss);
      } else if (cs) {
        words[i].start = cs.start;
        words[i].end = cs.end;
        const overlapping = fa.words.filter((w) => w.end > cs.start && w.start < cs.end);
        if (overlapping.length) {
          const avgLoss = mean(overlapping.map((w) => w.loss));
          faLosses[i] = avgLoss;
          fit[i] = fitFromLoss(avgLoss);
        }
      } else if (fw && fw.end > fw.start) {
        words[i].start = fw.start;
        words[i].end = fw.end;
        faLosses[i] = fw.loss;
        fit[i] = fitFromLoss(fw.loss);
      }
    });
  }

  // 2. Intelligibility and timing refinement from open transcription (STT).
  const insertions: string[] = [];
  let understood = 0;
  if (stt) {
    const heard = heardTokens(stt, lang);
    const rawOps = align(tokens.map((t) => t.norm), heard.map((h) => h.norm));
    // Reconcile compound merges/splits in STT (e.g. "I morgon" vs "Imorgon").
    const ops: typeof rawOps = [];
    for (let k = 0; k < rawOps.length; k++) {
      const a = rawOps[k];
      const b = rawOps[k + 1];
      if (a && b) {
        const mergedHi = a.type === "del" && b.type === "sub" ? b.hi : a.type === "sub" && b.type === "del" ? a.hi : -1;
        if (mergedHi >= 0 && a.type !== "ins" && b.type !== "ins" && tokens[a.ti].norm + tokens[b.ti].norm === heard[mergedHi].norm) {
          const h = heard[mergedHi];
          const lenA = Math.max(1, tokens[a.ti].norm.length);
          const lenB = Math.max(1, tokens[b.ti].norm.length);
          const split = h.start + ((h.end - h.start) * lenA) / (lenA + lenB);
          const idx1 = heard.length;
          heard.push({ norm: tokens[a.ti].norm, text: tokens[a.ti].text, start: h.start, end: split, conf: h.conf });
          heard.push({ norm: tokens[b.ti].norm, text: tokens[b.ti].text, start: split, end: h.end, conf: h.conf });
          ops.push({ type: "match", ti: a.ti, hi: idx1 });
          ops.push({ type: "match", ti: b.ti, hi: idx1 + 1 });
          k++;
          continue;
        }
        const splitTi = a.type === "sub" && b.type === "ins" ? a.ti : a.type === "ins" && b.type === "sub" ? b.ti : -1;
        if (splitTi >= 0 && a.type !== "del" && b.type !== "del" && tokens[splitTi].norm === heard[a.hi].norm + heard[b.hi].norm) {
          const h1 = heard[a.hi];
          const h2 = heard[b.hi];
          const confs = [h1.conf, h2.conf].filter((v): v is number => v !== undefined);
          const idx = heard.length;
          heard.push({
            norm: tokens[splitTi].norm,
            text: tokens[splitTi].text,
            start: h1.start,
            end: h2.end,
            conf: confs.length ? mean(confs) : undefined,
          });
          ops.push({ type: "match", ti: splitTi, hi: idx });
          k++;
          continue;
        }
      }
      ops.push(a);
    }

    for (const op of ops) {
      if (op.type === "ins") {
        insertions.push(heard[op.hi].text);
        continue;
      }
      const w = words[op.ti];
      if (op.type === "del") {
        w.status = "omitted";
        w.score = 0;
        // If forced alignment had poor fit on a skipped word, clear its bogus timing.
        if ((fit[op.ti] ?? 0) < 0.5) {
          w.start = undefined;
          w.end = undefined;
        }
        continue;
      }
      const h = heard[op.hi];
      const hValid = h.end > h.start;
      if (w.start === undefined || w.end === undefined) {
        if (hValid) {
          w.start = h.start;
          w.end = h.end;
        }
      } else if (hValid) {
        // When FA had high loss or drifted >300ms from STT, anchor to STT word timing.
        const drift = Math.abs(w.start - h.start);
        if ((fit[op.ti] ?? 0.5) < 0.38 || drift > 0.32) {
          w.start = h.start * 0.65 + w.start * 0.35;
          w.end = h.end * 0.65 + w.end * 0.35;
        } else {
          // Trim any leading/trailing pause bleed using STT's tighter speech onset/offset.
          const tightenedStart = Math.max(w.start, h.start - 0.02);
          const tightenedEnd = Math.min(w.end, h.end + 0.03);
          if (tightenedEnd > tightenedStart + 0.04) {
            w.start = tightenedStart;
            w.end = tightenedEnd;
          }
        }
      }

      // A recogniser spelling the word another accepted way ("practice" for "practise") heard it right.
      if (op.type === "match" || sameWord(tokens[op.ti].norm, h.norm, lang)) {
        understood++;
        const f = fit[op.ti];
        const c = h.conf;
        const raw = f !== undefined && c !== undefined ? f * 0.8 + c * 0.2 : (f ?? c ?? 0.65);
        w.score = clamp(Math.round(96 * Math.pow(Math.max(0, Math.min(1, raw)), 1.4)));
        w.status = statusFor(w.score);
      } else {
        w.heard = h.text;
        w.score = clamp(Math.round(45 * similarity(tokens[op.ti].norm, h.norm)));
        w.status = "mispronounced";
      }
    }
  } else {
    words.forEach((w, i) => {
      const raw = Math.max(0, Math.min(1, fit[i] ?? 0.65));
      w.score = clamp(Math.round(96 * Math.pow(raw, 1.4)));
      w.status = statusFor(w.score);
    });
    understood = words.length;
  }

  // Enforce monotonic non-overlapping word spans after fusing FA and STT.
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const cur = words[i];
    if (
      prev.start !== undefined &&
      prev.end !== undefined &&
      cur.start !== undefined &&
      cur.end !== undefined &&
      cur.start < prev.end
    ) {
      const mid = (prev.end + cur.start) / 2;
      if (mid > prev.start + 0.02 && cur.end > mid + 0.02) {
        prev.end = mid;
        cur.start = mid;
      }
    }
  }

  // 3. Phoneme-level scores from Azure, when configured for this language.
  let phonemeLevel = false;
  if (azure) {
    const spoken = azure.words.filter((w) => w.errorType !== "Insertion");
    const ops = align(
      tokens.map((t) => t.norm),
      spoken.map((w) => normalize(w.text, lang)),
    );
    for (const op of ops) {
      if (op.type === "ins" || op.type === "del") continue;
      const a = spoken[op.hi];
      const w = words[op.ti];
      if (a.errorType === "Omission") {
        w.status = "omitted";
        w.score = 0;
        continue;
      }
      if ((w.start === undefined || w.end === undefined) && a.start !== undefined && a.end !== undefined) {
        w.start = a.start;
        w.end = a.end;
      }
      let misheard = w.status === "mispronounced" && w.heard !== undefined;
      // The open recogniser can mishear short or rare words that were said correctly. When Azure,
      // which checks the expected sounds one by one, finds no error and a clear score, trust it.
      if (misheard && a.errorType === "None" && a.score >= SCORE_SCALE.clear) {
        misheard = false;
        w.heard = undefined;
        understood++;
      }
      w.score = Math.round(misheard ? Math.min(a.score, 59) : a.score);
      w.status =
        a.errorType === "Mispronunciation" && w.score < SCORE_SCALE.clear
          ? "mispronounced"
          : statusFor(w.score);
      if (a.phonemes.length) {
        w.phonemes = a.phonemes.map((p) => ({
          ipa: p.ipa,
          score: Math.round(p.score),
          // Azure's top guess can differ on a sound that was fine, so only name it when the sound scored low.
          ...(p.heard && p.score < SCORE_SCALE.clear ? { heardIpa: p.heard } : {}),
        }));
        w.phonemesMeasured = true;
        phonemeLevel = true;
      }
    }
  }

  // 4. Multimodal phonetic & articulatory diagnosis from OpenAI audio model.
  if (openai && openai.words.length > 0) {
    const aiNorms = openai.words.map((w) => normalize(w.text, lang));
    const ops =
      openai.words.length === tokens.length
        ? tokens.map((_, i) => ({ type: "match" as const, ti: i, hi: i }))
        : align(
            tokens.map((t) => t.norm),
            aiNorms,
          );

    for (const op of ops) {
      if (op.type === "ins" || op.type === "del") continue;
      const ai = openai.words[op.hi];
      const w = words[op.ti];
      if (!ai || !w) continue;

      if (ai.errorType === "Omission" && w.status === "omitted") {
        w.score = 0;
      } else if (w.status === "omitted" && ai.errorType !== "Omission" && ai.score >= 50) {
        // OpenAI heard the word clearly even though STT missed it
        w.score = ai.score;
        w.status = statusFor(w.score);
        understood++;
      } else {
        const sttMisheard = w.status === "mispronounced" && w.heard !== undefined;
        const blended = azure
          ? Math.round(w.score * 0.55 + ai.score * 0.45)
          : Math.round(w.score * 0.15 + ai.score * 0.85);
        w.score = sttMisheard ? Math.min(blended, 52) : clamp(blended);
        w.status =
          (ai.errorType === "Mispronunciation" || ai.errorType === "ConsonantSubstitution" || sttMisheard) &&
          w.score < SCORE_SCALE.clear
            ? w.score < SCORE_SCALE.unclear
              ? "mispronounced"
              : "unclear"
            : statusFor(w.score);
      }

      if (ai.expectedIpa) w.expectedIpa = ai.expectedIpa;
      if (ai.heardIpa) w.heardIpa = ai.heardIpa;
      if (!w.heard && ai.heard && normalize(ai.heard, lang) !== tokens[op.ti].norm) {
        w.heard = ai.heard;
      }
      if (ai.errorCategory) w.errorCategory = ai.errorCategory;
      if (ai.diagnosis) w.diagnosis = ai.diagnosis;
      if (ai.fix) w.fix = ai.fix;
      if (ai.stressIssue) w.stressIssue = ai.stressIssue;

      if (ai.phonemes.length > 0 && (!w.phonemes || !w.phonemes.length)) {
        w.phonemes = ai.phonemes;
        w.phonemesMeasured = true;
        phonemeLevel = true;
      } else if (ai.phonemes.length > 0 && w.phonemes && w.phonemes.length > 0) {
        // Enrich Azure phonemes with OpenAI's heardIpa / issue / tip diagnostics.
        w.phonemes = w.phonemes.map((p, idx) => {
          const match = ai.phonemes.find((ap) => ap.ipa === p.ipa) ?? ai.phonemes[idx];
          return {
            ...p,
            heardIpa: p.heardIpa ?? match?.heardIpa,
            issue: p.issue ?? match?.issue,
            tip: p.tip ?? match?.tip,
          };
        });
        phonemeLevel = true;
      }
    }
  }

  // 5. Enrich every word with phoneme-level breakdown and articulatory diagnosis so
  //    detailed feedback is always present even without external phoneme APIs.
  //    Sounds added here are the expected sounds only; they carry no measurement of their own.
  words.forEach((w, i) => enrichWordDiagnostics(w, lang, { faLoss: faLosses[i] }));
  const depth: CheckDepth = phonemeLevel ? "sound" : azure || openai ? "word" : "basic";

  const focusSounds = extractFocusSounds(words, lang);
  const total = Math.max(1, words.length);
  const claritySum = words.reduce((sum, w) => {
    if (w.status === "omitted") return sum;
    if (w.heard !== undefined && w.score < 60) return sum + 0.25;
    if (w.score >= 78) return sum + 1;
    if (w.score >= 60) return sum + 0.72;
    if (w.score >= 40) return sum + 0.42;
    return sum + 0.15;
  }, 0);
  // Nothing recognisable at all: ask for another take rather than scoring silence or noise.
  const azureHeard = azure?.words.some((w) => w.errorType !== "Omission" && w.score > 0) ?? false;
  // The audio model is not consulted here: in calibration it reported words in pure silence.
  if (stt && heardTokens(stt, lang).length === 0 && !azureHeard) {
    throw new NoSpeechError();
  }
  // Open recognition is unreliable on very short clips, so it does not cap intelligibility there;
  // the per-word clarity below still reflects any word it misheard.
  const shortClip = duration < 1.5 || tokens.length === 1;
  const sttCap = stt && !shortClip ? Math.round((understood / total) * 100) : 100;
  const intelligibility = clamp(Math.min(sttCap, Math.round((claritySum / total) * 100)));
  // Re-anchor scores on what native speakers reach in this language (intelligibility above keeps the
  // raw scores: it is about being understood, not about accent). Only engine-scored words are calibrated.
  // SCORE_RAW=1 keeps raw engine scores, for the calibration scripts that measure the native range.
  if (azure && process.env.SCORE_RAW !== "1") {
    for (const w of words) {
      if (w.status === "omitted") continue;
      w.score = toNativeScale(w.score, lang);
      w.status = w.status === "mispronounced" ? "mispronounced" : statusFor(w.score);
      if (w.phonemesMeasured && w.phonemes) {
        w.phonemes = w.phonemes.map((p) => ({ ...p, score: toNativeScale(p.score, lang) }));
      }
    }
  }
  return {
    engines: { elevenlabs: hasElevenLabs(), azure: hasAzure() || hasOpenAi(), openai: hasOpenAi() },
    demo: false,
    phonemeLevel,
    depth,
    transcript: stt?.text ?? "",
    words,
    insertions,
    scores: {
      accuracy: Math.round(mean(words.map((w) => w.score))),
      intelligibility,
      completeness: Math.round((words.filter((w) => w.status !== "omitted").length / total) * 100),
    },
    duration,
    warnings,
    overallFeedback: openai?.overallFeedback,
    focusSounds,
  };
}

export async function assess(
  wav: Blob,
  text: string,
  lang: string,
  duration: number,
  phonemes: boolean,
): Promise<AssessResult> {
  const warnings: string[] = [];
  const locale = getLanguage(lang).azure;
  const useAzure = phonemes && hasAzure() && !!locale;
  // Where Azure scores, the audio model is opt-in (SCORE_WITH_OPENAI=1). Calibration showed that
  // blending it in lowered native scores about as much as accented ones, added timeouts and
  // invented words in silence, so it did not separate accents better than Azure alone.
  const useOpenAi = hasOpenAi() && (!useAzure || process.env.SCORE_WITH_OPENAI === "1");

  // A brief outage or rate limit should not silently drop the main pronunciation scorer: retry once.
  const azureWithRetry = async (azureLocale: string) => {
    try {
      return await assessWithAzure(wav, text, azureLocale);
    } catch (err) {
      console.error("azure assessment failed, retrying", err);
      await new Promise((r) => setTimeout(r, 600));
      return assessWithAzure(wav, text, azureLocale);
    }
  };

  // Run acoustic alignment/transcription and multimodal phonetic diagnosis in parallel.
  const [fa, stt, azure, openaiParallel] = await Promise.allSettled([
    forcedAlign(wav, text),
    transcribe(wav, lang),
    useAzure && locale ? azureWithRetry(locale) : Promise.resolve(undefined),
    useOpenAi ? assessWithOpenAi(wav, text, lang) : Promise.resolve(undefined),
  ]);

  const azureResult = azure.status === "fulfilled" ? azure.value : undefined;
  let openaiResult: OpenAiAssessment | undefined =
    openaiParallel.status === "fulfilled" ? openaiParallel.value : undefined;
  // Without Azure, alignment fit alone scores even native speech far too low, so bring in the
  // OpenAI assessment as the stand-in scorer when Azure was expected but did not answer.
  if (useAzure && !azureResult && !openaiResult && hasOpenAi()) {
    try {
      openaiResult = await assessWithOpenAi(wav, text, lang);
    } catch (err) {
      console.error("openai stand-in assessment failed", err);
    }
  }
  const degraded = (useAzure && !azureResult) || (useOpenAi && !openaiResult);
  if (
    fa.status === "rejected" &&
    stt.status === "rejected" &&
    !azureResult &&
    !useOpenAi &&
    !openaiResult &&
    hasOpenAi()
  ) {
    try {
      openaiResult = await assessWithOpenAi(wav, text, lang);
    } catch (err) {
      console.error("openai fallback assessment failed", err);
    }
  }

  if (fa.status === "rejected" && stt.status === "rejected" && !openaiResult && !azureResult) {
    throw new Error(String(stt.reason?.message ?? stt.reason));
  }
  for (const r of [fa, stt, azure, openaiParallel]) {
    if (r.status === "rejected") console.error("assessment engine failed", r.reason);
  }
  if (((fa.status === "rejected" || stt.status === "rejected") && !openaiResult && !azureResult) || degraded) {
    warnings.push("Part of the analysis was unavailable just now, so some scores may be less detailed than usual.");
  }
  return buildResult(
    text,
    lang,
    duration,
    {
      fa: fa.status === "fulfilled" ? fa.value : undefined,
      stt: stt.status === "fulfilled" ? stt.value : undefined,
      azure: azureResult,
      openai: openaiResult,
    },
    warnings,
  );
}

/** Simulated result so the interface can be explored before any API key is set. */
export function demoResult(text: string, lang: string, duration: number): AssessResult {
  const tokens: Token[] = tokenize(text, lang);
  let seed = 0;
  for (const ch of text) seed = (seed * 31 + ch.codePointAt(0)!) >>> 0;
  seed = (seed + Math.round(duration * 1000)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const chars = tokens.reduce((n, t) => n + t.text.length, 0) || 1;
  let cursor = duration * 0.05;
  const speech = duration * 0.9;
  const words: WordResult[] = tokens.map((t, index) => {
    const len = (t.text.length / chars) * speech;
    const start = cursor;
    cursor += len;
    const r = rand();
    const score = r < 0.07 ? Math.round(30 + rand() * 25) : r < 0.2 ? Math.round(62 + rand() * 16) : Math.round(82 + rand() * 18);
    const w: WordResult = {
      index,
      text: t.text,
      from: t.from,
      to: t.to,
      start,
      end: start + len * 0.85,
      score,
      status: statusFor(score),
    };
    return enrichWordDiagnostics(w, lang);
  });
  const ok = words.filter((w) => w.status !== "mispronounced").length;
  return {
    engines: { elevenlabs: false, azure: false, openai: false },
    demo: true,
    phonemeLevel: false,
    depth: "basic",
    transcript: "",
    words,
    insertions: [],
    scores: {
      accuracy: Math.round(mean(words.map((w) => w.score))),
      intelligibility: Math.round((ok / Math.max(1, words.length)) * 100),
      completeness: 100,
    },
    duration,
    warnings: [],
    focusSounds: extractFocusSounds(words, lang),
  };
}
