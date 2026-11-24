"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeftRight,
  AudioWaveform,
  Check,
  CheckCircle2,
  Gauge,
  Headphones,
  Lightbulb,
  Loader2,
  Lock,
  Mic,
  Pencil,
  RotateCcw,
  Sparkles,
  Square,
  Trophy,
  User,
  Volume2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { LiveBars } from "@/components/live-bars";
import { Orb, paletteForScore } from "@/components/orb";
import { PitchChart } from "@/components/pitch-chart";
import { WordCompareControls } from "@/components/word-compare";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpgradeCard, useNudge } from "@/components/pricing";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAccount, type UpgradeReason } from "@/hooks/use-account";
import { isSilent, MAX_RECORDING_SECONDS, recorderErrorMessage, SILENT_MESSAGE, useRecorder } from "@/hooks/use-recorder";
import {
  decodeToMono16k,
  encodeWav,
  play,
  playOverlay,
  playWordSlice,
  refineSpansWithAudio,
  SAMPLE_RATE,
  speakTextWithBrowser,
  stopPlayback,
  trackPitch,
  type PitchTrack,
} from "@/lib/audio";
import { getLanguage, type Phrase } from "@/lib/languages";
import { LEVELS, SCORE_SCALE, type LevelId } from "@/lib/levels";
import { resetTimeLabel } from "@/lib/plans";
import { buildReferenceContour } from "@/components/pitch-chart";
import type { Deduction } from "@/lib/deductions";
import { compareProsody, fallbackProsody, overallFor } from "@/lib/prosody";
import { bandFor, DEPTH_NOTE } from "@/lib/score-bands";
import { rateWithDeductions } from "@/lib/rating";
import { soundForIpa } from "@/lib/sounds";
import { isShort, SHORT, splitShort, wordCount } from "@/lib/short";
import { bestKey, recordAttempt, useStore, type DrillWordTransition, type Recorded } from "@/lib/store";
import { timeTokens, tokenize, type Span } from "@/lib/text";
import type { AssessResult, Attempt, FocusSound, ProsodyResult, TtsResponse, WordResult, WordStatus } from "@/lib/types";
import { cn } from "@/lib/utils";


export interface Reference {
  url: string;
  /** The reference decoded to 16 kHz mono, when decoding worked. */
  samples: Float32Array | null;
  spans: (Span | null)[];
  pitch: PitchTrack | null;
  duration: number;
}

/** An error that should open the upgrade prompt instead of a toast. */
export class UpgradeNeeded extends Error {
  constructor(public reason: UpgradeReason) {
    super("upgrade");
  }
}


/**
 * Send one recording to /api/assess and return the result. Every failure becomes a message that says what
 * happened and whether the day's allowance was spent (it never is for a failed analysis).
 */
export async function postAssess(form: FormData): Promise<AssessResult> {
  let res: Response;
  try {
    // Never leave the learner on "Analysing…": the server gives up after 60 s, the page after 45 s.
    res = await fetch("/api/assess", { method: "POST", body: form, signal: AbortSignal.timeout(45_000) });
  } catch (err) {
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error("The analysis is taking too long right now. Please try that take again in a moment.");
    }
    throw new Error("We could not reach SayClear. Check your connection and try again. Nothing was used from today's allowance.");
  }
  const data = (await res.json().catch(() => null)) as (AssessResult & { error?: string; upgrade?: UpgradeReason }) | null;
  if (data?.upgrade) throw new UpgradeNeeded(data.upgrade);
  if (res.status === 401) throw new Error("You have been signed out. Sign in again to continue.");
  if (!res.ok || !data) {
    throw new Error(
      data?.error ??
        (res.status === 413
          ? "That recording is too long. Keep each take to one short sentence."
          : "Something went wrong on our side. Nothing was used from today's allowance; please try again."),
    );
  }
  return data;
}

const references = new Map<string, Promise<Reference>>();

/** Fetch (once) the reference reading with DP-aligned + acoustically refined word timings and pitch contour. */
export function loadReference(text: string, lang: string, level: LevelId, voiceId?: string): Promise<Reference> {
  const clean = text.trim();
  const key = `v2|${lang}|${voiceId ?? `auto-${level}`}|${clean}`;
  let pending = references.get(key);
  if (!pending) {
    pending = (async () => {
      let res: Response;
      try {
        res = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: clean, lang, level, voiceId }),
        });
      } catch {
        throw new Error("We could not reach the reference voice. Check your connection and try again.");
      }
      const data = (await res.json().catch(() => null)) as (TtsResponse & { error?: string; upgrade?: UpgradeReason }) | null;
      if (data?.upgrade) throw new UpgradeNeeded(data.upgrade);
      if (!res.ok || !data) throw new Error(data?.error ?? "The reference voice is not answering right now. Please try again in a moment.");
      const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: data.mime });
      const samples = await decodeToMono16k(blob).catch(() => null);
      const pitch = samples ? trackPitch(samples) : null;
      const rawSpans = timeTokens(data.chars, tokenize(clean, lang), lang);
      const spans = samples ? refineSpansWithAudio(samples, rawSpans) : rawSpans;
      const duration = samples
        ? samples.length / SAMPLE_RATE
        : data.chars.length
          ? data.chars[data.chars.length - 1].e
          : 0;
      return { url: URL.createObjectURL(blob), samples, spans, pitch, duration };
    })();
    references.set(key, pending);
    pending.catch(() => references.delete(key));
  }
  return pending;
}

export function speakWithBrowser(text: string, lang: string, rate: number, intentId?: number): Promise<void> {
  const locale = getLanguage(lang).azure ?? lang;
  return speakTextWithBrowser(text, locale, lang, rate, intentId);
}

/** Play a word or phrase in the reference voice (with standalone citation intonation for single words). */
export async function hear(
  text: string,
  opts: { lang: string; level: LevelId; live: boolean; voiceId?: string; rate?: number; intentId?: number },
): Promise<void> {
  const clean = text.trim().replace(/^[,;:\-–—]+|[,;:\-–—]+$/g, "").trim() || text.trim();
  if (!opts.live) {
    await speakWithBrowser(clean, opts.lang, opts.rate ?? 1, opts.intentId);
    return;
  }
  const ref = await loadReference(clean, opts.lang, opts.level, opts.voiceId);
  await play(ref.url, { rate: opts.rate ?? 1, intentId: opts.intentId });
}

export const scoreColor = (score: number) =>
  score >= 86 ? "text-emerald-600" : score >= 65 ? "text-amber-600" : "text-red-600";

const STATUS_STYLE: Record<WordStatus, string> = {
  ok: "hover:bg-secondary",
  unclear: "bg-amber-100 text-amber-950 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-200",
  mispronounced: "bg-red-100 text-red-950 hover:bg-red-200 dark:bg-red-950/60 dark:text-red-200",
  omitted: "text-muted-foreground line-through decoration-red-500 hover:bg-secondary",
};

const STATUS_LABEL: Record<WordStatus, string> = {
  ok: "Clear",
  unclear: "Unclear",
  mispronounced: "Mispronounced",
  omitted: "Skipped",
};

