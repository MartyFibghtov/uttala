import { getLanguage } from "../languages";
import { LEVELS, statusFor, type LevelId } from "../levels";
import { enrichWordDiagnostics, extractFocusSounds } from "../phonetics";
import { align, normalize, similarity, timeTokens, tokenize, type Token } from "../text";
import type { AssessResult, WordResult } from "../types";
import { assessWithAzure, hasAzure, type AzureAssessment } from "./azure";
import { forcedAlign, hasElevenLabs, transcribe, type ForcedAlignment, type Transcript } from "./elevenlabs";
import { assessWithOpenAi, hasOpenAi, type OpenAiAssessment } from "./openai";

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Alignment loss → 0..1 "acoustic fit". ElevenLabs does not document the scale
 * of `loss`, so this mapping is calibrated against rated recordings.
 */
const FIT_SCALE = Number(process.env.ALIGNMENT_LOSS_SCALE ?? 1);
const fitFromLoss = (loss: number) => Math.exp(-Math.max(0, loss) * FIT_SCALE);

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
  level: LevelId,
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
    for (const op of align(tokens.map((t) => t.norm), heard.map((h) => h.norm))) {
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

      if (op.type === "match") {
        understood++;
        const signals = [h.conf, fit[op.ti]].filter((v): v is number => v !== undefined);
        w.score = clamp(Math.round(60 + 40 * (signals.length ? mean(signals) : 0.75)));
        w.status = statusFor(w.score, level);
      } else {
        w.heard = h.text;
        w.score = clamp(Math.round(55 * similarity(tokens[op.ti].norm, h.norm)));
        w.status = "mispronounced";
      }
    }
  } else {
    words.forEach((w, i) => {
      w.score = clamp(Math.round(100 * (fit[i] ?? 0.75)));
      w.status = statusFor(w.score, level);
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
      const misheard = w.status === "mispronounced" && w.heard !== undefined;
      w.score = Math.round(misheard ? Math.min(a.score, 59) : a.score);
      w.status =
        a.errorType === "Mispronunciation" && w.score < LEVELS[level].clear
          ? "mispronounced"
          : statusFor(w.score, level);
      if (a.phonemes.length) {
        w.phonemes = a.phonemes.map((p) => ({ ipa: p.ipa, score: Math.round(p.score) }));
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
      } else if (w.status === "omitted" && ai.score >= 60) {
        // OpenAI heard the word clearly even though STT missed it
        w.score = ai.score;
        w.status = statusFor(w.score, level);
        understood++;
      } else {
        const sttMisheard = w.status === "mispronounced" && w.heard !== undefined;
        const blended = azure
          ? Math.round(w.score * 0.55 + ai.score * 0.45)
          : Math.round(w.score * 0.35 + ai.score * 0.65);
        w.score = sttMisheard ? Math.min(blended, 64) : clamp(blended);
        w.status =
          (ai.errorType === "Mispronunciation" || ai.errorType === "ConsonantSubstitution" || sttMisheard) &&
          w.score < LEVELS[level].clear
            ? w.score < LEVELS[level].unclear
              ? "mispronounced"
              : "unclear"
            : statusFor(w.score, level);
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
  words.forEach((w, i) => {
    enrichWordDiagnostics(w, lang, { faLoss: faLosses[i] });
    if (w.phonemes && w.phonemes.length > 0) {
      phonemeLevel = true;
    }
  });

  const focusSounds = extractFocusSounds(words, lang);
  const total = Math.max(1, words.length);
  return {
    engines: { elevenlabs: hasElevenLabs(), azure: hasAzure() || hasOpenAi(), openai: hasOpenAi() },
    demo: false,
    phonemeLevel,
    transcript: stt?.text ?? "",
    words,
    insertions,
    scores: {
      accuracy: Math.round(mean(words.map((w) => w.score))),
      intelligibility: clamp(Math.round((understood / total) * 100)),
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
  level: LevelId,
  duration: number,
  phonemes: boolean,
): Promise<AssessResult> {
  const warnings: string[] = [];
  const locale = getLanguage(lang).azure;
  const useAzure = phonemes && hasAzure() && !!locale;

  // Run fast, native acoustic models in parallel (~1s):
  // - ElevenLabs forced alignment + Scribe v2 transcription (with native `language_code`)
  // - Azure Pronunciation Assessment (with native BCP-47 locale acoustic model)
  const [fa, stt, azure] = await Promise.allSettled([
    forcedAlign(wav, text),
    transcribe(wav, lang),
    useAzure ? assessWithAzure(wav, text, locale) : Promise.resolve(undefined),
  ]);

  // Only fall back to OpenAI audio assessment when primary acoustic models fail.
  let openaiResult: OpenAiAssessment | undefined;
  if (fa.status === "rejected" && stt.status === "rejected" && hasOpenAi()) {
    try {
      openaiResult = await assessWithOpenAi(wav, text, lang, level);
    } catch (err) {
      console.error("openai fallback assessment failed", err);
    }
  }

  if (fa.status === "rejected" && stt.status === "rejected" && !openaiResult) {
    throw new Error(String(stt.reason?.message ?? stt.reason));
  }
  for (const r of [fa, stt, azure]) {
    if (r.status === "rejected") console.error("assessment engine failed", r.reason);
  }
  if ((fa.status === "rejected" || stt.status === "rejected") && !openaiResult) {
    warnings.push("Part of the analysis was unavailable just now, so some scores may be less detailed than usual.");
  }
  return buildResult(
    text,
    lang,
    level,
    duration,
    {
      fa: fa.status === "fulfilled" ? fa.value : undefined,
      stt: stt.status === "fulfilled" ? stt.value : undefined,
      azure: azure.status === "fulfilled" ? azure.value : undefined,
      openai: openaiResult,
    },
    warnings,
  );
}

/** Simulated result so the interface can be explored before any API key is set. */
export function demoResult(text: string, lang: string, level: LevelId, duration: number): AssessResult {
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
      status: statusFor(score, level),
    };
    return enrichWordDiagnostics(w, lang);
  });
  const ok = words.filter((w) => w.status !== "mispronounced").length;
  return {
    engines: { elevenlabs: false, azure: false, openai: false },
    demo: true,
    phonemeLevel: true,
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
