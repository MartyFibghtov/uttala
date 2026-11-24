"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeftRight, ArrowRight, CalendarClock, Check, Loader2, Plus, Sparkles, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { ArtworkFrame } from "@/components/artwork";
import { LanguagePicker, VoicePicker, useVoiceId } from "@/components/pickers";
import { UpgradeCard, useNudge } from "@/components/pricing";
import { hear, PracticeSession, scoreColor } from "@/components/practice-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneratedTextBanner, requestGeneratedText } from "@/components/weak-spot-generator";
import { WordLadder } from "@/components/word-ladder";
import { useAccount } from "@/hooks/use-account";
import { getLanguage } from "@/lib/languages";
import { contrastsFor, MINIMAL_PAIRS, type MinimalPair } from "@/lib/minimal-pairs";
import { isShort, shortContext } from "@/lib/short";
import { soundForIpa } from "@/lib/sounds";
import {
  dismissLeftOutWord,
  isDue,
  listeningKey,
  promoteLeftOutWord,
  recordListening,
  removeWeak,
  restoreWeakWord,
  REVIEW_GAPS,
  useStore,
  type DrillWordTransition,
} from "@/lib/store";
import type { GeneratedText, WeakWord } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = ["words", "sounds", "listening", "mastered"] as const;
type Tab = (typeof TABS)[number];

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
      <ArtworkFrame name="emptyClarity" sizes="176px" className="mx-auto mb-4 aspect-[4/3] w-44 rounded-xl" />
      <p className="font-medium">{title}</p>
      <div className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function dueLabel(w: WeakWord): string {
  if (w.reviews === undefined) return w.streak > 0 ? `${w.streak} of 3 clear` : w.heard ? `heard “${w.heard}”` : `${w.attempts}× unclear`;
  const check = `check ${w.reviews + 1} of ${REVIEW_GAPS.length}`;
  const days = Math.ceil(((w.due ?? 0) - Date.now()) / 86_400_000);
  return days <= 0 ? `${check} due now` : `${check} in ${days} day${days === 1 ? "" : "s"}`;
}