/** Concrete next step chosen from the diagnostic result and the learner's level. */
function coachTip(result: AssessResult, prosody: ProsodyResult | null, level: LevelId): string {
  if (result.overallFeedback) return result.overallFeedback;
  const worst = [...result.words].sort((a, b) => a.score - b.score)[0];
  const skipped = result.words.filter((w) => w.status === "omitted").length;
  if (skipped > result.words.length / 3) {
    return "A lot of the text was not heard. Check that your microphone is close, then say the whole sentence at a steady pace.";
  }
  if (worst && worst.status !== "ok") {
    if (worst.diagnosis && worst.fix) {
      return `${worst.diagnosis} ${worst.fix}`;
    }
    if (worst.heard) {
      return `“${worst.text}” was heard as “${worst.heard}”. Tap it to see the exact sound breakdown and compare your audio with the reference.`;
    }
    return level === "beginner"
      ? `Start with “${worst.text}”. Tap it, listen slowly, and say only that word a few times before trying the whole phrase again.`
      : `“${worst.text}” was the least clear word. Check its sound breakdown on the right, compare your version with the reference, then record again.`;
  }
  if (prosody?.hesitations) {
    return "Every word was clear. Next, link the words: read it again without stopping inside a phrase.";
  }
  if (prosody && prosody.rhythm !== null && prosody.rhythm < 75) {
    return "Your sounds are clear. Now copy the timing: stretch the words the reference stretches and hurry through the rest.";
  }
  if (prosody && prosody.intonation !== null && prosody.intonation < 70) {
    return "Your sounds are clear. Now copy the tune: follow where the reference voice rises and falls in the chart.";
  }
  return level === "advanced"
    ? "Clean take. Try the next sentence, switch to Shadowing to lock in native speed, or paste a line you have to say this week."
    : "Every word came through clearly. Move on to the next sentence, or try a harder level.";
}

interface Outcome {
  text: string;
  lang: string;
  level: LevelId;
  result: AssessResult;
  prosody: ProsodyResult | null;
  userUrl: string;
  reference: Reference | null;
  attempt: Attempt;
  personalBest: boolean;
  previousBest?: number;
  /** Unclear words that did not fit the drill list on this plan. */
  leftOut: string[];
  /** Per-word drill transitions produced by this attempt. */
  transitions: DrillWordTransition[];
}

interface Props {
  lang: string;
  text: string;
  level: LevelId;
  voiceId?: string;
  /** Meaning and romanisation for built-in phrases. */
  phrase?: Phrase;
  /** When given, the learner may replace the text with their own. */
  onTextChange?: (text: string) => void;
  /** Called when the learner finishes editing, so a long text can be split into short sentences. */
  onEditDone?: (text: string) => void;
  /** Called when recording begins so the parent can pin the active item. */
  onRecordStart?: () => void;
  onResult?: (result: AssessResult, attempt: Attempt, recorded: Recorded) => void;
  /** Shown beside the record button once there is a result, e.g. "Next phrase". */
  after?: React.ReactNode;
}

