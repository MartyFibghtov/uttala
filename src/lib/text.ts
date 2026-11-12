import type { TimedChar } from "./types";

export interface Token {
  text: string;
  norm: string;
  from: number;
  to: number;
}

/** Normalise a word for comparison: case, width, punctuation, optional vowel marks. */
export function normalize(word: string, locale?: string): string {
  return word
    .normalize("NFKC")
    .toLocaleLowerCase(locale)
    .replace(/[ً-ْٰـְ-ׇ]/g, "") // Arabic tashkeel/tatweel, Hebrew niqqud
    .replace(/[\p{P}\p{S}\s]/gu, "");
}

/** Fold diacritics and phonetic near-equivalents for softer alignment matching. */
export function phoneticSkeleton(word: string, locale?: string): string {
  return normalize(word, locale)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/sh/g, "s")
    .replace(/ch/g, "c")
    .replace(/ck/g, "k")
    .replace(/qu/g, "kw")
    .replace(/[vw]/g, "v")
    .replace(/[lr]/g, "r")
    .replace(/[sz]/g, "s")
    .replace(/[bp]/g, "p")
    .replace(/[dt]/g, "t")
    .replace(/[gk]/g, "k")
    .replace(/(.)\1+/g, "$1");
}

/** Language-aware word segmentation (works for scripts without spaces too). */
export function tokenize(text: string, locale: string): Token[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
  const tokens: Token[] = [];
  for (const s of segmenter.segment(text)) {
    if (!s.isWordLike) continue;
    const norm = normalize(s.segment, locale);
    if (!norm) continue;
    tokens.push({ text: s.segment, norm, from: s.index, to: s.index + s.segment.length });
  }
  return tokens;
}

export function sentenceOf(text: string, offset: number, locale: string): string {
  const segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
  for (const s of segmenter.segment(text)) {
    if (offset >= s.index && offset < s.index + s.segment.length) return s.segment.trim();
  }
  return text.trim();
}

export function levenshtein(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  let prev = y.map((_, j) => j + 1);
  prev.unshift(0);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(Array.from(a).length, Array.from(b).length);
  if (max === 0) return 1;
  const rawSim = 1 - levenshtein(a, b) / max;
  const skelA = phoneticSkeleton(a);
  const skelB = phoneticSkeleton(b);
  const skelMax = Math.max(Array.from(skelA).length, Array.from(skelB).length);
  const skelSim = skelMax === 0 ? rawSim : 1 - levenshtein(skelA, skelB) / skelMax;
  return rawSim * 0.7 + skelSim * 0.3;
}

type MatchOp = { type: "match"; ti: number; hi: number };
type SubOp = { type: "sub"; ti: number; hi: number };
type DelOp = { type: "del"; ti: number };
type InsOp = { type: "ins"; hi: number };
export type AlignOp = MatchOp | SubOp | DelOp | InsOp;

/**
 * Align target words with heard words (edit distance, phonetic-similarity-weighted
 * substitutions so near-misses pair up with the word they were meant to be).
 */
export function align(target: string[], heard: string[]): AlignOp[] {
  const n = target.length;
  const m = heard.length;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) cost[i][0] = i;
  for (let j = 1; j <= m; j++) cost[0][j] = j;
  const sub = (i: number, j: number) =>
    target[i] === heard[j] ? 0 : 0.85 + 0.95 * (1 - similarity(target[i], heard[j]));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cost[i][j] = Math.min(
        cost[i - 1][j - 1] + sub(i - 1, j - 1),
        cost[i - 1][j] + 1,
        cost[i][j - 1] + 1,
      );
    }
  }
  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(cost[i][j] - (cost[i - 1][j - 1] + sub(i - 1, j - 1))) < 1e-9) {
      ops.push({ type: target[i - 1] === heard[j - 1] ? "match" : "sub", ti: i - 1, hi: j - 1 });
      i--;
      j--;
    } else if (i > 0 && Math.abs(cost[i][j] - (cost[i - 1][j] + 1)) < 1e-9) {
      ops.push({ type: "del", ti: i - 1 });
      i--;
    } else {
      ops.push({ type: "ins", hi: j - 1 });
      j--;
    }
  }
  ops.reverse();
  return mergeCompounds(ops, target, heard);
}

/** "can not" vs "cannot": treat split/joined spellings as matches. */
function mergeCompounds(ops: AlignOp[], target: string[], heard: string[]): AlignOp[] {
  const out: AlignOp[] = [];
  for (let k = 0; k < ops.length; k++) {
    const a = ops[k];
    const b = ops[k + 1];
    if (a && b) {
      const pair = [a, b];
      const s = pair.find((o): o is SubOp => o.type === "sub");
      const d = pair.find((o): o is DelOp => o.type === "del");
      const ins = pair.find((o): o is InsOp => o.type === "ins");
      if (s && d) {
        const [t1, t2] = [s.ti, d.ti].sort((p, q) => p - q);
        const joined = target[t1] + target[t2];
        if (joined === heard[s.hi] || similarity(joined, heard[s.hi]) >= 0.9) {
          out.push({ type: "match", ti: t1, hi: s.hi }, { type: "match", ti: t2, hi: s.hi });
          k++;
          continue;
        }
      }
      if (s && ins) {
        const [h1, h2] = [s.hi, ins.hi].sort((p, q) => p - q);
        const joined = heard[h1] + heard[h2];
        if (joined === target[s.ti] || similarity(joined, target[s.ti]) >= 0.9) {
          out.push({ type: "match", ti: s.ti, hi: h1 });
          k++;
          continue;
        }
      }
    }
    out.push(a);
  }
  return out;
}

