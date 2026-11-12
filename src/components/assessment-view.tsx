"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Clock, Ear, Mic, Music, RotateCcw, Sparkles, Timer } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import {
  buildSimulatedTake,
  DiagnosticStageRecorder,
  GoodAndBadBreakdownScreen,
  rankForScore,
  ScoringAndPlanScreen,
  SpeechLevelRankingScreen,
  WordPracticeLessonScreen,
  type DiagnosticTake,
} from "@/components/diagnostic-lesson";
import { LanguagePicker } from "@/components/pickers";
import { scoreColor } from "@/components/practice-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccount } from "@/hooks/use-account";
import { diagnosticPromptsFor, getLanguage } from "@/lib/languages";
import { addCheckpoint, useStore } from "@/lib/store";
import type { Checkpoint } from "@/lib/types";
import { cn } from "@/lib/utils";

type ResultScreen = "ranking" | "breakdown" | "scale" | "practice";

const RESULT_SCREENS: { id: ResultScreen; label: string }[] = [
  { id: "ranking", label: "1. Speech Level" },
  { id: "breakdown", label: "2. Good & Bad" },
  { id: "scale", label: "3. Scoring & Plan" },
  { id: "practice", label: "4. Word Lesson" },
];

const STAGE_ICONS = [Ear, Timer, Music] as const;

