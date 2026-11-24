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
        const tried = score !== undefined && !clear;
        const active = step === current;
        return (
          <button
            key={`${i}:${step}`}
            type="button"
            lang={isSentence ? undefined : lang}
            aria-pressed={active}
            onClick={() => onPick(step)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-secondary",
              clear &&
                !active &&
                "border-emerald-500/40 bg-emerald-50/60 text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-100",
              tried &&
                !active &&
                "border-amber-400/50 bg-amber-50/40 dark:border-amber-800/60 dark:bg-amber-950/20",
              active && "border-foreground bg-secondary ring-1 ring-foreground/20",
              isSentence && "ml-1",
            )}
          >
            {clear ? (
              <Check className="verdict-pop size-3 text-emerald-600" />
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">{i + 1}.</span>
            )}
            <span>{isSentence ? "Whole sentence" : step}</span>
            {score !== undefined && (
              <span className={cn("tabular-nums font-semibold", scoreColor(score))}>{score}</span>
            )}
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
