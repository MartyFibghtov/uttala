import { soundForIpa, soundsFor, type Sound } from "./sounds";
import { levenshtein, normalize } from "./text";
import type { FocusSound, WordResult } from "./types";

interface GraphemeRule {
  pattern: string;
  ipa: string;
  soundSlug?: string;
}

/**
 * Common grapheme-to-phoneme mappings per language so that even when an external
 * phoneme engine is unavailable, words can be decomposed into approximate IPA segments
 * and linked to the articulatory guides in `sounds.ts`.
 */
const GRAPHEME_RULES: Record<string, GraphemeRule[]> = {
  en: [
    { pattern: "tion", ipa: "ʃən", soundSlug: "sh" },
    { pattern: "sion", ipa: "ʒən", soundSlug: "j" },
    { pattern: "ough", ipa: "oʊ", soundSlug: "ou" },
    { pattern: "igh", ipa: "aɪ", soundSlug: "ai" },
    { pattern: "tch", ipa: "tʃ", soundSlug: "ch" },
    { pattern: "dge", ipa: "dʒ", soundSlug: "j" },
    { pattern: "th", ipa: "θ", soundSlug: "th" },
    { pattern: "sh", ipa: "ʃ", soundSlug: "sh" },
    { pattern: "ch", ipa: "tʃ", soundSlug: "ch" },
    { pattern: "ng", ipa: "ŋ", soundSlug: "ng" },
    { pattern: "ph", ipa: "f" },
    { pattern: "wh", ipa: "w", soundSlug: "w" },
    { pattern: "qu", ipa: "kw", soundSlug: "w" },
    { pattern: "ee", ipa: "iː", soundSlug: "ee" },
    { pattern: "ea", ipa: "iː", soundSlug: "ee" },
    { pattern: "oo", ipa: "uː", soundSlug: "uu" },
    { pattern: "ou", ipa: "aʊ", soundSlug: "ou" },
    { pattern: "ow", ipa: "oʊ", soundSlug: "ou" },
    { pattern: "oa", ipa: "oʊ", soundSlug: "ou" },
    { pattern: "ai", ipa: "eɪ", soundSlug: "ei" },
    { pattern: "ay", ipa: "eɪ", soundSlug: "ei" },
    { pattern: "aw", ipa: "ɔː", soundSlug: "aw" },
    { pattern: "au", ipa: "ɔː", soundSlug: "aw" },
    { pattern: "er", ipa: "ɜː", soundSlug: "er" },
    { pattern: "ir", ipa: "ɜː", soundSlug: "er" },
    { pattern: "ur", ipa: "ɜː", soundSlug: "er" },
    { pattern: "ar", ipa: "ɑːr", soundSlug: "r" },
    { pattern: "or", ipa: "ɔːr", soundSlug: "aw" },
    { pattern: "a", ipa: "æ", soundSlug: "ae" },
    { pattern: "e", ipa: "e" },
    { pattern: "i", ipa: "ɪ", soundSlug: "ih" },
    { pattern: "o", ipa: "ɒ" },
    { pattern: "u", ipa: "ʌ", soundSlug: "uh" },
    { pattern: "y", ipa: "i" },
    { pattern: "r", ipa: "ɹ", soundSlug: "r" },
    { pattern: "l", ipa: "l", soundSlug: "l" },
    { pattern: "v", ipa: "v", soundSlug: "v" },
    { pattern: "w", ipa: "w", soundSlug: "w" },
    { pattern: "h", ipa: "h", soundSlug: "h" },
    { pattern: "z", ipa: "z", soundSlug: "z" },
    { pattern: "j", ipa: "dʒ", soundSlug: "j" },
    { pattern: "p", ipa: "pʰ", soundSlug: "ptk" },
    { pattern: "t", ipa: "t", soundSlug: "ptk" },
    { pattern: "k", ipa: "k", soundSlug: "ptk" },
    { pattern: "c", ipa: "k", soundSlug: "ptk" },
    { pattern: "b", ipa: "b", soundSlug: "final" },
    { pattern: "d", ipa: "d", soundSlug: "final" },
    { pattern: "g", ipa: "g", soundSlug: "final" },
    { pattern: "f", ipa: "f" },
    { pattern: "s", ipa: "s" },
    { pattern: "m", ipa: "m" },
    { pattern: "n", ipa: "n" },
  ],
  es: [
    { pattern: "rr", ipa: "r", soundSlug: "rr" },
    { pattern: "ll", ipa: "ʝ" },
    { pattern: "ch", ipa: "tʃ" },
    { pattern: "qu", ipa: "k" },
    { pattern: "gu", ipa: "g" },
    { pattern: "ñ", ipa: "ɲ" },
    { pattern: "j", ipa: "x", soundSlug: "j" },
    { pattern: "r", ipa: "ɾ", soundSlug: "r" },
    { pattern: "b", ipa: "β", soundSlug: "bv" },
    { pattern: "v", ipa: "β", soundSlug: "bv" },
    { pattern: "d", ipa: "ð", soundSlug: "bv" },
    { pattern: "g", ipa: "ɣ", soundSlug: "bv" },
  ],
  fr: [
    { pattern: "eau", ipa: "o" },
    { pattern: "ou", ipa: "u" },
    { pattern: "eu", ipa: "ø", soundSlug: "eu" },
    { pattern: "œu", ipa: "œ", soundSlug: "eu" },
    { pattern: "an", ipa: "ɑ̃", soundSlug: "nasals" },
    { pattern: "en", ipa: "ɑ̃", soundSlug: "nasals" },
    { pattern: "in", ipa: "ɛ̃", soundSlug: "nasals" },
    { pattern: "on", ipa: "ɔ̃", soundSlug: "nasals" },
    { pattern: "ch", ipa: "ʃ" },
    { pattern: "gn", ipa: "ɲ" },
    { pattern: "r", ipa: "ʁ", soundSlug: "r" },
    { pattern: "u", ipa: "y", soundSlug: "u" },
  ],
  de: [
    { pattern: "sch", ipa: "ʃ" },
    { pattern: "ch", ipa: "ç", soundSlug: "ich" },
    { pattern: "ach", ipa: "ax", soundSlug: "ach" },
    { pattern: "uch", ipa: "ux", soundSlug: "ach" },
    { pattern: "och", ipa: "ɔx", soundSlug: "ach" },
    { pattern: "ei", ipa: "aɪ" },
    { pattern: "ie", ipa: "iː" },
    { pattern: "eu", ipa: "ɔʏ" },
    { pattern: "äu", ipa: "ɔʏ" },
    { pattern: "ü", ipa: "yː", soundSlug: "ue" },
    { pattern: "ö", ipa: "øː", soundSlug: "oe" },
    { pattern: "ä", ipa: "ɛː" },
    { pattern: "ß", ipa: "s" },
    { pattern: "r", ipa: "ʁ" },
  ],
  it: [
    { pattern: "gli", ipa: "ʎ", soundSlug: "gli" },
    { pattern: "gn", ipa: "ɲ", soundSlug: "gn" },
    { pattern: "rr", ipa: "r", soundSlug: "r" },
    { pattern: "tt", ipa: "tt", soundSlug: "double" },
    { pattern: "ll", ipa: "tt", soundSlug: "double" },
    { pattern: "nn", ipa: "tt", soundSlug: "double" },
    { pattern: "pp", ipa: "tt", soundSlug: "double" },
    { pattern: "cc", ipa: "tt", soundSlug: "double" },
    { pattern: "ss", ipa: "tt", soundSlug: "double" },
    { pattern: "r", ipa: "r", soundSlug: "r" },
  ],
  pt: [
    { pattern: "ão", ipa: "ɐ̃", soundSlug: "nasal" },
    { pattern: "õe", ipa: "õ", soundSlug: "nasal" },
    { pattern: "ãe", ipa: "ɐ̃", soundSlug: "nasal" },
    { pattern: "ã", ipa: "ɐ̃", soundSlug: "nasal" },
    { pattern: "lh", ipa: "ʎ", soundSlug: "lh" },
    { pattern: "nh", ipa: "ɲ" },
    { pattern: "rr", ipa: "ʁ", soundSlug: "rr" },
    { pattern: "é", ipa: "ɛ", soundSlug: "open" },
    { pattern: "ó", ipa: "ɔ", soundSlug: "open" },
    { pattern: "r", ipa: "ɾ" },
  ],
  nl: [
    { pattern: "sch", ipa: "sx", soundSlug: "sch" },
    { pattern: "ui", ipa: "œy", soundSlug: "ui" },
    { pattern: "aa", ipa: "aː", soundSlug: "long" },
    { pattern: "ee", ipa: "eː", soundSlug: "long" },
    { pattern: "oo", ipa: "oː", soundSlug: "long" },
    { pattern: "uu", ipa: "yː", soundSlug: "long" },
    { pattern: "ch", ipa: "x", soundSlug: "g" },
    { pattern: "g", ipa: "x", soundSlug: "g" },
  ],
  sv: [
    { pattern: "skj", ipa: "ɧ", soundSlug: "sj" },
    { pattern: "stj", ipa: "ɧ", soundSlug: "sj" },
    { pattern: "sj", ipa: "ɧ", soundSlug: "sj" },
    { pattern: "tj", ipa: "ɕ" },
    { pattern: "kj", ipa: "ɕ" },
    { pattern: "u", ipa: "ʉː", soundSlug: "u" },
    { pattern: "å", ipa: "oː", soundSlug: "length" },
    { pattern: "ä", ipa: "ɛː", soundSlug: "length" },
    { pattern: "ö", ipa: "øː", soundSlug: "length" },
  ],
  pl: [
    { pattern: "szcz", ipa: "ʂtʂ", soundSlug: "clusters" },
    { pattern: "chrzą", ipa: "xʂɔ̃", soundSlug: "clusters" },
    { pattern: "sz", ipa: "ʂ", soundSlug: "sz" },
    { pattern: "cz", ipa: "tʂ", soundSlug: "sz" },
    { pattern: "rz", ipa: "ʐ", soundSlug: "sz" },
    { pattern: "ż", ipa: "ʐ", soundSlug: "sz" },
    { pattern: "ś", ipa: "ɕ", soundSlug: "sz" },
    { pattern: "ć", ipa: "tɕ", soundSlug: "sz" },
    { pattern: "ź", ipa: "ʑ", soundSlug: "sz" },
    { pattern: "ę", ipa: "ɛ̃", soundSlug: "nasal" },
    { pattern: "ą", ipa: "ɔ̃", soundSlug: "nasal" },
    { pattern: "y", ipa: "ɨ", soundSlug: "y" },
  ],
  uk: [
    { pattern: "ь", ipa: "ʲ", soundSlug: "soft" },
    { pattern: "г", ipa: "ɦ", soundSlug: "h" },
    { pattern: "и", ipa: "ɪ", soundSlug: "y" },
    { pattern: "і", ipa: "i", soundSlug: "y" },
    { pattern: "ї", ipa: "ji", soundSlug: "soft" },
    { pattern: "є", ipa: "jɛ", soundSlug: "soft" },
    { pattern: "щ", ipa: "ʃtʃ" },
  ],
  ru: [
    { pattern: "ь", ipa: "ʲ", soundSlug: "soft" },
    { pattern: "ы", ipa: "ɨ", soundSlug: "y" },
    { pattern: "р", ipa: "r", soundSlug: "r" },
    { pattern: "о", ipa: "ɐ", soundSlug: "reduce" },
    { pattern: "щ", ipa: "ɕː", soundSlug: "soft" },
  ],
  tr: [
    { pattern: "ğ", ipa: "ɰ", soundSlug: "g" },
    { pattern: "ı", ipa: "ɯ", soundSlug: "i" },
    { pattern: "ö", ipa: "ø", soundSlug: "o" },
    { pattern: "ü", ipa: "y", soundSlug: "o" },
    { pattern: "ş", ipa: "ʃ" },
    { pattern: "ç", ipa: "tʃ" },
    { pattern: "r", ipa: "ɾ", soundSlug: "r" },
  ],
  ja: [
    { pattern: "っ", ipa: "っ", soundSlug: "small-tsu" },
    { pattern: "ッ", ipa: "っ", soundSlug: "small-tsu" },
    { pattern: "ー", ipa: "ː", soundSlug: "long" },
    { pattern: "う", ipa: "ː", soundSlug: "long" },
    { pattern: "ふ", ipa: "ɸ", soundSlug: "fu" },
    { pattern: "フ", ipa: "ɸ", soundSlug: "fu" },
    { pattern: "ら", ipa: "ɾ", soundSlug: "r" },
    { pattern: "り", ipa: "ɾ", soundSlug: "r" },
    { pattern: "る", ipa: "ɾ", soundSlug: "r" },
    { pattern: "れ", ipa: "ɾ", soundSlug: "r" },
    { pattern: "ろ", ipa: "ɾ", soundSlug: "r" },
  ],
  zh: [
    { pattern: "是", ipa: "ʂ", soundSlug: "retroflex" },
    { pattern: "十", ipa: "ʂ", soundSlug: "retroflex" },
    { pattern: "吃", ipa: "ʈʂ", soundSlug: "retroflex" },
    { pattern: "知", ipa: "ʈʂ", soundSlug: "retroflex" },
    { pattern: "谢", ipa: "ɕ", soundSlug: "palatal" },
    { pattern: "去", ipa: "y", soundSlug: "u" },
    { pattern: "女", ipa: "y", soundSlug: "u" },
    { pattern: "鱼", ipa: "y", soundSlug: "u" },
  ],
  ko: [
    { pattern: "ㅡ", ipa: "ɯ", soundSlug: "eu" },
    { pattern: "으", ipa: "ɯ", soundSlug: "eu" },
    { pattern: "글", ipa: "ɯ", soundSlug: "eu" },
    { pattern: "어", ipa: "ʌ", soundSlug: "eo" },
    { pattern: "오", ipa: "o", soundSlug: "eo" },
    { pattern: "불", ipa: "p", soundSlug: "three" },
    { pattern: "풀", ipa: "pʰ", soundSlug: "three" },
    { pattern: "뿔", ipa: "p͈", soundSlug: "three" },
  ],
  ar: [
    { pattern: "ع", ipa: "ʕ", soundSlug: "ayn" },
    { pattern: "ح", ipa: "ħ", soundSlug: "hah" },
    { pattern: "ق", ipa: "q", soundSlug: "qaf" },
    { pattern: "ص", ipa: "sˤ", soundSlug: "emphatic" },
    { pattern: "ض", ipa: "dˤ", soundSlug: "emphatic" },
    { pattern: "ط", ipa: "tˤ", soundSlug: "emphatic" },
    { pattern: "ظ", ipa: "zˤ", soundSlug: "emphatic" },
  ],
  hi: [
    { pattern: "ख", ipa: "pʰ", soundSlug: "aspirated" },
    { pattern: "फ", ipa: "pʰ", soundSlug: "aspirated" },
    { pattern: "भ", ipa: "bʱ", soundSlug: "aspirated" },
    { pattern: "ध", ipa: "bʱ", soundSlug: "aspirated" },
    { pattern: "घ", ipa: "bʱ", soundSlug: "aspirated" },
    { pattern: "थ", ipa: "pʰ", soundSlug: "aspirated" },
    { pattern: "ट", ipa: "ʈ", soundSlug: "retroflex" },
    { pattern: "ठ", ipa: "ʈ", soundSlug: "retroflex" },
    { pattern: "ड", ipa: "ɖ", soundSlug: "retroflex" },
    { pattern: "ढ", ipa: "ɖ", soundSlug: "retroflex" },
    { pattern: "त", ipa: "t̪", soundSlug: "dental" },
    { pattern: "द", ipa: "d̪", soundSlug: "dental" },
    { pattern: "ँ", ipa: "̃", soundSlug: "nasal" },
    { pattern: "ं", ipa: "̃", soundSlug: "nasal" },
  ],
};

