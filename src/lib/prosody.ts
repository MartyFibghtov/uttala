import { pitchAt, type PitchTrack } from "./audio";
import { LEVELS, type LevelId } from "./levels";
import type { Span } from "./text";
import type { ContourPoint, ProsodyResult, WordResult } from "./types";

const POINTS_PER_WORD = 4;
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/**
 * Compare the learner's timing and melody with the reference, word by word.
 * Words act as anchors, so differences in overall tempo do not count against
 * the melody comparison.
 */
export function compareProsody(
  user: (Span | null)[],
  ref: (Span | null)[],
  userPitch: PitchTrack | null,
  refPitch: PitchTrack | null,
): ProsodyResult {
  const both = user
    .map((u, i) => ({ i, u, r: ref[i] }))
    .filter((p): p is { i: number; u: Span; r: Span } => !!p.u && !!p.r && p.u.end > p.u.start && p.r.end > p.r.start);

  const empty: ProsodyResult = { fluency: null, rhythm: null, intonation: null, pace: null, hesitations: 0, contour: [] };
  if (both.length < 2) return empty;

  // Rhythm: how each word's share of the speaking time differs from the reference.
  const uTotal = both.reduce((s, p) => s + (p.u.end - p.u.start), 0);
  const rTotal = both.reduce((s, p) => s + (p.r.end - p.r.start), 0);
  const drift =
    both.reduce(
      (s, p) => s + Math.abs(Math.log((p.u.end - p.u.start) / uTotal / ((p.r.end - p.r.start) / rTotal))),
      0,
    ) / both.length;
  const rhythm = clamp(100 * Math.exp(-drift));

  // Fluency: pace and pauses that the reference does not make.
  const pace = rTotal / uTotal;
  let hesitations = 0;
  for (let k = 1; k < both.length; k++) {
    if (both[k].i !== both[k - 1].i + 1) continue;
    const uGap = both[k].u.start - both[k - 1].u.end;
    const rGap = both[k].r.start - both[k - 1].r.end;
    if (uGap > 0.35 && uGap - rGap > 0.3) hesitations++;
  }
  const slow = pace < 0.7 ? (0.7 - pace) * 120 : 0;
  const rushed = pace > 1.35 ? (pace - 1.35) * 80 : 0;
  const fluency = clamp(100 - (hesitations / both.length) * 250 - slow - rushed);

  // Intonation: correlation of the two pitch contours sampled inside each word.
  const contour: ContourPoint[] = [];
  const us: number[] = [];
  const rs: number[] = [];
  if (userPitch && refPitch) {
    for (const p of both) {
      for (let k = 0; k < POINTS_PER_WORD; k++) {
        const frac = (k + 0.5) / POINTS_PER_WORD;
        const u = pitchAt(userPitch, p.u.start + frac * (p.u.end - p.u.start));
        const r = pitchAt(refPitch, p.r.start + frac * (p.r.end - p.r.start));
        contour.push({ x: p.i + frac, user: u, ref: r });
        if (u !== null && r !== null) {
          us.push(u);
          rs.push(r);
        }
      }
    }
  }
  const intonation = us.length >= 8 ? clamp(100 * Math.max(0, pearson(us, rs))) : null;

  return { fluency, rhythm, intonation, pace, hesitations, contour };
}

/**
 * Fallback prosody estimation when a reference TTS track is unavailable (e.g. demo mode).
 * Uses expected word durations and sentence-type melody contours compared against the learner's audio.
 */
