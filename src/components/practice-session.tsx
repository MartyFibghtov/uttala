"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeftRight,
  AudioWaveform,
  CheckCircle2,
  Gauge,
  Headphones,
  Lightbulb,
  Loader2,
  Lock,
  Mic,
  Pencil,
  RotateCcw,
  Square,
  Trophy,
  User,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { LiveBars } from "@/components/live-bars";
import { Orb, paletteForScore } from "@/components/orb";
import { PitchChart } from "@/components/pitch-chart";
import { WordCompareControls } from "@/components/word-compare";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAccount, type UpgradeReason } from "@/hooks/use-account";
import { MAX_RECORDING_SECONDS, useRecorder } from "@/hooks/use-recorder";
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
import { LEVELS, type LevelId } from "@/lib/levels";
import type { Deduction } from "@/lib/deductions";
import { compareProsody, fallbackProsody, overallFor } from "@/lib/prosody";
import { bandFor, DEPTH_NOTE } from "@/lib/score-bands";
import { preloadRatingModel, rateWithDeductions } from "@/lib/rating";
import { soundForIpa } from "@/lib/sounds";
import { isShort, SHORT, splitShort, wordCount } from "@/lib/short";
import { bestKey, recordAttempt, useStore } from "@/lib/store";
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

const references = new Map<string, Promise<Reference>>();

/** Fetch (once) the reference reading with DP-aligned + acoustically refined word timings and pitch contour. */
export function loadReference(text: string, lang: string, level: LevelId, voiceId?: string): Promise<Reference> {
  const clean = text.trim();
  const key = `v2|${lang}|${voiceId ?? `auto-${level}`}|${clean}`;
  let pending = references.get(key);
  if (!pending) {
    pending = (async () => {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: clean, lang, level, voiceId }),
      });
      const data = (await res.json()) as TtsResponse & { error?: string; upgrade?: UpgradeReason };
      if (data.upgrade) throw new UpgradeNeeded(data.upgrade);
      if (!res.ok) throw new Error(data.error ?? "Could not load the reference audio.");
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
  onResult?: (result: AssessResult, attempt: Attempt) => void;
  /** Shown beside the record button once there is a result, e.g. "Next phrase". */
  after?: React.ReactNode;
}

export function PracticeSession({ lang, text, level, voiceId, phrase, onTextChange, onEditDone, onResult, after }: Props) {
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
  // Fetch the sound model early so it is ready by the first recording (about 240 MB, once).
  useEffect(() => {
    preloadRatingModel().catch(() => undefined);
  }, []);

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
          toast.error("That was too short. Try again.");
          return;
        }
        const wav = encodeWav(samples);
        const form = new FormData();
        form.append("audio", wav, "speech.wav");
        form.append("text", target);
        form.append("lang", lang);
        form.append("level", level);
        const refPromise = live ? loadReference(target, lang, level, voiceId).catch(() => null) : Promise.resolve(null);
        const res = await fetch("/api/assess", { method: "POST", body: form });
        let data = (await res.json()) as AssessResult & { error?: string; upgrade?: UpgradeReason };
        if (data.upgrade) throw new UpgradeNeeded(data.upgrade);
        if (!res.ok) throw new Error(data.error ?? "Assessment failed.");
        noteAnalysis();

        // Do not block the analysis result if reference TTS is still generating on a cold cache.
        let reference = await Promise.race([
          refPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 200)),
        ]);

        // Main rating: score by deduction, from the sound model running on this device (src/lib/rating.ts).
        // It runs before the attempt is saved so the stored score is the deduction score.
        if (live) {
          reference ??= await Promise.race([refPromise, new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000))]);
        }
        const rated = await rateWithDeductions(samples, data, reference, lang);
        data = { ...rated.result, error: data.error, upgrade: data.upgrade };

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
        onResult?.(data, recorded.attempt);
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
    stopPlayback();
    // Warm reference audio while the user is speaking so it's ready when recording stops.
    if (live && target) {
      void loadReference(target, lang, level, voiceId).catch(() => null);
    }
    try {
      await recorder.start();
    } catch {
      toast.error("Microphone access is needed to record. Allow it in your browser and try again.");
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
          <CardContent className="p-0">
            <div className={cn("p-5 md:p-6", onTextChange ? "min-h-52" : "min-h-28")}>
              <div dir={language.rtl ? "rtl" : "ltr"} lang={lang}>
                {shown ? (
                  <ScoredText text={shown.text} words={shown.result.words} selected={selected} onSelect={setSelected} />
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
                <LockedMelody onUnlock={() => promptUpgrade("prosody")} />
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
}: {
  text: string;
  words: WordResult[];
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const w of words) {
    if (w.from > cursor) parts.push(text.slice(cursor, w.from));
    parts.push(
      <button
        key={w.index}
        type="button"
        onClick={() => onSelect(w.index)}
        aria-label={`${w.text}: ${STATUS_LABEL[w.status]}, ${w.score} out of 100`}
        className={cn(
          "rounded-md px-0.5 transition-colors",
          STATUS_STYLE[w.status],
          selected === w.index && "ring-2 ring-foreground ring-offset-1",
        )}
      >
        {text.slice(w.from, w.to)}
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

function LockedMelody({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-lg">
      <svg viewBox="0 0 600 120" className="h-28 w-full blur-[3px]" aria-hidden>
        <path
          d="M0,70 C60,20 110,90 170,60 S270,20 330,70 420,100 480,50 560,40 600,65"
          fill="none"
          strokeWidth={3}
          className="stroke-muted-foreground/40"
        />
        <path
          d="M0,80 C70,60 100,40 170,75 S280,60 330,50 430,80 480,70 550,30 600,55"
          fill="none"
          strokeWidth={3}
          className="stroke-foreground/70"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/50 text-center">
        <p className="text-sm font-medium">See how your melody compares with a native voice</p>
        <Button size="sm" className="rounded-full" onClick={onUnlock}>
          <Lock />
          Unlock with Plus
        </Button>
      </div>
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
