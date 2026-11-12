/** Points, streaks, daily goals and achievements. Pure functions over the learner's saved progress. */

export interface DayLog {
  xp: number;
  /** Recordings analysed. */
  attempts: number;
  /** Seconds of speech recorded. */
  seconds: number;
  /** Listening rounds answered. */
  rounds: number;
}

export type Days = Record<string, DayLog>;

export const EMPTY_DAY: DayLog = { xp: 0, attempts: 0, seconds: 0, rounds: 0 };

const DAY_MS = 86_400_000;

/** Calendar day in the learner's own time zone, as YYYY-MM-DD. */
export function dayKey(at: number | Date = Date.now()): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The last `count` calendar days, oldest first. */
export function lastDays(count: number, now = Date.now()): string[] {
  const start = new Date(now);
  start.setHours(12, 0, 0, 0); // noon avoids daylight-saving edges
  return Array.from({ length: count }, (_, i) => dayKey(start.getTime() - (count - 1 - i) * DAY_MS));
}

/** Consecutive days with practice, counting today or (if today is still empty) up to yesterday. */
export function currentStreak(days: Days, now = Date.now()): number {
  const active = (key: string) => (days[key]?.xp ?? 0) > 0;
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!active(dayKey(cursor))) cursor.setTime(cursor.getTime() - DAY_MS);
  let streak = 0;
  while (active(dayKey(cursor))) {
    streak++;
    cursor.setTime(cursor.getTime() - DAY_MS);
  }
  return streak;
}

export function longestStreak(days: Days): number {
  const keys = Object.keys(days)
    .filter((k) => days[k].xp > 0)
    .sort();
  let best = 0;
  let run = 0;
  let prev = 0;
  for (const key of keys) {
    const at = new Date(`${key}T12:00:00`).getTime();
    run = prev && Math.round((at - prev) / DAY_MS) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = at;
  }
  return best;
}

export const totalXp = (days: Days) => Object.values(days).reduce((s, d) => s + d.xp, 0);

// --- Points -----------------------------------------------------------------

export const XP = {
  /** A recording: a base amount for showing up plus a share for how well it went. */
  attempt: (overall: number) => 10 + Math.round(overall / 10),
  wordMastered: 15,
  listeningRight: 2,
  listeningWrong: 1,
  checkpoint: 30,
};

export const GOALS = [
  { xp: 20, name: "Light", detail: "About 2 minutes a day" },
  { xp: 40, name: "Steady", detail: "About 5 minutes a day" },
  { xp: 80, name: "Serious", detail: "About 10 minutes a day" },
  { xp: 150, name: "Intense", detail: "About 20 minutes a day" },
] as const;

export const DEFAULT_GOAL = 40;

// --- Ranks ------------------------------------------------------------------

const RANKS = ["Newcomer", "Listener", "Speaker", "Clear speaker", "Confident speaker", "Storyteller", "Orator", "Virtuoso"];

/** Rank n ends at 50 · n · (n + 1) points, so each rank takes a little longer than the last. */
export function rankFor(xp: number): { level: number; name: string; into: number; span: number } {
  let level = 0;
  while (xp >= 50 * (level + 1) * (level + 2)) level++;
  const floor = 50 * level * (level + 1);
  const ceil = 50 * (level + 1) * (level + 2);
  return { level: level + 1, name: RANKS[Math.min(level, RANKS.length - 1)], into: xp - floor, span: ceil - floor };
}

// --- Achievements -----------------------------------------------------------

export interface Stats {
  attempts: number;
  bestScore: number;
  streak: number;
  longestStreak: number;
  xp: number;
  mastered: number;
  listeningRight: number;
  phrasesCleared: number;
  unitsCleared: number;
  languages: number;
  checkpoints: number;
  minutes: number;
}

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  /** Orb colour for the badge. */
  palette: "gold" | "ember" | "orchid" | "sky" | "moss";
  /** Progress towards the badge, as [current, target]. */
  progress: (s: Stats) => [number, number];
}

const reach = (pick: (s: Stats) => number, target: number) => (s: Stats) =>
  [Math.min(pick(s), target), target] as [number, number];

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first", title: "First words", detail: "Analyse your first recording", palette: "gold", progress: reach((s) => s.attempts, 1) },
  { id: "ten", title: "Warmed up", detail: "Analyse 10 recordings", palette: "gold", progress: reach((s) => s.attempts, 10) },
  { id: "hundred", title: "Hundred takes", detail: "Analyse 100 recordings", palette: "ember", progress: reach((s) => s.attempts, 100) },
  { id: "streak3", title: "Three in a row", detail: "Practise 3 days running", palette: "sky", progress: reach((s) => s.longestStreak, 3) },
  { id: "streak7", title: "Full week", detail: "Practise 7 days running", palette: "sky", progress: reach((s) => s.longestStreak, 7) },
  { id: "streak30", title: "Habit formed", detail: "Practise 30 days running", palette: "orchid", progress: reach((s) => s.longestStreak, 30) },
  { id: "score90", title: "Crystal clear", detail: "Score 90 or more on a recording", palette: "moss", progress: reach((s) => s.bestScore, 90) },
  { id: "score97", title: "Mistaken for a local", detail: "Score 97 or more on a recording", palette: "moss", progress: reach((s) => s.bestScore, 97) },
  { id: "master1", title: "Tamed one", detail: "Master a word from your drill list", palette: "ember", progress: reach((s) => s.mastered, 1) },
  { id: "master25", title: "Word tamer", detail: "Master 25 drill words", palette: "ember", progress: reach((s) => s.mastered, 25) },
  { id: "ear50", title: "Sharp ears", detail: "Get 50 listening rounds right", palette: "orchid", progress: reach((s) => s.listeningRight, 50) },
  { id: "ear250", title: "Golden ears", detail: "Get 250 listening rounds right", palette: "orchid", progress: reach((s) => s.listeningRight, 250) },
  { id: "unit1", title: "Unit complete", detail: "Clear every phrase in a course unit", palette: "sky", progress: reach((s) => s.unitsCleared, 1) },
  { id: "course", title: "Phrasebook finished", detail: "Clear all 7 units of a course", palette: "gold", progress: reach((s) => s.unitsCleared, 7) },
  { id: "checkpoint", title: "Know your number", detail: "Complete a checkpoint test", palette: "moss", progress: reach((s) => s.checkpoints, 1) },
  { id: "polyglot", title: "Polyglot", detail: "Practise in 3 languages", palette: "orchid", progress: reach((s) => s.languages, 3) },
  { id: "hour", title: "An hour of speech", detail: "Record 60 minutes in total", palette: "ember", progress: reach((s) => s.minutes, 60) },
  { id: "xp1000", title: "Four figures", detail: "Earn 1,000 points", palette: "gold", progress: reach((s) => s.xp, 1000) },
];

export const isUnlocked = (a: Achievement, s: Stats) => {
  const [have, need] = a.progress(s);
  return have >= need;
};
