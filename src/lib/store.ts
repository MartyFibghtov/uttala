"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_GOAL, EMPTY_DAY, XP, dayKey, type DayLog, type Days } from "./gamification";
import { type LevelId, SCORE_SCALE } from "./levels";
import { overallScore } from "./prosody";
import { shortContext } from "./short";
import { normalize } from "./text";
import type {
  AssessResult,
  Attempt,
  Checkpoint,
  GeneratedText,
  ListeningTally,
  MasteredWord,
  ProsodyResult,
  SavedText,
  WeakPhoneme,
  WeakWord,
} from "./types";

export interface Prefs {
  /** Chosen reference voice per language. */
  voices: Record<string, string>;
}

export interface Settings {
  /** Daily goal in points. */
  goal: number;
  /** Run the precise sound check (on our server) after each recording. */
  soundCheck?: boolean;
}

interface Shape {
  attempts: Attempt[];
  weak: WeakWord[];
  phonemes: WeakPhoneme[];
  prefs: Prefs;
  /** Activity per calendar day. */
  days: Days;
  /** Best overall score per text, keyed by `bestKey`. */
  best: Record<string, number>;
  /** Listening-drill results per language and contrast. */
  listening: Record<string, ListeningTally>;
  saved: SavedText[];
  generated: GeneratedText[];
  checkpoints: Checkpoint[];
  mastered: MasteredWord[];
  settings: Settings;
  /** Achievements the learner has already been told about. */
  badges: string[];
  /** Weak words that did not fit the free drill list (this browser only). */
  leftOut: { lang: string; text: string }[];
}

const defaults: Shape = {
  attempts: [],
  weak: [],
  phonemes: [],
  prefs: { voices: {} },
  days: {},
  best: {},
  listening: {},
  saved: [],
  generated: [],
  checkpoints: [],
  mastered: [],
  settings: { goal: DEFAULT_GOAL },
  badges: [],
  leftOut: [],
};

/** Keys that are saved to the learner's account, not just this browser. */
const SYNCED = [
  "attempts",
  "weak",
  "phonemes",
  "days",
  "best",
  "listening",
  "saved",
  "generated",
  "checkpoints",
  "mastered",
  "settings",
  "badges",
] as const;
type SyncedKey = (typeof SYNCED)[number];

let prefix = "sayclear.anon.";
const cache = new Map<string, unknown>();
const listeners = new Set<() => void>();

/** Scope everything to one account, so two people sharing a browser never see each other's data. */
export function setStoreUser(userId: string) {
  const next = `sayclear.${userId}.`;
  if (next === prefix) return;
  prefix = next;
  cache.clear();
  listeners.forEach((l) => l());
}

function read<K extends keyof Shape>(key: K): Shape[K] {
  if (cache.has(key)) return cache.get(key) as Shape[K];
  let value = defaults[key];
  try {
    const raw = window.localStorage.getItem(prefix + key);
    if (raw) value = JSON.parse(raw) as Shape[K];
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  cache.set(key, value);
  return value;
}

function write<K extends keyof Shape>(key: K, value: Shape[K], fromServer = false) {
  cache.set(key, value);
  try {
    window.localStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    // Keep working in memory if storage is full or blocked.
  }
  listeners.forEach((l) => l());
  if (!fromServer && (SYNCED as readonly string[]).includes(key)) schedulePush();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => {
    cache.clear();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStore<K extends keyof Shape>(key: K): Shape[K] {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => defaults[key],
  );
}

export function setPrefs(patch: Partial<Prefs>) {
  write("prefs", { ...read("prefs"), ...patch });
}

// --- Account sync -----------------------------------------------------------

let pushTimer: number | undefined;
let dirty = false;

const syncedAt = () => Number(window.localStorage.getItem(prefix + "syncedAt") ?? 0);
const markSynced = (at: number) => window.localStorage.setItem(prefix + "syncedAt", String(at));
const snapshot = (): Pick<Shape, SyncedKey> =>
  Object.fromEntries(SYNCED.map((key) => [key, read(key)])) as Pick<Shape, SyncedKey>;

function schedulePush() {
  dirty = true;
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void push(), 2500);
}

async function push(keepalive = false) {
  if (!dirty) return;
  dirty = false;
  try {
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: snapshot() }),
      keepalive,
    });
    if (!res.ok) throw new Error(String(res.status));
    markSynced(((await res.json()) as { updatedAt: number }).updatedAt);
  } catch {
    dirty = true; // try again on the next change or when the tab is hidden
  }
}

