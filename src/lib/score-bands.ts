import type { CheckDepth } from "./types";

/**
 * What a score means, in words. One set of bands for every level, language and screen.
 *
 * The wording only claims what the analysis can back up. A 90 means every word we checked matched a
 * native speaker, not that no listener could ever hear an accent: voice placement, subtle vowel colour
 * and melody are measured loosely or not at all, and those can still give an accent away.
 */
export interface ScoreBand {
  min: number;
  range: string;
  label: string;
  detail: string;
}

export const SCORE_BANDS: ScoreBand[] = [
  {
    min: 90,
    range: "90–100",
    label: "Native-like",
    detail:
      "Every word we checked matched a native speaker. Subtle traits we do not measure yet, such as voice placement, can still give an accent away.",
  },
  {
    min: 80,
    range: "80–89",
    label: "Slight accent",
    detail: "Easy to understand. A few words or sounds came out a little different from a native speaker.",
  },
  {
    min: 60,
    range: "60–79",
    label: "Noticeable accent",
    detail: "Understood in context, but some words came out clearly different from a native speaker.",
  },
  {
    min: 0,
    range: "0–59",
    label: "Strong accent",
    detail: "Several words were hard to recognise. These go straight into your drills.",
  },
];

export function bandFor(score: number): ScoreBand {
  return SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

/** One line telling the learner how closely this recording was checked. */
export const DEPTH_NOTE: Record<CheckDepth, string> = {
  sound: "Checked sound by sound.",
  word: "Checked word by word. Turn on the precise sound check in Settings to compare every sound with a native reading.",
  basic: "Basic check: which words were recognised, and their timing.",
};
