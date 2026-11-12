"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  AudioWaveform,
  Check,
  CheckCircle2,
  ChevronDown,
  Ear,
  Gauge,
  Info,
  Lightbulb,
  Loader2,
  Mic,
  Music,
  RotateCcw,
  Sparkles,
  Square,
  Star,
  Target,
  Timer,
  TrendingUp,
  User,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Ring } from "@/components/charts";
import { LiveBars } from "@/components/live-bars";
import { Orb, paletteForScore, type OrbPalette } from "@/components/orb";
import { PitchChart } from "@/components/pitch-chart";
import {
  hear,
  loadReference,
  scoreColor,
  speakWithBrowser,
  UpgradeNeeded,
  type Reference,
} from "@/components/practice-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccount } from "@/hooks/use-account";
import { MAX_RECORDING_SECONDS, useRecorder } from "@/hooks/use-recorder";
import {
  decodeToMono16k,
  encodeWav,
  play,
  refineSpansWithAudio,
  SAMPLE_RATE,
  stopPlayback,
  trackPitch,
} from "@/lib/audio";
import {
  getLanguage,
  type DiagnosticPrompt,
  type DiagnosticStageKind,
} from "@/lib/languages";
import { LEVELS, statusFor, type LevelId } from "@/lib/levels";
import { enrichWordDiagnostics, extractFocusSounds, segmentWordToPhonemes } from "@/lib/phonetics";
import { compareProsody, fallbackProsody, overallScore } from "@/lib/prosody";
import { soundForIpa, soundsFor } from "@/lib/sounds";
import { recordAttempt } from "@/lib/store";
import { tokenize } from "@/lib/text";
import type { AssessResult, Attempt, ProsodyResult, WordResult, WordStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Every diagnostic reading is scored at the same intermediate baseline so rankings compare fairly. */
export const DIAGNOSTIC_SCORING_LEVEL: LevelId = "intermediate";

export interface DiagnosticTake {
  prompt: DiagnosticPrompt;
  result: AssessResult;
  prosody: ProsodyResult;
  attempt: Attempt;
  userUrl?: string;
  reference?: Reference | null;
}

export interface SpeechRank {
  id: "native" | "proficient" | "advanced" | "intermediate" | "beginner" | "novice";
  min: number;
  label: string;
  recommended: LevelId;
  palette: OrbPalette;
  short: string;
  description: string;
  coachMessage: (name: string | undefined, langName: string) => string;
}

export const SPEECH_RANKS: SpeechRank[] = [
  {
    id: "native",
    min: 92,
    label: "Native",
    recommended: "advanced",
    palette: "moss",
    short: "92–100%",
    description: "Listeners follow you without effort. Your vowel quality, consonant timing and pitch melody sound natural.",
    coachMessage: (name) =>
      `${name ? `${name}, you` : "You"} sound remarkably natural. Native speakers understand you effortlessly, and both your rhythm and melody are right on target. We will focus on subtle polish at full conversational speed.`,
  },
  {
    id: "proficient",
    min: 82,
    label: "Proficient",
    recommended: "advanced",
    palette: "moss",
    short: "82–91%",
    description: "Native speakers understand you clearly, though a few subtle sounds or pitch patterns still hint at an accent.",
    coachMessage: (name) =>
      `${name ? `${name}, you` : "You"} sound good. Native speakers understand you clearly, but will notice an accent on a few sounds and melody turns. We'll target a few focused changes that make a big difference.`,
  },
  {
    id: "advanced",
    min: 72,
    label: "Advanced",
    recommended: "intermediate",
    palette: "sky",
    short: "72–81%",
    description: "Your speech is clear in everyday conversation. Refining word stress, linking and a handful of vowels will smooth out your flow.",
    coachMessage: (name) =>
      `${name ? `${name}, your` : "Your"} speech comes through clearly. Listeners follow your meaning well, and tightening a few recurring sounds and your sentence rhythm will make you sound much more effortless.`,
  },
  {
    id: "intermediate",
    min: 60,
    label: "Intermediate",
    recommended: "intermediate",
    palette: "gold",
    short: "60–71%",
    description: "People understand your main message, with the occasional word or contrast they have to work out from context.",
    coachMessage: (name) =>
      `${name ? `${name}, you` : "You"} have a solid foundation. People get your message, though a few key sounds make listeners work a little harder. Practising those contrasts first will raise your score quickly.`,
  },
  {
    id: "beginner",
    min: 45,
    label: "Beginner",
    recommended: "beginner",
    palette: "gold",
    short: "45–59%",
    description: "Familiar phrases come through, while longer sentences and new sounds still need deliberate pacing.",
    coachMessage: (name) =>
      `${name ? `${name}, several` : "Several"} core sounds are already coming through. We will slow things down and train one difficult word and sound at a time so whole sentences become comfortable.`,
  },
  {
    id: "novice",
    min: 0,
    label: "Novice",
    recommended: "beginner",
    palette: "ember",
    short: "0–44%",
    description: "Just starting out: many sounds and pitch patterns are new to your ear and mouth. Short phrases and ear drills are the fastest way up.",
    coachMessage: (name, langName) =>
      `${name ? `${name}, welcome` : "Welcome"} to ${langName}. We will start by training your ear and mouth on the most important sounds and short phrases step by step.`,
  },
];

export function rankForScore(score: number): SpeechRank {
  return SPEECH_RANKS.find((r) => score >= r.min) ?? SPEECH_RANKS[SPEECH_RANKS.length - 1];
}

export interface HighlightItem {
  id: string;
  kind: "sound" | "melody" | "rhythm" | "word";
  /** Concise headline shown directly without overloading the user. */
  title: string;
  /** Short 1-line subtitle shown under the headline. */
  subtitle: string;
  score: number;
  ipa?: string;
  /** Expandable details revealed only when the user opens the item. */
  detail: {
    explanation: string;
    howToFix?: string;
    watchOut?: string;
    words: string[];
    expectedIpa?: string;
    heardIpa?: string;
    soundId?: string;
  };
}

/** Extract concise "What sound or melody was good" and "what was bad" for a single take. */
export function extractTakeHighlights(
  result: AssessResult,
  prosody: ProsodyResult,
  lang: string,
  stageKind?: DiagnosticStageKind,
): { good: HighlightItem[]; bad: HighlightItem[] } {
  return extractHighlightsFromTakes(
    [
      {
        prompt: {
          kind: stageKind ?? "sounds",
          title: "",
          subtitle: "",
          text: "",
          targets: [],
          cue: "",
        },
        result,
        prosody,
        attempt: {
          id: "temp",
          at: 0,
          lang,
          text: "",
          overall: result.scores.accuracy,
          accuracy: result.scores.accuracy,
          intelligibility: result.scores.intelligibility,
          fluency: prosody.fluency,
          rhythm: prosody.rhythm,
          intonation: prosody.intonation,
          demo: result.demo,
        },
      },
    ],
    lang,
    2,
  );
}

/**
 * Aggregate all recorded diagnostic takes into concise "What sound or melody was good"
 * and "What sound or melody was bad" items, with expandable phonetic & prosody details.
 */
export function extractHighlightsFromTakes(
  takes: DiagnosticTake[],
  lang: string,
  maxPerSide = 3,
): { good: HighlightItem[]; bad: HighlightItem[] } {
  const good: HighlightItem[] = [];
  const bad: HighlightItem[] = [];

  // 1. Aggregate phonemes across all words in the takes
  const phonemeMap = new Map<
    string,
    {
      ipa: string;
      scores: number[];
      words: string[];
      heardIpa?: string;
      issue?: string;
      tip?: string;
    }
  >();

  for (const t of takes) {
    for (const w of t.result.words) {
      for (const p of w.phonemes ?? []) {
        const clean = p.ipa.replace(/[ˈˌ]/g, "").trim();
        if (!clean) continue;
        const entry = phonemeMap.get(clean) ?? { ipa: clean, scores: [], words: [] };
        entry.scores.push(p.score);
        if (!entry.words.includes(w.text)) entry.words.push(w.text);
        if (p.heardIpa && p.heardIpa !== p.ipa) entry.heardIpa = p.heardIpa;
        if (p.issue && !entry.issue) entry.issue = p.issue;
        if (p.tip && !entry.tip) entry.tip = p.tip;
        phonemeMap.set(clean, entry);
      }
    }
  }

  const phonemeStats = [...phonemeMap.values()].map((item) => {
    const avg = Math.round(item.scores.reduce((s, v) => s + v, 0) / item.scores.length);
    const guide = soundForIpa(lang, item.ipa);
    return { ...item, avg, guide };
  });

  // Sort for strongest sounds (prefer guide-backed sounds so they have rich names)
  const strongSounds = [...phonemeStats]
    .filter((p) => p.avg >= 80)
    .sort((a, b) => (b.guide ? 10 : 0) - (a.guide ? 10 : 0) || b.avg - a.avg);

  for (const s of strongSounds.slice(0, 2)) {
    const label = s.guide ? `${s.guide.name} /${s.ipa}/` : `Sound /${s.ipa}/`;
    good.push({
      id: `good-sound-${s.ipa}`,
      kind: "sound",
      ipa: s.ipa,
      score: s.avg,
      title: `${label} was crisp and clear`,
      subtitle: `Heard cleanly in ${s.words.slice(0, 3).map((w) => `“${w}”`).join(", ")}`,
      detail: {
        explanation: s.guide
          ? `Your articulation of ${s.guide.name.toLowerCase()} (/${s.ipa}/) scored ${s.avg}% across your scan.`
          : `You produced /${s.ipa}/ accurately (${s.avg}%) without substitution.`,
        howToFix: s.guide?.how,
        words: s.words.slice(0, 4),
        soundId: s.guide?.id,
      },
    });
  }

  // Sort for weakest sounds
  const weakSounds = [...phonemeStats]
    .filter((p) => p.avg < 80)
    .sort((a, b) => a.avg - b.avg);

  for (const s of weakSounds.slice(0, 2)) {
    const label = s.guide ? `${s.guide.name} /${s.ipa}/` : `Sound /${s.ipa}/`;
    bad.push({
      id: `bad-sound-${s.ipa}`,
      kind: "sound",
      ipa: s.ipa,
      score: s.avg,
      title: `${label} slipped in ${s.words[0] ? `“${s.words[0]}”` : "your reading"}`,
      subtitle:
        s.heardIpa && s.heardIpa !== "∅"
          ? `Sounded close to /${s.heardIpa}/ instead of /${s.ipa}/`
          : s.issue ?? `Needs clearer tongue and lip placement (${s.avg}%)`,
      detail: {
        explanation:
          s.issue ??
          (s.guide
            ? `The ${s.guide.name.toLowerCase()} (/${s.ipa}/) averaged ${s.avg}%. ${s.guide.watch}`
            : `The sound /${s.ipa}/ averaged ${s.avg}% and blurred into neighbouring sounds.`),
        howToFix:
          s.tip ??
          s.guide?.how ??
          `Slow down on ${s.words.slice(0, 2).map((w) => `“${w}”`).join(" and ")}, isolating /${s.ipa}/ before saying the full word.`,
        watchOut: s.guide?.watch,
        words: s.words.slice(0, 4),
        expectedIpa: s.ipa,
        heardIpa: s.heardIpa,
        soundId: s.guide?.id,
      },
    });
  }

  // 2. Prosody (Melody & Rhythm) highlights across takes
  const rhythms = takes.map((t) => t.prosody.rhythm).filter((v): v is number => v !== null);
  const intonations = takes.map((t) => t.prosody.intonation).filter((v): v is number => v !== null);
  const fluencies = takes.map((t) => t.prosody.fluency).filter((v): v is number => v !== null);
  const totalHesitations = takes.reduce((s, t) => s + t.prosody.hesitations, 0);

  const avgRhythm = rhythms.length ? Math.round(rhythms.reduce((a, b) => a + b, 0) / rhythms.length) : 82;
  const avgMelody = intonations.length ? Math.round(intonations.reduce((a, b) => a + b, 0) / intonations.length) : 80;
  const avgFluency = fluencies.length ? Math.round(fluencies.reduce((a, b) => a + b, 0) / fluencies.length) : 84;

  // Check Melody
  if (avgMelody >= 78) {
    good.push({
      id: "good-melody",
      kind: "melody",
      score: avgMelody,
      title: "Natural pitch melody and intonation",
      subtitle: "Your voice rose and fell in step with the reference speaker",
      detail: {
        explanation: `Your pitch contour matched the native reference at ${avgMelody}%. Questions rose naturally and statements settled cleanly at the end.`,
        howToFix: "Keep leaning into the pitch rise before commas and on open questions to sound expressive.",
        words: takes[takes.length - 1]?.result.words.slice(0, 3).map((w) => w.text) ?? [],
      },
    });
  } else {
    bad.push({
      id: "bad-melody",
      kind: "melody",
      score: avgMelody,
      title: "Sentence melody stayed slightly flat",
      subtitle: "Pitch rise on questions and contrast clauses was narrower than native speech",
      detail: {
        explanation: `Your intonation contour scored ${avgMelody}%. When pitch stays level across clauses, listeners have to work harder to hear where a question or contrast turns.`,
        howToFix:
          "Let your voice rise noticeably at the end of a question clause (↗) and drop a few semitones on the final stressed word of a statement (↘).",
        words: takes[takes.length - 1]?.result.words.slice(-3).map((w) => w.text) ?? [],
      },
    });
  }

  // Check Rhythm & Stress
  if (avgRhythm >= 78 && totalHesitations === 0) {
    good.push({
      id: "good-rhythm",
      kind: "rhythm",
      score: avgRhythm,
      title: "Steady rhythm and word linking",
      subtitle: "You stretched stressed words and glided smoothly through small words",
      detail: {
        explanation: `Your word timing scored ${avgRhythm}% with ${avgFluency}% fluency and no mid-phrase hesitations.`,
        howToFix: "To go even further, try Shadowing mode to lock in this timing at full native speed.",
        words: [],
      },
    });
  } else if (avgRhythm < 78 || totalHesitations > 0) {
    bad.push({
      id: "bad-rhythm",
      kind: "rhythm",
      score: Math.min(avgRhythm, avgFluency),
      title: totalHesitations > 0 ? "Mid-sentence pauses broke the rhythm" : "Word stress and syllable timing drifted",
      subtitle:
        totalHesitations > 0
          ? `${totalHesitations} brief hesitation${totalHesitations === 1 ? "" : "s"} between linked words`
          : "Unstressed connecting words took almost as much time as stressed words",
      detail: {
        explanation: `Your rhythm scored ${avgRhythm}% and fluency scored ${avgFluency}%. Native rhythm relies on holding stressed content words longer while shrinking small function words.`,
        howToFix:
          "Link small words onto the next content word as a single breath group, and linger only on the main stressed syllable.",
        words: [],
      },
    });
  }

  // Ensure neither list is ever empty
  if (good.length === 0) {
    const bestWord = takes
      .flatMap((t) => t.result.words)
      .sort((a, b) => b.score - a.score)[0];
    good.push({
      id: "good-fallback",
      kind: "word",
      score: bestWord?.score ?? 82,
      title: bestWord ? `Clear pronunciation on “${bestWord.text}”` : "Good overall intelligibility",
      subtitle: "Core syllables were recognised clearly by the listener",
      detail: {
        explanation: bestWord
          ? `“${bestWord.text}” came through at ${bestWord.score}%, showing solid control of its vowel and consonant transitions.`
          : "Your voice came through clearly enough for the recogniser to follow your sentences.",
        words: bestWord ? [bestWord.text] : [],
      },
    });
  }

  if (bad.length === 0) {
    const lowestWord = takes
      .flatMap((t) => t.result.words)
      .sort((a, b) => a.score - b.score)[0];
    const fallbackSound = soundsFor(lang)[0];
    bad.push({
      id: "bad-fallback",
      kind: "sound",
      score: lowestWord ? Math.min(79, lowestWord.score) : 76,
      ipa: fallbackSound?.symbol,
      title: lowestWord
        ? `Fine-tune “${lowestWord.text}” for native polish`
        : `Polish ${fallbackSound?.name ?? "connected speech"} at fast pace`,
      subtitle: lowestWord
        ? `Scored ${lowestWord.score}% — the lowest word across your scan`
        : "Every word was clear; subtle vowel length and melody are your next step",
      detail: {
        explanation:
          lowestWord?.diagnosis ??
          `All words were understood! Focusing on “${lowestWord?.text ?? fallbackSound?.words[0] ?? ""}” will sharpen the finest details of your accent.`,
        howToFix: lowestWord?.fix ?? fallbackSound?.how,
        watchOut: fallbackSound?.watch,
        words: lowestWord ? [lowestWord.text] : fallbackSound?.words.slice(0, 3) ?? [],
        soundId: fallbackSound?.id,
      },
    });
  }

  return {
    good: good.slice(0, maxPerSide),
    bad: bad.slice(0, maxPerSide),
  };
}

/** Pick the top difficult words across all takes for the post-test word lesson. */
export function extractLessonWords(
  takes: DiagnosticTake[],
  lang: string,
  count = 4,
): { word: WordResult; take: DiagnosticTake }[] {
  const seen = new Set<string>();
  const candidates: { word: WordResult; take: DiagnosticTake }[] = [];

  for (const take of takes) {
    for (const word of take.result.words) {
      const clean = word.text.toLocaleLowerCase(lang).replace(/[^\p{L}]/gu, "");
      if (clean.length < 3 || seen.has(clean)) continue;
      seen.add(clean);
      candidates.push({ word, take });
    }
  }

  return candidates.sort((a, b) => a.word.score - b.word.score).slice(0, count);
}

/** Build a realistic simulated take when the user skips mic recording to preview the lesson flow. */
export function buildSimulatedTake(prompt: DiagnosticPrompt, lang: string, stageIdx: number): DiagnosticTake {
  const tokens = tokenize(prompt.text, lang);
  const duration = Math.max(2.6, tokens.length * 0.36);
  let cursor = 0.1;

  // Deterministic realistic scores around 82–88% with 1–2 weaker target words (~62–72%)
  const words: WordResult[] = tokens.map((t, i) => {
    const span = (duration - 0.2) / Math.max(1, tokens.length);
    const start = cursor;
    cursor += span;
    const isTargetWeak =
      (stageIdx === 0 && (i === 0 || i === 5)) ||
      (stageIdx === 1 && i === 3) ||
      (stageIdx === 2 && i === 4);
    const score = isTargetWeak ? 62 + ((i * 7 + stageIdx * 5) % 12) : 84 + ((i * 11 + stageIdx * 3) % 14);
    const w: WordResult = {
      index: i,
      text: t.text,
      from: t.from,
      to: t.to,
      start,
      end: start + span * 0.86,
      score,
      status: statusFor(score, DIAGNOSTIC_SCORING_LEVEL),
    };
    return enrichWordDiagnostics(w, lang);
  });

  const accuracy = Math.round(words.reduce((s, w) => s + w.score, 0) / Math.max(1, words.length));
  const intelligibility = Math.round(
    (words.filter((w) => w.status !== "mispronounced").length / Math.max(1, words.length)) * 100,
  );
  const prosody = fallbackProsody(prompt.text, words, null, duration);
  const overall = overallScore(
    {
      accuracy,
      intelligibility,
      fluency: prosody.fluency,
      rhythm: prosody.rhythm,
      intonation: prosody.intonation,
    },
    DIAGNOSTIC_SCORING_LEVEL,
  );

  const result: AssessResult = {
    engines: { elevenlabs: false, azure: false, openai: false },
    demo: true,
    phonemeLevel: true,
    transcript: prompt.text,
    words,
    insertions: [],
    scores: {
      accuracy,
      intelligibility,
      completeness: 100,
    },
    duration,
    warnings: [],
    focusSounds: extractFocusSounds(words, lang),
  };

  return {
    prompt,
    result,
    prosody,
    attempt: {
      id: `sim-${stageIdx}-${Date.now()}`,
      at: Date.now(),
      lang,
      text: prompt.text,
      overall,
      accuracy,
      intelligibility,
      fluency: prosody.fluency,
      rhythm: prosody.rhythm,
      intonation: prosody.intonation,
      demo: true,
      level: DIAGNOSTIC_SCORING_LEVEL,
      seconds: Math.round(duration),
    },
  };
}

/** Conversational coach header card in Uttala's Orb + Card design language. */
export function CoachBanner({
  palette = "orchid",
  label = "Coach",
  children,
}: {
  palette?: OrbPalette;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3.5 rounded-2xl border bg-card/90 p-4 shadow-xs">
      <Orb palette={palette} size={38} float="slow" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-foreground">{children}</p>
      </div>
    </div>
  );
}

/** Small orb that swells with the microphone level while recording. */
function MicLevelOrb({ analyser }: { analyser: AnalyserNode | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < 32; i++) sum += data[i];
      if (ref.current) ref.current.style.transform = `scale(${1 + Math.min(0.5, sum / 32 / 255)})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [analyser]);
  return (
    <span ref={ref} className="transition-transform duration-75">
      <Orb palette="ember" size={26} />
    </span>
  );
}

const WORD_STATUS_STYLE: Record<WordStatus, string> = {
  ok: "hover:bg-secondary",
  unclear: "bg-amber-100 text-amber-950 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-200",
  mispronounced: "bg-red-100 text-red-950 hover:bg-red-200 dark:bg-red-950/60 dark:bg-red-200",
  omitted: "text-muted-foreground line-through decoration-red-500 hover:bg-secondary",
};

const STAGE_ICON: Record<DiagnosticStageKind, typeof Ear> = {
  sounds: Ear,
  rhythm: Timer,
  melody: Music,
};

/**
 * Expandable highlight row ("What sound or melody was good" / "What was bad").
 * Uses native <details className="disclosure"> so secondary articulatory info is on-demand only.
 */
export function ExpandableHighlightRow({
  item,
  tone,
  lang,
  live,
}: {
  item: HighlightItem;
  tone: "good" | "bad";
  lang: string;
  live: boolean;
}) {
  return (
    <details className="disclosure group rounded-xl border bg-background transition-colors open:bg-secondary/30">
      <summary className="flex items-center justify-between gap-3 px-3.5 py-3 text-left select-none">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              tone === "good"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                : "bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300",
            )}
          >
            {tone === "good" ? <Check className="size-3.5" /> : <Target className="size-3.5" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
              tone === "good"
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200"
                : item.score >= 60
                  ? "bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200"
                  : "bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-200",
            )}
          >
            {item.score}%
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
        </div>
      </summary>

      <div className="space-y-2.5 border-t px-3.5 py-3 text-xs">
        <p className="leading-relaxed text-muted-foreground">{item.detail.explanation}</p>

        {item.detail.expectedIpa && item.detail.heardIpa && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5">
            <span className="text-muted-foreground">
              Target sound: <strong className="font-mono text-foreground">/{item.detail.expectedIpa}/</strong>
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              Heard as:{" "}
              <strong className="font-mono text-amber-700 dark:text-amber-300">/{item.detail.heardIpa}/</strong>
            </span>
          </div>
        )}

        {item.detail.howToFix && (
          <div className="rounded-lg border bg-card p-2.5">
            <p className="font-medium text-foreground">
              {tone === "good" ? "How you make it:" : "How to fix it:"}
            </p>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">{item.detail.howToFix}</p>
          </div>
        )}

        {item.detail.words.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-muted-foreground">Tap to hear:</span>
            {item.detail.words.map((w) => (
              <button
                key={w}
                type="button"
                lang={lang}
                onClick={() => void hear(w, { lang, level: DIAGNOSTIC_SCORING_LEVEL, live })}
                className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Volume2 className="size-3 text-muted-foreground" />
                {w}
              </button>
            ))}
            {item.detail.soundId && (
              <Link
                href={`/sounds/${item.detail.soundId}`}
                className="ml-auto font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Sound guide →
              </Link>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * Step-based diagnostic recording card for one stage of the pronunciation test.
 * Keeps post-recording feedback minimal ("What sound or melody was good" and "what was bad")
 * with expandable disclosure for deeper word/melody inspection.
 */
export function DiagnosticStageRecorder({
  lang,
  stageIndex,
  totalStages,
  prompt,
  savedTake,
  onTake,
}: {
  lang: string;
  stageIndex: number;
  totalStages: number;
  prompt: DiagnosticPrompt;
  savedTake?: DiagnosticTake;
  onTake: (take: DiagnosticTake) => void;
}) {
  const { me, noteAnalysis, promptUpgrade } = useAccount();
  const language = getLanguage(lang);
  const live = me.engines.elevenlabs;
  const tokens = useMemo(() => tokenize(prompt.text, lang), [prompt.text, lang]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [slow, setSlow] = useState(false);
  const [selectedWordIdx, setSelectedWordIdx] = useState<number | null>(null);
  const outOfRecordings = me.usage.used >= me.usage.limit;

  useEffect(() => stopPlayback, []);

  // Preload reference audio in the background so it is ready by the time the learner finishes recording.
  useEffect(() => {
    if (!live) return;
    void loadReference(prompt.text.trim(), lang, DIAGNOSTIC_SCORING_LEVEL).catch(() => null);
  }, [lang, live, prompt.text]);

  const listen = async (wordIndex?: number) => {
    const rate = slow ? 0.75 : 1;
    const textToPlay = wordIndex === undefined ? prompt.text : (tokens[wordIndex]?.text ?? "");
    if (!textToPlay) return;
    if (!live) {
      speakWithBrowser(textToPlay, lang, rate);
      return;
    }
    setListening(true);
    try {
      await hear(textToPlay, { lang, level: DIAGNOSTIC_SCORING_LEVEL, live, rate });
    } catch (err) {
      if (err instanceof UpgradeNeeded) promptUpgrade(err.reason);
      else toast.error(err instanceof Error ? err.message : "Could not play the reference.");
    } finally {
      setListening(false);
    }
  };

  const analyse = useCallback(
    async (blob: Blob) => {
      setBusy(true);
      try {
        const samples = await decodeToMono16k(blob);
        if (samples.length < SAMPLE_RATE * 0.4) {
          toast.error("That was too short. Please read the full sentence.");
          return;
        }
        const wav = encodeWav(samples);
        const form = new FormData();
        form.append("audio", wav, "speech.wav");
        form.append("text", prompt.text.trim());
        form.append("lang", lang);
        form.append("level", DIAGNOSTIC_SCORING_LEVEL);

        const refPromise = live
          ? loadReference(prompt.text.trim(), lang, DIAGNOSTIC_SCORING_LEVEL).catch(() => null)
          : Promise.resolve(null);
        const res = await fetch("/api/assess", { method: "POST", body: form });
        const data = (await res.json()) as AssessResult & { error?: string; upgrade?: "limit" | "customText" };
        if (data.upgrade) {
          promptUpgrade(data.upgrade);
          return;
        }
        if (!res.ok) throw new Error(data.error ?? "Assessment failed.");
        noteAnalysis();

        // Never stall the diagnostic result on slow reference TTS synthesis.
        const reference = await Promise.race([
          refPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 180)),
        ]);

        const refinedUserSpans = refineSpansWithAudio(
          samples,
          data.words.map((w) =>
            w.start !== undefined && w.end !== undefined ? { start: w.start, end: w.end } : null,
          ),
        );
        data.words.forEach((w, idx) => {
          const rs = refinedUserSpans[idx];
          if (rs) {
            w.start = rs.start;
            w.end = rs.end;
          }
        });

        const userPitch = trackPitch(samples);
        const rawProsody = reference
          ? compareProsody(
              data.words.map((w) =>
                w.start !== undefined && w.end !== undefined ? { start: w.start, end: w.end } : null,
              ),
              reference.spans,
              userPitch,
              reference.pitch,
            )
          : null;

        const prosody =
          rawProsody && rawProsody.rhythm !== null && rawProsody.intonation !== null
            ? rawProsody
            : fallbackProsody(prompt.text, data.words, userPitch, data.duration);

        const recorded = recordAttempt(data, prosody, {
          lang,
          text: prompt.text.trim(),
          level: DIAGNOSTIC_SCORING_LEVEL,
          maxDrillWords: me.entitlements.maxDrillWords,
          phonemes: true,
        });

        const worst = [...data.words].sort((a, b) => a.score - b.score)[0];
        setSelectedWordIdx(worst ? worst.index : 0);

        onTake({
          prompt,
          result: data,
          prosody,
          attempt: recorded.attempt,
          userUrl: URL.createObjectURL(wav),
          reference,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not analyse that recording.");
      } finally {
        setBusy(false);
      }
    },
    [lang, live, me.entitlements.maxDrillWords, noteAnalysis, onTake, prompt, promptUpgrade],
  );

  const recorder = useRecorder(analyse);

  const toggleRecording = async () => {
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (blob) await analyse(blob);
      return;
    }
    if (outOfRecordings) {
      promptUpgrade("limit");
      return;
    }
    stopPlayback();
    try {
      await recorder.start();
    } catch {
      toast.error("Microphone access is needed to record. Allow it in your browser and try again.");
    }
  };

  const Icon = STAGE_ICON[prompt.kind];
  const highlights = useMemo(
    () => (savedTake ? extractTakeHighlights(savedTake.result, savedTake.prosody, lang, prompt.kind) : null),
    [savedTake, lang, prompt.kind],
  );
  const selectedWord =
    savedTake && selectedWordIdx !== null
      ? (savedTake.result.words[selectedWordIdx] ?? savedTake.result.words[0])
      : savedTake?.result.words[0];

  return (
    <div className="space-y-5">
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary/40 px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="flex size-6 items-center justify-center rounded-full bg-background border">
              <Icon className="size-3.5" />
            </span>
            <span>
              Part {stageIndex + 1} of {totalStages} · {prompt.title}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {prompt.targets.map((t) => (
              <Badge key={t} variant="secondary" className="font-normal text-xs">
                {t}
              </Badge>
            ))}
          </div>
        </div>

        <CardContent className="p-0">
          <div className="p-5 md:p-6">
            <div dir={language.rtl ? "rtl" : "ltr"} lang={lang}>
              {savedTake ? (
                <p className="text-xl leading-loose md:text-2xl md:leading-loose">
                  {(() => {
                    const parts: React.ReactNode[] = [];
                    let cursor = 0;
                    for (const w of savedTake.result.words) {
                      if (w.from > cursor) parts.push(prompt.text.slice(cursor, w.from));
                      parts.push(
                        <button
                          key={w.index}
                          type="button"
                          onClick={() => {
                            setSelectedWordIdx(w.index);
                            void listen(w.index);
                          }}
                          className={cn(
                            "rounded-md px-0.5 transition-colors",
                            WORD_STATUS_STYLE[w.status],
                            selectedWord?.index === w.index && "ring-2 ring-foreground ring-offset-1",
                          )}
                        >
                          {prompt.text.slice(w.from, w.to)}
                        </button>,
                      );
                      cursor = w.to;
                    }
                    parts.push(prompt.text.slice(cursor));
                    return parts;
                  })()}
                </p>
              ) : (
                <p className="text-xl leading-loose md:text-2xl md:leading-loose">
                  {(() => {
                    const parts: React.ReactNode[] = [];
                    let cursor = 0;
                    tokens.forEach((t, i) => {
                      if (t.from > cursor) parts.push(prompt.text.slice(cursor, t.from));
                      parts.push(
                        <button
                          key={i}
                          type="button"
                          onClick={() => void listen(i)}
                          aria-label={`Hear “${t.text}”`}
                          className="rounded-md px-0.5 transition-colors hover:bg-secondary"
                        >
                          {prompt.text.slice(t.from, t.to)}
                        </button>,
                      );
                      cursor = t.to;
                    });
                    parts.push(prompt.text.slice(cursor));
                    return parts;
                  })()}
                </p>
              )}
            </div>

            {(prompt.roman || prompt.meaning) && (
              <div className="mt-4 space-y-0.5 border-t pt-3 text-sm">
                {prompt.roman && <p className="text-muted-foreground italic">{prompt.roman}</p>}
                {prompt.meaning && <p className="text-muted-foreground">Means: {prompt.meaning}</p>}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Lightbulb className="size-3.5 shrink-0 text-amber-500" />
                {prompt.cue}
              </span>
              {!savedTake && <span>Tap any word to hear it alone</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
            <Button variant="outline" className="rounded-full" onClick={() => void listen()} disabled={listening}>
              {listening ? <Loader2 className="animate-spin" /> : <Volume2 />}
              Listen
            </Button>
            <Button
              variant={slow ? "secondary" : "ghost"}
              className="rounded-full"
              aria-pressed={slow}
              onClick={() => setSlow(!slow)}
            >
              <Gauge />
              Slow
            </Button>
            {savedTake?.userUrl && (
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => void play(savedTake.userUrl!)}
              >
                <User />
                Replay me
              </Button>
            )}

            <div className="ml-auto flex items-center gap-3">
              {recorder.recording && (
                <>
                  <MicLevelOrb analyser={recorder.analyser} />
                  <LiveBars analyser={recorder.analyser} className="hidden h-8 w-24 text-foreground sm:block" />
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">
                    {Math.floor(recorder.seconds)}s / {MAX_RECORDING_SECONDS}s
                  </span>
                </>
              )}
              <Button
                className="rounded-full"
                variant={recorder.recording ? "destructive" : savedTake ? "outline" : "default"}
                onClick={() => void toggleRecording()}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="animate-spin" />
                ) : recorder.recording ? (
                  <Square className="fill-current" />
                ) : savedTake ? (
                  <RotateCcw />
                ) : (
                  <Mic />
                )}
                {busy ? "Analysing…" : recorder.recording ? "Stop" : savedTake ? "Record again" : "Record"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {savedTake && highlights && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <div>
              <CardTitle className="text-base">Part {stageIndex + 1} snapshot</CardTitle>
              <p className="text-xs text-muted-foreground">
                Tap any item below to expand the articulatory or melody details.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="text-right">
                <span className={cn("text-2xl font-semibold tabular-nums", scoreColor(savedTake.attempt.overall))}>
                  {savedTake.attempt.overall}%
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {rankForScore(savedTake.attempt.overall).label}
                </span>
              </div>
              <Orb palette={paletteForScore(savedTake.attempt.overall)} size={36} />
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" />
                  What sound or melody was good
                </p>
                {highlights.good.map((item) => (
                  <ExpandableHighlightRow key={item.id} item={item} tone="good" lang={lang} live={live} />
                ))}
              </div>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <AlertCircle className="size-3.5" />
                  What sound or melody needs work
                </p>
                {highlights.bad.map((item) => (
                  <ExpandableHighlightRow key={item.id} item={item} tone="bad" lang={lang} live={live} />
                ))}
              </div>
            </div>

            <details className="disclosure group rounded-xl border bg-secondary/20">
              <summary className="flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground select-none">
                <span>Expand word-by-word scores &amp; pitch melody curve</span>
                <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="space-y-4 border-t p-4">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg border bg-background p-2.5">
                    <span className="text-muted-foreground">Sounds</span>
                    <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", scoreColor(savedTake.result.scores.accuracy))}>
                      {savedTake.result.scores.accuracy}%
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background p-2.5">
                    <span className="text-muted-foreground">Rhythm</span>
                    <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", scoreColor(savedTake.prosody.rhythm ?? 80))}>
                      {savedTake.prosody.rhythm ?? 80}%
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background p-2.5">
                    <span className="text-muted-foreground">Melody</span>
                    <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", scoreColor(savedTake.prosody.intonation ?? 80))}>
                      {savedTake.prosody.intonation ?? 80}%
                    </p>
                  </div>
                </div>

                {selectedWord && (
                  <div className="rounded-xl border bg-background p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm" lang={lang}>
                        “{selectedWord.text}”
                        {selectedWord.expectedIpa && (
                          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                            /{selectedWord.expectedIpa}/
                          </span>
                        )}
                      </span>
                      <span className={cn("font-semibold tabular-nums", scoreColor(selectedWord.score))}>
                        {selectedWord.score}%
                      </span>
                    </div>
                    {selectedWord.phonemes && selectedWord.phonemes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedWord.phonemes.map((p, idx) => (
                          <span
                            key={idx}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs",
                              p.score >= 80
                                ? "bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                                : p.score >= 60
                                  ? "bg-amber-50/70 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                                  : "bg-red-50/70 text-red-900 dark:bg-red-950/30 dark:text-red-200",
                            )}
                          >
                            /{p.ipa}/ <span className="tabular-nums font-sans font-semibold">{p.score}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {(selectedWord.diagnosis || selectedWord.fix) && (
                      <p className="text-muted-foreground">
                        {selectedWord.diagnosis} {selectedWord.fix}
                      </p>
                    )}
                  </div>
                )}

                {savedTake.prosody.contour.length > 0 && (
                  <div className="rounded-xl border bg-background p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Voice melody compared with the reference
                    </p>
                    <PitchChart
                      contour={savedTake.prosody.contour}
                      words={savedTake.result.words.map((w) => w.text)}
                    />
                  </div>
                )}
              </div>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Feedback Screen 1: Overall Pronunciation Ranking ("Your Speech Level")
 * Features a vertical ranking ladder from Novice to Native with a floating user callout pointer,
 * plus expandable rank definitions and reading breakdown.
 */
export function SpeechLevelRankingScreen({
  takes,
  lang,
  userName,
  previousScore,
}: {
  takes: DiagnosticTake[];
  lang: string;
  userName?: string;
  previousScore?: number | null;
}) {
  const { me, updateProfile } = useAccount();
  const language = getLanguage(lang);
  const firstName = userName ? userName.trim().split(" ")[0] : undefined;

  const avgScore = Math.round(takes.reduce((s, t) => s + t.attempt.overall, 0) / Math.max(1, takes.length));
  const avgSounds = Math.round(takes.reduce((s, t) => s + t.result.scores.accuracy, 0) / Math.max(1, takes.length));
  const avgRhythm = Math.round(
    takes.reduce((s, t) => s + (t.prosody.rhythm ?? t.result.scores.accuracy), 0) / Math.max(1, takes.length),
  );
  const avgMelody = Math.round(
    takes.reduce((s, t) => s + (t.prosody.intonation ?? t.result.scores.accuracy), 0) / Math.max(1, takes.length),
  );

  const rank = rankForScore(avgScore);
  const switchTo = rank.recommended !== me.profile.level ? rank.recommended : null;
  const delta = previousScore !== undefined && previousScore !== null ? avgScore - previousScore : null;

  // Map score (0..100) to vertical ladder position (0% = top Native, 100% = bottom Novice)
  const rankIndex = SPEECH_RANKS.findIndex((r) => r.id === rank.id);
  const nextUpperMin = rankIndex > 0 ? SPEECH_RANKS[rankIndex - 1].min : 100;
  const span = Math.max(1, nextUpperMin - rank.min);
  const withinBand = Math.max(0, Math.min(1, (avgScore - rank.min) / span));
  const stepShare = 100 / (SPEECH_RANKS.length - 1);
  const topPercent = Math.max(
    4,
    Math.min(94, (rankIndex - withinBand * 0.85) * stepShare),
  );

  return (
    <div className="space-y-5">
      <CoachBanner palette={rank.palette} label="Assessment Summary">
        {rank.coachMessage(firstName, language.name)}
      </CoachBanner>

      <Card className="aurora-wash overflow-hidden">
        <CardContent className="grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_320px] md:items-center md:p-8">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your {language.name} Speech Level
              </p>
              <div className="mt-2 flex items-baseline gap-3">
                <span className={cn("text-6xl font-semibold tracking-tight tabular-nums", scoreColor(avgScore))}>
                  {avgScore}%
                </span>
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm font-semibold">
                    <Orb palette={rank.palette} size={14} />
                    {rank.label}
                  </span>
                  {delta !== null && delta !== 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {delta > 0 ? `+${delta}%` : `${delta}%`} vs. last scan
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{rank.description}</p>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: "Sounds", value: avgSounds, icon: Ear },
                { label: "Rhythm", value: avgRhythm, icon: Timer },
                { label: "Melody", value: avgMelody, icon: Music },
              ].map(({ label, value, icon: PillarIcon }) => (
                <div key={label} className="rounded-xl border bg-background/85 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PillarIcon className="size-3.5" />
                    {label}
                  </div>
                  <p className={cn("mt-1 text-2xl font-semibold tabular-nums", scoreColor(value))}>{value}%</p>
                </div>
              ))}
            </div>

            <details className="disclosure group rounded-xl border bg-background/85">
              <summary className="flex items-center justify-between px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground select-none">
                <span>Expand scores by reading &amp; recommended course level</span>
                <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="space-y-3 border-t px-4 py-3 text-xs">
                <div className="divide-y">
                  {takes.map((t, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {i + 1}. {t.prompt.title}
                        </p>
                        <p className="truncate text-muted-foreground" lang={lang}>
                          {t.prompt.text}
                        </p>
                      </div>
                      <span className={cn("shrink-0 text-sm font-semibold tabular-nums", scoreColor(t.attempt.overall))}>
                        {t.attempt.overall}%
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
                  <div>
                    <p className="font-medium text-foreground">
                      Recommended setting: {LEVELS[rank.recommended].name}
                    </p>
                    <p className="text-muted-foreground">{LEVELS[rank.recommended].headline}</p>
                  </div>
                  {switchTo ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => void updateProfile({ level: switchTo })}
                    >
                      Use {LEVELS[switchTo].name}
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                      <Check className="size-3.5" /> Active
                    </span>
                  )}
                </div>
              </div>
            </details>
          </div>

          {/* Right column: Vertical Speech Level Ladder (inspired by Reference Image 2, styled in Uttala's design) */}
          <div className="relative mx-auto flex w-full max-w-xs items-stretch justify-end py-2 pl-28 pr-2">
            {/* Floating user score callout pointing to their spot on the vertical ladder */}
            <div
              className="pointer-events-none absolute left-0 z-10 -translate-y-1/2 transition-all duration-500"
              style={{ top: `${topPercent}%` }}
            >
              <div className="relative flex flex-col items-center rounded-2xl border bg-card px-4 py-2.5 text-center shadow-md">
                <span className={cn("text-2xl font-semibold tracking-tight tabular-nums", scoreColor(avgScore))}>
                  {avgScore}%
                </span>
                <span className="max-w-24 truncate text-xs font-medium text-muted-foreground">
                  {firstName || "You"}
                </span>
                {/* Right-pointing triangle notch */}
                <span
                  aria-hidden
                  className="absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 rotate-45 border-t border-r bg-card"
                />
              </div>
            </div>

            {/* Vertical thermometer track + Rank labels */}
            <div className="relative flex flex-1 items-stretch gap-3.5">
              <div className="relative flex w-7 shrink-0 flex-col items-center justify-between rounded-full border bg-secondary/70 py-3">
                {/* Filled level bar from bottom up */}
                <div
                  aria-hidden
                  className="
                    pointer-events-none absolute inset-x-1 bottom-1 rounded-full bg-foreground/15 transition-all duration-700
                  "
                  style={{ height: `${Math.max(8, 100 - topPercent)}%` }}
                />
                {SPEECH_RANKS.map((r, i) => {
                  const active = r.id === rank.id;
                  const passed = avgScore >= r.min;
                  return (
                    <div key={r.id} className="relative z-10 flex flex-col items-center">
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full transition-colors",
                          active
                            ? "bg-foreground text-background ring-4 ring-foreground/20"
                            : passed
                              ? "bg-foreground/70 text-background"
                              : "bg-background text-muted-foreground border",
                        )}
                      >
                        {i === 0 ? (
                          <Star className="size-3 fill-current" />
                        ) : (
                          <span className="size-1.5 rounded-full bg-current" />
                        )}
                      </span>
                      {i < SPEECH_RANKS.length - 1 && (
                        <div className="my-1.5 flex flex-col gap-1.5" aria-hidden>
                          <span className="h-0.5 w-1.5 rounded-full bg-border" />
                          <span className="h-0.5 w-1.5 rounded-full bg-border" />
                          <span className="h-0.5 w-1.5 rounded-full bg-border" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-1 flex-col justify-between py-1.5">
                {SPEECH_RANKS.map((r) => {
                  const active = r.id === rank.id;
                  return (
                    <details key={r.id} className="disclosure group">
                      <summary className="flex items-center gap-1.5 py-1 text-left select-none">
                        <span
                          className={cn(
                            "text-sm transition-colors",
                            active ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {r.label}
                        </span>
                        <Info className="size-3.5 text-muted-foreground/70 group-hover:text-foreground" />
                      </summary>
                      <p className="pb-1 text-[11px] leading-snug text-muted-foreground">
                        <span className="font-mono">{r.short}</span> · {r.description}
                      </p>
                    </details>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Feedback Screen 2: "What sound or melody was good" and "what was bad".
 * Shows only concise good vs. bad items directly; every item is expandable for details.
 */
export function GoodAndBadBreakdownScreen({
  takes,
  lang,
}: {
  takes: DiagnosticTake[];
  lang: string;
}) {
  const { me } = useAccount();
  const live = me.engines.elevenlabs;
  const { good, bad } = useMemo(() => extractHighlightsFromTakes(takes, lang, 3), [takes, lang]);
  const melodyTake = takes.find((t) => t.prompt.kind === "melody") ?? takes[takes.length - 1];

  return (
    <div className="space-y-5">
      <CoachBanner palette="gold" label="Strengths & Focus Areas">
        We kept this simple: only what sounded good and what held you back. Tap any item to expand how to articulate
        it and hear the words from your scan.
      </CoachBanner>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                <Check className="size-3.5" />
              </span>
              What sound or melody was good
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Sounds and prosody patterns that came through clearly.
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {good.map((item) => (
              <ExpandableHighlightRow key={item.id} item={item} tone="good" lang={lang} live={live} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-6 items-center justify-center rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300">
                <Target className="size-3.5" />
              </span>
              What sound or melody was bad
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Highest-impact sounds and pitch habits to train next. Tap to expand.
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {bad.map((item) => (
              <ExpandableHighlightRow key={item.id} item={item} tone="bad" lang={lang} live={live} />
            ))}
          </CardContent>
        </Card>
      </div>

      {melodyTake && melodyTake.prosody.contour.length > 0 && (
        <details className="disclosure group rounded-2xl border bg-card">
          <summary className="flex items-center justify-between px-5 py-3.5 text-sm font-medium select-none">
            <span className="flex items-center gap-2">
              <Music className="size-4 text-muted-foreground" />
              Expand your pitch melody curve against the native voice
            </span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="border-t px-5 py-4">
            <p className="mb-3 text-xs text-muted-foreground">
              From Part 3 (“{melodyTake.prompt.text}”): how your pitch rose and fell through each word compared with
              the reference speaker.
            </p>
            <PitchChart
              contour={melodyTake.prosody.contour}
              words={melodyTake.result.words.map((w) => w.text)}
            />
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Feedback Screen 3: Scoring Scale & Today's Lesson Plan (inspired by Reference Images 1, 3, and 4).
 */
export function ScoringAndPlanScreen({
  takes,
  lang,
}: {
  takes: DiagnosticTake[];
  lang: string;
}) {
  const avgScore = Math.round(takes.reduce((s, t) => s + t.attempt.overall, 0) / Math.max(1, takes.length));
  const lessonWords = useMemo(() => extractLessonWords(takes, lang, 6), [takes, lang]);

  const bands = [
    {
      range: "90–100%",
      label: "Excellent",
      bar: "bg-emerald-500",
      wash: "from-emerald-500/20 via-emerald-500/5 to-transparent",
      text: "text-emerald-700 dark:text-emerald-400",
      detail: "Native-like sound clarity, natural word stress and smooth pitch melody.",
    },
    {
      range: "80–89%",
      label: "Good",
      bar: "bg-amber-400",
      wash: "from-amber-400/20 via-amber-400/5 to-transparent",
      text: "text-amber-700 dark:text-amber-300",
      detail: "Understood effortlessly; only minor vowel or timing habits show an accent.",
    },
    {
      range: "60–79%",
      label: "Fair",
      bar: "bg-orange-500",
      wash: "from-orange-500/20 via-orange-500/5 to-transparent",
      text: "text-orange-700 dark:text-orange-400",
      detail: "Understood in context, though a sound substitution or stress shift stood out.",
    },
    {
      range: "0–59%",
      label: "Weak",
      bar: "bg-red-500",
      wash: "from-red-500/20 via-red-500/5 to-transparent",
      text: "text-red-700 dark:text-red-400",
      detail: "Hard for a listener to catch without effort; queued for focused word drills.",
    },
  ];

  return (
    <div className="space-y-5">
      <CoachBanner palette="sky" label="How Scoring Works">
        As you practise, every word and sound gets a score. Here is what the scale means — and the words from your
        assessment that we queued for your first lesson.
      </CoachBanner>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left Card: Scoring Scale (Reference Image 4 concept in Uttala's design) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scoring Scale</CardTitle>
            <p className="text-xs text-muted-foreground">
              Every word, sound and melody curve is rated on the same 0–100 scale.
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {bands.map((b) => (
              <details key={b.label} className="disclosure group rounded-xl border bg-background overflow-hidden">
                <summary className="relative flex items-center justify-between gap-4 px-4 py-3.5 select-none">
                  <span className={cn("absolute inset-y-0 left-0 w-1.5", b.bar)} aria-hidden />
                  <span
                    className={cn("pointer-events-none absolute inset-0 bg-gradient-to-r", b.wash)}
                    aria-hidden
                  />
                  <span className="relative pl-2 text-base font-semibold tabular-nums">{b.range}</span>
                  <span className="relative flex items-center gap-2">
                    <span className={cn("text-sm font-semibold", b.text)}>{b.label}</span>
                    <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                  </span>
                </summary>
                <p className="border-t bg-card px-5 py-2.5 text-xs text-muted-foreground">{b.detail}</p>
              </details>
            ))}
          </CardContent>
        </Card>

        {/* Right Card: Today's Lesson Plan Stepper (Reference Images 1 & 3 concept in Uttala's design) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your First Lesson Plan</CardTitle>
            <p className="text-xs text-muted-foreground">
              Great work on the assessment. Next, let&apos;s practise the words that were most challenging for you.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step 1: Completed Initial Assessment */}
            <div className="flex items-stretch gap-3.5">
              <div className="flex flex-col items-center">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-xs">
                  <Star className="size-3.5 fill-current" />
                </span>
                <span className="my-1.5 w-0.5 flex-1 border-l-2 border-dashed border-border" aria-hidden />
              </div>
              <div className="flex flex-1 items-center justify-between rounded-2xl border bg-secondary/40 px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold">Initial Assessment</p>
                  <p className="text-xs text-muted-foreground">3 readings · Sounds, Rhythm &amp; Melody</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="rounded-lg bg-amber-400/90 px-2.5 py-1 text-xs font-bold text-amber-950 tabular-nums">
                    {avgScore}%
                  </span>
                  <span className="flex size-9 items-center justify-center rounded-full bg-background border">
                    <AudioWaveform className="size-4" />
                  </span>
                </div>
              </div>
            </div>

            {/* Step 2: Focus Words Cluster */}
            <div className="flex items-stretch gap-3.5">
              <div className="flex flex-col items-center">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-background text-xs font-semibold">
                  2
                </span>
              </div>
              <div className="aurora-wash relative flex-1 overflow-hidden rounded-2xl border p-5">
                {/* Subtle concentric sound-wave rings in background */}
                <svg
                  viewBox="0 0 240 160"
                  className="pointer-events-none absolute inset-0 size-full opacity-25"
                  aria-hidden
                >
                  {[32, 54, 76, 98].map((r) => (
                    <circle
                      key={r}
                      cx="120"
                      cy="85"
                      r={r}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                      className="text-foreground/40"
                    />
                  ))}
                </svg>
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Target Words Lesson</p>
                    <Badge variant="secondary" className="text-[11px]">
                      {Math.min(3, lessonWords.length)} words ready
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Picked from your lowest-scoring sounds in the scan:
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {lessonWords.map(({ word }) => (
                      <span
                        key={`${word.index}-${word.text}`}
                        lang={lang}
                        className="inline-flex items-center gap-1.5 rounded-xl border bg-background/90 px-3 py-1.5 text-sm font-medium shadow-2xs"
                      >
                        {word.text}
                        <span className={cn("text-xs font-semibold tabular-nums", scoreColor(word.score))}>
                          {word.score}%
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Feedback Screen 4: Guided Word-by-Word Practice Lesson (inspired by Reference Image 5, in Uttala's design).
 * Steps through the top 3 challenging words from the user's test with a score gauge, improvement badge,
 * syllable/phoneme pills, and an expandable intonation & articulation tip.
 */
export function WordPracticeLessonScreen({
  takes,
  lang,
}: {
  takes: DiagnosticTake[];
  lang: string;
}) {
  const { me, noteAnalysis, promptUpgrade } = useAccount();
  const live = me.engines.elevenlabs;
  const targets = useMemo(() => extractLessonWords(takes, lang, 3), [takes, lang]);
  const [wordIdx, setWordIdx] = useState(0);
  const [slow, setSlow] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [overrides, setOverrides] = useState<
    Record<number, { word: WordResult; userUrl: string; score: number }>
  >({});

  useEffect(() => stopPlayback, []);

  const currentItem = targets[wordIdx] ?? targets[0];
  const initialWord = currentItem?.word;
  const updated = overrides[wordIdx];
  const activeWord = updated?.word ?? initialWord;
  const currentScore = updated ? updated.score : (initialWord?.score ?? 75);
  const initialScore = initialWord?.score ?? 75;
  const improvement = updated ? updated.score - initialScore : 0;

  const segmented = useMemo(
    () => (activeWord ? segmentWordToPhonemes(activeWord.text, lang) : []),
    [activeWord, lang],
  );

  const hearCoach = async () => {
    if (!activeWord) return;
    const rate = slow ? 0.75 : 1;
    if (!live) {
      speakWithBrowser(activeWord.text, lang, rate);
      return;
    }
    setListening(true);
    try {
      await hear(activeWord.text, { lang, level: DIAGNOSTIC_SCORING_LEVEL, live, rate });
    } catch (err) {
      if (err instanceof UpgradeNeeded) promptUpgrade(err.reason);
      else toast.error(err instanceof Error ? err.message : "Could not play the reference.");
    } finally {
      setListening(false);
    }
  };

  const hearSelf = async () => {
    if (updated?.userUrl) {
      await play(updated.userUrl, { rate: slow ? 0.75 : 1 });
      return;
    }
    const takeUrl = currentItem?.take.userUrl;
    if (takeUrl && initialWord?.start !== undefined && initialWord?.end !== undefined) {
      await play(takeUrl, {
        from: Math.max(0, initialWord.start - 0.02),
        to: initialWord.end + 0.03,
        rate: slow ? 0.75 : 1,
      });
    } else {
      toast.message("Record this word once to hear your take.");
    }
  };

  const analyseWord = useCallback(
    async (blob: Blob) => {
      if (!activeWord) return;
      setBusy(true);
      try {
        const samples = await decodeToMono16k(blob);
        if (samples.length < SAMPLE_RATE * 0.25) {
          toast.error("That was too short. Say the full word clearly.");
          return;
        }
        const wav = encodeWav(samples);
        const form = new FormData();
        form.append("audio", wav, "speech.wav");
        form.append("text", activeWord.text);
        form.append("lang", lang);
        form.append("level", DIAGNOSTIC_SCORING_LEVEL);

        const res = await fetch("/api/assess", { method: "POST", body: form });
        const data = (await res.json()) as AssessResult & { error?: string; upgrade?: "limit" | "customText" };
        if (data.upgrade) {
          promptUpgrade(data.upgrade);
          return;
        }
        if (!res.ok) throw new Error(data.error ?? "Assessment failed.");
        noteAnalysis();

        const scoredWord = data.words[0] ?? {
          ...activeWord,
          score: data.scores.accuracy,
          status: statusFor(data.scores.accuracy, DIAGNOSTIC_SCORING_LEVEL),
        };
        recordAttempt(data, null, {
          lang,
          text: activeWord.text,
          level: DIAGNOSTIC_SCORING_LEVEL,
          maxDrillWords: me.entitlements.maxDrillWords,
          phonemes: true,
        });

        setOverrides((prev) => ({
          ...prev,
          [wordIdx]: {
            word: scoredWord,
            userUrl: URL.createObjectURL(wav),
            score: scoredWord.score,
          },
        }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not score that word.");
      } finally {
        setBusy(false);
      }
    },
    [activeWord, lang, me.entitlements.maxDrillWords, noteAnalysis, promptUpgrade, wordIdx],
  );

  const recorder = useRecorder(analyseWord);

  const toggleRecording = async () => {
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (blob) await analyseWord(blob);
      return;
    }
    if (me.usage.used >= me.usage.limit) {
      promptUpgrade("limit");
      return;
    }
    stopPlayback();
    try {
      await recorder.start();
    } catch {
      toast.error("Microphone access is needed to record.");
    }
  };

  if (!activeWord) return null;

  const canPlaySelf = Boolean(
    updated?.userUrl || (currentItem?.take.userUrl && initialWord?.start !== undefined),
  );
  const primaryGuide = segmented.find((s) => s.sound)?.sound;

  return (
    <div className="space-y-5">
      <CoachBanner palette={improvement > 0 ? "moss" : "orchid"} label={`Focus Word ${wordIdx + 1} of ${targets.length}`}>
        {improvement > 0
          ? `Nice work! You raised “${activeWord.text}” by ${improvement}% (from ${initialScore}% to ${currentScore}%). Try the next word when you are ready.`
          : wordIdx === 0
            ? `Here is the first word from your scan. Listen to the coach voice, check the sound breakdown below, and give it a try!`
            : `Next up is “${activeWord.text}”. Listen once, then record it on its own.`}
      </CoachBanner>

      <Card className="aurora-wash overflow-hidden">
        <CardContent className="flex flex-col items-center p-6 text-center md:p-8">
          {/* Word selector pills */}
          <div className="mb-5 flex flex-wrap justify-center gap-1.5">
            {targets.map((t, i) => {
              const score = overrides[i]?.score ?? t.word.score;
              return (
                <button
                  key={t.word.text}
                  type="button"
                  onClick={() => setWordIdx(i)}
                  lang={lang}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    i === wordIdx ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-secondary",
                  )}
                >
                  <span>
                    {i + 1}. {t.word.text}
                  </span>
                  <span className="opacity-80 tabular-nums">{score}%</span>
                </button>
              );
            })}
          </div>

          {/* Improvement badge (Reference Image 5 concept) */}
          <div className="mb-3">
            {improvement > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                <TrendingUp className="size-3.5 text-emerald-600" />
                <strong>{improvement}%</strong> improvement from{" "}
                <span className="text-amber-700 dark:text-amber-300 font-semibold">{initialScore}%</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                Scan score: <strong className={cn("tabular-nums", scoreColor(initialScore))}>{initialScore}%</strong> ·
                Record once to beat it
              </span>
            )}
          </div>

          {/* Score Ring Gauge */}
          <Ring value={currentScore} max={100} size={116} stroke={10}>
            <span className={cn("text-3xl font-semibold tracking-tight tabular-nums", scoreColor(currentScore))}>
              {currentScore}%
            </span>
          </Ring>

          {/* Target Word + wavy accent underline */}
          <div className="mt-4">
            <p
              lang={lang}
              className={cn(
                "text-4xl font-semibold tracking-tight md:text-5xl",
                currentScore >= 80
                  ? "text-emerald-600 dark:text-emerald-400"
                  : currentScore >= 60
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400",
              )}
            >
              {activeWord.text}
            </p>
            <svg viewBox="0 0 120 8" className="mx-auto mt-1.5 h-2 w-28 text-muted-foreground/50" aria-hidden>
              <path
                d="M 2 4 Q 8 1, 14 4 T 26 4 T 38 4 T 50 4 T 62 4 T 74 4 T 86 4 T 98 4 T 110 4 T 118 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Sound / Phoneme Breakdown Pills */}
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {(activeWord.phonemes && activeWord.phonemes.length > 0
              ? activeWord.phonemes.map((p, i) => ({
                  key: `${p.ipa}-${i}`,
                  grapheme: segmented[i]?.grapheme ?? p.ipa,
                  ipa: p.ipa,
                  score: p.score,
                }))
              : segmented.map((s, i) => ({
                  key: `${s.ipa}-${i}`,
                  grapheme: s.grapheme,
                  ipa: s.ipa,
                  score: currentScore,
                }))
            ).map((unit) => (
              <button
                key={unit.key}
                type="button"
                onClick={() => void hearCoach()}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-secondary",
                  unit.score >= 80
                    ? "border-emerald-300 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : unit.score >= 60
                      ? "border-amber-300 bg-amber-50/70 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      : "border-red-300 bg-red-50/70 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
                )}
              >
                <span>{unit.grapheme}</span>
                <span className="font-mono opacity-75">/{unit.ipa}/</span>
              </button>
            ))}
          </div>

          {/* Expandable Intonation & Articulation Tip (Reference Image 5 concept) */}
          <details className="disclosure group mt-5 w-full max-w-md">
            <summary className="mx-auto inline-flex items-center gap-1.5 rounded-full border bg-background px-4 py-1.5 text-xs font-medium shadow-2xs transition-colors hover:bg-secondary select-none">
              <Sparkles className="size-3.5 text-amber-500" />
              <span>Articulation &amp; intonation tip</span>
              <ChevronDown className="size-3.5 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="mt-3 rounded-xl border bg-background p-3.5 text-left text-xs space-y-1.5">
              {activeWord.diagnosis && (
                <p className="text-muted-foreground">
                  <strong className="text-foreground">What we heard: </strong>
                  {activeWord.diagnosis}
                </p>
              )}
              <p className="text-muted-foreground">
                <strong className="text-foreground">How to shape it: </strong>
                {activeWord.fix ??
                  primaryGuide?.how ??
                  "Hold the stressed vowel slightly longer and finish the final consonant cleanly."}
              </p>
              <p className="text-muted-foreground">
                <strong className="text-foreground">Melody tip: </strong>
                {activeWord.stressIssue ??
                  "When practising a single word, start slightly higher on the stressed syllable and let your pitch fall gently to the end."}
              </p>
            </div>
          </details>

          {/* Playback & Record Controls (Reference Image 5 layout in Uttala style) */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-w-28 rounded-full"
              onClick={() => void hearCoach()}
              disabled={listening}
            >
              {listening ? <Loader2 className="animate-spin" /> : <Volume2 />}
              Coach
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-w-28 rounded-full"
              onClick={() => void hearSelf()}
              disabled={!canPlaySelf}
            >
              <User />
              You
            </Button>
            <Button
              variant={slow ? "secondary" : "ghost"}
              size="sm"
              className="rounded-full font-mono text-xs"
              aria-pressed={slow}
              onClick={() => setSlow(!slow)}
            >
              {slow ? "0.75×" : "1×"}
            </Button>
          </div>

          <div className="mt-5 flex w-full max-w-sm items-center justify-between gap-4">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label="Previous word"
              disabled={wordIdx === 0}
              onClick={() => setWordIdx((i) => Math.max(0, i - 1))}
            >
              <ArrowLeft className="size-4" />
            </Button>

            <div className="flex flex-col items-center gap-1.5">
              <Button
                size="lg"
                variant={recorder.recording ? "destructive" : "default"}
                className="h-14 rounded-full px-7 shadow-sm"
                onClick={() => void toggleRecording()}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : recorder.recording ? (
                  <Square className="size-5 fill-current" />
                ) : (
                  <Mic className="size-5" />
                )}
                {busy ? "Scoring…" : recorder.recording ? "Stop" : "Record word"}
              </Button>
              {recorder.recording && (
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  Listening… {Math.floor(recorder.seconds)}s
                </span>
              )}
            </div>

            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label="Next word"
              disabled={wordIdx >= targets.length - 1}
              onClick={() => setWordIdx((i) => Math.min(targets.length - 1, i + 1))}
            >
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

