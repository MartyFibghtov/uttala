"use client";

import { useState } from "react";
import { ArrowLeftRight, Headphones, Loader2, User, Volume2 } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { beginAudioIntent, isAudioIntentCurrent } from "@/lib/audio";
import type { WordResult } from "@/lib/types";

type ActivePhase = null | "you" | "target" | "sentence" | "compare-you" | "compare-target";

export interface WordCompareControlsProps {
  word: Pick<WordResult, "text" | "score" | "status" | "start" | "end" | "expectedIpa" | "heardIpa" | "heard">;
  lang: string;
  onPlaySelf?: (intentId?: number) => Promise<void> | void;
  onPlayTarget: (intentId?: number) => Promise<void> | void;
  onPlayInSentence?: (intentId?: number) => Promise<void> | void;
  canPlaySelf?: boolean;
  canPlayTarget?: boolean;
  canPlayInSentence?: boolean;
  /** Render a compact header showing the selected word, IPA contrast, and score. */
  showHeader?: boolean;
  compact?: boolean;
  className?: string;
}

function compareScoreColor(score: number): string {
  return score >= 86
    ? "text-emerald-600 dark:text-emerald-400"
    : score >= 65
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
}

/**
 * Side-by-side "How you said it" vs. "How it should sound" playback controls for a single word,
 * including a synchronized Compare (You → Target) sequence with live phase highlighting.
 */
export function WordCompareControls({
  word,
  lang,
  onPlaySelf,
  onPlayTarget,
  onPlayInSentence,
  canPlaySelf = false,
  canPlayTarget = true,
  canPlayInSentence = false,
  showHeader = false,
  compact = false,
  className,
}: WordCompareControlsProps) {
  const wordKey = `${word.text}:${word.start ?? ""}:${word.end ?? ""}`;
  const [active, setActive] = useState<{ key: string; phase: Exclude<ActivePhase, null> } | null>(null);
  const phase: ActivePhase = active?.key === wordKey ? active.phase : null;
  const setPhase = (next: ActivePhase) => setActive(next ? { key: wordKey, phase: next } : null);

  const selfActive = phase === "you" || phase === "compare-you";
  const targetActive = phase === "target" || phase === "compare-target";
  const comparing = phase === "compare-you" || phase === "compare-target";
  const sentenceActive = phase === "sentence";

  const playSelf = async () => {
    if (!canPlaySelf || !onPlaySelf) return;
    const intentId = beginAudioIntent();
    setPhase("you");
    try {
      await onPlaySelf(intentId);
    } finally {
      if (isAudioIntentCurrent(intentId)) setPhase(null);
    }
  };

  const playTarget = async () => {
    if (!canPlayTarget) return;
    const intentId = beginAudioIntent();
    setPhase("target");
    try {
      await onPlayTarget(intentId);
    } finally {
      if (isAudioIntentCurrent(intentId)) setPhase(null);
    }
  };

  const playInSentence = async () => {
    if (!canPlayInSentence || !onPlayInSentence) return;
    const intentId = beginAudioIntent();
    setPhase("sentence");
    try {
      await onPlayInSentence(intentId);
    } finally {
      if (isAudioIntentCurrent(intentId)) setPhase(null);
    }
  };

  const playCompare = async () => {
    if (!canPlaySelf || !onPlaySelf || !canPlayTarget) return;
    const intentId = beginAudioIntent();
    setPhase("compare-you");
    try {
      await onPlaySelf(intentId);
      if (!isAudioIntentCurrent(intentId)) return;
      await new Promise((resolve) => setTimeout(resolve, 260));
      if (!isAudioIntentCurrent(intentId)) return;
      setPhase("compare-target");
      await onPlayTarget(intentId);
    } finally {
      if (isAudioIntentCurrent(intentId)) setPhase(null);
    }
  };

  const buttonSize = compact ? "sm" : "default";

  return (
    <div className={cn("space-y-2", className)}>
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-base font-semibold tracking-tight" lang={lang}>
              “{word.text}”
            </span>
            {word.expectedIpa && (
              <span className="font-mono text-xs text-muted-foreground">/{word.expectedIpa}/</span>
            )}
            {word.heardIpa && word.heardIpa !== word.expectedIpa && (
              <span className="font-mono text-xs text-red-600 dark:text-red-400">
                → heard /{word.heardIpa}/
              </span>
            )}
            {word.heard && (
              <span className="text-xs text-muted-foreground">heard as “{word.heard}”</span>
            )}
          </div>
          <Badge variant="secondary" className={cn("tabular-nums font-semibold", compareScoreColor(word.score))}>
            {word.score}%
          </Badge>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Compare pronunciation of ${word.text}`}>
        <Button
          type="button"
          variant={selfActive ? "secondary" : "outline"}
          size={buttonSize}
          className={cn(
            "min-h-8 flex-1 rounded-full transition-shadow",
            selfActive && "ring-2 ring-foreground/70",
          )}
          aria-pressed={selfActive}
          aria-label={`You said — play your recording of ${word.text}`}
          disabled={!canPlaySelf || !onPlaySelf}
          onClick={() => void playSelf()}
        >
          {selfActive ? <Loader2 className="animate-spin" /> : <User />}
          <span>You said</span>
        </Button>

        <Button
          type="button"
          variant={targetActive ? "secondary" : "outline"}
          size={buttonSize}
          className={cn(
            "min-h-8 flex-1 rounded-full transition-shadow",
            targetActive && "ring-2 ring-foreground/70",
          )}
          aria-pressed={targetActive}
          aria-label={`Should sound — play target pronunciation of ${word.text}`}
          disabled={!canPlayTarget}
          onClick={() => void playTarget()}
        >
          {targetActive ? <Loader2 className="animate-spin" /> : <Volume2 />}
          <span>Should sound</span>
        </Button>

        <Button
          type="button"
          variant={comparing ? "default" : "secondary"}
          size={buttonSize}
          className="min-h-8 rounded-full"
          aria-pressed={comparing}
          aria-label={`Compare how you said ${word.text} vs how it should sound`}
          disabled={!canPlaySelf || !onPlaySelf || !canPlayTarget}
          onClick={() => void playCompare()}
        >
          {comparing ? <Loader2 className="animate-spin" /> : <ArrowLeftRight />}
          <span>{phase === "compare-you" ? "You…" : phase === "compare-target" ? "Target…" : "Compare"}</span>
        </Button>

        {canPlayInSentence && onPlayInSentence && (
          <Button
            type="button"
            variant={sentenceActive ? "secondary" : "ghost"}
            size={buttonSize}
            className={cn("min-h-8 rounded-full", sentenceActive && "ring-2 ring-foreground/60")}
            aria-pressed={sentenceActive}
            aria-label={`In sentence — hear ${word.text} inside the full sentence`}
            onClick={() => void playInSentence()}
          >
            {sentenceActive ? <Loader2 className="animate-spin" /> : <Headphones />}
            <span>In sentence</span>
          </Button>
        )}
      </div>

      {!canPlaySelf && (
        <p className="text-[11px] text-muted-foreground">
          {word.status === "omitted"
            ? "This word wasn't heard in your recording — tap Should sound to hear it."
            : "Your clip for this individual word wasn't isolated — tap Should sound to hear the target."}
        </p>
      )}
    </div>
  );
}