let syncStarted = false;

/** Load progress saved on another device, or upload what this browser has. Call once after sign-in. */
export async function startSync() {
  if (!syncStarted) {
    syncStarted = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void push(true);
    });
  }
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return;
    const server = (await res.json()) as { data: Partial<Pick<Shape, SyncedKey>> | null; updatedAt: number };
    if (server.data && server.updatedAt > syncedAt()) {
      for (const key of SYNCED) {
        const value: unknown = server.data[key];
        // Accept only the shape this version expects; anything else keeps the local value.
        if (value && typeof value === "object" && Array.isArray(value) === Array.isArray(defaults[key])) {
          write(key, value as never, true);
        }
      }
      markSynced(server.updatedAt);
    } else if (!server.data && (read("attempts").length > 0 || Object.keys(read("days")).length > 0)) {
      schedulePush();
    }
  } catch {
    // Offline: local data keeps working and uploads later.
  }
}

export function clearProgress() {
  for (const key of SYNCED) {
    if (key !== "settings") write(key, defaults[key] as never);
  }
}

export const exportProgress = () => snapshot();

export function removeWeak(key: string) {
  write("weak", read("weak").filter((w) => w.key !== key));
}

export function setSettings(patch: Partial<Settings>) {
  write("settings", { ...read("settings"), ...patch });
}

export function markBadgesSeen(ids: string[]) {
  write("badges", [...new Set([...read("badges"), ...ids])]);
}

// --- Daily activity ---------------------------------------------------------

/** Add to today's activity log. */
function logDay(patch: Partial<DayLog>) {
  const days = read("days");
  const key = dayKey();
  const today = days[key] ?? EMPTY_DAY;
  write("days", {
    ...days,
    [key]: {
      xp: today.xp + (patch.xp ?? 0),
      attempts: today.attempts + (patch.attempts ?? 0),
      seconds: today.seconds + (patch.seconds ?? 0),
      rounds: today.rounds + (patch.rounds ?? 0),
    },
  });
}

// --- Texts ------------------------------------------------------------------

export const bestKey = (lang: string, text: string) => `${lang}:${text.trim()}`;

/** Score from which a course phrase counts as cleared, and the marks for two and three stars. */
export const PHRASE_CLEAR = 70;
export const starsFor = (score: number | undefined) =>
  score === undefined || score < PHRASE_CLEAR ? 0 : score >= 90 ? 3 : score >= 80 ? 2 : 1;

export function saveText(lang: string, text: string): boolean {
  const clean = text.trim();
  const saved = read("saved");
  if (!clean || saved.some((s) => s.lang === lang && s.text === clean)) return false;
  write("saved", [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, lang, text: clean, at: Date.now() }, ...saved].slice(0, 100));
  return true;
}

export function removeSavedText(id: string) {
  write("saved", read("saved").filter((s) => s.id !== id));
}

export function addGeneratedText(item: GeneratedText) {
  const clean = item.text.trim();
  const prev = read("generated").filter((g) => !(g.lang === item.lang && g.text === clean));
  write("generated", [{ ...item, text: clean }, ...prev].slice(0, 60));
}

export function removeGeneratedText(id: string) {
  write("generated", read("generated").filter((g) => g.id !== id));
}

// --- Listening drills -------------------------------------------------------

export const listeningKey = (lang: string, contrast: string) => `${lang}:${contrast}`;

export function recordListening(lang: string, contrast: string, right: boolean) {
  const all = read("listening");
  const key = listeningKey(lang, contrast);
  const prev = all[key] ?? { right: 0, total: 0 };
  write("listening", { ...all, [key]: { right: prev.right + (right ? 1 : 0), total: prev.total + 1 } });
  logDay({ xp: right ? XP.listeningRight : XP.listeningWrong, rounds: 1 });
}

