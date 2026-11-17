import { tokenize } from "./text";

/**
 * One thing at a time. Everything a learner reads aloud is a single word or a short sentence:
 * short takes keep attention on one sound or one tune, and they are cheap to score (every engine
 * bills by the second of audio or the character of text).
 */
export const SHORT = {
  /** Words a practice sentence aims for. Built-in and generated sentences stay at or under this. */
  words: 8,
  /** Words a sentence may have before it is split. A little slack for particles and clitics. */
  maxWords: 10,
  /** Hard cap on characters for anything sent to scoring or text-to-speech. */
  chars: 120,
  /** Longest recording. A short sentence takes 2–5 seconds even when read slowly. */
  seconds: 12,
} as const;

export interface Piece {
  text: string;
  from: number;
  to: number;
}

export const wordCount = (text: string, lang: string) => tokenize(text, lang).length;

/** True when the text fits in one short take. */
export function isShort(text: string, lang: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= SHORT.chars && wordCount(t, lang) <= SHORT.maxWords;
}

// Clause boundaries across scripts: Latin, CJK, Arabic and Devanagari punctuation.
const CLAUSE = /[,;:—–、，；：،؛]/u;

function trimPiece(text: string, from: number, to: number): Piece | null {
  const raw = text.slice(from, to);
  const lead = raw.length - raw.trimStart().length;
  const t = raw.trim();
  return t ? { text: t, from: from + lead, to: from + lead + t.length } : null;
}

/** Split one sentence at clause punctuation, keeping the punctuation with the clause before it. */
function clauses(text: string, from: number, to: number): Piece[] {
  const out: Piece[] = [];
  let start = from;
  for (let i = from; i < to; i++) {
    if (CLAUSE.test(text[i])) {
      const p = trimPiece(text, start, i + 1);
      if (p) out.push(p);
      start = i + 1;
    }
  }
  const last = trimPiece(text, start, to);
  if (last) out.push(last);
  return out;
}

/** Cut a piece that is still too long into even windows of at most SHORT.words words. */
function windows(text: string, piece: Piece, lang: string): Piece[] {
  const tokens = tokenize(piece.text, lang);
  if (tokens.length <= SHORT.maxWords && piece.text.length <= SHORT.chars) return [piece];
  const out: Piece[] = [];
  const n = Math.max(2, Math.ceil(tokens.length / SHORT.words));
  const size = Math.max(1, Math.ceil(tokens.length / n));
  for (let i = 0; i < tokens.length; i += size) {
    const next = tokens[i + size];
    const end = next ? piece.from + next.from : piece.to;
    const p = trimPiece(text, piece.from + tokens[i].from, end);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Break any text into short pieces: sentences first, then clauses, then even word windows.
 * Clauses of one or two words are joined to a neighbour when the two still fit. Offsets point
 * into the original text.
 */
export function splitShort(text: string, lang: string): Piece[] {
  const segmenter = new Intl.Segmenter(lang, { granularity: "sentence" });
  const small = (p: Piece) => wordCount(p.text, lang) <= 2;
  const pieces: Piece[] = [];
  for (const s of segmenter.segment(text)) {
    const sentence = trimPiece(text, s.index, s.index + s.segment.length);
    if (!sentence) continue;
    if (isShort(sentence.text, lang)) {
      pieces.push(sentence);
      continue;
    }
    const parts: Piece[] = [];
    for (const c of clauses(text, sentence.from, sentence.to)) {
      const prev = parts[parts.length - 1];
      const joined = prev ? trimPiece(text, prev.from, c.to) : null;
      if (prev && joined && (small(prev) || small(c)) && isShort(joined.text, lang)) parts[parts.length - 1] = joined;
      else parts.push(c);
    }
    for (const p of parts) pieces.push(...windows(text, p, lang));
  }
  return pieces.filter((p) => wordCount(p.text, lang) > 0);
}

/** The short stretch of a text around a character offset: what a weak word is drilled in. */
export function shortContext(text: string, offset: number, lang: string): string {
  const pieces = splitShort(text, lang);
  const hit = pieces.find((p) => offset >= p.from && offset < p.to);
  return (hit ?? pieces[0])?.text ?? text.trim();
}

/**
 * The words to drill on their own before saying the whole sentence, in sentence order: the learner's
 * weak words first, then the longest words (the ones with the most sounds to get wrong). Short
 * function words are skipped. Proposed words (from a generated sentence) win when given.
 */
export function ladderWords(
  sentence: string,
  lang: string,
  opts: { proposed?: string[]; weak?: Set<string>; max?: number } = {},
): string[] {
  const max = opts.max ?? 4;
  if (opts.proposed?.length) return opts.proposed.slice(0, max);
  const tokens = tokenize(sentence, lang);
  if (tokens.length <= 2) return [];
  const weak = opts.weak ?? new Set<string>();
  const len = (s: string) => Array.from(s).length;
  // Scripts without spaces pack more sound into each character.
  const minLen = /[぀-ヿ一-鿿가-힯]/u.test(sentence) ? 2 : 4;
  const ranked = tokens
    .map((t, i) => ({ t, i, weak: weak.has(t.norm) }))
    .filter((x) => x.weak || len(x.t.norm) >= minLen)
    .sort((a, b) => Number(b.weak) - Number(a.weak) || len(b.t.norm) - len(a.t.norm));
  const seen = new Set<string>();
  const picked = ranked.filter((x) => !seen.has(x.t.norm) && seen.add(x.t.norm)).slice(0, max);
  return picked.sort((a, b) => a.i - b.i).map((x) => x.t.text);
}