export function AssessmentView() {
  const { me } = useAccount();
  const lang = me.profile.lang;
  const language = getLanguage(lang);
  const history = useStore("checkpoints").filter((c) => c.lang === lang);
  const prompts = useMemo(() => diagnosticPromptsFor(lang), [lang]);

  const [run, setRun] = useState<{
    lang: string;
    takes: (DiagnosticTake | undefined)[];
    step: number;
    saved: Checkpoint | null;
    resultIndex: number;
  } | null>(null);

  // Switching language mid-test starts over.
  const active = run && run.lang === lang ? run : null;
  const left = me.usage.limit - me.usage.used;

  const header = (
    <PageHeader
      title="Pronunciation Assessment"
      description={`A three-part speech scan in ${language.name} testing your sounds, rhythm and melody — with step-by-step feedback and your overall pronunciation rank.`}
    >
      {!active && <LanguagePicker />}
    </PageHeader>
  );

  if (active?.saved) {
    const completedTakes = prompts.map((p, i) => active.takes[i] ?? buildSimulatedTake(p, lang, i));
    const resultScreen = RESULT_SCREENS[active.resultIndex]?.id ?? "ranking";
    const previous = history.find((c) => c.at !== active.saved!.at);

    return (
      <>
        {header}

        {/* Step-by-step result screen indicator */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Assessment feedback steps">
            {RESULT_SCREENS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active.resultIndex === i}
                onClick={() => setRun({ ...active, resultIndex: i })}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  active.resultIndex === i
                    ? "border-foreground bg-foreground text-background"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => setRun(null)}>
            <RotateCcw className="size-3.5" />
            Retake scan
          </Button>
        </div>

        {resultScreen === "ranking" && (
          <SpeechLevelRankingScreen
            takes={completedTakes}
            lang={lang}
            userName={me.user.name}
            previousScore={previous?.score ?? null}
          />
        )}

        {resultScreen === "breakdown" && <GoodAndBadBreakdownScreen takes={completedTakes} lang={lang} />}

        {resultScreen === "scale" && <ScoringAndPlanScreen takes={completedTakes} lang={lang} />}

        {resultScreen === "practice" && <WordPracticeLessonScreen takes={completedTakes} lang={lang} />}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            className="rounded-full"
            disabled={active.resultIndex === 0}
            onClick={() => setRun({ ...active, resultIndex: Math.max(0, active.resultIndex - 1) })}
          >
            <ArrowLeft />
            Previous screen
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {active.resultIndex < RESULT_SCREENS.length - 1 ? (
              <Button
                className="rounded-full"
                onClick={() => setRun({ ...active, resultIndex: active.resultIndex + 1 })}
              >
                Next: {RESULT_SCREENS[active.resultIndex + 1].label.replace(/^\d+\.\s*/, "")}
                <ArrowRight />
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" className="rounded-full">
                  <Link href="/progress">See all checkpoints</Link>
                </Button>
                <Button asChild className="rounded-full">
                  <Link href="/drills">
                    Open full drill list
                    <ArrowRight />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  if (!active) {
    const last = history[0];
    const lastRank = last ? rankForScore(last.score) : null;
    return (
      <>
        {header}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardContent className="space-y-5">
              <ol className="space-y-4">
                {prompts.map((p, i) => {
                  const StageIcon = STAGE_ICONS[i] ?? Ear;
                  return (
                    <li key={p.kind} className="flex gap-3.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                        <StageIcon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">
                            {i + 1}. {p.title}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {p.targets.slice(0, 2).map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px] font-normal">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{p.subtitle}</p>
                        <p className="mt-1 truncate text-sm text-foreground/90" lang={lang}>
                          “{p.text}”
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4" />
                  About 3 minutes
                </span>
                <span className="flex items-center gap-1.5">
                  <Mic className="size-4" />
                  3 guided readings + word lesson
                </span>
              </div>

              {left < 3 && (
                <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                  You have {Math.max(0, left)} recording{left === 1 ? "" : "s"} left today, and the full scan uses 3.
                  You can still preview the scan or upgrade for more recordings.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  size="lg"
                  className="rounded-full"
                  onClick={() => setRun({ lang, takes: [], step: 0, saved: null, resultIndex: 0 })}
                >
                  Start 3-part assessment
                  <ArrowRight />
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-full">
                  <Link href="/onboarding">Open full onboarding flow</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">{last ? "Current speech rank" : "What you will get"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {last && lastRank ? (
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className={cn("text-4xl font-semibold tracking-tight tabular-nums", scoreColor(last.score))}>
                      {last.score}%
                    </p>
                    <p className="text-sm font-medium">
                      {lastRank.label} ·{" "}
                      <span className="font-normal text-muted-foreground">
                        {new Date(last.at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </span>
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{lastRank.description}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Three targeted readings measure your vowels and consonants, syllable rhythm, and pitch melody. You get
                  an overall speech rank from Novice to Native, a clear summary of what sounded good vs. what needs
                  work, and a guided mini-lesson on your hardest words.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const step = active.step;
  const currentTake = active.takes[step];

  const finishScan = (finalTakes: (DiagnosticTake | undefined)[]) => {
    const filled = prompts.map((p, i) => finalTakes[i] ?? buildSimulatedTake(p, lang, i));
    const score = Math.round(filled.reduce((s, t) => s + t.attempt.overall, 0) / filled.length);
    const accuracy = Math.round(filled.reduce((s, t) => s + t.result.scores.accuracy, 0) / filled.length);
    const intelligibility = Math.round(
      filled.reduce((s, t) => s + t.result.scores.intelligibility, 0) / filled.length,
    );
    const rank = rankForScore(score);
    const checkpoint: Checkpoint = {
      at: Date.now(),
      lang,
      score,
      accuracy,
      intelligibility,
      recommended: rank.recommended,
    };
    addCheckpoint(checkpoint);
    setRun({ ...active, takes: filled, saved: checkpoint, resultIndex: 0 });
  };

  const saveTake = (take: DiagnosticTake) => {
    setRun((r) => {
      if (!r) return r;
      const nextTakes = [...r.takes];
      nextTakes[step] = take;
      return { ...r, takes: nextTakes };
    });
  };

  const advanceWithSample = () => {
    const nextTakes = [...active.takes];
    if (!nextTakes[step]) {
      nextTakes[step] = buildSimulatedTake(prompts[step], lang, step);
    }
    if (step < prompts.length - 1) {
      setRun({ ...active, takes: nextTakes, step: step + 1 });
    } else {
      finishScan(nextTakes);
    }
  };

  return (
    <>
      {header}
      <div className="mb-5 flex items-center gap-3">
        {prompts.map((p, i) => (
          <div key={p.kind} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              className={cn(
                "h-1.5 rounded-full transition-colors",
                i < step || (i === step && currentTake)
                  ? "bg-foreground"
                  : i === step
                    ? "bg-foreground/40"
                    : "bg-secondary",
              )}
            />
            <span className={cn("truncate text-xs", i === step ? "font-medium" : "text-muted-foreground")}>
              {i + 1}. {p.title}
            </span>
          </div>
        ))}
      </div>

      <DiagnosticStageRecorder
        key={`${lang}-${step}`}
        lang={lang}
        stageIndex={step}
        totalStages={prompts.length}
        prompt={prompts[step]}
        savedTake={currentTake}
        onTake={saveTake}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          className="rounded-full"
          onClick={() => (step === 0 ? setRun(null) : setRun({ ...active, step: step - 1 }))}
        >
          <ArrowLeft />
          {step === 0 ? "Cancel" : "Previous part"}
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          {!currentTake && (
            <Button variant="outline" className="rounded-full text-muted-foreground" onClick={advanceWithSample}>
              <Sparkles className="size-3.5" />
              Use sample scan for this step
            </Button>
          )}
          {currentTake &&
            (step < prompts.length - 1 ? (
              <Button className="rounded-full" onClick={() => setRun({ ...active, step: step + 1 })}>
                Next: {prompts[step + 1].title}
                <ArrowRight />
              </Button>
            ) : (
              <Button className="rounded-full" onClick={() => finishScan(active.takes)}>
                See my pronunciation rank
                <ArrowRight />
              </Button>
            ))}
        </div>
      </div>
    </>
  );
}
