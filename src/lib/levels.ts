import type { WordStatus } from "./types";

export type LevelId = "beginner" | "intermediate" | "advanced";

export interface Level {
  id: LevelId;
  name: string;
  /** How a learner would describe themselves. */
  headline: string;
  description: string;
  /** Reference playback starts slowed down. */
  slowByDefault: boolean;
}

export const LEVELS: Record<LevelId, Level> = {
  beginner: {
    id: "beginner",
    name: "Starting out",
    headline: "I'm new to this language",
    description:
      "Short everyday phrases with meanings. Say the hard words on their own, listen slowly, and focus on simply being understood.",
    slowByDefault: true,
  },
  intermediate: {
    id: "intermediate",
    name: "Getting clear",
    headline: "I can speak, but people sometimes ask me to repeat",
    description:
      "Short sentences at natural speed. Drill the words that trip listeners up, then put them back into the sentence.",
    slowByDefault: false,
  },
  advanced: {
    id: "advanced",
    name: "Sounding native",
    headline: "I'm fluent and want to lose the last traces of accent",
    description:
      "Short, dense sentences and tongue twisters that stack the hardest sounds: the details that still give an accent away.",
    slowByDefault: false,
  },
};

export const LEVEL_IDS = Object.keys(LEVELS) as LevelId[];

export const isLevel = (v: unknown): v is LevelId => typeof v === "string" && v in LEVELS;

/**
 * One scale for everyone. A learner's level picks the texts and the playback speed, never the score:
 * the same recording gets the same numbers at every level. 90–100 is meant to be native-like.
 */
export const SCORE_SCALE = {
  /** Word score at or above which a word counts as clear. */
  clear: 80,
  /** Word score at or above which a word counts as unclear rather than mispronounced. */
  unclear: 60,
  /**
   * Share of each dimension in the overall score. Sounds and words dominate: a wrong sound is what
   * gives an accent away, while rhythm and melody are measured against a single synthetic voice and
   * are the least reliable signals.
   */
  weights: { accuracy: 0.75, intelligibility: 0.1, fluency: 0.05, rhythm: 0.05, intonation: 0.05 },
} as const;

export function statusFor(score: number): WordStatus {
  if (score >= SCORE_SCALE.clear) return "ok";
  if (score >= SCORE_SCALE.unclear) return "unclear";
  return "mispronounced";
}

/**
 * Raw word score below which the slowest tenth of native words fall, per language, measured on real
 * native news speech (scripts/realset.mts). Azure's raw scores are generous: accented but correct
 * words land at 94–97, so the raw number is re-anchored on what natives actually reach.
 */
export const NATIVE_P10: Record<string, number> = { en: 97, de: 79, es: 94, ru: 79, sv: 68 };
const DEFAULT_NATIVE_P10 = 94;

// Display deficit (100 − score) against raw deficit measured in units of the native spread.
const CURVE: [number, number][] = [
  [0, 0],
  [1, 8],
  [2, 15],
  [3.33, 22],
  [6.67, 35],
  [13.3, 55],
  [20, 72],
  [33.3, 100],
];

/**
 * Map a raw engine word score onto the native-anchored scale: the native tenth lands at 92, so 90+
 * means within the range real native speakers reach, and anything less drops off quickly.
 */
export function toNativeScale(raw: number, lang: string): number {
  const spread = Math.min(10, Math.max(3, 100 - (NATIVE_P10[lang] ?? DEFAULT_NATIVE_P10)));
  const x = Math.max(0, 100 - raw) / spread;
  for (let i = 1; i < CURVE.length; i++) {
    const [x0, y0] = CURVE[i - 1];
    const [x1, y1] = CURVE[i];
    if (x <= x1) return Math.round(100 - (y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)));
  }
  return 0;
}
