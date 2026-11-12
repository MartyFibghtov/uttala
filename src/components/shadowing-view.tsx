"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Eye,
  EyeOff,
  Headphones,
  Layers,
  Loader2,
  Mic,
  Play,
  Radio,
  Repeat,
  RotateCcw,
  Shuffle,
  Square,
  Volume2,
  Waves,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { LiveBars } from "@/components/live-bars";
import { Orb, paletteForScore } from "@/components/orb";
import { LanguagePicker, LevelPicker, VoicePicker, useVoiceId } from "@/components/pickers";
import { buildReferenceContour, PitchChart } from "@/components/pitch-chart";
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
import { Progress } from "@/components/ui/progress";
import { GeneratedTextBanner, WeakSpotGenerator } from "@/components/weak-spot-generator";
import { useAccount, type UpgradeReason } from "@/hooks/use-account";
import { useRecorder } from "@/hooks/use-recorder";
import {
  decodeToMono16k,
  encodeWav,
  play,
  playOverlay,
  refineSpansWithAudio,
  SAMPLE_RATE,
  stopPlayback,
  trackPitch,
} from "@/lib/audio";
import { findPhrase, getLanguage, textsFor, type Phrase } from "@/lib/languages";
import { type LevelId } from "@/lib/levels";
import { compareProsody, overallScore } from "@/lib/prosody";
import { recordAttempt, useStore } from "@/lib/store";
import { tokenize, type Span } from "@/lib/text";
import type { AssessResult, Attempt, GeneratedText, ProsodyResult } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ShadowMode = "simultaneous" | "echo";

const SPEED_STEPS = [
  { rate: 0.75, label: "0.75×", hint: "Articulation" },
  { rate: 0.88, label: "0.88×", hint: "Linking" },
  { rate: 1.0, label: "1.00×", hint: "Native speed" },
] as const;

interface ShadowOutcome {
  text: string;
  lang: string;
  level: LevelId;
  mode: ShadowMode;
  result: AssessResult;
  prosody: ProsodyResult | null;
  synchrony: number;
  userUrl: string;
  reference: Reference | null;
  attempt: Attempt;
}

function splitSentences(text: string, lang: string): string[] {
  const seg = new Intl.Segmenter(lang, { granularity: "sentence" });
  const parts: string[] = [];
  for (const s of seg.segment(text)) {
    const clean = s.segment.trim();
    if (clean) parts.push(clean);
  }
  return parts.length > 0 ? parts : [text.trim()];
}

/** Calculate a composite Shadowing Synchrony score weighting rhythm, pace, melody, fluency and sound clarity. */
function computeSynchrony(result: AssessResult, prosody: ProsodyResult | null, level: LevelId): number {
  if (!prosody) return result.scores.accuracy;
  const paceScore =
    prosody.pace === null
      ? 80
      : Math.max(0, Math.min(100, Math.round(100 - Math.abs(1 - prosody.pace) * 140)));
  const rhythm = prosody.rhythm ?? 78;
  const melody = prosody.intonation ?? 78;
  const fluency = prosody.fluency ?? 80;
  const sounds = result.scores.accuracy;
  const raw = rhythm * 0.28 + paceScore * 0.22 + melody * 0.2 + fluency * 0.12 + sounds * 0.18;
  return Math.max(0, Math.min(100, Math.round((raw + overallScore({
    accuracy: result.scores.accuracy,
    intelligibility: result.scores.intelligibility,
    fluency: prosody.fluency,
    rhythm: prosody.rhythm,
    intonation: prosody.intonation,
  }, level)) / 2)));
}