// Voiced function words in English where initial "th" is /ð/ rather than /θ/.
const EN_VOICED_TH = new Set([
  "the",
  "this",
  "that",
  "these",
  "those",
  "there",
  "their",
  "they",
  "them",
  "then",
  "than",
  "though",
  "thus",
  "mother",
  "father",
  "brother",
  "weather",
  "together",
  "other",
  "another",
  "either",
  "neither",
  "whether",
  "rather",
  "breathe",
  "with",
]);

export interface SegmentedUnit {
  grapheme: string;
  ipa: string;
  fromOffset: number;
  toOffset: number;
  sound?: Sound;
}

/** Break a word into approximate phoneme/grapheme units when no external phoneme list is present. */
export function segmentWordToPhonemes(word: string, lang: string): SegmentedUnit[] {
  const lower = word.normalize("NFKC").toLocaleLowerCase(lang);
  const rules = GRAPHEME_RULES[lang] ?? [];
  const sounds = soundsFor(lang);
  const out: SegmentedUnit[] = [];

  let i = 0;
  while (i < lower.length) {
    const ch = lower[i];
    if (!/[\p{L}\p{N}]/u.test(ch)) {
      i++;
      continue;
    }
    let matched: GraphemeRule | undefined;
    for (const r of rules) {
      if (lower.startsWith(r.pattern, i)) {
        matched = r;
        break;
      }
    }
    if (matched) {
      let ipa = matched.ipa;
      let slug = matched.soundSlug;
      if (lang === "en" && matched.pattern === "th" && EN_VOICED_TH.has(normalize(word, lang))) {
        ipa = "ð";
        slug = "dh";
      }
      // Silent final 'e' in English words of >3 letters
      if (
        lang === "en" &&
        matched.pattern === "e" &&
        i === lower.length - 1 &&
        lower.length > 3 &&
        !/[aeiouy]e$/.test(lower)
      ) {
        i++;
        continue;
      }
      const sound = slug ? sounds.find((s) => s.id === `${lang}-${slug}`) : soundForIpa(lang, ipa);
      out.push({
        grapheme: word.slice(i, i + matched.pattern.length),
        ipa,
        fromOffset: i,
        toOffset: i + matched.pattern.length,
        sound,
      });
      i += matched.pattern.length;
    } else {
      const sound = soundForIpa(lang, ch);
      out.push({
        grapheme: word.slice(i, i + 1),
        ipa: ch,
        fromOffset: i,
        toOffset: i + 1,
        sound,
      });
      i++;
    }
  }
  return out;
}

