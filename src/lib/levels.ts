import type { WordStatus } from "./types";

export type LevelId = "beginner" | "intermediate" | "advanced";

export interface Level {
  id: LevelId;
  name: string;
  /** How a learner would describe themselves. */
  headline: string;
  description: string;
  /** Word score needed to count as clear / as merely unclear. */
  clear: number;
  unclear: number;
  /** Reference playback starts slowed down. */
  slowByDefault: boolean;
  /** Share of each dimension in the overall score. */
  weights: { accuracy: number; intelligibility: number; fluency: number; rhythm: number; intonation: number };
}

export const LEVELS: Record<LevelId, Level> = {
  beginner: {
    id: "beginner",
    name: "Starting out",
    headline: "I'm new to this language",
    description:
      "Short everyday phrases with meanings. Tap any word to hear it, listen slowly, and focus on simply being understood.",
    clear: 70,
    unclear: 50,
    slowByDefault: true,
    weights: { accuracy: 0.4, intelligibility: 0.4, fluency: 0.1, rhythm: 0.05, intonation: 0.05 },
  },
  intermediate: {
    id: "intermediate",
    name: "Getting clear",
    headline: "I can speak, but people sometimes ask me to repeat",
    description:
      "Full sentences at natural speed. Find the words that trip listeners up and smooth out your rhythm.",
    clear: 80,
    unclear: 60,
    slowByDefault: false,
    weights: { accuracy: 0.45, intelligibility: 0.25, fluency: 0.1, rhythm: 0.1, intonation: 0.1 },
  },
  advanced: {
    id: "advanced",
    name: "Sounding native",
    headline: "I'm fluent and want to lose the last traces of accent",
    description:
      "Demanding passages and tongue twisters, strict scoring, and extra weight on rhythm and melody: the things that still give an accent away.",
    clear: 88,
    unclear: 72,
    slowByDefault: false,
    weights: { accuracy: 0.35, intelligibility: 0.15, fluency: 0.1, rhythm: 0.2, intonation: 0.2 },
  },
};

export const LEVEL_IDS = Object.keys(LEVELS) as LevelId[];

export const isLevel = (v: unknown): v is LevelId => typeof v === "string" && v in LEVELS;

export function statusFor(score: number, level: LevelId): WordStatus {
  const l = LEVELS[level];
  if (score >= l.clear) return "ok";
  if (score >= l.unclear) return "unclear";
  return "mispronounced";
}