export function ShadowingSession({
  lang,
  text,
  level,
  voiceId,
  phrase,
}: {
  lang: string;
  text: string;
  level: LevelId;
  voiceId?: string;
  phrase?: Phrase;
}) {
  const { me, noteAnalysis, promptUpgrade } = useAccount();
  const ent = me.entitlements;
  const language = getLanguage(lang);
  const live = me.engines.elevenlabs;
  const outOfRecordings = me.usage.used >= me.usage.limit;

  const [mode, setMode] = useState<ShadowMode>("simultaneous");
  const [rate, setRate] = useState<number>(level === "beginner" ? 0.75 : level === "intermediate" ? 0.88 : 1.0);
  const [blind, setBlind] = useState(false);
  const [headphones, setHeadphones] = useState(true);
  const textKey = `${lang}:${text}`;
  const [chunkState, setChunkState] = useState<{ key: string; idx: number | "all" }>({ key: textKey, idx: "all" });
  const chunkIdx: number | "all" = chunkState.key === textKey ? chunkState.idx : "all";
  const setChunkIdx = (idx: number | "all") => setChunkState({ key: textKey, idx });
  const [countdown, setCountdown] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "countdown" | "model-playing" | "shadowing" | "analysing">("idle");
  const [refState, setRefState] = useState<{ key: string; ref: Reference | null }>({ key: "", ref: null });
  const [playheadTime, setPlayheadTime] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<ShadowOutcome | null>(null);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  const abortRef = useRef(false);

  const sentences = useMemo(() => splitSentences(text, lang), [text, lang]);
  const activeText =
    chunkIdx === "all" || sentences.length <= 1 ? text.trim() : (sentences[chunkIdx] ?? text.trim());
  const tokens = useMemo(() => tokenize(activeText, lang), [activeText, lang]);
  const refKey = `${lang}:${level}:${voiceId ?? ""}:${activeText}`;
  const reference = live && activeText && refState.key === refKey ? refState.ref : null;
  const setReference = useCallback(
    (ref: Reference | null) => setRefState({ key: refKey, ref }),
    [refKey],
  );

  const shown =
    outcome && outcome.text === activeText && outcome.lang === lang && outcome.level === level ? outcome : null;

  useEffect(() => {
    if (!live || !activeText) return;
    let cancelled = false;
    loadReference(activeText, lang, level, voiceId)
      .then((ref) => {
        if (!cancelled) setRefState({ key: refKey, ref });
      })
      .catch(() => {
        if (!cancelled) setRefState({ key: refKey, ref: null });
      });
    return () => {
      cancelled = true;
    };
  }, [activeText, lang, level, live, refKey, voiceId]);

  useEffect(() => {
    const url = outcome?.userUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [outcome?.userUrl]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      stopPlayback();
    };
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
      setPhase("analysing");
      setPlayheadTime(null);
      try {
        const samples = await decodeToMono16k(blob);
        if (samples.length < SAMPLE_RATE * 0.4) {
          toast.error("Recording was too short. Try shadowing the full phrase.");
          return;
        }
        const wav = encodeWav(samples);
        const form = new FormData();
        form.append("audio", wav, "speech.wav");
        form.append("text", activeText);
        form.append("lang", lang);
        form.append("level", level);

        const [res, ref] = await Promise.all([
          fetch("/api/assess", { method: "POST", body: form }),
          live ? loadReference(activeText, lang, level, voiceId).catch(() => null) : Promise.resolve(null),
        ]);
        const data = (await res.json()) as AssessResult & { error?: string; upgrade?: UpgradeReason };
        if (data.upgrade) throw new UpgradeNeeded(data.upgrade);
        if (!res.ok) throw new Error(data.error ?? "Shadowing analysis failed.");
        noteAnalysis();

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

        const prosody = ref
          ? compareProsody(
              data.words.map((w) =>
                w.start !== undefined && w.end !== undefined ? { start: w.start, end: w.end } : null,
              ),
              ref.spans,
              trackPitch(samples),
              ref.pitch,
            )
          : null;

        const recorded = recordAttempt(data, prosody, {
          lang,
          text: activeText,
          level,
          maxDrillWords: ent.maxDrillWords,
          phonemes: ent.phonemes,
        });

        const synchrony = computeSynchrony(data, prosody, level);
        const worst = [...data.words].sort((a, b) => a.score - b.score)[0];
        setSelectedWord(worst ? worst.index : 0);
        setOutcome({
          text: activeText,
          lang,
          level,
          mode,
          result: data,
          prosody,
          synchrony,
          userUrl: URL.createObjectURL(wav),
          reference: ref,
          attempt: recorded.attempt,
        });
      } catch (err) {
        fail(err, "Could not analyse your shadowing take.");
      } finally {
        setPhase("idle");
      }
    },
    [activeText, ent.maxDrillWords, ent.phonemes, fail, lang, level, live, mode, noteAnalysis, voiceId],
  );

  const recorder = useRecorder(analyse);

  const cancelShadowing = useCallback(async () => {
    abortRef.current = true;
    setCountdown(null);
    setPlayheadTime(null);
    stopPlayback();
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (blob && blob.size > 2000) {
        await analyse(blob);
        return;
      }
    }
    setPhase("idle");
  }, [analyse, recorder]);

  /** Preview the reference with real-time karaoke highlighting and pitch cursor. */
  const listenPreview = async () => {
    if (!live) {
      speakWithBrowser(activeText, lang, rate);
      return;
    }
    setPhase("model-playing");
    try {
      const ref = reference ?? (await loadReference(activeText, lang, level, voiceId));
      setReference(ref);
      await play(ref.url, {
        rate,
        onProgress: (t) => setPlayheadTime(t),
      });
    } catch (err) {
      fail(err, "Could not play the reference.");
    } finally {
      setPlayheadTime(null);
      setPhase("idle");
    }
  };

  /**
   * Run a Shadowing session:
   * - "simultaneous" (Chorus mode): 3-2-1 countdown -> starts microphone + plays reference simultaneously
   *   with live karaoke word pacing -> stops shortly after the reference finishes.
   * - "echo" (Echo mode): Plays the reference while highlighting each word -> immediately opens microphone
   *   so the learner repeats from auditory memory with the same rhythm.
   */
  const startShadowing = async () => {
    if (phase !== "idle") {
      await cancelShadowing();
      return;
    }
    if (outOfRecordings) {
      promptUpgrade("limit");
      return;
    }
    abortRef.current = false;
    stopPlayback();

    try {
      const ref = live ? (reference ?? (await loadReference(activeText, lang, level, voiceId))) : null;
      if (ref) setReference(ref);

      if (mode === "simultaneous") {
        // Start mic first so browser permission prompt never interrupts the countdown or audio.
        await recorder.start({ echoCancellation: !headphones });
        setPhase("countdown");
        for (const step of [3, 2, 1]) {
          if (abortRef.current) return;
          setCountdown(step);
          await new Promise((r) => setTimeout(r, 550));
        }
        setCountdown(null);
        if (abortRef.current) return;

        setPhase("shadowing");
        if (ref) {
          await play(ref.url, {
            rate,
            onProgress: (t) => setPlayheadTime(t),
          });
        } else {
          speakWithBrowser(activeText, lang, rate);
          await new Promise((r) => setTimeout(r, Math.max(2500, activeText.length * 85)));
        }
        if (abortRef.current) return;
        // Give 450ms tail room for the learner to finish the final consonant.
        await new Promise((r) => setTimeout(r, 450));
        if (abortRef.current) return;
        const blob = await recorder.stop();
        if (blob) await analyse(blob);
      } else {
        // Echo mode: Model speaks first while learner listens & tracks the contour, then mic opens immediately.
        setPhase("model-playing");
        if (ref) {
          await play(ref.url, {
            rate,
            onProgress: (t) => setPlayheadTime(t),
          });
        } else {
          speakWithBrowser(activeText, lang, rate);
          await new Promise((r) => setTimeout(r, Math.max(2000, activeText.length * 75)));
        }
        setPlayheadTime(null);
        if (abortRef.current) return;

        await recorder.start({ echoCancellation: true });
        setPhase("shadowing");

        // Echo window: pace guide sweeps across the words at the target rate while the learner echoes.
        const targetDuration = ref && ref.duration > 0 ? ref.duration / rate : Math.max(2.5, tokens.length * 0.45);
        const echoWindowMs = Math.min(28_000, Math.round((targetDuration + 0.9) * 1000));
        const started = performance.now();
        await new Promise<void>((resolve) => {
          const tick = () => {
            if (abortRef.current) {
              resolve();
              return;
            }
            const elapsedSec = ((performance.now() - started) / 1000) * rate;
            setPlayheadTime(elapsedSec);
            if (performance.now() - started >= echoWindowMs) {
              resolve();
              return;
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        setPlayheadTime(null);
        if (abortRef.current) return;
        const blob = await recorder.stop();
        if (blob) await analyse(blob);
      }
    } catch (err) {
      await recorder.stop().catch(() => null);
      setPhase("idle");
      setCountdown(null);
      setPlayheadTime(null);
      fail(err, "Microphone access is needed to shadow.");
    }
  };

  // Compute live word index + fractional progress from `playheadTime` and `reference.spans`.
  const liveWordPosition = ((): { wordIdx: number; fraction: number } | null => {
    if (playheadTime === null || !reference?.spans.length) return null;
    const spans = reference.spans;
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      if (!s) continue;
      if (playheadTime >= s.start && playheadTime <= s.end) {
        const dur = Math.max(0.02, s.end - s.start);
        return { wordIdx: i, fraction: Math.max(0, Math.min(1, (playheadTime - s.start) / dur)) };
      }
      if (playheadTime < s.start) {
        return { wordIdx: Math.max(0, i - 1), fraction: 1 };
      }
    }
    return { wordIdx: spans.length - 1, fraction: 1 };
  })();

  const refContour = shown?.prosody?.contour.length
    ? shown.prosody.contour
    : reference
      ? buildReferenceContour(reference.spans, reference.pitch)
      : [];

  const playheadCursor = liveWordPosition ? liveWordPosition.wordIdx + liveWordPosition.fraction : null;

  return (
    <div className="space-y-6">
      {/* Control bar: Mode, Speed stepping, Blind ear-first toggle, Headphones toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Shadowing technique">
          <button
            type="button"
            aria-pressed={mode === "simultaneous"}
            onClick={() => setMode("simultaneous")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              mode === "simultaneous"
                ? "bg-foreground text-background"
                : "border text-muted-foreground hover:bg-secondary",
            )}
          >
            <Waves className="size-3.5" />
            Simultaneous (Chorus)
          </button>
          <button
            type="button"
            aria-pressed={mode === "echo"}
            onClick={() => setMode("echo")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              mode === "echo"
                ? "bg-foreground text-background"
                : "border text-muted-foreground hover:bg-secondary",
            )}
          >
            <Repeat className="size-3.5" />
            Echo (Listen → Repeat)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border p-0.5" role="group" aria-label="Shadowing speed">
            {SPEED_STEPS.map((s) => (
              <button
                key={s.rate}
                type="button"
                aria-pressed={rate === s.rate}
                onClick={() => setRate(s.rate)}
                title={`${s.label} — ${s.hint}`}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
                  rate === s.rate ? "bg-secondary text-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant={blind ? "secondary" : "outline"}
            size="sm"
            className="rounded-full text-xs"
            aria-pressed={blind}
            onClick={() => setBlind(!blind)}
            title="Arguelles blind shadowing: hide the text to focus 100% on listening and imitating melody"
          >
            {blind ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {blind ? "Script hidden" : "Blind mode"}
          </Button>

          {mode === "simultaneous" && (
            <Button
              type="button"
              variant={headphones ? "secondary" : "outline"}
              size="sm"
              className="rounded-full text-xs"
              aria-pressed={headphones}
              onClick={() => setHeadphones(!headphones)}
              title="Keep enabled when wearing headphones so browser echo cancellation never clips your voice"
            >
              <Headphones className="size-3.5" />
              {headphones ? "Headphones on" : "Speakers"}
            </Button>
          )}
        </div>
      </div>

      {/* Sentence chunk selector when text has multiple sentences */}
      {sentences.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sentence chunk">
          <span className="mr-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Layers className="size-3.5" />
            Chunk:
          </span>
          <button
            type="button"
            aria-pressed={chunkIdx === "all"}
            onClick={() => setChunkIdx("all")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              chunkIdx === "all" && "border-foreground bg-foreground text-background",
            )}
          >
            Full passage ({sentences.length} sentences)
          </button>
          {sentences.map((s, idx) => (
            <button
              key={idx}
              type="button"
              aria-pressed={chunkIdx === idx}
              onClick={() => setChunkIdx(idx)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                chunkIdx === idx && "border-foreground bg-foreground text-background",
              )}
            >
              Sentence {idx + 1}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card className="gap-0 overflow-hidden py-0">
            <CardContent className="p-0">
              <div className="relative min-h-44 p-5 md:p-6">
                {countdown !== null && (
                  <div className=" bg-background/85 absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 backdrop-blur-xs">
                    <span className="text-5xl font-bold tracking-tight tabular-nums">{countdown}</span>
                    <span className="text-sm font-medium text-muted-foreground">
                      Breathe in — start speaking with the voice on 1…
                    </span>
                  </div>
                )}

                <div
                  dir={language.rtl ? "rtl" : "ltr"}
                  lang={lang}
                  className={cn("transition-all duration-200", blind && "blur-md select-none")}
                >
                  <KaraokeText
                    text={activeText}
                    tokens={tokens}
                    spans={reference?.spans ?? []}
                    playheadTime={playheadTime}
                    scoredWords={shown?.result.words}
                    selectedWord={selectedWord}
                    onTapWord={(i) => {
                      setSelectedWord(i);
                      const wordText = tokens[i]?.text;
                      if (wordText) void hear(wordText, { lang, level, live, voiceId, rate });
                    }}
                  />
                </div>

                {blind && (
                  <div className="mt-3 flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    <span>Blind shadowing active: rely on your ears, not spelling.</span>
                    <button
                      type="button"
                      onClick={() => setBlind(false)}
                      className="font-medium text-foreground underline underline-offset-2"
                    >
                      Reveal script
                    </button>
                  </div>
                )}

                {(phrase?.roman || phrase?.meaning) && !blind && (
                  <div className="mt-4 space-y-0.5 border-t pt-3 text-sm">
                    {phrase.roman && <p className="text-muted-foreground italic">{phrase.roman}</p>}
                    {phrase.meaning && <p className="text-muted-foreground">Means: {phrase.meaning}</p>}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <span>
                    {phase === "shadowing" && mode === "simultaneous" && (
                      <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                        <Radio className="size-3.5 animate-pulse" />
                        Speak right now in unison with the highlighted words!
                      </span>
                    )}
                    {phase === "model-playing" && mode === "echo" && (
                      <span className="flex items-center gap-1.5 font-medium text-amber-600">
                        <Volume2 className="size-3.5 animate-pulse" />
                        Listen closely to the rhythm & melody — your turn starts right after…
                      </span>
                    )}
                    {phase === "shadowing" && mode === "echo" && (
                      <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                        <Mic className="size-3.5 animate-pulse" />
                        Your turn! Echo the sentence matching the highlighted pace…
                      </span>
                    )}
                    {phase === "idle" &&
                      (mode === "simultaneous"
                        ? "Simultaneous mode: speak at the exact same time as the native speaker."
                        : "Echo mode: listen to the native speaker, then immediately echo the phrase.")}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => void listenPreview()}
                  disabled={phase !== "idle"}
                >
                  {phase === "model-playing" ? <Loader2 className="animate-spin" /> : <Volume2 />}
                  Listen first
                </Button>

                {shown && (
                  <>
                    {shown.reference && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => void playOverlay(shown.reference!.url, shown.userUrl)}
                        disabled={phase !== "idle"}
                      >
                        <Headphones />
                        Hear Together
                      </Button>
                    )}
                    {shown.reference && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={async () => {
                          await play(shown.reference!.url);
                          await play(shown.userUrl);
                        }}
                        disabled={phase !== "idle"}
                      >
                        <ArrowLeftRight />
                        A → B
                      </Button>
                    )}
                  </>
                )}

                <div className="ml-auto flex items-center gap-3">
                  {recorder.recording && (
                    <LiveBars analyser={recorder.analyser} className="hidden h-8 w-24 text-foreground sm:block" />
                  )}
                  <Button
                    type="button"
                    className="rounded-full"
                    variant={phase === "shadowing" || phase === "countdown" ? "destructive" : "default"}
                    onClick={() => void startShadowing()}
                    disabled={phase === "analysing" || !activeText}
                  >
                    {phase === "analysing" ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Scoring synchrony…
                      </>
                    ) : phase === "shadowing" || phase === "countdown" || (phase === "model-playing" && mode === "echo") ? (
                      <>
                        <Square className="fill-current" />
                        Finish take
                      </>
                    ) : shown ? (
                      <>
                        <RotateCcw />
                        Shadow again
                      </>
                    ) : (
                      <>
                        <Play className="fill-current" />
                        {mode === "simultaneous" ? "Start Chorus Shadowing" : "Start Echo Shadowing"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Melody Guide & Post-Take Pitch Contour */}
          {refContour.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {shown ? "Shadowing Melody Synchrony" : "Live Reference Melody Guide"}
                  </CardTitle>
                  {shown?.prosody?.pace != null && (
                    <Badge variant="secondary" className="tabular-nums">
                      Pace: {shown.prosody.pace.toFixed(2)}× model speed
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {shown
                    ? "Compare your pitch contour (solid) against the native speaker's melody (muted)."
                    : "Follow the rising and falling curve as the green playhead sweeps through each word."}
                </p>
              </CardHeader>
              <CardContent>
                <PitchChart
                  contour={refContour}
                  words={tokens.map((t) => t.text)}
                  playhead={playheadCursor}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          {shown ? (
            <ShadowingFeedback
              outcome={shown}
              selectedWord={selectedWord}
              onSelectWord={setSelectedWord}
              onPlayWordRef={(i) => {
                const w = shown.result.words[i];
                if (w) void hear(w.text, { lang, level, live, voiceId, rate });
              }}
              onPlayWordSelf={(i) => {
                const w = shown.result.words[i];
                if (w && w.start !== undefined && w.end !== undefined) {
                  void play(shown.userUrl, { from: Math.max(0, w.start - 0.02), to: w.end + 0.025 });
                }
              }}
            />
          ) : (
            <ShadowingGuide mode={mode} rate={rate} onSelectRate={setRate} />
          )}
        </div>
      </div>
    </div>
  );
}

function KaraokeText({
  text,
  tokens,
  spans,
  playheadTime,
  scoredWords,
  selectedWord,
  onTapWord,
}: {
  text: string;
  tokens: { from: number; to: number; text: string }[];
  spans: (Span | null)[];
  playheadTime: number | null;
  scoredWords?: AssessResult["words"];
  selectedWord: number | null;
  onTapWord: (index: number) => void;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  tokens.forEach((t, i) => {
    if (t.from > cursor) parts.push(text.slice(cursor, t.from));
    const span = spans[i];
    const isPlaying = playheadTime !== null && span !== null && span !== undefined;
    const isActive = isPlaying && playheadTime >= span.start - 0.02 && playheadTime <= span.end + 0.02;
    const isPast = isPlaying && playheadTime > span.end + 0.02;
    const progress =
      isActive && span
        ? Math.max(0, Math.min(100, Math.round(((playheadTime - span.start) / Math.max(0.03, span.end - span.start)) * 100)))
        : 0;

    const scored = scoredWords?.[i];

    parts.push(
      <button
        key={i}
        type="button"
        onClick={() => onTapWord(i)}
        className={cn(
          "relative inline-block rounded-md px-1 py-0.5 transition-all duration-75",
          !scored && !isPlaying && "hover:bg-secondary",
          isActive && "scale-105 bg-emerald-500/20 font-semibold text-foreground ring-2 ring-emerald-500",
          isPast && "text-foreground/65",
          scored && scored.status === "unclear" && "bg-amber-100 text-amber-950 dark:bg-amber-950/60 dark:text-amber-200",
          scored && scored.status === "mispronounced" && "bg-red-100 text-red-950 dark:bg-red-950/60 dark:text-red-200",
          scored && scored.status === "omitted" && "line-through decoration-red-500 opacity-60",
          selectedWord === i && scored && "ring-2 ring-foreground ring-offset-1",
        )}
      >
        {text.slice(t.from, t.to)}
        {isActive && (
          <span
            className="absolute bottom-0 left-0 h-0.5 rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        )}
      </button>,
    );
    cursor = t.to;
  });

  parts.push(text.slice(cursor));
  return <p className="text-xl leading-loose md:text-2xl md:leading-loose">{parts}</p>;
}

function ShadowingFeedback({
  outcome,
  selectedWord,
  onSelectWord,
  onPlayWordRef,
  onPlayWordSelf,
}: {
  outcome: ShadowOutcome;
  selectedWord: number | null;
  onSelectWord: (i: number) => void;
  onPlayWordRef: (i: number) => void;
  onPlayWordSelf: (i: number) => void;
}) {
  const { result, prosody, synchrony, reference } = outcome;
  const pace = prosody?.pace;
  const word = selectedWord !== null ? result.words[selectedWord] : result.words[0];
  const refSpan = word && reference ? reference.spans[word.index] : null;
  const userDur = word && word.start !== undefined && word.end !== undefined ? word.end - word.start : null;
  const refDur = refSpan ? refSpan.end - refSpan.start : null;
  const durRatio = userDur && refDur && refDur > 0.03 ? userDur / refDur : null;

  const metrics = [
    {
      label: "Rhythm lock",
      value: prosody?.rhythm ?? result.scores.accuracy,
      hint: "Matching which syllables are stretched vs compressed.",
    },
    {
      label: "Melody match",
      value: prosody?.intonation ?? null,
      hint: "Tracking the native voice's pitch rises and falls.",
    },
    {
      label: "Flow & pace",
      value: prosody?.fluency ?? result.scores.completeness,
      hint:
        pace != null
          ? `${pace.toFixed(2)}× native speed · ${prosody?.hesitations ?? 0} unscripted pauses`
          : "Smooth connected delivery.",
    },
    {
      label: "Sound accuracy",
      value: result.scores.accuracy,
      hint: "Clarity of individual vowels and consonants while shadowing.",
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Shadowing Synchrony
              </p>
              <p className={cn("text-5xl font-semibold tracking-tight tabular-nums", scoreColor(synchrony))}>
                {synchrony}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {synchrony >= 85
                  ? "Locked in step with the native speaker."
                  : synchrony >= 70
                    ? "Good synchrony — refine the highlighted timing and pitch shifts."
                    : "Try a slower speed step (0.75× or 0.88×) to lock in rhythm first."}
              </p>
            </div>
            <Orb palette={paletteForScore(synchrony)} size={56} float="fast" />
          </div>

          <div className="space-y-3 pt-1">
            {metrics.map((m) => (
              <div key={m.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{m.label}</span>
                  <span className="tabular-nums text-muted-foreground">{m.value ?? "–"}</span>
                </div>
                <Progress value={m.value ?? 0} className="mt-1 h-1.5" />
                <p className="mt-0.5 text-xs text-muted-foreground">{m.hint}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {word && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{word.text}</CardTitle>
                {word.expectedIpa && (
                  <p className="font-mono text-xs text-muted-foreground">
                    /{word.expectedIpa}/
                    {word.heardIpa && word.heardIpa !== word.expectedIpa ? ` → heard /${word.heardIpa}/` : ""}
                  </p>
                )}
              </div>
              <span className={cn("text-xl font-semibold tabular-nums", scoreColor(word.score))}>{word.score}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {durRatio !== null && (
              <div className="flex items-center justify-between rounded-lg border bg-secondary/40 px-2.5 py-1.5">
                <span className="text-muted-foreground">Word duration vs. model</span>
                <span className="font-mono font-medium">
                  {durRatio.toFixed(2)}× ({durRatio > 1.25 ? "stretched" : durRatio < 0.75 ? "rushed" : "on beat"})
                </span>
              </div>
            )}
            {word.diagnosis && (
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">Diagnosis: </span>
                {word.diagnosis}
              </p>
            )}
            {word.fix && (
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">How to fix: </span>
                {word.fix}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 rounded-full"
                onClick={() => onPlayWordRef(word.index)}
              >
                <Volume2 />
                Model word
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 rounded-full"
                onClick={() => onPlayWordSelf(word.index)}
                disabled={word.start === undefined}
              >
                <Mic />
                Your word
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result.words.some((w) => w.status !== "ok") && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Words that drifted during shadowing</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {result.words
              .filter((w) => w.status !== "ok")
              .map((w) => (
                <button
                  key={w.index}
                  type="button"
                  onClick={() => onSelectWord(w.index)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-secondary",
                    selectedWord === w.index && "border-foreground bg-secondary",
                  )}
                >
                  <span>{w.text}</span>
                  <span className={cn("tabular-nums", scoreColor(w.score))}>{w.score}</span>
                </button>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ShadowingGuide({
  mode,
  rate,
  onSelectRate,
}: {
  mode: ShadowMode;
  rate: number;
  onSelectRate: (r: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How to shadow effectively</CardTitle>
        <p className="text-xs text-muted-foreground">
          Based on Alexander Arguelles&apos; Shadowing &amp; Olle Kjellin&apos;s Chorusing methods.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-3">
          <div className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
              1
            </span>
            <div>
              <p className="font-medium">
                {mode === "simultaneous" ? "Speak WITH the voice, not after" : "Listen, hold in memory, then echo"}
              </p>
              <p className="text-xs text-muted-foreground">
                {mode === "simultaneous"
                  ? "Use the 3-2-1 countdown to start your first syllable at the exact instant the native speaker begins. Match their speed and pitch contour."
                  : "Let the native phrase wash over your ear first. As soon as it ends, repeat the whole chunk with the exact same rhythm and melody."}
              </p>
            </div>
          </div>

          <div className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
              2
            </span>
            <div>
              <p className="font-medium">Step up your speed gradually</p>
              <p className="text-xs text-muted-foreground">
                Start at{" "}
                <button type="button" onClick={() => onSelectRate(0.75)} className="underline">
                  0.75×
                </button>{" "}
                to master tongue transitions, move to{" "}
                <button type="button" onClick={() => onSelectRate(0.88)} className="underline">
                  0.88×
                </button>{" "}
                for word linking, and finish at{" "}
                <button type="button" onClick={() => onSelectRate(1.0)} className="underline">
                  1.00×
                </button>{" "}
                native speed. Current: <span className="font-medium text-foreground">{rate}×</span>.
              </p>
            </div>
          </div>

          <div className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
              3
            </span>
            <div>
              <p className="font-medium">Try Blind mode + Hear Together</p>
              <p className="text-xs text-muted-foreground">
                Hide the script so spelling doesn&apos;t interfere with your ear. After recording, press{" "}
                <span className="font-medium text-foreground">Hear Together</span> to play your voice and the native
                speaker in stereo unison.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ShadowingView() {
  const { me } = useAccount();
  const { lang, level } = me.profile;
  const voiceId = useVoiceId();
  const library = textsFor(lang, level);
  const generatedList = useStore("generated").filter((g) => g.lang === lang);

  const [texts, setTexts] = useState<Record<string, string>>({});
  const [activeGenerated, setActiveGenerated] = useState<Record<string, GeneratedText | null>>({});

  const key = `${lang}:${level}`;
  const text = texts[key] ?? library[0].text;
  const currentGen = activeGenerated[key]?.text === text ? activeGenerated[key] : generatedList.find((g) => g.text === text) ?? null;

  const setText = (value: string, gen: GeneratedText | null = null) => {
    setTexts((t) => ({ ...t, [key]: value }));
    setActiveGenerated((g) => ({ ...g, [key]: gen }));
  };

  const phrase = findPhrase(lang, text) ?? (currentGen ? { text: currentGen.text, meaning: currentGen.meaning, roman: currentGen.roman } : undefined);

  const nextText = () => {
    const at = library.findIndex((p) => p.text === text);
    setText(library[(at + 1) % library.length].text, null);
  };

  return (
    <>
      <PageHeader
        title="Shadowing Studio"
        description="Imitate a native voice in real time (Chorus mode) or immediately after each sentence (Echo mode) with live karaoke word pacing, melody tracking, and stereo overlay comparison."
      >
        <LanguagePicker />
        <LevelPicker />
        <VoicePicker />
        <WeakSpotGenerator lang={lang} level={level} onGenerated={(item) => setText(item.text, item)} />
        <Button variant="outline" className="rounded-full" onClick={nextText}>
          <Shuffle />
          Next passage
        </Button>
      </PageHeader>

      {currentGen && <GeneratedTextBanner item={currentGen} />}

      <ShadowingSession lang={lang} level={level} text={text} phrase={phrase} voiceId={voiceId} />
    </>
  );
}