export interface Span {
  start: number;
  end: number;
}

const WORD_CHAR_RE = /[\p{L}\p{N}]/u;

function baseChar(ch: string, locale?: string): string {
  return ch
    .normalize("NFKC")
    .toLocaleLowerCase(locale)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

interface TargetCharUnit {
  raw: string;
  base: string;
  tokenIndex: number; // -1 for inter-word separator
  isSpace: boolean;
}

interface AlignedCharUnit {
  raw: string;
  base: string;
  s: number;
  e: number;
  isWordChar: boolean;
  afterGap: boolean;
  beforeGap: boolean;
}

/**
 * Map character-level timings onto our tokens using global Dynamic Programming
 * sequence alignment with word-boundary anchors and pause-bleed clamping.
 */
export function timeTokens(chars: TimedChar[], tokens: Token[], locale?: string): (Span | null)[] {
  if (!tokens.length || !chars.length) return tokens.map(() => null);

  // 1. Expand TimedChar[] into individual character units with interpolated sub-timings.
  const rawUnits: { raw: string; base: string; s: number; e: number; isWordChar: boolean }[] = [];
  for (const ch of chars) {
    if (!ch.c) continue;
    const glyphs = Array.from(ch.c);
    const dur = Math.max(0, ch.e - ch.s);
    const step = glyphs.length > 0 ? dur / glyphs.length : 0;
    glyphs.forEach((g, idx) => {
      const lower = g.normalize("NFKC").toLocaleLowerCase(locale);
      const isWordChar = WORD_CHAR_RE.test(lower);
      rawUnits.push({
        raw: lower,
        base: isWordChar ? baseChar(lower, locale) : " ",
        s: ch.s + idx * step,
        e: ch.s + (idx + 1) * step,
        isWordChar,
      });
    });
  }

  // Collapse runs of non-word characters (spaces, punctuation) into single boundary separators
  // while marking word characters that sit next to a boundary/pause.
  const alignedChars: AlignedCharUnit[] = [];
  for (let i = 0; i < rawUnits.length; i++) {
    const u = rawUnits[i];
    if (!u.isWordChar) {
      const prev = alignedChars[alignedChars.length - 1];
      if (prev && !prev.isWordChar) {
        prev.e = Math.max(prev.e, u.e);
      } else {
        alignedChars.push({
          raw: " ",
          base: " ",
          s: u.s,
          e: u.e,
          isWordChar: false,
          afterGap: false,
          beforeGap: false,
        });
      }
    } else {
      const prevRaw = rawUnits[i - 1];
      const nextRaw = rawUnits[i + 1];
      const prevGap = !prevRaw || !prevRaw.isWordChar || u.s - prevRaw.e > 0.04;
      const nextGap = !nextRaw || !nextRaw.isWordChar || nextRaw.s - u.e > 0.04;
      alignedChars.push({
        raw: u.raw,
        base: u.base || u.raw,
        s: u.s,
        e: u.e,
        isWordChar: true,
        afterGap: prevGap,
        beforeGap: nextGap,
      });
    }
  }

  if (!alignedChars.length) return tokens.map(() => null);

  // 2. Build the target character sequence from tokens with boundary markers between separated tokens.
  const targetUnits: TargetCharUnit[] = [];
  tokens.forEach((t, ti) => {
    if (ti > 0 && t.from > tokens[ti - 1].to) {
      targetUnits.push({ raw: " ", base: " ", tokenIndex: -1, isSpace: true });
    }
    for (const ch of Array.from(t.text)) {
      const lower = ch.normalize("NFKC").toLocaleLowerCase(locale);
      if (!WORD_CHAR_RE.test(lower)) continue;
      targetUnits.push({
        raw: lower,
        base: baseChar(lower, locale) || lower,
        tokenIndex: ti,
        isSpace: false,
      });
    }
  });

  if (!targetUnits.length) return tokens.map(() => null);

  // 3. Global DP alignment between targetUnits (N) and alignedChars (M).
  const n = targetUnits.length;
  const m = alignedChars.length;
  const stride = m + 1;
  const dp = new Float32Array((n + 1) * stride);
  const ptr = new Uint8Array((n + 1) * stride); // 1 = diag, 2 = up (del target), 3 = left (ins char)

  for (let i = 1; i <= n; i++) {
    dp[i * stride] = dp[(i - 1) * stride] + (targetUnits[i - 1].isSpace ? 0.2 : 1.0);
    ptr[i * stride] = 2;
  }
  for (let j = 1; j <= m; j++) {
    dp[j] = dp[j - 1] + (!alignedChars[j - 1].isWordChar ? 0.2 : 1.0);
    ptr[j] = 3;
  }

  for (let i = 1; i <= n; i++) {
    const tu = targetUnits[i - 1];
    const row = i * stride;
    const prevRow = (i - 1) * stride;
    const delCost = tu.isSpace ? 0.2 : 1.0;

    for (let j = 1; j <= m; j++) {
      const cu = alignedChars[j - 1];
      const insCost = !cu.isWordChar ? 0.2 : 1.0;

      let subCost: number;
      if (tu.isSpace && !cu.isWordChar) {
        subCost = 0;
      } else if (tu.isSpace !== !cu.isWordChar) {
        subCost = 2.6; // Strongly discourage aligning letters with whitespace
      } else if (tu.raw === cu.raw) {
        subCost = 0;
      } else if (tu.base === cu.base) {
        subCost = 0.12;
      } else {
        subCost = 1.15;
      }

      const cDiag = dp[prevRow + j - 1] + subCost;
      const cUp = dp[prevRow + j] + delCost;
      const cLeft = dp[row + j - 1] + insCost;

      if (cDiag <= cUp && cDiag <= cLeft) {
        dp[row + j] = cDiag;
        ptr[row + j] = 1;
      } else if (cUp <= cLeft) {
        dp[row + j] = cUp;
        ptr[row + j] = 2;
      } else {
        dp[row + j] = cLeft;
        ptr[row + j] = 3;
      }
    }
  }

  // Backtrack to assign aligned word characters to each token.
  const bucket: AlignedCharUnit[][] = tokens.map(() => []);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const move = ptr[i * stride + j];
    if (move === 1) {
      const tu = targetUnits[i - 1];
      const cu = alignedChars[j - 1];
      if (!tu.isSpace && cu.isWordChar && tu.tokenIndex >= 0) {
        bucket[tu.tokenIndex].push(cu);
      }
      i--;
      j--;
    } else if (move === 2) {
      i--;
    } else {
      j--;
    }
  }
  bucket.forEach((b) => b.reverse());

  // 4. Compute typical character duration to trim silence/pause bleed at word edges.
  const charDurs = alignedChars
    .filter((c) => c.isWordChar && c.e > c.s && c.e - c.s < 0.35)
    .map((c) => c.e - c.s)
    .sort((a, b) => a - b);
  const medCharDur = charDurs.length
    ? Math.max(0.035, Math.min(0.1, charDurs[Math.floor(charDurs.length / 2)]))
    : 0.065;

  const spans: (Span | null)[] = bucket.map((matched) => {
    if (!matched.length) return null;
    const first = matched[0];
    const last = matched[matched.length - 1];

    let start = first.s;
    let end = last.e;

    // Trim leading silence bleed if the first character after a pause/start is abnormally stretched.
    const firstDur = first.e - first.s;
    if (first.afterGap && firstDur > Math.max(0.18, medCharDur * 3.0)) {
      start = first.e - Math.max(0.1, medCharDur * 1.85);
    }

    // Trim trailing pause bleed if the last character before punctuation/pause absorbed the pause.
    const lastDur = last.e - last.s;
    if (last.beforeGap && lastDur > Math.max(0.2, medCharDur * 3.2)) {
      end = last.s + Math.max(0.12, medCharDur * 2.0);
    }

    if (end <= start) {
      const mid = (first.s + last.e) / 2;
      const half = Math.max(0.03, medCharDur * 0.6);
      start = Math.max(0, mid - half);
      end = mid + half;
    }

    return { start, end };
  });

  // 5. Enforce monotonic non-overlapping spans and interpolate any missing token spans.
  for (let k = 0; k < spans.length; k++) {
    if (!spans[k]) {
      const prevEnd = k > 0 ? spans[k - 1]?.end : undefined;
      let nextIdx = k + 1;
      while (nextIdx < spans.length && !spans[nextIdx]) nextIdx++;
      const nextStart = nextIdx < spans.length ? spans[nextIdx]?.start : undefined;
      if (prevEnd !== undefined && nextStart !== undefined && nextStart > prevEnd) {
        const count = nextIdx - k + 1;
        const step = (nextStart - prevEnd) / count;
        spans[k] = { start: prevEnd + step * 0.1, end: prevEnd + step * 0.9 };
      }
    }
    if (k > 0 && spans[k] && spans[k - 1]) {
      const prev = spans[k - 1]!;
      const cur = spans[k]!;
      if (cur.start < prev.end) {
        const mid = (prev.end + cur.start) / 2;
        if (mid > prev.start + 0.02 && cur.end > mid + 0.02) {
          prev.end = mid;
          cur.start = mid;
        }
      }
    }
  }

  return spans;
}