// --- Checkpoints ------------------------------------------------------------

export function addCheckpoint(checkpoint: Checkpoint) {
  write("checkpoints", [checkpoint, ...read("checkpoints")].slice(0, 60));
  logDay({ xp: XP.checkpoint });
}

// --- Drill scheduling -------------------------------------------------------

const MASTERED_STREAK = 3;
const DAY_MS = 86_400_000;
/** After three clear takes in a row a word rests, then is checked again after these gaps. */
export const REVIEW_GAPS = [2 * DAY_MS, 7 * DAY_MS];

/** A word that should be practised now: still being learned, or due for a spaced check. */
export const isDue = (w: WeakWord, now = Date.now()) => w.reviews === undefined || (w.due ?? 0) <= now;

// --- Recording an attempt ---------------------------------------------------

export interface Recorded {
  attempt: Attempt;
  /** Words that passed their last spaced check with this recording. */
  mastered: string[];
  /** True when this beat the previous best score for the text. */
  personalBest: boolean;
  /** Unclear words from this take that did not fit the drill list on the learner's plan. */
  leftOut: string[];
}

/** Save an attempt, award points and update the list of things worth drilling. */
export function recordAttempt(
  result: AssessResult,
  prosody: ProsodyResult | null,
  opts: { lang: string; text: string; level: LevelId; maxDrillWords: number | null; phonemes: boolean },
): Recorded {
  const { lang, text, level } = opts;
  const now = Date.now();
  const parts = {
    accuracy: result.scores.accuracy,
    intelligibility: result.scores.intelligibility,
    fluency: prosody?.fluency ?? null,
    rhythm: prosody?.rhythm ?? null,
    intonation: prosody?.intonation ?? null,
  };
  const overall = result.deduction?.score ?? overallScore(parts);
  const mastered: MasteredWord[] = [];

  const clear = SCORE_SCALE.clear;
  const all = read("weak");
  const weak = new Map(all.filter((w) => w.lang === lang).map((w) => [w.key, w]));
  for (const w of result.words) {
    const norm = normalize(w.text, lang);
    if (Array.from(norm).length < 2 && !/[^\u0000-ɏ]/.test(norm)) continue; // skip "a", "I"
    const key = `${lang}:${norm}`;
    const prev = weak.get(key);
    if (w.score < clear) {
      // Unclear again: back to learning, whatever stage it had reached.
      weak.set(key, {
        key,
        lang,
        text: w.text,
        context: prev && result.words.length === 1 ? prev.context : shortContext(text, w.from, lang),
        attempts: (prev?.attempts ?? 0) + 1,
        avg: prev ? Math.round(prev.avg * 0.6 + w.score * 0.4) : w.score,
        last: w.score,
        streak: 0,
        heard: w.heard ?? prev?.heard,
        at: now,
      });
    } else if (prev) {
      const base = {
        ...prev,
        attempts: prev.attempts + 1,
        avg: Math.round(prev.avg * 0.6 + w.score * 0.4),
        last: w.score,
        at: now,
      };
      if (prev.reviews === undefined) {
        const streak = prev.streak + 1;
        weak.set(key, streak >= MASTERED_STREAK ? { ...base, streak, reviews: 0, due: now + REVIEW_GAPS[0] } : { ...base, streak });
      } else if ((prev.due ?? 0) > now) {
        weak.set(key, base); // said clearly before the check was due: nice, but the schedule stands
      } else if (prev.reviews + 1 >= REVIEW_GAPS.length) {
        weak.delete(key);
        mastered.push({ key, lang, text: prev.text, at: now });
      } else {
        weak.set(key, { ...base, reviews: prev.reviews + 1, due: now + REVIEW_GAPS[prev.reviews + 1] });
      }
    }
  }
  // Weakest first; a plan with a capped drill list keeps only the weakest few per language.
  const ranked = [...weak.values()].sort((a, b) => a.avg - b.avg);
  const kept = ranked.slice(0, opts.maxDrillWords ?? 200);
  write("weak", [...all.filter((w) => w.lang !== lang), ...kept]);
  // Remember which unclear words did not fit, so the learner can see what a longer list would hold.
  const dropped = ranked.slice(kept.length).map((w) => ({ lang, text: w.text }));
  const keptTexts = new Set(kept.map((w) => w.text));
  const leftOut = [...dropped, ...read("leftOut").filter((w) => !(w.lang === lang && keptTexts.has(w.text)))]
    .filter((w, i, all2) => all2.findIndex((x) => x.lang === w.lang && x.text === w.text) === i)
    .slice(0, 30);
  if (JSON.stringify(leftOut) !== JSON.stringify(read("leftOut"))) write("leftOut", leftOut);
  if (mastered.length) write("mastered", [...mastered, ...read("mastered")].slice(0, 500));

  const xp = XP.attempt(overall) + mastered.length * XP.wordMastered;
  const attempt: Attempt = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    at: now,
    lang,
    text,
    overall,
    ...parts,
    demo: result.demo,
    level,
    seconds: Math.round(result.duration),
    xp,
  };
  write("attempts", [attempt, ...read("attempts")].slice(0, 300));
  logDay({ xp, attempts: 1, seconds: Math.round(result.duration) });

  const best = read("best");
  const key = bestKey(lang, text);
  const previousBest = best[key];
  const personalBest = previousBest !== undefined && overall > previousBest;
  if (previousBest === undefined || overall > previousBest) {
    const entries = Object.entries({ ...best, [key]: overall });
    write("best", Object.fromEntries(entries.slice(-600)));
  }

  if (opts.phonemes && result.phonemeLevel) {
    const phonemes = new Map(read("phonemes").map((p) => [p.key, p]));
    for (const w of result.words) {
      // Only sounds that were measured feed the sound statistics; estimated ones would skew them.
      if (!w.phonemesMeasured) continue;
      for (const p of w.phonemes ?? []) {
        const key = `${lang}:${p.ipa}`;
        const prev = phonemes.get(key) ?? { key, lang, ipa: p.ipa, count: 0, avg: 0, examples: [] };
        const examples =
          p.score < 70 && !prev.examples.includes(w.text) ? [w.text, ...prev.examples].slice(0, 6) : prev.examples;
        phonemes.set(key, {
          ...prev,
          count: prev.count + 1,
          avg: Math.round((prev.avg * prev.count + p.score) / (prev.count + 1)),
          examples,
        });
      }
    }
    write("phonemes", [...phonemes.values()]);
  }
  return { attempt, mastered: mastered.map((w) => w.text), personalBest, leftOut: dropped.map((w) => w.text) };
}