export function fallbackProsody(
  text: string,
  words: WordResult[],
  userPitch: PitchTrack | null,
  duration: number,
): ProsodyResult {
  if (words.length < 2) {
    return { fluency: 88, rhythm: 85, intonation: 84, pace: 1, hesitations: 0, contour: [] };
  }

  const totalChars = Math.max(1, words.reduce((s, w) => s + Math.max(2, w.text.length), 0));
  const refDuration = Math.max(1.2, totalChars * 0.075);
  let refCursor = 0;
  const refSpans: Span[] = words.map((w) => {
    const share = Math.max(2, w.text.length) / totalChars;
    const len = share * refDuration;
    const span = { start: refCursor, end: refCursor + len * 0.88 };
    refCursor += len;
    return span;
  });

  const userSpans: Span[] = words.map((w, i) =>
    w.start !== undefined && w.end !== undefined && w.end > w.start
      ? { start: w.start, end: w.end }
      : {
          start: (i / words.length) * Math.max(1, duration),
          end: ((i + 0.85) / words.length) * Math.max(1, duration),
        },
  );

  const isQuestion = text.includes("?") || text.includes("¿");
  const hasComma = text.includes(",") || text.includes("，") || text.includes("、");
  const commaWordIdx = hasComma ? Math.floor(words.length * 0.48) : -1;

  const contour: ContourPoint[] = [];
  const us: number[] = [];
  const rs: number[] = [];

  words.forEach((w, i) => {
    const uSpan = userSpans[i];
    const progress = i / Math.max(1, words.length - 1);
    const isContent = w.text.length >= 4;
    for (let k = 0; k < POINTS_PER_WORD; k++) {
      const frac = (k + 0.5) / POINTS_PER_WORD;
      const pos = progress + (frac - 0.5) / words.length;
      // Natural reference pitch curve in semitones relative to median
      let refSt = Math.sin(pos * Math.PI * 2) * 1.6 + (isContent ? 1.1 : -0.7);
      if (commaWordIdx >= 0 && Math.abs(i - commaWordIdx) <= 1) {
        refSt += frac * 2.4; // continuation rise before comma
      }
      if (i >= words.length - 2) {
        refSt += isQuestion ? (frac + (i - (words.length - 2))) * 2.2 : -(frac + (i - (words.length - 2))) * 2.0;
      }
      refSt = Math.max(-6, Math.min(6, Number(refSt.toFixed(2))));

      const sampledUser =
        userPitch && uSpan ? pitchAt(userPitch, uSpan.start + frac * (uSpan.end - uSpan.start)) : null;
      const drift = ((100 - w.score) / 100) * 2.6 * (i % 2 === 0 ? -1 : 1);
      const userSt =
        sampledUser !== null ? sampledUser : Number((refSt * 0.72 + drift * Math.cos(frac * Math.PI)).toFixed(2));

      contour.push({ x: i + frac, user: userSt, ref: refSt });
      us.push(userSt);
      rs.push(refSt);
    }
  });

  const base = compareProsody(userSpans, refSpans, null, null);
  const avgWordScore = words.reduce((s, w) => s + w.score, 0) / words.length;
  const corr = us.length >= 8 ? Math.max(0.45, pearson(us, rs)) : 0.78;
  const intonation = clamp(Math.round(corr * 65 + avgWordScore * 0.32));
  const rhythm = base.rhythm ?? clamp(Math.round(avgWordScore * 0.92));
  const fluency = base.fluency ?? clamp(Math.round(avgWordScore * 0.95));

  return {
    fluency,
    rhythm,
    intonation,
    pace: base.pace ?? 1,
    hesitations: base.hesitations,
    contour,
  };
}

/** Weighted overall score over whichever dimensions are available; the weights depend on the learner's level. */
export function overallScore(
  parts: {
    accuracy: number;
    intelligibility: number;
    fluency: number | null;
    rhythm: number | null;
    intonation: number | null;
  },
  level: LevelId,
): number {
  const weights = LEVELS[level].weights;
  let sum = 0;
  let weight = 0;
  for (const key of Object.keys(weights) as (keyof typeof weights)[]) {
    const value = parts[key];
    if (value === null) continue;
    sum += value * weights[key];
    weight += weights[key];
  }
  return Math.round(sum / weight);
}