/** Find which part of `target` was changed in `heard` to explain the substitution clearly. */
function diffGraphemes(
  target: string,
  heard: string,
  lang: string,
): { targetPart: string; heardPart: string; position: "initial" | "medial" | "final" | "whole" } | null {
  const t = normalize(target, lang);
  const h = normalize(heard, lang);
  if (!t || !h || t === h) return null;

  let prefix = 0;
  while (prefix < t.length && prefix < h.length && t[prefix] === h[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < t.length - prefix &&
    suffix < h.length - prefix &&
    t[t.length - 1 - suffix] === h[h.length - 1 - suffix]
  ) {
    suffix++;
  }

  const targetPart = t.slice(prefix, t.length - suffix);
  const heardPart = h.slice(prefix, h.length - suffix);
  const position =
    prefix === 0 && suffix === 0
      ? "whole"
      : prefix === 0
        ? "initial"
        : suffix === 0
          ? "final"
          : "medial";

  return { targetPart: targetPart || t, heardPart: heardPart || "∅", position };
}

/**
 * Enrich a WordResult with detailed phoneme breakdown, expected/heard IPA,
 * error category, diagnosis of what went wrong, and concrete articulatory fix.
 */
export function enrichWordDiagnostics(
  word: WordResult,
  lang: string,
  opts: {
    faLoss?: number;
    charScores?: number[];
  } = {},
): WordResult {
  const normTarget = normalize(word.text, lang);
  const normHeard = word.heard ? normalize(word.heard, lang) : undefined;
  const segmented = segmentWordToPhonemes(word.text, lang);

  // 1. Expected IPA from existing analysis or grapheme segmentation.
  if (!word.expectedIpa && segmented.length > 0) {
    word.expectedIpa = segmented.map((s) => s.ipa).join("");
  }
  if (!word.heardIpa && normHeard && normHeard !== normTarget) {
    const heardSeg = segmentWordToPhonemes(word.heard!, lang);
    if (heardSeg.length > 0) {
      word.heardIpa = heardSeg.map((s) => s.ipa).join("");
    }
  }

  // 2. If phonemes are already present (from OpenAI audio or Azure), enrich each phoneme with sound guide tips.
  if (word.phonemes && word.phonemes.length > 0) {
    word.phonemes = word.phonemes.map((p) => {
      const guide = soundForIpa(lang, p.ipa);
      if (p.score >= 80) return p;
      return {
        ...p,
        issue:
          p.issue ??
          (p.heardIpa && p.heardIpa !== p.ipa
            ? `Substituted /${p.heardIpa}/ for target /${p.ipa}/`
            : guide
              ? `Unclear ${guide.name.toLowerCase()} (/${p.ipa}/)`
              : `Imprecise /${p.ipa}/ articulation`),
        tip: p.tip ?? guide?.how,
      };
    });
  } else if (word.status !== "omitted" && segmented.length > 0) {
    // Construct phoneme breakdown from segmented units + character/word scores & substitution diff.
    const diff = normHeard ? diffGraphemes(word.text, word.heard!, lang) : null;
    word.phonemes = segmented.map((seg, idx) => {
      let score = word.score;
      let heardIpa: string | undefined;
      let issue: string | undefined;

      if (opts.charScores && opts.charScores.length > 0) {
        const slice = opts.charScores.slice(seg.fromOffset, Math.max(seg.fromOffset + 1, seg.toOffset));
        if (slice.length > 0) {
          const charAvg = slice.reduce((a, b) => a + b, 0) / slice.length;
          score = Math.round(word.score * 0.55 + charAvg * 0.45);
        }
      }

      if (diff) {
        const segNorm = normalize(seg.grapheme, lang);
        const overlapsDiff =
          (diff.position === "initial" && idx === 0) ||
          (diff.position === "final" && idx === segmented.length - 1) ||
          (diff.targetPart && segNorm && diff.targetPart.includes(segNorm));
        if (overlapsDiff) {
          score = Math.min(score, Math.max(25, word.score - 18));
          if (diff.heardPart && diff.heardPart !== "∅") {
            const hSeg = segmentWordToPhonemes(diff.heardPart, lang)[0];
            heardIpa = hSeg?.ipa ?? diff.heardPart;
            issue = `Heard as /${heardIpa}/ instead of /${seg.ipa}/`;
          } else {
            heardIpa = "∅";
            issue = `Sound /${seg.ipa}/ was dropped`;
          }
        } else {
          score = Math.min(96, Math.max(score, word.score + 12));
        }
      } else if (word.status !== "ok" && seg.sound) {
        // Known difficult sound in the language gets flagged slightly lower when the word was unclear.
        score = Math.max(35, word.score - 8);
        issue = `Watch ${seg.sound.name.toLowerCase()} (/${seg.ipa}/)`;
      }

      return {
        ipa: seg.ipa,
        score: Math.max(0, Math.min(100, Math.round(score))),
        heardIpa,
        issue,
        tip: seg.sound?.how,
      };
    });
  }

  // 3. Build detailed diagnosis and articulatory fix when the word is not fully clear.
  if (word.status === "omitted") {
    word.errorCategory ??= "Omitted word";
    word.diagnosis ??= `“${word.text}” was not detected in your recording—either skipped or spoken too softly to align.`;
    word.fix ??= `Say “${word.text}” clearly with full voice, making sure you don't rush past it between neighbouring words.`;
    return word;
  }

  const weakPhonemes = (word.phonemes ?? []).filter((p) => p.score < 78).sort((a, b) => a.score - b.score);
  const worstPhoneme = weakPhonemes[0];
  const matchedGuide =
    (worstPhoneme ? soundForIpa(lang, worstPhoneme.ipa) : undefined) ??
    segmented.find((s) => s.sound)?.sound;

  if (word.status !== "ok" || weakPhonemes.length > 0) {
    if (!word.diagnosis) {
      if (word.heard && normHeard !== normTarget) {
        const diff = diffGraphemes(word.text, word.heard, lang);
        if (worstPhoneme?.heardIpa && worstPhoneme.heardIpa !== "∅") {
          word.errorCategory ??= `Sound substitution (/${worstPhoneme.ipa}/ → /${worstPhoneme.heardIpa}/)`;
          word.diagnosis = `“${word.text}” sounded like “${word.heard}” because /${worstPhoneme.ipa}/ was pronounced as /${worstPhoneme.heardIpa}/.${matchedGuide ? ` ${matchedGuide.watch}` : ""}`;
        } else if (diff && diff.heardPart === "∅") {
          word.errorCategory ??= diff.position === "final" ? "Final sound dropped" : "Sound omitted";
          word.diagnosis = `“${word.text}” was heard as “${word.heard}” — the ${diff.position} sound “${diff.targetPart}”${worstPhoneme ? ` (/${worstPhoneme.ipa}/)` : ""} was dropped or unreleased.`;
        } else {
          const dist = levenshtein(normTarget, normHeard ?? "");
          word.errorCategory ??= dist <= 2 ? "Single-sound confusion" : "Word mispronunciation";
          word.diagnosis = `Recogniser heard “${word.heard}” instead of “${word.text}”${worstPhoneme ? `, with the main mismatch on /${worstPhoneme.ipa}/` : ""}.${matchedGuide ? ` ${matchedGuide.watch}` : ""}`;
        }
      } else if (worstPhoneme) {
        word.errorCategory ??= matchedGuide ? `${matchedGuide.name} (/${worstPhoneme.ipa}/)` : `Unclear /${worstPhoneme.ipa}/`;
        word.diagnosis = matchedGuide
          ? `The ${matchedGuide.name.toLowerCase()} /${worstPhoneme.ipa}/ in “${word.text}” was indistinct (${worstPhoneme.score}/100). ${matchedGuide.watch}`
          : `The sound /${worstPhoneme.ipa}/ in “${word.text}” lacked clarity (${worstPhoneme.score}/100).`;
      } else {
        word.errorCategory ??= "Unclear articulation";
        word.diagnosis = `“${word.text}” was understood, but the vowel and consonant transitions were slightly blurred or rushed.`;
      }
    }

    if (!word.fix) {
      if (worstPhoneme?.tip) {
        word.fix = worstPhoneme.tip;
      } else if (matchedGuide) {
        word.fix = matchedGuide.how;
      } else if (word.heard) {
        word.fix = `Slow down on “${word.text}”, exaggerate the contrast between “${word.text}” and “${word.heard}”, then repeat at normal speed.`;
      } else {
        word.fix = `Tap “Reference” to hear “${word.text}” in isolation, hold the stressed vowel slightly longer, and finish the final consonant cleanly.`;
      }
    }
  }

  return word;
}

/** Aggregate the weakest phonemes across the recording into actionable FocusSound items. */
export function extractFocusSounds(words: WordResult[], lang: string): FocusSound[] {
  const map = new Map<string, { ipa: string; scores: number[]; words: string[] }>();
  for (const w of words) {
    for (const p of w.phonemes ?? []) {
      if (p.score >= 78) continue;
      const clean = p.ipa.replace(/[ˈˌ]/g, "");
      if (!clean) continue;
      const cur = map.get(clean) ?? { ipa: clean, scores: [], words: [] };
      cur.scores.push(p.score);
      if (!cur.words.includes(w.text)) cur.words.push(w.text);
      map.set(clean, cur);
    }
  }

  return [...map.values()]
    .sort((a, b) => {
      const avgA = a.scores.reduce((s, v) => s + v, 0) / a.scores.length;
      const avgB = b.scores.reduce((s, v) => s + v, 0) / b.scores.length;
      return avgA - avgB;
    })
    .slice(0, 4)
    .map((item) => {
      const guide = soundForIpa(lang, item.ipa);
      return {
        ipa: item.ipa,
        name: guide?.name ?? `Sound /${item.ipa}/`,
        count: item.scores.length,
        tip:
          guide?.how ??
          `Practise /${item.ipa}/ slowly in ${item.words.slice(0, 3).map((w) => `“${w}”`).join(", ")}.`,
        soundId: guide?.id,
      };
    });
}
