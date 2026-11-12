"use client";

import { useMemo } from "react";
import {
  XP,
  currentStreak,
  dayKey,
  longestStreak,
  rankFor,
  totalXp,
  EMPTY_DAY,
  type DayLog,
  type Days,
  type Stats,
} from "./gamification";
import { unitsFor, type Unit } from "./languages";
import { PHRASE_CLEAR, bestKey, starsFor, useStore } from "./store";
import type { Attempt } from "./types";

/** Activity log, filled in from the history for days recorded before the log existed. */
export function effectiveDays(days: Days, attempts: Attempt[]): Days {
  const merged: Days = { ...days };
  for (const a of attempts) {
    const key = dayKey(a.at);
    if (days[key]) continue;
    const prev = merged[key] ?? EMPTY_DAY;
    merged[key] = {
      xp: prev.xp + (a.xp ?? XP.attempt(a.overall)),
      attempts: prev.attempts + 1,
      seconds: prev.seconds + (a.seconds ?? 0),
      rounds: prev.rounds,
    };
  }
  return merged;
}

export interface UnitProgress {
  unit: Unit;
  cleared: number;
  total: number;
  stars: number;
  /** Best score per phrase, in order. */
  scores: (number | undefined)[];
}

export function courseProgress(lang: string, best: Record<string, number>): UnitProgress[] {
  return unitsFor(lang).map((unit) => {
    const scores = unit.phrases.map((p) => best[bestKey(lang, p.text)]);
    return {
      unit,
      scores,
      total: unit.phrases.length,
      cleared: scores.filter((s) => s !== undefined && s >= PHRASE_CLEAR).length,
      stars: scores.reduce<number>((sum, s) => sum + starsFor(s), 0),
    };
  });
}

export interface Overview extends Stats {
  days: Days;
  today: DayLog;
  goal: number;
  rank: ReturnType<typeof rankFor>;
}

/** Everything the dashboard, the sidebar and the achievements need, across all languages. */
export function useOverview(): Overview {
  const attempts = useStore("attempts");
  const rawDays = useStore("days");
  const best = useStore("best");
  const listening = useStore("listening");
  const mastered = useStore("mastered");
  const checkpoints = useStore("checkpoints");
  const settings = useStore("settings");

  return useMemo(() => {
    const days = effectiveDays(rawDays, attempts);
    const logs = Object.values(days);
    const langs = new Set([...attempts.map((a) => a.lang), ...Object.keys(best).map((k) => k.slice(0, k.indexOf(":")))]);
    let phrasesCleared = 0;
    let unitsCleared = 0;
    for (const lang of langs) {
      const progress = courseProgress(lang, best);
      phrasesCleared += progress.reduce((s, u) => s + u.cleared, 0);
      unitsCleared = Math.max(unitsCleared, progress.filter((u) => u.cleared === u.total).length);
    }
    const xp = totalXp(days);
    return {
      days,
      today: days[dayKey()] ?? EMPTY_DAY,
      goal: settings.goal,
      rank: rankFor(xp),
      xp,
      attempts: Math.max(attempts.length, logs.reduce((s, d) => s + d.attempts, 0)),
      bestScore: Math.max(0, ...attempts.map((a) => a.overall), ...Object.values(best)),
      streak: currentStreak(days),
      longestStreak: longestStreak(days),
      mastered: mastered.length,
      listeningRight: Object.values(listening).reduce((s, t) => s + t.right, 0),
      phrasesCleared,
      unitsCleared,
      languages: new Set(attempts.map((a) => a.lang)).size,
      checkpoints: checkpoints.length,
      minutes: Math.floor(logs.reduce((s, d) => s + d.seconds, 0) / 60),
    };
  }, [attempts, rawDays, best, listening, mastered, checkpoints, settings.goal]);
}
