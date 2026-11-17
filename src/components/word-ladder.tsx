"use client";

import { ArrowRight, Check } from "lucide-react";
import { scoreColor } from "@/components/practice-session";
import { Button } from "@/components/ui/button";
import { SCORE_SCALE } from "@/lib/levels";
import { bestKey, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * One thing at a time: drill each hard word on its own, then say the whole short sentence.
 * `current` is what is being practised now, one of `words` or `sentence`.
 */
export function WordLadder({
  lang,
  words,
  sentence,
  current,
  onPick,
  className,
}: {
  lang: string;
  words: string[];
  sentence: string;
  current: string;
  onPick: (text: string) => void;
  className?: string;
}) {
  const best = useStore("best");
  if (!words.length) return null;
  const steps = [...words, sentence];
  const at = steps.indexOf(current);
  const next = at >= 0 && at < steps.length - 1 ? steps[at + 1] : null;

  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-1.5", className)} role="group" aria-label="Words, then the sentence">
      <span className="mr-1 text-xs text-muted-foreground">Words first:</span>
      {steps.map((step, i) => {
        const isSentence = i === steps.length - 1;
        const score = best[bestKey(lang, step)];
        const clear = score !== undefined && score >= SCORE_SCALE.clear;
        return (
          <button
            key={`${i}:${step}`}
            type="button"
            lang={isSentence ? undefined : lang}
            aria-pressed={step === current}
            onClick={() => onPick(step)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-secondary",
              step === current && "border-foreground bg-secondary",
              isSentence && "ml-1",
            )}
          >
            {clear && <Check className="size-3 text-emerald-600" />}
            {isSentence ? "Whole sentence" : step}
            {score !== undefined && !clear && <span className={cn("tabular-nums", scoreColor(score))}>{score}</span>}
          </button>
        );
      })}
      {next && (
        <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs" onClick={() => onPick(next)}>
          {next === sentence ? "Now the sentence" : "Next word"}
          <ArrowRight className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