function DrillCapNote({ cap, lang, full }: { cap: number; lang: string; full: boolean }) {
  const { me } = useAccount();
  const leftOut = useStore("leftOut").filter((w) => w.lang === lang);
  const nudge = useNudge("drills", full && leftOut.length > 0 && me.billing);
  if (nudge.visible && me.billing) {
    return (
      <UpgradeCard
        title={`Your drill list is full at ${cap} words`}
        currentPlan={me.plan}
        trialAvailable={me.trialAvailable}
        onDismiss={nudge.dismiss}
      >
        <p>
          Waiting for a slot:{" "}
          <span className="font-medium text-foreground" lang={lang}>
            {leftOut.slice(0, 6).map((w) => w.text).join(", ")}
          </span>
          {leftOut.length > 6 ? ` and ${leftOut.length - 6} more` : ""}. Your active {cap} drill words never disappear on
          their own — master one (or swap one from the waiting list on the left) to open a slot, or unlock Plus for an
          unlimited drill list.
        </p>
      </UpgradeCard>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      The free plan holds {cap} active drill slots at a time. Existing drill words stay in their slots until you master,
      swap or remove them
      {leftOut.length > 0 && (
        <>
          {" "}
          (waiting for a slot:{" "}
          <span lang={lang}>
            {leftOut.slice(0, 4).map((w) => w.text).join(", ")}
          </span>
          )
        </>
      )}
      .
    </p>
  );
}

const DRILL_STEPS = [
  { label: "Clear 1", short: "1/3" },
  { label: "Clear 2", short: "2/3" },
  { label: "Clear 3 · Rest 2d", short: "3/3" },
  { label: "2-day check", short: "Check 1" },
  { label: "7-day check · Mastered", short: "Check 2" },
] as const;

function DrillProgressStepper({
  word,
  lang,
  transition,
  attemptId,
  nextDue,
  onNextWord,
}: {
  word: WeakWord;
  lang: string;
  transition?: DrillWordTransition;
  attemptId?: string;
  nextDue: WeakWord | null;
  onNextWord?: () => void;
}) {
  const isMastered = transition?.status === "mastered" || (word.reviews ?? 0) >= REVIEW_GAPS.length;
  const completedSteps = isMastered
    ? 5
    : word.reviews !== undefined
      ? 3 + Math.min(2, word.reviews)
      : Math.min(3, word.streak);

  const justAdvancedStep =
    transition?.status === "streak-up"
      ? transition.newStreak - 1
      : transition?.status === "resting"
        ? (transition.checkIndex ?? 1) === 1
          ? 2
          : 3
        : transition?.status === "mastered"
          ? 4
          : -1;

  const justReset = transition?.status === "streak-reset";
  const justGraduated = transition?.status === "resting" || transition?.status === "mastered";

  return (
    <div className="rounded-xl border bg-card p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-foreground" lang={lang}>
            “{word.text}”
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {isMastered
              ? "Mastered — all 5 stages complete"
              : word.reviews !== undefined
                ? dueLabel(word)
                : `Stage 1: ${word.streak} of 3 clear takes in a row`}
          </span>
        </div>
        <span className={cn("text-xs font-semibold tabular-nums", scoreColor(word.avg))}>Avg {word.avg}</span>
      </div>

      <div className="grid grid-cols-5 gap-1.5" role="list" aria-label="Drill mastery stages">
        {DRILL_STEPS.map((s, idx) => {
          const done = idx < completedSteps;
          const active = idx === completedSteps && !isMastered;
          const popped = idx === justAdvancedStep;
          const shook = justReset && idx === 0;
          return (
            <div
              key={`${s.label}-${ popKey(attemptId, popped, shook) }`}
              role="listitem"
              className={cn(
                "flex flex-col justify-between rounded-lg border px-2 py-1.5 text-[11px] transition-colors",
                done &&
                  "border-emerald-500/50 bg-emerald-50/90 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
                active && !shook && "border-foreground/60 bg-secondary/70 text-foreground font-medium",
                shook &&
                  "verdict-shake border-red-400 bg-red-50/80 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100",
                !done && !active && !shook && "border-border/70 bg-background text-muted-foreground",
                popped && "verdict-pop",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-[10px] opacity-75">{s.short}</span>
                {done && <Check className="size-3 shrink-0 text-emerald-600" />}
              </div>
              <span className="mt-0.5 truncate font-medium">{s.label}</span>
            </div>
          );
        })}
      </div>

      {justGraduated && (
        <div
          key={attemptId ?? "graduated"}
          className="transition-entry flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300/80 bg-emerald-50/80 px-3 py-2.5 text-xs text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-100"
        >
          <div className="space-y-0.5">
            <p className="font-semibold">
              {transition?.status === "mastered"
                ? `“${word.text}” is mastered and moved to your Mastered tab!`
                : transition?.checkIndex === 1
                  ? `3 of 3 clear! “${word.text}” moved to Resting for ${transition.dueDays ?? 2} days.`
                  : `Check 1 passed! “${word.text}” now rests for ${transition?.dueDays ?? 7} days until its final check.`}
            </p>
            <p className="opacity-85">
              {nextDue
                ? `We kept “${word.text}” open so you can review your score first. Continue to “${nextDue.text}” whenever you are ready.`
                : "You have finished all words due right now!"}
            </p>
          </div>
          {nextDue && onNextWord && (
            <Button size="sm" className="h-7 rounded-full text-xs" onClick={onNextWord}>
              Next word: “{nextDue.text}”
              <ArrowRight className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function popKey(attemptId: string | undefined, popped: boolean, shook: boolean): string {
  return (popped || shook) && attemptId ? attemptId : "idle";
}

function WordDrills({ lang }: { lang: string }) {
  const { me } = useAccount();
  const level = me.profile.level;
  const cap = me.entitlements.maxDrillWords;
  const voiceId = useVoiceId();
  const weak = useStore("weak").filter((w) => w.lang === lang);
  const leftOut = useStore("leftOut").filter((w) => w.lang === lang);
  const due = weak.filter((w) => isDue(w));
  const resting = weak.filter((w) => !isDue(w)).sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
  const [key, setKey] = useState<string | null>(null);
  const [pinnedWord, setPinnedWord] = useState<WeakWord | null>(null);
  const [lastOutcome, setLastOutcome] = useState<{
    attemptId: string;
    key: string;
    transition?: DrillWordTransition;
  } | null>(null);
  const [mode, setMode] = useState<"word" | "sentence" | "generated">("word");
  const [tailored, setTailored] = useState<GeneratedText | null>(null);
  /** Inside a tailored sentence: one of its drill words, said on its own first. */
  const [tailoredStep, setTailoredStep] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fromStore = key ? weak.find((w) => w.key === key) : undefined;
  const pinnedForLang =
    pinnedWord && pinnedWord.lang === lang && (!key || pinnedWord.key === key) ? pinnedWord : undefined;
  const current = fromStore ?? pinnedForLang ?? due[0] ?? resting[0];

  if (!current && leftOut.length === 0) {
    return (
      <Empty title="No weak words yet">
        Record a sentence in{" "}
        <Link href="/practice" className="underline underline-offset-4">
          Practice
        </Link>{" "}
        or a phrase in{" "}
        <Link href="/learn" className="underline underline-offset-4">
          Learn
        </Link>
        . Words that come out unclear are collected here. Say one clearly three times in a row and it rests, then comes
        back for a check after 2 days and again after 7. Pass both and it is mastered.
      </Empty>
    );
  }

  if (!current && leftOut.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your drill slots are open</CardTitle>
          <p className="text-sm text-muted-foreground">
            Pick a word from your waiting list to move it into an active drill slot.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {leftOut.map((w) => (
            <Button
              key={w.text}
              variant="outline"
              size="sm"
              className="rounded-full"
              lang={lang}
              onClick={() => {
                const promoted = promoteLeftOutWord(lang, w.text);
                if (promoted) {
                  setKey(promoted.key);
                  setPinnedWord(promoted);
                }
              }}
            >
              <Plus className="size-3.5" />
              {w.text}
            </Button>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Older entries kept the whole text a word came from; drill it in the short stretch around the word.
  const context = isShort(current.context, lang)
    ? current.context
    : shortContext(current.context, Math.max(0, current.context.indexOf(current.text)), lang);
  const hasSentence = context !== current.text;
  const otherDue = due.filter((w) => w.key !== current.key);
  const at = due.findIndex((w) => w.key === current.key);
  const nextDue = at >= 0 && due.length > 1 ? due[(at + 1) % due.length] : (otherDue[0] ?? null);
  const activeOutcome = lastOutcome && lastOutcome.key === current.key ? lastOutcome : undefined;
  const justMastered = !fromStore && activeOutcome?.transition?.status === "mastered";

  const pick = (w: WeakWord) => {
    setKey(w.key);
    setPinnedWord(w);
    setMode("word");
  };

  const handleRemove = (target: WeakWord) => {
    const fallback = nextDue ?? resting.find((w) => w.key !== target.key) ?? null;
    removeWeak(target.key);
    if (fallback) {
      setKey(fallback.key);
      setPinnedWord(fallback);
    } else {
      setKey(null);
      setPinnedWord(null);
    }
    setMode("word");
    toast(`Removed “${target.text}” from your drill slots.`, {
      action: {
        label: "Undo",
        onClick: () => {
          restoreWeakWord(target);
          setKey(target.key);
          setPinnedWord(target);
        },
      },
    });
  };

  const handlePromoteWaiting = (waitingText: string) => {
    const slotsFull = cap !== null && weak.length >= cap;
    const swapOut = slotsFull ? current : undefined;
    const promoted = promoteLeftOutWord(lang, waitingText, swapOut?.key);
    if (!promoted) return;
    setKey(promoted.key);
    setPinnedWord(promoted);
    setMode("word");
    if (swapOut) {
      toast.success(`Swapped “${promoted.text}” into your ${cap} drill slots (“${swapOut.text}” moved to waiting list).`);
    } else {
      toast.success(`Added “${promoted.text}” to an active drill slot.`);
    }
  };

  const generateForDrill = async (focusWord: WeakWord = current) => {
    setGenerating(true);
    try {
      const item = await requestGeneratedText({
        lang,
        level,
        words: [{ text: focusWord.text, heard: focusWord.heard, avg: focusWord.avg }],
        avoid: tailored ? [tailored.text, focusWord.context] : [focusWord.context],
        selectedOnly: true,
      });
      setTailored(item);
      setTailoredStep(null);
      setMode("generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a practice sentence.");
    } finally {
      setGenerating(false);
    }
  };

  const item = (w: WeakWord, badge?: string) => {
    const filledDots = w.reviews !== undefined ? 3 : Math.min(3, w.streak);
    return (
      <button
        key={w.key}
        type="button"
        onClick={() => pick(w)}
        className={cn(
          "transition-entry flex shrink-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
          w.key === current.key && "border-foreground bg-secondary",
        )}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium" lang={lang}>
              {w.text}
            </span>
            {badge && (
              <span className="verdict-pop shrink-0 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {badge}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
            <span className="inline-flex items-center gap-0.5" aria-hidden>
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className={cn(
                    "size-1.5 rounded-full transition-colors",
                    d < filledDots ? "bg-emerald-600" : "bg-muted-foreground/30",
                  )}
                />
              ))}
            </span>
            <span>{dueLabel(w)}</span>
          </span>
        </span>
        <span className={cn("tabular-nums font-medium", scoreColor(w.avg))}>{w.avg}</span>
      </button>
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[276px_minmax(0,1fr)]">
      <div className="space-y-4 xl:max-h-[75vh] xl:overflow-y-auto xl:pr-1">
        {cap !== null && (
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Active drill slots</span>
              <span className="font-semibold tabular-nums">
                {weak.length} of {cap}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1" aria-label={`${weak.length} of ${cap} drill slots used`}>
              {Array.from({ length: cap }).map((_, idx) => {
                const slotWord = weak[idx];
                const isRestingSlot = slotWord && !isDue(slotWord);
                return (
                  <span
                    key={idx}
                    title={slotWord ? slotWord.text : "Open slot"}
                    className={cn(
                      "h-2 rounded-full transition-colors",
                      slotWord
                        ? isRestingSlot
                          ? "bg-emerald-500"
                          : "bg-foreground"
                        : "border border-dashed border-muted-foreground/50 bg-secondary/50",
                    )}
                  />
                );
              })}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {weak.length >= cap
                ? `All ${cap} slots are full. Your active words never disappear — new weak words wait below until a slot opens or you swap one in.`
                : `${cap - weak.length} open slot${cap - weak.length === 1 ? "" : "s"}. Master a word or add one from your waiting list.`}
            </p>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {due.length ? `Practise now · ${due.length}` : "Nothing due right now"}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
            {justMastered && item(current, "Mastered ✓")}
            {due.map((w) =>
              item(
                w,
                activeOutcome?.key === w.key && activeOutcome.transition?.status === "streak-up"
                  ? `${w.streak}/3 ✓`
                  : undefined,
              ),
            )}
          </div>
        </div>

        {resting.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarClock className="size-3.5" />
              Resting until the next check · {resting.length}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
              {resting.map((w) =>
                item(
                  w,
                  activeOutcome?.key === w.key && activeOutcome.transition?.status === "resting"
                    ? "Resting ✓"
                    : undefined,
                ),
              )}
            </div>
          </div>
        )}

        {leftOut.length > 0 && (
          <div className="rounded-xl border border-dashed p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium">
                Waiting for a slot · {leftOut.length}
              </p>
              {cap !== null && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {cap}-word limit
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {cap !== null && weak.length >= cap
                ? `Held back so your ${cap} active drill words aren't pushed out. Swap any word in whenever you want to drill it now:`
                : "You have an open drill slot. Move a waiting word into your drill list:"}
            </p>
            <div className="space-y-1.5">
              {leftOut.slice(0, 8).map((w) => {
                const slotsFull = cap !== null && weak.length >= cap;
                return (
                  <div
                    key={w.text}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-xs"
                  >
                    <span className="min-w-0 truncate font-medium" lang={lang}>
                      {w.text}
                      {w.avg !== undefined && (
                        <span className={cn("ml-1.5 tabular-nums font-normal", scoreColor(w.avg))}>{w.avg}</span>
                      )}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handlePromoteWaiting(w.text)}
                        className="inline-flex items-center gap-1 rounded-full border bg-secondary/70 px-2 py-0.5 text-[11px] font-medium hover:bg-secondary"
                        title={
                          slotsFull
                            ? `Swap “${w.text}” with “${current.text}”`
                            : `Add “${w.text}” to an open drill slot`
                        }
                      >
                        {slotsFull ? <ArrowLeftRight className="size-2.5" /> : <Plus className="size-2.5" />}
                        {slotsFull ? "Swap in" : "Add"}
                      </button>
                      <button
                        type="button"
                        aria-label={`Dismiss ${w.text}`}
                        onClick={() => dismissLeftOutWord(lang, w.text)}
                        className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={mode === "word" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setMode("word")}
          >
            Word
          </Button>
          <Button
            size="sm"
            variant={mode === "sentence" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setMode("sentence")}
            disabled={!hasSentence}
          >
            In its sentence
          </Button>
          <Button
            size="sm"
            variant={mode === "generated" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => void generateForDrill(current)}
            disabled={generating}
          >
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generating ? "Generating…" : "New sentence"}
          </Button>
          {fromStore && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto rounded-full text-muted-foreground"
              onClick={() => handleRemove(current)}
            >
              <X />
              Remove
            </Button>
          )}
        </div>

        <DrillProgressStepper
          word={current}
          lang={lang}
          transition={activeOutcome?.transition}
          attemptId={activeOutcome?.attemptId}
          nextDue={nextDue}
          onNextWord={nextDue ? () => pick(nextDue) : undefined}
        />

        {!isDue(current) && !activeOutcome?.transition && (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            You said this clearly three times in a row, so it is resting. The gap is the point: recalling it after a
            break is what makes it stick. You can still practise it, but it only counts once the check is due.
          </p>
        )}
        {mode === "generated" && tailored && (
          <>
            <GeneratedTextBanner
              item={tailored}
              onRegenerate={() => void generateForDrill(current)}
              busy={generating}
            />
            <WordLadder
              lang={lang}
              words={(tailored.words ?? []).filter((w) => w !== tailored.text)}
              sentence={tailored.text}
              current={tailoredStep ?? tailored.text}
              onPick={(t) => setTailoredStep(t === tailored.text ? null : t)}
            />
          </>
        )}
        <PracticeSession
          lang={lang}
          level={level}
          text={
            mode === "generated" && tailored
              ? (tailoredStep ?? tailored.text)
              : mode === "sentence" && hasSentence
                ? context
                : current.text
          }
          phrase={
            mode === "generated" && tailored && !tailoredStep
              ? { text: tailored.text, meaning: tailored.meaning, roman: tailored.roman }
              : undefined
          }
          voiceId={voiceId}
          onRecordStart={() => {
            setKey(current.key);
            setPinnedWord(current);
          }}
          onResult={(_res, attempt, recorded) => {
            const match =
              recorded.transitions.find((t) => t.key === current.key) ?? recorded.transitions[0];
            setKey(current.key);
            if (match) {
              setPinnedWord(match.word);
            }
            setLastOutcome({
              attemptId: attempt.id,
              key: current.key,
              transition: match,
            });
          }}
          after={
            <>
              {mode === "word" && (
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => (hasSentence ? setMode("sentence") : void generateForDrill(current))}
                  disabled={generating}
                >
                  Now in a sentence
                  <ArrowRight />
                </Button>
              )}
              {nextDue && (
                <Button variant="outline" className="rounded-full" onClick={() => pick(nextDue)}>
                  Next word: “{nextDue.text}”
                  <ArrowRight />
                </Button>
              )}
            </>
          }
        />
        {cap !== null && <DrillCapNote cap={cap} lang={lang} full={weak.length >= cap} />}
      </div>
    </div>
  );
}

function Sounds({ lang }: { lang: string }) {
  const { me, promptUpgrade } = useAccount();
  const level = me.profile.level;
  const voiceId = useVoiceId();
  const [selectedSoundWord, setSelectedSoundWord] = useState<string | null>(null);
  const [tailoredSoundText, setTailoredSoundText] = useState<GeneratedText | null>(null);
  const [generatingIpa, setGeneratingIpa] = useState<string | null>(null);
  const phonemes = useStore("phonemes")
    .filter((p) => p.lang === lang && p.count >= 2)
    .sort((a, b) => a.avg - b.avg);
  const supported = (me.engines.azure && !!getLanguage(lang).azure) || Boolean(me.engines.openai);
  const library = (
    <span className="mt-4 block">
      <Button asChild variant="outline" className="rounded-full">
        <Link href="/sounds">Open the sound library</Link>
      </Button>
    </span>
  );

  if (!supported) {
    return (
      <Empty title="Sound-by-sound scoring is not available for this language yet">
        The sound library still explains how to make each difficult sound, with words to practise.
        {library}
      </Empty>
    );
  }
  if (!me.entitlements.phonemes) {
    return (
      <Empty title="Find the exact sounds that hold you back">
        Pro adds server sound-by-sound scores for English and keeps a running list of your weakest sounds. In other languages the free precise sound check already compares each sound with a native reading.
        <span className="mt-4 flex flex-wrap justify-center gap-2">
          <Button className="rounded-full" onClick={() => promptUpgrade("phonemes")}>
            See Pro
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/sounds">Sound library</Link>
          </Button>
        </span>
      </Empty>
    );
  }
  if (!phonemes.length) {
    return (
      <Empty title="No sound-level data yet">
        Record a few sentences in Practice and your weakest sounds will show up here.
        {library}
      </Empty>
    );
  }

  const generateForSound = async (ipa: string, examples: string[]) => {
    const guide = soundForIpa(lang, ipa);
    setGeneratingIpa(ipa);
    try {
      const item = await requestGeneratedText({
        lang,
        level,
        sounds: [
          {
            ipa,
            name: guide?.name ?? `/${ipa}/`,
            how: guide?.how,
            watch: guide?.watch,
            examples: examples.length ? examples : guide?.words ?? [],
          },
        ],
        selectedOnly: true,
      });
      setTailoredSoundText(item);
      // Words first, then the sentence.
      setSelectedSoundWord(item.words?.find((w) => w !== item.text) ?? item.text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a practice sentence.");
    } finally {
      setGeneratingIpa(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {phonemes.map((p) => {
          const guide = soundForIpa(lang, p.ipa);
          return (
            <Card key={p.key}>
              <CardContent className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="font-mono text-2xl">/{p.ipa}/</span>
                    {guide && <span className="ml-2 text-xs text-muted-foreground">{guide.name}</span>}
                  </div>
                  <span className={cn("text-lg font-semibold tabular-nums", scoreColor(p.avg))}>{p.avg}</span>
                </div>
                <p className="text-xs text-muted-foreground">Heard {p.count} times</p>
                {guide && <p className="line-clamp-2 text-xs text-muted-foreground">{guide.how}</p>}
                {p.examples.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="block text-xs text-muted-foreground">Tap to hear alone or drill:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {p.examples.map((w) => (
                        <button
                          key={w}
                          type="button"
                          lang={lang}
                          onClick={() => {
                            setSelectedSoundWord(w);
                            setTailoredSoundText(null);
                            void hear(w, { lang, level, live: me.engines.elevenlabs, voiceId });
                          }}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-secondary",
                            selectedSoundWord === w && "border-foreground bg-secondary",
                          )}
                        >
                          <Volume2 className="size-3 text-muted-foreground" />
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-full text-xs"
                    disabled={generatingIpa === p.ipa}
                    onClick={() => void generateForSound(p.ipa, p.examples)}
                  >
                    {generatingIpa === p.ipa ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    Sentence for /{p.ipa}/
                  </Button>
                  {guide && (
                    <Link href={`/sounds/${guide.id}`} className="inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline">
                      How to make it
                      <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedSoundWord && (
        <div className="space-y-3">
          {tailoredSoundText &&
            (tailoredSoundText.text === selectedSoundWord || tailoredSoundText.words?.includes(selectedSoundWord)) && (
              <>
                <GeneratedTextBanner
                  item={tailoredSoundText}
                  onRegenerate={() => {
                    const target = tailoredSoundText.targets[0]?.replaceAll("/", "") ?? phonemes[0]?.ipa ?? "";
                    if (target) void generateForSound(target, []);
                  }}
                  busy={generatingIpa !== null}
                />
                <WordLadder
                  lang={lang}
                  words={(tailoredSoundText.words ?? []).filter((w) => w !== tailoredSoundText.text)}
                  sentence={tailoredSoundText.text}
                  current={selectedSoundWord}
                  onPick={setSelectedSoundWord}
                />
              </>
            )}
          <PracticeSession
            lang={lang}
            level={level}
            text={selectedSoundWord}
            phrase={
              tailoredSoundText && tailoredSoundText.text === selectedSoundWord
                ? { text: tailoredSoundText.text, meaning: tailoredSoundText.meaning, roman: tailoredSoundText.roman }
                : undefined
            }
            voiceId={voiceId}
          />
        </div>
      )}
    </div>
  );
}

const coin = () => Math.random() < 0.5;
const anyOf = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

interface Round {
  id: number;
  pair: MinimalPair;
  answer: "a" | "b";
  voiceId?: string;
}

function Listening({ lang }: { lang: string }) {
  const { me } = useAccount();
  const pairs = MINIMAL_PAIRS[lang];
  const contrasts = contrastsFor(lang);
  const tallies = useStore("listening");
  const [focus, setFocus] = useState<string | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [picked, setPicked] = useState<"a" | "b" | null>(null);
  const [session, setSession] = useState({ right: 0, total: 0 });
  const [loading, setLoading] = useState(false);

  if (!pairs) {
    return (
      <Empty title="No listening sets for this language yet">
        Listening drills train you to hear the difference between two close sounds.
      </Empty>
    );
  }

  const accuracy = (contrast: string) => {
    const t = tallies[listeningKey(lang, contrast)];
    return t && t.total > 0 ? Math.round((t.right / t.total) * 100) : null;
  };

  const speakWord = async (word: string, voiceId?: string) => {
    setLoading(true);
    try {
      await hear(word, { lang, level: me.profile.level, live: me.engines.elevenlabs, voiceId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not play the word.");
    } finally {
      setLoading(false);
    }
  };

  const speak = (r: Round) => speakWord(r.pair[r.answer], r.voiceId);

  const next = (only: string | null = focus) => {
    // A different native voice each round: hearing native speakers is what makes the contrast stick.
    const native = me.voices.filter((v) => v.langs.includes(lang));
    const voices = !me.entitlements.voiceChoice ? [] : native;
    let pool = only ? pairs.filter((p) => p.contrast === only) : pairs;
    if (!only && coin()) {
      // Half the time, go for the contrast the learner hears least reliably (breaking ties randomly).
      const scores = contrasts.map((c) => ({ c, acc: accuracy(c) ?? 50 }));
      const minAcc = Math.min(...scores.map((s) => s.acc));
      const weakest = anyOf(scores.filter((s) => s.acc === minAcc)).c;
      pool = pairs.filter((p) => p.contrast === weakest);
    }
    const fresh = round && pool.length > 1 ? pool.filter((p) => p.a !== round.pair.a || p.b !== round.pair.b) : pool;
    const r: Round = {
      id: (round?.id ?? 0) + 1,
      pair: anyOf(fresh.length ? fresh : pool),
      answer: coin() ? "a" : "b",
      voiceId: voices.length ? anyOf(voices).id : undefined,
    };
    setRound(r);
    setPicked(null);
    void speak(r);
  };

  const choose = (choice: "a" | "b") => {
    if (!round) return;
    if (picked) {
      // After answering, tapping either card plays that word aloud so the learner can compare the pair.
      void speakWord(round.pair[choice], round.voiceId);
      return;
    }
    const right = choice === round.answer;
    setPicked(choice);
    setSession((t) => ({ right: t.right + (right ? 1 : 0), total: t.total + 1 }));
    recordListening(lang, round.pair.contrast, right);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Which word do you hear?</CardTitle>
          <p className="text-sm text-muted-foreground">
            You cannot reliably say a difference you cannot hear. Each round plays one word of a pair
            {me.entitlements.voiceChoice ? ", in a different voice each time." : "."}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Contrast to train">
            {[null, ...contrasts].map((c) => (
              <button
                key={c ?? "all"}
                type="button"
                aria-pressed={focus === c}
                onClick={() => {
                  setFocus(c);
                  if (round) next(c);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors",
                  focus === c && "border-foreground bg-foreground text-background",
                )}
              >
                {c ?? "Smart mix"}
              </button>
            ))}
          </div>
          {!round ? (
            <Button className="w-full rounded-full" onClick={() => next()}>
              Start
            </Button>
          ) : (
            <div key={round.id} className="prompt-stage-enter space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Round {round.id} · Contrast {round.pair.contrast}
                </span>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => void speak(round)} disabled={loading}>
                  <Volume2 />
                  Play again
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["a", "b"] as const).map((side) => {
                  const correct = picked && side === round.answer;
                  const wrong = picked === side && side !== round.answer;
                  return (
                    <button
                      key={side}
                      type="button"
                      onClick={() => choose(side)}
                      lang={lang}
                      className={cn(
                        "flex h-24 flex-col items-center justify-center gap-1 rounded-xl border text-xl font-medium transition-colors",
                        !picked && "hover:bg-secondary",
                        correct &&
                          "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-100",
                        wrong &&
                          "verdict-shake border-red-500 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/45 dark:text-red-100",
                      )}
                    >
                      <span className="inline-flex items-center gap-2">
                        {round.pair[side]}
                        {correct && <Check className="verdict-pop size-5 text-emerald-600" />}
                        {wrong && <X className="size-5 text-red-600" />}
                      </span>
                      {picked && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-normal opacity-75">
                          <Volume2 className="size-3" />
                          Tap to hear
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {picked && (
                <div
                  role="status"
                  className={cn(
                    "transition-entry flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs",
                    picked === round.answer
                      ? "border-emerald-300 bg-emerald-50/80 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-100"
                      : "border-red-300 bg-red-50/80 text-red-950 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-100",
                  )}
                >
                  <span>
                    {picked === round.answer ? (
                      <>
                        <span className="font-semibold">Correct!</span> You heard “{round.pair[round.answer]}”. Tap either
                        card above to compare the pair, or continue.
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">Not quite</span> — that was “{round.pair[round.answer]}”, not “
                        {round.pair[picked]}”. Tap each card above to hear them side by side.
                      </>
                    )}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm tabular-nums text-muted-foreground">
                  This session: {session.right} of {session.total} correct
                </span>
                <Button className="rounded-full" onClick={() => next()} disabled={!picked}>
                  Next
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Your ear, by contrast</CardTitle>
          <p className="text-sm text-muted-foreground">Share of rounds you got right, all time.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {contrasts.map((c) => {
            const acc = accuracy(c);
            const t = tallies[listeningKey(lang, c)];
            return (
              <div key={c}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{c}</span>
                  <span className={cn("tabular-nums", acc === null ? "text-muted-foreground" : scoreColor(acc))}>
                    {acc === null ? "–" : `${acc}%`}
                  </span>
                </div>
                <Progress value={acc ?? 0} className="mt-1.5 h-1.5" aria-label={`${c} accuracy`} />
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">{t ? `${t.total} rounds` : "Not tried yet"}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Mastered({ lang }: { lang: string }) {
  const mastered = useStore("mastered").filter((w) => w.lang === lang);
  if (!mastered.length) {
    return (
      <Empty title="No mastered words yet">
        A word is mastered when you say it clearly three times in a row and then pass two spaced checks, 2 and 7 days
        later.
      </Empty>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {mastered.length} word{mastered.length === 1 ? "" : "s"} mastered
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {mastered.map((w) => (
          <span key={`${w.key}-${w.at}`} className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm" lang={lang}>
            <Check className="size-3.5 text-emerald-600" />
            {w.text}
          </span>
        ))}
      </CardContent>
    </Card>
  );
}

export function DrillsView() {
  const { me } = useAccount();
  const router = useRouter();
  const params = useSearchParams();
  const lang = me.profile.lang;
  const requested = params.get("tab");
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : "words";
  const due = useStore("weak").filter((w) => w.lang === lang && isDue(w)).length;

  return (
    <>
      <PageHeader
        title="Drills"
        description="Short, focused practice on the words and sounds that came out weakest in your recordings, scheduled so that what you fix stays fixed."
      >
        <LanguagePicker />
        <VoicePicker />
      </PageHeader>
      <Tabs value={tab} onValueChange={(v) => router.replace(v === "words" ? "/drills" : `/drills?tab=${v}`, { scroll: false })}>
        <TabsList className="mb-4">
          <TabsTrigger value="words">Words{due > 0 ? ` · ${due}` : ""}</TabsTrigger>
          <TabsTrigger value="sounds">Sounds</TabsTrigger>
          <TabsTrigger value="listening">Listening</TabsTrigger>
          <TabsTrigger value="mastered">Mastered</TabsTrigger>
        </TabsList>
        <TabsContent value="words">
          <WordDrills lang={lang} />
        </TabsContent>
        <TabsContent value="sounds">
          <Sounds lang={lang} />
        </TabsContent>
        <TabsContent value="listening">
          <Listening key={lang} lang={lang} />
        </TabsContent>
        <TabsContent value="mastered">
          <Mastered lang={lang} />
        </TabsContent>
      </Tabs>
    </>
  );
}
