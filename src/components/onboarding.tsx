"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Ear, Music, Sparkles, Timer, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/app-shell";
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
import { Orb } from "@/components/orb";
import { loadReference } from "@/components/practice-session";
import { Pricing } from "@/components/pricing";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";
import { play } from "@/lib/audio";
import { diagnosticPromptsFor, getLanguage, LANGUAGES } from "@/lib/languages";
import { LEVEL_IDS, LEVELS } from "@/lib/levels";
import { MINIMAL_PAIRS } from "@/lib/minimal-pairs";
import { addCheckpoint } from "@/lib/store";
import { cn } from "@/lib/utils";

type Step =
  | "language"
  | "level"
  | "lesson"
  | "test-sounds"
  | "test-rhythm"
  | "test-melody"
  | "ranking"
  | "breakdown"
  | "scale"
  | "practice"
  | "plan";

const TEST_STEPS: Step[] = ["test-sounds", "test-rhythm", "test-melody"];

function Choice({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative rounded-xl border bg-card p-4 text-left transition-all hover:border-foreground/40",
        selected && "border-foreground ring-1 ring-foreground",
        className,
      )}
    >
      {selected && (
        <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="size-3" />
        </span>
      )}
      {children}
    </button>
  );
}

/** The three ideas behind the product, each with something to hear or see. */
function Lesson({ lang }: { lang: string }) {
  const { me } = useAccount();
  const pair = MINIMAL_PAIRS[lang]?.[0];
  const language = getLanguage(lang);

  const hearWord = async (word: string) => {
    if (!me.engines.elevenlabs) {
      const u = new SpeechSynthesisUtterance(word);
      u.lang = lang;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      return;
    }
    try {
      const ref = await loadReference(word, lang, me.profile.level);
      await play(ref.url);
    } catch {
      toast.error("Could not play that word.");
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border bg-card p-5">
        <Ear className="size-5" />
        <h3 className="mt-3 font-semibold">1. Sounds</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Every language has sounds yours does not. Until your ear can tell two of them apart, your mouth cannot
          either, so we test and train both.
        </p>
        {pair ? (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Can you hear the difference in {language.name}?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[pair.a, pair.b].map((w) => (
                <Button
                  key={w}
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-full"
                  onClick={() => void hearWord(w)}
                >
                  <Volume2 />
                  {w}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            You will see each word coloured by how clearly it came through.
          </p>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <Timer className="size-5" />
        <h3 className="mt-3 font-semibold">2. Rhythm</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Speakers stretch some words and hurry through others. Getting that timing right matters as much as the
          sounds themselves.
        </p>
        <div className="mt-5 flex h-10 items-end gap-1.5" aria-hidden>
          {[40, 100, 30, 55, 100, 35, 25, 80].map((h, i) => (
            <span
              key={i}
              className={cn("flex-1 rounded-sm", h > 70 ? "bg-foreground" : "bg-muted-foreground/30")}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Dark bars are the words a native speaker leans on.</p>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <Music className="size-5" />
        <h3 className="mt-3 font-semibold">3. Melody</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your voice rises and falls as you speak. The tune tells a question from a statement and makes speech sound
          natural.
        </p>
        <svg viewBox="0 0 200 56" className="mt-4 h-12 w-full" aria-hidden>
          <path
            d="M2,40 C30,10 55,44 82,30 S130,6 150,26 180,50 198,18"
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            className="stroke-muted-foreground/40"
          />
          <path
            d="M2,44 C28,26 58,40 82,36 S128,18 150,30 178,44 198,30"
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            className="stroke-foreground"
          />
        </svg>
        <p className="mt-2 text-xs text-muted-foreground">Your line against a native voice.</p>
      </div>
    </div>
  );
}

export function Onboarding() {
  const router = useRouter();
  const { me, updateProfile } = useAccount();
  const offerPlan = me.billing && me.plan === "free";
  const steps: Step[] = [
    "language",
    "level",
    "lesson",
    "test-sounds",
    "test-rhythm",
    "test-melody",
    "ranking",
    "breakdown",
    "scale",
    "practice",
    ...(offerPlan ? (["plan"] as Step[]) : []),
  ];
  const [index, setIndex] = useState(0);
  const [takesByLang, setTakesByLang] = useState<Record<string, (DiagnosticTake | undefined)[]>>({});
  const [finishing, setFinishing] = useState(false);

  const step = steps[index];
  const { lang, level } = me.profile;
  const language = getLanguage(lang);
  const prompts = useMemo(() => diagnosticPromptsFor(lang), [lang]);
  const recordedTakes = useMemo(() => takesByLang[lang] ?? [], [takesByLang, lang]);

  // Ensure post-test feedback screens always have all 3 takes (filling any skipped stage with a simulated take).
  const completedTakes = useMemo(
    () => prompts.map((p, i) => recordedTakes[i] ?? buildSimulatedTake(p, lang, i)),
    [prompts, recordedTakes, lang],
  );

  const saveStageTake = (stageIdx: number, take: DiagnosticTake) => {
    setTakesByLang((prev) => {
      const list = [...(prev[lang] ?? [])];
      list[stageIdx] = take;
      return { ...prev, [lang]: list };
    });
  };

  const fillSimulatedAndAdvance = (stageIdx: number) => {
    if (!recordedTakes[stageIdx]) {
      saveStageTake(stageIdx, buildSimulatedTake(prompts[stageIdx], lang, stageIdx));
    }
    setIndex((i) => Math.min(steps.length - 1, i + 1));
  };

  const finish = async () => {
    setFinishing(true);
    const avgScore = Math.round(
      completedTakes.reduce((s, t) => s + t.attempt.overall, 0) / Math.max(1, completedTakes.length),
    );
    const avgAccuracy = Math.round(
      completedTakes.reduce((s, t) => s + t.result.scores.accuracy, 0) / Math.max(1, completedTakes.length),
    );
    const avgIntel = Math.round(
      completedTakes.reduce((s, t) => s + t.result.scores.intelligibility, 0) / Math.max(1, completedTakes.length),
    );
    const rank = rankForScore(avgScore);
    addCheckpoint({
      at: Date.now(),
      lang,
      score: avgScore,
      accuracy: avgAccuracy,
      intelligibility: avgIntel,
      recommended: rank.recommended,
    });
    await updateProfile({ onboarded: true });
    router.replace("/home");
  };

  const next = () => (index === steps.length - 1 ? void finish() : setIndex(index + 1));

  const testStageIndex = TEST_STEPS.indexOf(step);
  const currentStageTake = testStageIndex >= 0 ? recordedTakes[testStageIndex] : undefined;

  const heading: Record<Step, [string, string]> = {
    language: [
      `Welcome${me.user.name ? `, ${me.user.name}` : ""}. Which language do you want to speak?`,
      "You can add or switch languages at any time.",
    ],
    level: [
      `How is your ${language.name} today?`,
      "Pick where you feel comfortable. Next, a short 3-part speech scan will measure your exact pronunciation rank.",
    ],
    lesson: [
      "Three things decide how clear you sound",
      "Our onboarding test checks all three — one short reading at a time — and releases your feedback step by step.",
    ],
    "test-sounds": [
      "Part 1 of 3 · Signature sounds",
      "Press Listen to hear the sentence once, then Record and read it aloud at a comfortable pace.",
    ],
    "test-rhythm": [
      "Part 2 of 3 · Rhythm & word stress",
      "Lean on the key content words and link the small connecting words smoothly without pausing.",
    ],
    "test-melody": [
      "Part 3 of 3 · Melody & intonation",
      "Let your pitch rise naturally on the first question and fall cleanly at the end of the sentence.",
    ],
    ranking: [
      "Your pronunciation ranking",
      `Where your ${language.name} stands today across sounds, rhythm and melody.`,
    ],
    breakdown: [
      "What sounded good & what needs work",
      "Only the key takeaways at a glance — tap any sound or melody item to expand the details.",
    ],
    scale: [
      "How scoring works & your first lesson",
      "Every word and sound is scored from 0 to 100, and your weakest words are queued up to practise.",
    ],
    practice: [
      "Practise your focus words",
      "Try each word from your assessment on its own and watch your score climb.",
    ],
    plan: [
      "Keep going on Free, or unlock everything",
      "You can decide later. Nothing is charged during a trial.",
    ],
  };

  const nextButtonLabel = () => {
    if (step === "lesson") return "Start 3-part scan";
    if (step === "test-sounds") return "Next: Rhythm & stress";
    if (step === "test-rhythm") return "Next: Melody & intonation";
    if (step === "test-melody") return "See my pronunciation rank";
    if (step === "ranking") return "See what was good & bad";
    if (step === "breakdown") return "How scoring works";
    if (step === "scale") return "Practise my focus words";
    if (step === "practice") return offerPlan ? "Continue" : "Finish & go to Today's Plan";
    if (step === "plan") return "Continue with Free";
    return index === steps.length - 1 ? "Start practising" : "Continue";
  };

  return (
    <div className="aurora-wash min-h-dvh">
      <div className={cn("mx-auto px-4 py-6 md:px-8", step === "plan" ? "max-w-5xl" : "max-w-4xl")}>
        <div className="flex items-center justify-between gap-4">
          <Logo href="/onboarding" />
          <div className="flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${steps.length}`}>
            {steps.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-6 bg-foreground" : "w-1.5 bg-border",
                  i < index && "bg-foreground/50",
                )}
              />
            ))}
          </div>
        </div>

        <div className="mt-8 flex items-start gap-4">
          <Orb
            palette={(["orchid", "gold", "sky", "ember", "moss"] as const)[index % 5]}
            size={44}
            float="fast"
            className="hidden sm:block"
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{heading[step][0]}</h1>
            <p className="mt-1.5 text-muted-foreground">{heading[step][1]}</p>
          </div>
        </div>

        <div className="mt-7">
          {step === "language" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {LANGUAGES.map((l) => (
                <Choice key={l.code} selected={l.code === lang} onClick={() => void updateProfile({ lang: l.code })}>
                  <span className="block font-medium">{l.name}</span>
                  <span className="block text-sm text-muted-foreground" lang={l.code}>
                    {l.native}
                  </span>
                </Choice>
              ))}
            </div>
          )}

          {step === "level" && (
            <div className="grid gap-3">
              {LEVEL_IDS.map((id) => (
                <Choice
                  key={id}
                  selected={id === level}
                  onClick={() => void updateProfile({ level: id })}
                  className="pr-12"
                >
                  <span className="block font-medium">{LEVELS[id].headline}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{LEVELS[id].description}</span>
                </Choice>
              ))}
            </div>
          )}

          {step === "lesson" && <Lesson lang={lang} />}

          {testStageIndex >= 0 && prompts[testStageIndex] && (
            <DiagnosticStageRecorder
              key={`${lang}-${testStageIndex}`}
              lang={lang}
              stageIndex={testStageIndex}
              totalStages={prompts.length}
              prompt={prompts[testStageIndex]}
              savedTake={currentStageTake}
              onTake={(take) => saveStageTake(testStageIndex, take)}
            />
          )}

          {step === "ranking" && (
            <SpeechLevelRankingScreen takes={completedTakes} lang={lang} userName={me.user.name} />
          )}

          {step === "breakdown" && <GoodAndBadBreakdownScreen takes={completedTakes} lang={lang} />}

          {step === "scale" && <ScoringAndPlanScreen takes={completedTakes} lang={lang} />}

          {step === "practice" && <WordPracticeLessonScreen takes={completedTakes} lang={lang} />}

          {step === "plan" && <Pricing currentPlan={me.plan} trialAvailable={me.trialAvailable} />}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 pb-10">
          <Button variant="ghost" className="rounded-full" onClick={() => setIndex(index - 1)} disabled={index === 0}>
            <ArrowLeft />
            Back
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {testStageIndex >= 0 && !currentStageTake && (
              <Button
                variant="outline"
                className="rounded-full text-muted-foreground"
                onClick={() => fillSimulatedAndAdvance(testStageIndex)}
              >
                <Sparkles className="size-3.5" />
                Use sample scan for this step
              </Button>
            )}
            {(testStageIndex < 0 || Boolean(currentStageTake)) && (
              <Button className="rounded-full" onClick={next} disabled={finishing}>
                {nextButtonLabel()}
                <ArrowRight />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