// --- Upgrade card cadence ---------------------------------------------------
// Unprompted upgrade cards are rationed in this browser only: one per calendar day, and none for a week
// after the learner says "Not now". Cards the learner opens themselves are never counted.

interface NudgeState {
  day: string;
  kind: string;
  snoozeUntil: number;
}

const readNudge = (): NudgeState => {
  try {
    const raw = window.localStorage.getItem(prefix + "nudge");
    if (raw) return JSON.parse(raw) as NudgeState;
  } catch {
    // Storage unavailable: behave as if nothing was shown, but see claimNudge.
  }
  return { day: "", kind: "", snoozeUntil: 0 };
};

const writeNudge = (state: NudgeState) => {
  try {
    window.localStorage.setItem(prefix + "nudge", JSON.stringify(state));
  } catch {
    // Blocked storage: the card may reappear on the next visit, which is acceptable.
  }
};

/** True when a card of this kind may be shown now. The first kind to claim today keeps today's slot. */
export function claimNudge(kind: string): boolean {
  const state = readNudge();
  const today = dayKey();
  if (Date.now() < state.snoozeUntil) return false;
  if (state.day === today) return state.kind === kind;
  writeNudge({ ...state, day: today, kind });
  return true;
}

/** The learner said "Not now": stay quiet for a while. */
export function snoozeNudges(days: number) {
  writeNudge({ ...readNudge(), snoozeUntil: Date.now() + days * 86_400_000 });
}