export function PracticeSession({
  lang,
  text,
  level,
  voiceId,
  phrase,
  onTextChange,
  onEditDone,
  onRecordStart,
  onResult,
  after,
}: Props) {
  const { me, noteAnalysis, promptUpgrade } = useAccount();
  const ent = me.entitlements;
  const language = getLanguage(lang);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [editing, setEditing] = useState(false);
  const [slowChoice, setSlowChoice] = useState<boolean | null>(null);
  const slow = slowChoice ?? LEVELS[level].slowByDefault;

  const shown = outcome && outcome.text === text && outcome.lang === lang && outcome.level === level ? outcome : null;
  const target = text.trim();
  const live = me.engines.elevenlabs;
  const tokens = useMemo(() => tokenize(text, lang), [text, lang]);
  const outOfRecordings = me.usage.used >= me.usage.limit;
  const best = useStore("best")[bestKey(lang, text)];

  useEffect(() => {
    const url = outcome?.userUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [outcome?.userUrl]);

  useEffect(() => stopPlayback, []);

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof UpgradeNeeded) promptUpgrade(err.reason);
      else toast.error(err instanceof Error ? err.message : fallback);
    },
    [promptUpgrade],
  );

  const analyse = useCallback(
    async (blob: Blob) => {
      setBusy(true);
      try {
        const samples = await decodeToMono16k(blob);
        if (samples.length < SAMPLE_RATE * 0.4) {
          toast.error("That was too short. Say the whole sentence, then press Stop. This did not use a recording.");
          return;
        }
        if (isSilent(samples)) {
          toast.error(SILENT_MESSAGE);
          return;
        }
        const wav = encodeWav(samples);
        const form = new FormData();
        form.append("audio", wav, "speech.wav");
        form.append("text", target);
        form.append("lang", lang);
        form.append("level", level);
        const refPromise = live ? loadReference(target, lang, level, voiceId).catch(() => null) : Promise.resolve(null);
        let data = await postAssess(form);
        noteAnalysis();

        // Do not block the analysis result if reference TTS is still generating on a cold cache.
        let reference = await Promise.race([
          refPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 200)),
        ]);

        // Main rating: score by deduction, from the sound model running on our server (src/lib/rating.ts).
        // It runs before the attempt is saved so the stored score is the deduction score.
        if (live) {
          reference ??= await Promise.race([refPromise, new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000))]);
        }
        const rated = await rateWithDeductions(samples, data, reference, lang);
        data = rated.result;

        // Refine user word timings against the actual 16 kHz waveform energy envelope.
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

        const userSpans = data.words.map((w) =>
          w.start !== undefined && w.end !== undefined ? { start: w.start, end: w.end } : null,
        );
        const userPitch = ent.prosody ? trackPitch(samples) : null;
        const rawProsody =
          reference && ent.prosody && userPitch
            ? compareProsody(userSpans, reference.spans, userPitch, reference.pitch)
            : null;
        // Prefer prosody measured on the sound model's word timings (the one the deduction used).
        const measured = rated.prosody ?? rawProsody;
        const prosody = ent.prosody
          ? measured && measured.rhythm !== null && measured.intonation !== null
            ? measured
            : fallbackProsody(target, data.words, userPitch, data.duration)
          : null;
        const recorded = recordAttempt(data, prosody, {
          lang,
          text: target,
          level,
          maxDrillWords: ent.maxDrillWords,
          phonemes: ent.phonemes,
        });
        if (recorded.mastered.length) {
          toast.success(
            recorded.mastered.length === 1
              ? `“${recorded.mastered[0]}” is mastered. It has left your drill list.`
              : `${recorded.mastered.length} words mastered. They have left your drill list.`,
          );
        }
        const worst = [...data.words].sort((a, b) => a.score - b.score)[0];
        setSelected(worst && worst.status !== "ok" ? worst.index : data.words[0]?.index ?? null);
        setEditing(false);
        const userUrl = URL.createObjectURL(wav);
        setOutcome({
          text,
          lang,
          level,
          result: data,
          prosody,
          userUrl,
          reference,
          attempt: recorded.attempt,
          personalBest: recorded.personalBest,
          previousBest: recorded.previousBest,
          leftOut: recorded.leftOut,
          transitions: recorded.transitions,
        });
        if (!reference && live) {
          void refPromise.then((lateRef) => {
            if (!lateRef) return;
            setOutcome((prev) => {
              if (!prev || prev.userUrl !== userUrl) return prev;
              const updatedProsody =
                ent.prosody && userPitch
                  ? compareProsody(userSpans, lateRef.spans, userPitch, lateRef.pitch)
                  : prev.prosody;
              return {
                ...prev,
                reference: lateRef,
                prosody:
                  updatedProsody && updatedProsody.rhythm !== null && updatedProsody.intonation !== null
                    ? updatedProsody
                    : prev.prosody,
              };
            });
          });
        }
        onResult?.(data, recorded.attempt, recorded);
      } catch (err) {
        fail(err, "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
    [ent.maxDrillWords, ent.phonemes, ent.prosody, fail, lang, level, live, noteAnalysis, onResult, target, text, voiceId],
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
    onRecordStart?.();
    stopPlayback();
    // Warm reference audio while the user is speaking so it's ready when recording stops.
    if (live && target) {
      void loadReference(target, lang, level, voiceId).catch(() => null);
    }
    try {
      await recorder.start();
    } catch (err) {
      toast.error(recorderErrorMessage(err));
    }
  };

  /**
   * Play the whole reference, or a single word at `index`.
   * When `standalone` is true (e.g. tapping a word to learn its pronunciation),
   * plays the word with standalone citation intonation so it never sounds chopped out of a sentence.
   */
  const listen = async (index?: number, standalone = false, intentId?: number) => {
    const rate = slow ? 0.75 : 1;
    if (!live) {
      await speakWithBrowser(index === undefined ? target : (tokens[index]?.text ?? ""), lang, rate, intentId);
      return;
    }
    if (intentId === undefined) setListening(true);
    try {
      if (index !== undefined && (standalone || tokens.length === 1)) {
        const wordText = tokens[index]?.text;
        if (!wordText) return;
        await hear(wordText, { lang, level, live, voiceId, rate, intentId });
        return;
      }
      const ref = await loadReference(target, lang, level, voiceId);
      const span = index === undefined ? null : ref.spans[index];
      if (index !== undefined && !span) {
        const wordText = tokens[index]?.text;
        if (wordText) await hear(wordText, { lang, level, live, voiceId, rate, intentId });
        return;
      }
      await play(
        ref.url,
        span
          ? { from: Math.max(0, span.start - 0.015), to: span.end + 0.02, rate, intentId }
          : { rate, intentId },
      );
    } catch (err) {
      fail(err, "Could not play the reference.");
    } finally {
      if (intentId === undefined) setListening(false);
    }
  };

  const startEditing = () => {
    if (!ent.customText) {
      promptUpgrade("customText");
      return;
    }
    setOutcome(null);
    setEditing(true);
  };

  /** Reference first, then the learner: the quickest way to hear what differs. */
  const compare = async () => {
    if (!shown?.reference) return;
    setListening(true);
    try {
      await play(shown.reference.url);
      await play(shown.userUrl);
    } finally {
      setListening(false);
    }
  };

  /** Play Reference and Learner simultaneously (chorus overlay) so timing/pitch drift pops out. */
  const compareOverlay = async () => {
    if (!shown?.reference) return;
    setListening(true);
    try {
      await playOverlay(shown.reference.url, shown.userUrl);
    } finally {
      setListening(false);
    }
  };

  // Keyboard: R records or stops, L plays the reference. Ignored while typing.
  const keys = useRef({ record: toggleRecording, listen: () => void listen() });
  useEffect(() => {
    keys.current = { record: toggleRecording, listen: () => void listen() };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "r" || e.key === "R") void keys.current.record();
      else if (e.key === "l" || e.key === "L") keys.current.listen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const word = shown && selected !== null ? shown.result.words[selected] : null;
  // One short take at a time: a longer text is split into sentences before it can be recorded.
  const short = isShort(target, lang);
  const disabled = !target || !short || busy;
  const canSeeSounds = me.engines.azure || Boolean(me.engines.openai);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <Card className="gap-0 overflow-hidden py-0">
          {shown && (
            <AttemptVerdictBanner
              key={shown.attempt.id}
              outcome={shown}
              cap={ent.maxDrillWords}
            />
          )}
          <CardContent className="p-0">
            <div className={cn("p-5 md:p-6", onTextChange ? "min-h-52" : "min-h-28")}>
              <div
                key={`${lang}:${text}`}
                dir={language.rtl ? "rtl" : "ltr"}
                lang={lang}
                className="prompt-stage-enter"
              >
                {shown ? (
                  <ScoredText
                    text={shown.text}
                    words={shown.result.words}
                    selected={selected}
                    onSelect={setSelected}
                    attemptId={shown.attempt.id}
                  />
                ) : editing && onTextChange ? (
                  <Textarea
                    autoFocus
                    value={text}
                    onChange={(e) => onTextChange(e.target.value)}
                    placeholder="Type or paste what you want to say. Longer texts are split into short sentences you practise one at a time…"
                    name="text"
                    aria-label="Text to read aloud"
                    className="min-h-44 resize-none border-0 p-0 text-lg leading-relaxed shadow-none focus-visible:ring-0 md:text-xl dark:bg-transparent"
                  />
                ) : (
                  <TappableText text={text} tokens={tokens} onTap={(i) => void listen(i, true)} />
                )}
              </div>
              {!editing && (phrase?.roman || phrase?.meaning) && (
                <div className="mt-4 space-y-0.5 border-t pt-3 text-sm">
                  {phrase.roman && <p className="text-muted-foreground italic">{phrase.roman}</p>}
                  {phrase.meaning && <p className="text-muted-foreground">Means: {phrase.meaning}</p>}
                </div>
              )}
              {!shown && !editing && (
                <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Tap any word to hear it pronounced clearly on its own.</span>
                  {best !== undefined && (
                    <span className="flex items-center gap-1">
                      <Trophy className="size-3" />
                      Your best: <span className={cn("font-medium tabular-nums", scoreColor(best))}>{best}</span>
                    </span>
                  )}
                  <span className="ml-auto hidden md:inline">
                    <Kbd>L</Kbd> listen · <Kbd>R</Kbd> record
                  </span>
                </p>
              )}
              {shown && <Legend />}
              {shown && word && (
                <div className="mt-3 rounded-xl border bg-secondary/35 p-3">
                  <WordCompareControls
                    word={word}
                    lang={lang}
                    showHeader
                    compact
                    canPlaySelf={word.start !== undefined && word.end !== undefined}
                    canPlayTarget
                    canPlayInSentence={live && shown.result.words.length > 1 && !!shown.reference?.spans[word.index]}
                    onPlaySelf={(intentId) =>
                      playWordSlice(shown.userUrl, word, { rate: slow ? 0.75 : 1, intentId })
                    }
                    onPlayTarget={(intentId) => listen(word.index, true, intentId)}
                    onPlayInSentence={(intentId) => listen(word.index, false, intentId)}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
              <Button variant="outline" className="rounded-full" onClick={() => listen()} disabled={!target || listening}>
                {listening ? <Loader2 className="animate-spin" /> : <Volume2 />}
                Listen
              </Button>
              <Button
                variant={slow ? "secondary" : "ghost"}
                className="rounded-full"
                aria-pressed={slow}
                onClick={() => setSlowChoice(!slow)}
              >
                <Gauge />
                Slow
              </Button>
              {onTextChange &&
                (editing ? (
                  <Button
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => {
                      setEditing(false);
                      onEditDone?.(target);
                    }}
                    disabled={!target}
                  >
                    Done
                  </Button>
                ) : (
                  <Button variant="ghost" className="rounded-full" onClick={startEditing}>
                    {ent.customText ? <Pencil /> : <Lock />}
                    Use your own text
                  </Button>
                ))}

              <div className="ml-auto flex items-center gap-3">
                {recorder.recording ? (
                  <>
                    <LevelOrb analyser={recorder.analyser} />
                    <LiveBars analyser={recorder.analyser} className="hidden h-8 w-28 text-foreground sm:block" />
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {Math.floor(recorder.seconds)}s / {MAX_RECORDING_SECONDS}s
                    </span>
                  </>
                ) : (
                  editing && (
                    <span className="text-xs text-muted-foreground">
                      {short || !target
                        ? `${wordCount(target, lang)} / ${SHORT.words} words`
                        : `${splitShort(target, lang).length} short sentences · press Done`}
                    </span>
                  )
                )}
                <Button
                  className="rounded-full"
                  variant={recorder.recording ? "destructive" : "default"}
                  onClick={toggleRecording}
                  disabled={disabled}
                >
                  {busy ? (
                    <Loader2 className="animate-spin" />
                  ) : recorder.recording ? (
                    <Square className="fill-current" />
                  ) : shown ? (
                    <RotateCcw />
                  ) : (
                    <Mic />
                  )}
                  {busy ? "Analysing…" : recorder.recording ? "Stop" : shown ? "Try again" : "Record"}
                </Button>
                {shown && !recorder.recording && !busy && after}
              </div>
            </div>
          </CardContent>
        </Card>

        {shown && (
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex gap-3">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pronunciation Coach</p>
                <p className="text-sm leading-relaxed">{coachTip(shown.result, shown.prosody, level)}</p>
              </div>
            </div>
            {shown.result.focusSounds && shown.result.focusSounds.length > 0 && (
              <FocusSoundsBar
                sounds={shown.result.focusSounds}
                lang={lang}
                level={level}
                live={live}
                voiceId={voiceId}
              />
            )}
          </div>
        )}
        {shown && shown.leftOut.length > 0 && ent.maxDrillWords !== null && (
          <DrillFullCard words={shown.leftOut} cap={ent.maxDrillWords} />
        )}
        {outOfRecordings && !recorder.recording && (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Today&apos;s {me.usage.limit} recordings are used. They come back at {resetTimeLabel()} (midnight UTC).
            Listening, ear training, the sound library and your drill list stay open, and everything you already
            recorded is saved.
          </p>
        )}
        {shown?.result.demo && (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Demo mode: these scores are simulated because the speech engine is not connected.
          </p>
        )}
        {shown?.result.warnings.map((w) => (
          <p key={w} className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            {w}
          </p>
        ))}

        {shown && live && (ent.prosody ? shown.prosody && shown.prosody.contour.length > 0 : true) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Melody</CardTitle>
              <p className="text-sm text-muted-foreground">
                How your pitch rises and falls through each word, compared with the reference. Each line is relative
                to the speaker&apos;s own voice, so only the shape matters.
              </p>
            </CardHeader>
            <CardContent>
              {shown.prosody ? (
                <PitchChart contour={shown.prosody.contour} words={shown.result.words.map((w) => w.text)} />
              ) : (
                <LockedMelody
                  reference={shown.reference}
                  words={shown.result.words.map((w) => w.text)}
                  good={shown.attempt.overall >= 70}
                  onUnlock={() => promptUpgrade("prosody")}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="min-w-0 space-y-6">
        {shown ? (
          <>
            <Scores
              xp={shown.attempt.xp}
              personalBest={shown.personalBest}
              result={shown.result}
              prosody={shown.prosody}
              level={level}
              prosodyLocked={live && !ent.prosody}
              onUnlock={() => promptUpgrade("prosody")}
            />
            {word && (
              <WordDetail
                word={word}
                lang={lang}
                isMultiWord={shown.result.words.length > 1}
                canHearReference
                canHearSlice={live && !!shown.reference?.spans[word.index]}
                soundsLocked={canSeeSounds && !ent.phonemes && !word.phonemes?.length}
                onUnlockSounds={() => promptUpgrade("phonemes")}
                onWordAlone={(intentId) => listen(word.index, true, intentId)}
                onInSentence={(intentId) => listen(word.index, false, intentId)}
                onSelf={(intentId) =>
                  playWordSlice(shown.userUrl, word, { rate: slow ? 0.75 : 1, intentId })
                }
              />
            )}
            <FocusNext
              words={shown.result.words}
              selected={selected}
              onSelect={setSelected}
              onReplay={() => void play(shown.userUrl)}
              onCompare={shown.reference ? () => void compare() : undefined}
              onOverlay={shown.reference ? () => void compareOverlay() : undefined}
            />
          </>
        ) : (
          <HowItWorks level={level} />
        )}
      </div>
    </div>
  );
}

function AttemptVerdictBanner({ outcome, cap }: { outcome: Outcome; cap: number | null }) {
  const words = outcome.result.words;
  const overall = overallFor(outcome.result, outcome.prosody);
  const single = words.length === 1 ? words[0] : null;
  const badWords = words.filter((w) => w.status !== "ok");
  const mispronouncedCount = words.filter((w) => w.status === "mispronounced" || w.status === "omitted").length;

  const primaryTransition = single
    ? outcome.transitions.find(
        (t) =>
          t.status === "mastered" ||
          t.status === "resting" ||
          t.status === "streak-up" ||
          t.status === "streak-reset" ||
          t.status === "resting-early",
      )
    : undefined;

  const addedToDrills = outcome.transitions.filter((t) => t.status === "added").map((t) => t.text);
  const cappedByLimit = outcome.transitions.filter((t) => t.status === "capped").map((t) => t.text);
  const masteredNow = outcome.transitions.filter((t) => t.status === "mastered").map((t) => t.text);
  const restingNow = outcome.transitions.filter((t) => t.status === "resting").map((t) => t.text);

  let kind: "success" | "almost" | "failure";
  if (single) {
    kind =
      single.score >= SCORE_SCALE.clear
        ? "success"
        : single.score >= SCORE_SCALE.unclear
          ? "almost"
          : "failure";
  } else {
    kind =
      overall >= SCORE_SCALE.clear && badWords.length === 0
        ? "success"
        : overall >= 65 && mispronouncedCount === 0
          ? "almost"
          : overall >= 72 && badWords.length <= 1
            ? "almost"
            : "failure";
  }

  let headline = "";
  let detail = "";

  if (single && primaryTransition) {
    const t = primaryTransition;
    if (t.status === "mastered") {
      headline = `Mastered! “${t.text}” passed its final check (${single.score}/100)`;
      detail = "This word graduated to your Mastered list. Advance when you are ready.";
    } else if (t.status === "resting") {
      headline =
        t.checkIndex === 1
          ? `3 of 3 clear! “${t.text}” is locked in (${single.score}/100)`
          : `Spaced check ${(t.checkIndex ?? 2) - 1} passed! (${single.score}/100)`;
      detail = `Now resting for ${t.dueDays ?? 2} days before its next check. Review your take or move to the next word.`;
    } else if (t.status === "streak-up") {
      const left = Math.max(1, 3 - t.newStreak);
      headline = `Clear take! Streak ${t.newStreak} of 3 in a row (${single.score}/100)`;
      detail = `Say “${t.text}” clearly ${left} more time${left === 1 ? "" : "s"} in a row to send it to rest.`;
    } else if (t.status === "resting-early") {
      headline = `Clear take! (${single.score}/100)`;
      detail = `Still resting until its scheduled check in ${t.dueDays ?? 1} day${t.dueDays === 1 ? "" : "s"}.`;
    } else if (t.status === "streak-reset") {
      headline =
        t.prevStreak > 0
          ? `Unclear take (${single.score}/100) — streak reset from ${t.prevStreak} of 3 to 0`
          : `Not clear yet (${single.score}/100) — need ${SCORE_SCALE.clear}+ for take 1 of 3`;
      detail = single.heard
        ? `Heard as “${single.heard}”. Listen to the target below and try again.`
        : (single.fix ?? "Listen to the reference once, then record again.");
    }
  } else if (single) {
    if (kind === "success") {
      headline = `Clear! “${single.text}” came through cleanly (${single.score}/100)`;
      detail =
        outcome.personalBest && outcome.previousBest !== undefined
          ? `Up +${overall - outcome.previousBest} pts from your previous best.`
          : "Sounded clear. Try it again or continue to the next step.";
    } else if (kind === "almost") {
      headline = `Almost there on “${single.text}” (${single.score}/100)`;
      detail =
        single.fix ??
        (single.heard
          ? `Heard as “${single.heard}”. Aim for ${SCORE_SCALE.clear}+ to mark this word clear.`
          : `Score ${SCORE_SCALE.clear}+ to mark this word clear. Listen and try once more.`);
    } else {
      headline = `“${single.text}” needs another try (${single.score}/100)`;
      detail = single.heard
        ? `Heard as “${single.heard}”. Compare your audio with the reference below, then try again.`
        : (single.diagnosis ?? "Listen slowly to the reference below, then record again.");
    }
  } else {
    if (kind === "success") {
      headline = `Clean take! Every word came through clearly (${overall}/100)`;
      detail =
        outcome.personalBest && outcome.previousBest !== undefined
          ? `New personal best (+${overall - outcome.previousBest} pts).`
          : "All words were clear. Review any word below or continue when you are ready.";
    } else if (kind === "almost") {
      headline = `Good take (${overall}/100) — ${badWords.length} word${badWords.length === 1 ? "" : "s"} to polish`;
      detail = `Tap ${badWords.length === 1 ? `“${badWords[0].text}”` : "the highlighted words"} below to compare your recording with the reference.`;
    } else {
      headline = `Needs another take (${overall}/100) — ${badWords.length} word${badWords.length === 1 ? "" : "s"} unclear`;
      detail = `Tap the highlighted words below to hear what went wrong, or practise the hard words one at a time.`;
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "transition-entry border-b px-5 py-3.5 text-sm",
        kind === "success" &&
          "border-emerald-200 bg-emerald-50/90 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100",
        kind === "almost" &&
          "border-amber-200 bg-amber-50/90 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100",
        kind === "failure" &&
          "border-red-200 bg-red-50/90 text-red-950 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
              kind === "success" && "verdict-pop bg-emerald-600 text-white",
              kind === "almost" && "verdict-pop bg-amber-500 text-white",
              kind === "failure" && "verdict-shake bg-red-600 text-white",
            )}
          >
            {kind === "success" ? (
              <Check className="size-3.5 stroke-[2.5]" />
            ) : kind === "almost" ? (
              <AlertCircle className="size-3.5" />
            ) : (
              <XCircle className="size-3.5" />
            )}
          </span>
          <div className="space-y-1">
            <p className="font-semibold leading-snug">{headline}</p>
            <p className="text-xs opacity-85">{detail}</p>
            {(addedToDrills.length > 0 || cappedByLimit.length > 0 || masteredNow.length > 0 || restingNow.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {masteredNow.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/15 px-2 py-0.5 text-[11px] font-medium">
                    <Sparkles className="size-3" />
                    Mastered: {masteredNow.map((w) => `“${w}”`).join(", ")}
                  </span>
                )}
                {restingNow.length > 0 && !single && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/15 px-2 py-0.5 text-[11px] font-medium">
                    <Check className="size-3" />
                    3/3 clear → resting: {restingNow.map((w) => `“${w}”`).join(", ")}
                  </span>
                )}
                {addedToDrills.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium text-foreground">
                    Added to Drills: {addedToDrills.slice(0, 3).map((w) => `“${w}”`).join(", ")}
                    {addedToDrills.length > 3 ? ` +${addedToDrills.length - 3}` : ""}
                  </span>
                )}
                {cappedByLimit.length > 0 && (
                  <Link
                    href="/drills"
                    className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-background/85 px-2 py-0.5 text-[11px] font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {cap ?? 5}-word drill limit full: {cappedByLimit.slice(0, 2).map((w) => `“${w}”`).join(", ")}
                    {cappedByLimit.length > 2 ? ` +${cappedByLimit.length - 2}` : ""} in waiting list →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {outcome.attempt.xp !== undefined && outcome.attempt.xp > 0 && (
            <span className="rounded-full bg-background/80 px-2.5 py-0.5 tabular-nums text-foreground">
              +{outcome.attempt.xp} pts
            </span>
          )}
          {outcome.personalBest && (
            <span className="verdict-pop inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-white">
              <Trophy className="size-3" />
              New best
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DrillFullCard({ words, cap }: { words: string[]; cap: number }) {
  const { me } = useAccount();
  const nudge = useNudge("drills", me.billing);
  const shownWords = words.slice(0, 4).map((w) => `“${w}”`).join(", ");
  if (!nudge.visible || !me.billing) {
    return (
      <div className="transition-entry flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/70 bg-amber-50/60 px-4 py-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/25">
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">All {cap} drill slots are in use.</span> Your existing {cap} drill
          words were kept safe, and {shownWords}
          {words.length > 4 ? ` and ${words.length - 4} more` : ""} moved to your waiting list so nothing disappears.
        </p>
        <Button asChild size="sm" variant="outline" className="rounded-full">
          <Link href="/drills">Manage {cap} slots in Drills</Link>
        </Button>
      </div>
    );
  }
  return (
    <UpgradeCard
      title={`Your drill list is full at ${cap} words`}
      currentPlan={me.plan}
      trialAvailable={me.trialAvailable}
      onDismiss={nudge.dismiss}
    >
      <p>
        Your existing {cap} drill words were kept safe, and these unclear words from this take moved to your waiting list:{" "}
        <span className="font-medium text-foreground">{shownWords}</span>
        {words.length > 4 ? ` and ${words.length - 4} more` : ""}. You can swap them into a slot under{" "}
        <Link href="/drills" className="font-medium text-foreground underline underline-offset-4">
          Drills
        </Link>
        , or unlock Plus for an unlimited drill list.
      </p>
    </UpgradeCard>
  );
}

function FocusSoundsBar({
  sounds,
  lang,
  level,
  live,
  voiceId,
}: {
  sounds: FocusSound[];
  lang: string;
  level: LevelId;
  live: boolean;
  voiceId?: string;
}) {
  return (
    <div className="border-t pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <AudioWaveform className="size-3.5" />
        Key sounds to refine from this recording
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {sounds.map((s) => {
          const guide = s.soundId ? soundForIpa(lang, s.ipa) : undefined;
          const sampleWord = guide?.words[0];
          return (
            <div key={s.ipa} className="flex flex-col justify-between gap-2 rounded-lg border bg-background p-2.5 text-xs">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    <span className="font-mono text-sm">/{s.ipa}/</span> · {s.name}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {s.count}× in take
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground leading-snug">{s.tip}</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {sampleWord && (
                  <button
                    type="button"
                    onClick={() => void hear(sampleWord, { lang, level, live, voiceId })}
                    className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                  >
                    <Volume2 className="size-3" />
                    Hear “{sampleWord}”
                  </button>
                )}
                {s.soundId && (
                  <Link
                    href={`/sounds/${s.soundId}`}
                    className="ml-auto inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Sound guide →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Small orb that swells with the microphone level while recording. */
function LevelOrb({ analyser }: { analyser: AnalyserNode | null }) {
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
      <Orb palette="ember" size={28} />
    </span>
  );
}

function TappableText({
  text,
  tokens,
  onTap,
}: {
  text: string;
  tokens: { from: number; to: number; text: string }[];
  onTap: (index: number) => void;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((t, i) => {
    if (t.from > cursor) parts.push(text.slice(cursor, t.from));
    parts.push(
      <button
        key={i}
        type="button"
        onClick={() => onTap(i)}
        aria-label={`Hear “${t.text}”`}
        className="rounded-md px-0.5 transition-colors hover:bg-secondary"
      >
        {text.slice(t.from, t.to)}
      </button>,
    );
    cursor = t.to;
  });
  parts.push(text.slice(cursor));
  return <p className="text-xl leading-loose md:text-2xl md:leading-loose">{parts}</p>;
}

function ScoredText({
  text,
  words,
  selected,
  onSelect,
  attemptId,
}: {
  text: string;
  words: WordResult[];
  selected: number | null;
  onSelect: (i: number) => void;
  attemptId?: string;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  const single = words.length === 1;
  for (const w of words) {
    if (w.from > cursor) parts.push(text.slice(cursor, w.from));
    parts.push(
      <button
        key={`${attemptId ?? "take"}-${w.index}`}
        type="button"
        onClick={() => onSelect(w.index)}
        aria-label={`${w.text}: ${STATUS_LABEL[w.status]}, ${w.score} out of 100`}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1 transition-colors",
          STATUS_STYLE[w.status],
          single && w.status === "ok" && "bg-emerald-100/80 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-200",
          (w.status === "mispronounced" || w.status === "omitted") && "verdict-shake",
          selected === w.index && "ring-2 ring-foreground ring-offset-1",
        )}
      >
        <span>{text.slice(w.from, w.to)}</span>
        {single && w.status === "ok" && <Check className="verdict-pop size-5 text-emerald-600" />}
      </button>,
    );
    cursor = w.to;
  }
  parts.push(text.slice(cursor));
  return <p className="text-xl leading-loose md:text-2xl md:leading-loose">{parts}</p>;
}

function Legend() {
  const items: [string, string][] = [
    ["Clear", "border bg-background"],
    ["Unclear", "bg-amber-100"],
    ["Mispronounced", "bg-red-100"],
  ];
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
      {items.map(([label, swatch]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded-sm", swatch)} />
          {label}
        </span>
      ))}
      <span className="line-through decoration-red-500">Skipped</span>
      <span className="ml-auto">Tap any word to compare how you said it vs. how it should sound</span>
    </div>
  );
}

/**
 * Free plan: the native melody of this very sentence is shown for free, and Plus would lay the learner's own
 * line over it. After a good take the full explanation shows once a day; otherwise one quiet line.
 */
function LockedMelody({
  reference,
  words,
  good,
  onUnlock,
}: {
  reference: Reference | null;
  words: string[];
  good: boolean;
  onUnlock: () => void;
}) {
  const { me } = useAccount();
  const contour = useMemo(() => (reference ? buildReferenceContour(reference.spans, reference.pitch) : []), [reference]);
  const nudge = useNudge("melody", good);
  return (
    <div className="space-y-3">
      {contour.length > 0 ? (
        <PitchChart contour={contour} words={words} />
      ) : (
        <p className="text-sm text-muted-foreground">The native melody for this sentence is still loading.</p>
      )}
      {nudge.visible ? (
        <UpgradeCard
          title="Nice take. Here is what Plus would add to this chart"
          currentPlan={me.plan}
          trialAvailable={me.trialAvailable}
          onDismiss={nudge.dismiss}
        >
          <p>
            The line above is how a native speaker moves their voice through this sentence. With Plus, your own line is
            drawn on top of it word by word, with a rhythm score, so you can see where your voice goes flat or
            rushes. Your sounds and words are scored in full on the free plan either way.
          </p>
        </UpgradeCard>
      ) : (
        <p className="text-xs text-muted-foreground">
          Plus draws your own melody on top of this one.{" "}
          <button type="button" onClick={onUnlock} className="font-medium underline underline-offset-4">
            See what it adds
          </button>
        </p>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-secondary px-1 font-mono text-[10px]">{children}</kbd>;
}

function Scores({
  xp,
  personalBest,
  result,
  prosody,
  level,
  prosodyLocked,
  onUnlock,
}: {
  xp?: number;
  personalBest?: boolean;
  result: AssessResult;
  prosody: ProsodyResult | null;
  level: LevelId;
  prosodyLocked: boolean;
  onUnlock: () => void;
}) {
  const overall = overallFor(result, prosody);
  const pace = prosody?.pace;
  const rows: { label: string; value: number | null; hint: string; paid?: boolean }[] = [
    {
      label: "Sounds",
      value: result.scores.accuracy,
      hint: result.phonemeLevel
        ? "How close each sound was to a native speaker. This carries most of your score."
        : "How close each word was to a native speaker. This carries most of your score.",
    },
    {
      label: "Understood",
      value: result.scores.intelligibility,
      hint: "Share of words a listener without the script recognised.",
    },
    {
      label: "Fluency",
      value: prosody?.fluency ?? null,
      paid: true,
      hint:
        pace == null
          ? "Pace and hesitations."
          : `${prosody?.hesitations ?? 0} hesitation${prosody?.hesitations === 1 ? "" : "s"} · ${pace.toFixed(2)}× reference pace`,
    },
    {
      label: "Rhythm",
      value: prosody?.rhythm ?? null,
      paid: true,
      hint: "Which words you stretch and which you shorten, compared with one reference voice. A guide, not a verdict.",
    },
    {
      label: "Melody",
      value: prosody?.intonation ?? null,
      paid: true,
      hint: "Rise and fall of your pitch, compared with one reference voice. A guide, not a verdict.",
    },
  ];
  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Overall · {LEVELS[level].name}</p>
            <p className={cn("text-5xl font-semibold tracking-tight tabular-nums", scoreColor(overall))}>{overall}</p>
            <p className="mt-1 text-sm font-medium" title={bandFor(overall).detail}>
              {bandFor(overall).label}
            </p>
            <p className="text-xs text-muted-foreground">{DEPTH_NOTE[result.depth ?? (result.phonemeLevel ? "sound" : "word")]}</p>
            {result.deduction ? (
              <p className="text-xs text-muted-foreground">Rated by deduction: 100 minus every mistake caught.</p>
            ) : (
              !result.demo && <p className="text-xs text-muted-foreground">Engine score: the precise rating could not run.</p>
            )}
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {xp !== undefined && <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground">+{xp} points</span>}
              {personalBest && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900">
                  <Trophy className="size-3" />
                  New best
                </span>
              )}
            </p>
          </div>
          <Orb palette={paletteForScore(overall)} size={60} float="fast" />
        </div>
        {result.deduction && <DeductionList result={result} />}
        <div className="space-y-4">
          {rows.map((r) => {
            const locked = r.paid && prosodyLocked;
            return (
              <div key={r.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{r.label}</span>
                  {locked ? (
                    <button
                      type="button"
                      onClick={onUnlock}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <Lock className="size-3" />
                      Plus
                    </button>
                  ) : (
                    <span className="tabular-nums text-muted-foreground">{r.value ?? "–"}</span>
                  )}
                </div>
                <Progress value={r.value ?? 0} className="mt-1.5 h-1.5" />
                <p className="mt-1 text-xs text-muted-foreground">
                  {locked || r.value !== null ? r.hint : "Not enough speech to measure this time."}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

const KIND_LABEL: Record<Deduction["kind"], string> = {
  sound: "Sound",
  word: "Word",
  pause: "Pause",
  pace: "Pace",
  rhythm: "Rhythm",
  melody: "Melody",
};

/** What cost points, biggest first: the reasons behind a deduction score. */
function DeductionList({ result }: { result: AssessResult }) {
  const items = [...(result.deduction?.items ?? [])].sort((a, b) => b.points - a.points);
  if (!items.length) return <p className="text-sm text-muted-foreground">No mistakes caught. Nothing was deducted.</p>;
  const shown = items.slice(0, 8);
  return (
    <div>
      <p className="text-sm font-medium">What cost points</p>
      <ul className="mt-1.5 space-y-1 text-sm">
        {shown.map((d, i) => (
          <li key={i} className="flex items-baseline gap-2">
            <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
              −{d.points.toFixed(1)}
            </span>
            <span className="min-w-0">
              <span className="text-muted-foreground">{KIND_LABEL[d.kind]}</span>
              {d.word !== undefined && result.words[d.word] ? ` · “${result.words[d.word].text}”` : ""} · {d.detail}
            </span>
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <p className="mt-1 text-xs text-muted-foreground">
          and {items.length - shown.length} smaller deduction{items.length - shown.length > 1 ? "s" : ""} (−
          {items
            .slice(shown.length)
            .reduce((s, d) => s + d.points, 0)
            .toFixed(1)}
          )
        </p>
      )}
    </div>
  );
}

function WordDetail({
  word,
  lang,
  isMultiWord,
  canHearReference,
  canHearSlice,
  soundsLocked,
  onUnlockSounds,
  onWordAlone,
  onInSentence,
  onSelf,
}: {
  word: WordResult;
  lang: string;
  isMultiWord: boolean;
  canHearReference: boolean;
  canHearSlice: boolean;
  soundsLocked: boolean;
  onUnlockSounds: () => void;
  onWordAlone: (intentId?: number) => Promise<void> | void;
  onInSentence: (intentId?: number) => Promise<void> | void;
  onSelf: (intentId?: number) => Promise<void> | void;
}) {
  const [activePhonemeIdx, setActivePhonemeIdx] = useState<number | null>(null);
  const phonemes = useMemo(() => word.phonemes ?? [], [word.phonemes]);
  // Without a measurement the sounds are the word's expected sounds; their numbers would be invented.
  const measured = word.phonemesMeasured === true;
  const worstIdx = useMemo(() => {
    if (!measured) {
      const heardIdx = phonemes.findIndex((p) => p.heardIpa && p.heardIpa !== p.ipa);
      return heardIdx >= 0 ? heardIdx : null;
    }
    let idx = -1;
    let min = 80;
    phonemes.forEach((p, i) => {
      if (p.score < min) {
        min = p.score;
        idx = i;
      }
    });
    return idx >= 0 ? idx : null;
  }, [phonemes, measured]);

  const focusedIdx = activePhonemeIdx !== null && phonemes[activePhonemeIdx] ? activePhonemeIdx : worstIdx;
  const focusedPhoneme = focusedIdx !== null ? phonemes[focusedIdx] : null;
  const focusedGuide = focusedPhoneme ? soundForIpa(lang, focusedPhoneme.ipa) : undefined;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-2xl font-semibold tracking-tight" lang={lang}>
              {word.text}
            </p>
            {(word.expectedIpa || word.heardIpa) && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {word.expectedIpa && (
                  <span>
                    Target <span className="font-mono text-foreground">/{word.expectedIpa}/</span>
                  </span>
                )}
                {word.heardIpa && word.heardIpa !== word.expectedIpa && (
                  <span>
                    · Heard <span className="font-mono text-red-600 dark:text-red-400">/{word.heardIpa}/</span>
                  </span>
                )}
              </p>
            )}
            {word.heard && <p className="mt-0.5 text-sm text-muted-foreground">Heard as “{word.heard}”</p>}
            {word.status === "omitted" && (
              <p className="mt-0.5 text-sm text-muted-foreground">This word was not heard in your recording.</p>
            )}
          </div>
          <div className="text-right">
            <p className={cn("text-2xl font-semibold tabular-nums", scoreColor(word.score))}>{word.score}</p>
            <Badge variant="secondary">{word.errorCategory ?? STATUS_LABEL[word.status]}</Badge>
          </div>
        </div>

        {word.native && (
          <div className="space-y-1 rounded-lg border bg-secondary/40 p-2.5 text-xs">
            <p className="font-medium">Compared with a native reading</p>
            <p className="font-mono">
              <span className="text-muted-foreground">native</span> /{word.native.ref}/{" "}
              <span className="text-muted-foreground">· you</span>{" "}
              <span className={word.native.issues.length ? "text-red-600 dark:text-red-400" : undefined}>/{word.native.heard}/</span>
            </p>
            {word.native.issues.length > 0 ? (
              <ul className="space-y-0.5">
                {word.native.issues.slice(0, 3).map((i, k) => (
                  <li key={k}>
                    {i.heard ? (
                      <>
                        You said <span className="font-mono">/{i.heard}/</span> where a native says{" "}
                        <span className="font-mono">/{i.ref}/</span>.
                      </>
                    ) : (
                      <>
                        The native <span className="font-mono">/{i.ref}/</span> was missing.
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Your sounds matched the native reading.</p>
            )}
          </div>
        )}

        {phonemes.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {measured
                ? "Sound-by-sound breakdown (tap a sound)"
                : "Sounds in this word (tap one for how to say it). Scored as a whole word, not sound by sound."}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {phonemes.map((p, i) => {
                const isFocused = focusedIdx === i;
                const substituted = !!p.heardIpa && p.heardIpa !== p.ipa;
                const isWeak = measured ? p.score < 80 : substituted;
                const isBad = measured ? p.score < 60 : substituted;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActivePhonemeIdx(i)}
                    className={cn(
                      "flex flex-col items-center rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:bg-secondary",
                      isWeak && "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30",
                      isBad && "border-red-300 bg-red-50/70 dark:border-red-800 dark:bg-red-950/40",
                      isFocused && "ring-2 ring-foreground ring-offset-1",
                    )}
                  >
                    <span className="flex items-center gap-1 font-mono text-sm font-medium">
                      <span>/{p.ipa}/</span>
                      {p.heardIpa && p.heardIpa !== p.ipa && (
                        <span className="text-xs text-red-600 dark:text-red-400">→/{p.heardIpa}/</span>
                      )}
                    </span>
                    {measured && (
                      <span className={cn("text-[11px] font-semibold tabular-nums", scoreColor(p.score))}>{p.score}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {focusedPhoneme && (focusedPhoneme.issue || focusedPhoneme.tip || focusedGuide) && (
              <div className="rounded-lg border bg-secondary/40 p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    Sound <span className="font-mono">/{focusedPhoneme.ipa}/</span>
                    {focusedGuide ? ` · ${focusedGuide.name}` : ""}
                  </span>
                  {focusedGuide && (
                    <Link href={`/sounds/${focusedGuide.id}`} className="font-medium underline underline-offset-2">
                      Full guide →
                    </Link>
                  )}
                </div>
                {focusedPhoneme.issue && <p className="text-muted-foreground">{focusedPhoneme.issue}</p>}
                {(focusedPhoneme.tip ?? focusedGuide?.how) && (
                  <p className="text-foreground">
                    <span className="font-medium">How to articulate: </span>
                    {focusedPhoneme.tip ?? focusedGuide?.how}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {(word.diagnosis || word.fix || word.stressIssue) && (
          <div className="space-y-2 rounded-xl border bg-card p-3 text-xs">
            {word.diagnosis && (
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                <div>
                  <span className="font-semibold text-foreground">What went wrong: </span>
                  <span className="text-muted-foreground">{word.diagnosis}</span>
                </div>
              </div>
            )}
            {word.fix && (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                <div>
                  <span className="font-semibold text-foreground">How to fix it: </span>
                  <span className="text-muted-foreground">{word.fix}</span>
                </div>
              </div>
            )}
            {word.stressIssue && (
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">Stress / tone: </span>
                {word.stressIssue}
              </p>
            )}
          </div>
        )}

        {soundsLocked && (
          <button
            type="button"
            onClick={onUnlockSounds}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            <Lock className="size-3.5 shrink-0" />
            See which sound in this word is off, with Pro
          </button>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">How you said it vs. how it should sound</p>
          <WordCompareControls
            word={word}
            lang={lang}
            compact
            canPlaySelf={word.start !== undefined && word.end !== undefined}
            canPlayTarget={canHearReference}
            canPlayInSentence={isMultiWord && canHearSlice}
            onPlaySelf={onSelf}
            onPlayTarget={onWordAlone}
            onPlayInSentence={onInSentence}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FocusNext({
  words,
  selected,
  onSelect,
  onReplay,
  onCompare,
  onOverlay,
}: {
  words: WordResult[];
  selected: number | null;
  onSelect: (i: number) => void;
  onReplay: () => void;
  onCompare?: () => void;
  onOverlay?: () => void;
}) {
  const weak = words.filter((w) => w.status !== "ok").sort((a, b) => a.score - b.score).slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{weak.length ? "Work on these next" : "Nothing to fix here"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {weak.length === 0 && (
          <p className="text-sm text-muted-foreground">Every word came through clearly. Try a longer or harder text.</p>
        )}
        {weak.map((w) => (
          <button
            key={w.index}
            type="button"
            onClick={() => onSelect(w.index)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
              selected === w.index && "border-foreground bg-secondary",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{w.text}</span>
              {(w.errorCategory || w.diagnosis) && (
                <span className="block truncate text-xs text-muted-foreground">
                  {w.errorCategory ?? w.diagnosis}
                </span>
              )}
            </span>
            <span className={cn("shrink-0 font-semibold tabular-nums", scoreColor(w.score))}>{w.score}</span>
          </button>
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={onReplay}>
            <User />
            Replay me
          </Button>
          {onCompare && (
            <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={onCompare}>
              <ArrowLeftRight />
              A → B
            </Button>
          )}
          {onOverlay && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-full"
              onClick={onOverlay}
              title="Play the reference and your recording together in stereo"
            >
              <Headphones />
              Together
            </Button>
          )}
          {weak.length > 0 && (
            <Button asChild size="sm" className="flex-1 rounded-full">
              <Link href="/drills">Drill them</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const STEPS: Record<LevelId, [string, string][]> = {
  beginner: [
    ["Tap and listen", "Tap each word to hear it on its own, then play the whole phrase. It starts slowed down for you."],
    ["Say it", "Press Record and say the phrase. Don't worry about speed."],
    ["See what was understood", "Clear words stay plain. Coloured words show exact sound-by-sound feedback."],
    ["Repeat the hard ones", "They are saved to Drills until you say them clearly three times, then come back for two spaced checks."],
  ],
  intermediate: [
    ["Listen", "Hear a native reading. Slow it down if you need to."],
    ["Record", "Say the sentence at your natural pace. It takes a few seconds."],
    ["Inspect the diagnosis", "Tap any word to see which phoneme was off, how to position your tongue and lips, and compare audio."],
    ["Word, then sentence", "Drill each weak word on its own, then put it back into the sentence. Shadowing trains the rhythm."],
  ],
  advanced: [
    ["Listen for the music", "Notice where the voice speeds up, lingers and changes pitch, not only the sounds."],
    ["Record", "Say it at full natural speed, in one breath."],
    ["Compare rhythm and melody", "Use A → B and Together playback to hear subtle timing and pitch differences."],
    ["Target your weak spots", "Generate a short sentence and drill words built around your exact weak sounds."],
  ],
};

function HowItWorks({ level }: { level: LevelId }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How a session works</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {STEPS[level].map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
