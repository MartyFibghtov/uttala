import { getLanguage } from "../languages";
import { LEVELS, type LevelId } from "../levels";
import { MINIMAL_PAIRS } from "../minimal-pairs";
import { isShort, SHORT, splitShort } from "../short";
import { getSound, soundForIpa, soundsFor } from "../sounds";
import { tokenize } from "../text";
import type { Attempt, GeneratedText, ListeningTally, PhonemeResult, WeakPhoneme, WeakWord } from "../types";
import { db, first, query } from "./db";

const BASE = "https://api.openai.com/v1";
const key = () => (process.env.OPENAI_API_KEY ?? "").trim();

export const hasOpenAi = () => key().length > 0;
export const openAiModel = () => process.env.OPENAI_MODEL ?? "gpt-4o";
export const openAiAudioModel = () => process.env.OPENAI_AUDIO_MODEL ?? "gpt-audio-1.5";

const NON_LATIN = new Set(["uk", "ru", "ja", "zh", "ko", "ar", "hi"]);

export type ProsodyFocus = "rhythm" | "intonation" | "fluency";

export interface WeakWordTarget {
  text: string;
  heard?: string;
  avg?: number;
}

export interface WeakSoundTarget {
  ipa: string;
  name?: string;
  how?: string;
  watch?: string;
  examples?: string[];
  avg?: number;
}

export interface WeakContrastTarget {
  contrast: string;
  pairs?: [string, string][];
  accuracy?: number;
}

export interface WeakSpotInput {
  lang: string;
  level: LevelId;
  words?: WeakWordTarget[];
  sounds?: WeakSoundTarget[];
  contrasts?: WeakContrastTarget[];
  prosody?: ProsodyFocus[];
  /** Custom weak spots, sounds, words or topic specified by the learner. */
  customFocus?: string;
  /** Texts recently practised or generated, to avoid repeating. */
  avoid?: string[];
  /** When true, use only the explicitly provided targets rather than auto-merging stored history. */
  selectedOnly?: boolean;
}

interface StoredState {
  weak?: WeakWord[];
  phonemes?: WeakPhoneme[];
  listening?: Record<string, ListeningTally>;
  attempts?: Attempt[];
}

function mean(values: (number | null | undefined)[]): number | null {
  const real = values.filter((v): v is number => typeof v === "number");
  return real.length ? Math.round(real.reduce((s, v) => s + v, 0) / real.length) : null;
}

/** Extract the learner's weak spots for `lang` from their synced account state in the database. */
export async function loadStoredWeakSpots(
  userId: string,
  lang: string,
): Promise<{
  words: WeakWordTarget[];
  sounds: WeakSoundTarget[];
  contrasts: WeakContrastTarget[];
  prosody: ProsodyFocus[];
  avoid: string[];
}> {
  const [stateRow, recentRows] = await Promise.all([
    first<{ data: string }>("SELECT data FROM user_state WHERE user_id = ?", [userId]),
    query<{ text: string }>(
      "SELECT text FROM generated_text WHERE user_id = ? AND lang = ? ORDER BY created_at DESC LIMIT 10",
      [userId, lang],
    ),
  ]);

  let parsed: StoredState = {};
  if (stateRow?.data) {
    try {
      parsed = JSON.parse(stateRow.data) as StoredState;
    } catch {
      parsed = {};
    }
  }

  const now = Date.now();
  const isDue = (w: WeakWord) => w.reviews === undefined || (w.due ?? 0) <= now;

  const words: WeakWordTarget[] = (parsed.weak ?? [])
    .filter((w) => w && w.lang === lang && typeof w.text === "string")
    .sort((a, b) => Number(isDue(b)) - Number(isDue(a)) || a.avg - b.avg)
    .slice(0, 8)
    .map((w) => ({ text: w.text, heard: w.heard, avg: w.avg }));

  const sounds: WeakSoundTarget[] = (parsed.phonemes ?? [])
    .filter((p) => p && p.lang === lang && p.avg < 85)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 5)
    .map((p) => {
      const guide = soundForIpa(lang, p.ipa);
      return {
        ipa: p.ipa,
        name: guide?.name,
        how: guide?.how,
        watch: guide?.watch,
        examples: p.examples?.length ? p.examples : guide?.words.slice(0, 4),
        avg: p.avg,
      };
    });

  const pairsForLang = MINIMAL_PAIRS[lang] ?? [];
  const contrasts: WeakContrastTarget[] = [];
  for (const [k, tally] of Object.entries(parsed.listening ?? {})) {
    if (!k.startsWith(`${lang}:`) || !tally || tally.total < 1) continue;
    const accuracy = Math.round((tally.right / tally.total) * 100);
    if (accuracy >= 85) continue;
    const contrast = k.slice(lang.length + 1);
    const matching = pairsForLang.filter((p) => p.contrast === contrast).map((p): [string, string] => [p.a, p.b]);
    contrasts.push({ contrast, pairs: matching.slice(0, 4), accuracy });
  }
  contrasts.sort((a, b) => (a.accuracy ?? 50) - (b.accuracy ?? 50));

  const attempts = (parsed.attempts ?? []).filter((a) => a && a.lang === lang).slice(0, 10);
  const prosody: ProsodyFocus[] = [];
  const rhythmAvg = mean(attempts.map((a) => a.rhythm));
  const intonationAvg = mean(attempts.map((a) => a.intonation));
  const fluencyAvg = mean(attempts.map((a) => a.fluency));
  if (rhythmAvg !== null && rhythmAvg < 75) prosody.push("rhythm");
  if (intonationAvg !== null && intonationAvg < 75) prosody.push("intonation");
  if (fluencyAvg !== null && fluencyAvg < 75) prosody.push("fluency");

  const avoid = [
    ...recentRows.map((r) => r.text),
    ...attempts.slice(0, 6).map((a) => a.text),
  ];

  return { words, sounds, contrasts: contrasts.slice(0, 3), prosody, avoid };
}

function enrichSounds(lang: string, items: WeakSoundTarget[]): WeakSoundTarget[] {
  return items.map((s) => {
    const guide = getSound(`${lang}-${s.ipa}`) ?? getSound(s.ipa) ?? soundForIpa(lang, s.ipa);
    return {
      ipa: guide?.symbol ?? s.ipa,
      name: s.name ?? guide?.name,
      how: s.how ?? guide?.how,
      watch: s.watch ?? guide?.watch,
      examples: s.examples?.length ? s.examples : guide?.words.slice(0, 5),
      avg: s.avg,
    };
  });
}

function enrichContrasts(lang: string, items: WeakContrastTarget[]): WeakContrastTarget[] {
  const allPairs = MINIMAL_PAIRS[lang] ?? [];
  return items.map((c) => {
    const matching = c.pairs?.length
      ? c.pairs
      : allPairs.filter((p) => p.contrast === c.contrast).map((p): [string, string] => [p.a, p.b]);
    return {
      contrast: c.contrast,
      pairs: matching.slice(0, 4),
      accuracy: c.accuracy,
    };
  });
}

/** Merge client-supplied weak spots with stored account weak spots and language defaults. */
export async function resolveWeakSpots(input: WeakSpotInput, userId?: string) {
  const stored = userId ? await loadStoredWeakSpots(userId, input.lang) : null;
  const hasExplicit =
    (input.words?.length ?? 0) > 0 ||
    (input.sounds?.length ?? 0) > 0 ||
    (input.contrasts?.length ?? 0) > 0 ||
    (input.prosody?.length ?? 0) > 0 ||
    Boolean(input.customFocus?.trim());

  const useStored = !input.selectedOnly || !hasExplicit;

  const wordMap = new Map<string, WeakWordTarget>();
  for (const w of [...(input.words ?? []), ...(useStored ? (stored?.words ?? []) : [])]) {
    const clean = w.text.trim();
    if (!clean) continue;
    const k = clean.toLowerCase();
    if (!wordMap.has(k)) wordMap.set(k, { text: clean, heard: w.heard, avg: w.avg });
  }
  const words = [...wordMap.values()].slice(0, 8);

  const soundMap = new Map<string, WeakSoundTarget>();
  for (const s of enrichSounds(input.lang, [...(input.sounds ?? []), ...(useStored ? (stored?.sounds ?? []) : [])])) {
    const clean = s.ipa.trim();
    if (!clean) continue;
    if (!soundMap.has(clean)) soundMap.set(clean, s);
  }
  let sounds = [...soundMap.values()].slice(0, 5);

  const contrastMap = new Map<string, WeakContrastTarget>();
  for (const c of enrichContrasts(input.lang, [
    ...(input.contrasts ?? []),
    ...(useStored ? (stored?.contrasts ?? []) : []),
  ])) {
    const clean = c.contrast.trim();
    if (!clean) continue;
    if (!contrastMap.has(clean)) contrastMap.set(clean, c);
  }
  let contrasts = [...contrastMap.values()].slice(0, 3);

  const prosody = [
    ...new Set<ProsodyFocus>([
      ...(input.prosody ?? []),
      ...(useStored ? (stored?.prosody ?? []) : []),
    ]),
  ];

  const customFocus = input.customFocus?.trim() || undefined;

  // If the learner has no recorded weak spots yet and didn't specify a custom focus,
  // target the signature difficult sounds and minimal-pair contrast for this language.
  if (!words.length && !sounds.length && !contrasts.length && !customFocus) {
    const fallbackSounds = soundsFor(input.lang).slice(0, 2);
    sounds = fallbackSounds.map((s) => ({
      ipa: s.symbol,
      name: s.name,
      how: s.how,
      watch: s.watch,
      examples: s.words.slice(0, 5),
    }));
    const firstPair = (MINIMAL_PAIRS[input.lang] ?? [])[0];
    if (firstPair) {
      contrasts = enrichContrasts(input.lang, [{ contrast: firstPair.contrast }]);
    }
  }

  const avoid = [...new Set([...(input.avoid ?? []), ...(stored?.avoid ?? [])])].slice(0, 12);

  return { words, sounds, contrasts, prosody, customFocus, avoid };
}

// Every level gets one short sentence: one idea said in one breath, so attention stays on one sound or
// one tune and the take is cheap to score. Levels differ in vocabulary and density, not in length.
const LEVEL_GUIDANCE: Record<LevelId, string> = {
  beginner: "Write ONE short, simple everyday sentence (4 to 7 words) with everyday vocabulary and simple grammar.",
  intermediate: "Write ONE short, natural everyday sentence (5 to 8 words) that a native speaker would actually say.",
  advanced:
    "Write ONE short, dense sentence (5 to 8 words) that packs the target sounds into several words, with minimal-pair contrasts side by side. A natural tongue-twister style is welcome.",
};

function buildPrompt(
  lang: string,
  level: LevelId,
  resolved: Awaited<ReturnType<typeof resolveWeakSpots>>,
): { system: string; user: string } {
  const language = getLanguage(lang);
  const needsRoman = NON_LATIN.has(lang);
  const needsMeaning = lang !== "en";

  const system = [
    `You are an expert phonetician and ${language.name} (${language.native}) pronunciation coach.`,
    `Your job is to compose ONE short, natural sentence in ${language.name} engineered to drill a learner's pronunciation weak spots, plus a few single practice words for the same sounds. Short is the point: the learner practises one thing at a time, first the words alone, then the sentence.`,
    "",
    "Strict requirements:",
    `1. The practice sentence ("text") MUST be written entirely in natural, idiomatic ${language.name} (ISO code "${lang}"). Never include phonetic brackets, IPA, markdown, bullet points, or quotation marks inside "text" because it is sent directly to a text-to-speech voice and forced speech aligner.`,
    `2. Level: ${LEVELS[level].name} (${level}). ${LEVEL_GUIDANCE[level]}`,
    `3. Hard length limit: "text" is ONE sentence of at most ${SHORT.words} words and at most ${SHORT.chars} characters. Never write two sentences.`,
    "4. Phonetic engineering rules:",
    "   - Focus: build the sentence around the ONE or TWO most important weak spots. Do not try to cover everything.",
    "   - Weak words: Include one or two of the learner's weak words if they fit naturally. If a weak word lists what the speech recogniser misheard instead (e.g. 'weather' heard as 'wetter'), include both the weak word and nearby words that exercise that exact phonetic distinction.",
    "   - Weak sounds / phonemes: Pack the sentence(s) with natural words containing those target sounds in varied syllable positions (initial, between vowels, final, or in clusters), addressing the listed common mistake.",
    "   - Weak minimal-pair contrasts: Place words from BOTH sides of the confused contrast near each other in the same sentence so the learner must actively differentiate the two sounds rather than merging them.",
    "   - Prosody weak spots: When 'rhythm' is listed, create clear contrast between stressed content words and reduced/unstressed syllables (or even syllable/mora timing as appropriate to the language). When 'intonation' is listed, use clause structure, contrast, or a question-and-answer cadence that demands clear pitch movement. When 'fluency' is listed, favour smooth word-linking without choppy parentheticals.",
    "   - Custom focus: Honour any specific weak spot, sound, words, or scenario requested by the learner.",
    needsMeaning
      ? '5. Include "meaning": a natural English translation of "text".'
      : '5. Omit "meaning" (or set to null) since the language is English.',
    needsRoman
      ? `6. Include "roman": a clean, standard romanisation of "text" to help learners read the ${language.name} script.`
      : '6. Omit "roman" (or set to null) since this language uses the Latin script.',
    '7. Include "focus": a single concise coaching sentence in English (max 160 characters) addressed directly to the learner explaining which weak spots this text drills and the #1 articulation cue to watch for.',
    '8. Include "targets": an array of 1 to 4 short strings naming the exact weak words, IPA sounds (e.g. "/θ/"), or contrasts woven into the text.',
    `9. Include "words": an array of 3 to 5 single ${language.name} words (one word each, no phrases, no punctuation) that carry the same target sounds, to drill one at a time before the sentence. Prefer common words, and put both sides of a contrast next to each other when there is one.`,
    "10. Return ONLY a valid JSON object matching the requested schema.",
  ].join("\n");

  const sections: string[] = [
    `Target language: ${language.name} (${language.native}, code "${lang}")`,
    `Learner level: ${LEVELS[level].name} (${level})`,
  ];

  if (resolved.words.length > 0) {
    sections.push(
      "Learner's weak words to include and drill:\n" +
        resolved.words
          .map(
            (w) =>
              `- "${w.text}"${w.heard ? ` (misheard by speech recogniser as "${w.heard}")` : ""}${w.avg !== undefined ? ` [avg score: ${w.avg}/100]` : ""}`,
          )
          .join("\n"),
    );
  }

  if (resolved.sounds.length > 0) {
    sections.push(
      "Learner's weak sounds / phonemes to pack into the text:\n" +
        resolved.sounds
          .map(
            (s) =>
              `- /${s.ipa}/${s.name ? ` (${s.name})` : ""}${s.avg !== undefined ? ` [avg score: ${s.avg}/100]` : ""}` +
              (s.how ? `\n  How to produce: ${s.how}` : "") +
              (s.watch ? `\n  Common mistake to counter: ${s.watch}` : "") +
              (s.examples?.length ? `\n  Example words with this sound: ${s.examples.join(", ")}` : ""),
          )
          .join("\n"),
    );
  }

  if (resolved.contrasts.length > 0) {
    sections.push(
      "Learner's weak ear/production contrasts (include words from BOTH sides of each contrast):\n" +
        resolved.contrasts
          .map(
            (c) =>
              `- Contrast ${c.contrast}${c.accuracy !== undefined ? ` [listening accuracy: ${c.accuracy}%]` : ""}` +
              (c.pairs?.length ? ` — minimal pairs: ${c.pairs.map(([a, b]) => `${a}/${b}`).join(", ")}` : ""),
          )
          .join("\n"),
    );
  }

  if (resolved.prosody.length > 0) {
    sections.push(`Prosody skills needing work: ${resolved.prosody.join(", ")}`);
  }

  if (resolved.customFocus) {
    sections.push(`Learner's specified weak spot / focus request: "${resolved.customFocus}"`);
  }

  if (resolved.avoid.length > 0) {
    sections.push(
      "Do NOT repeat or closely copy any of these recent texts:\n" +
        resolved.avoid.map((t) => `- ${t.slice(0, 140)}`).join("\n"),
    );
  }

  sections.push(
    'Respond with JSON: { "text": string, "meaning"?: string, "roman"?: string, "focus": string, "targets": string[], "words": string[] }',
  );

  return { system, user: sections.join("\n\n") };
}

function fallbackGenerate(
  lang: string,
  level: LevelId,
  resolved: Awaited<ReturnType<typeof resolveWeakSpots>>,
): Omit<GeneratedText, "id" | "at"> {
  const language = getLanguage(lang);
  const pool = level === "beginner" ? language.starter : language[level];
  const base = pool.find((t) => !resolved.avoid.includes(t)) ?? pool[0];
  const targets = [
    ...resolved.words.slice(0, 3).map((w) => w.text),
    ...resolved.sounds.slice(0, 2).map((s) => `/${s.ipa}/`),
    ...resolved.contrasts.slice(0, 1).map((c) => c.contrast),
  ];
  return {
    lang,
    level,
    text: base,
    focus: targets.length
      ? `Practise steady articulation across ${targets.join(", ")}.`
      : `Focus on clear sounds and natural ${language.name} rhythm.`,
    targets: targets.length ? targets : [language.name],
    words: drillWords(lang, [], resolved),
  };
}

/** Three to five single words to drill before the sentence: the model's own, else weak words and sound examples. */
function drillWords(
  lang: string,
  proposed: unknown,
  resolved: Awaited<ReturnType<typeof resolveWeakSpots>>,
): string[] {
  const fromModel = Array.isArray(proposed) ? proposed.map((w) => String(w)) : [];
  const fallback = [
    ...resolved.words.map((w) => w.text),
    ...resolved.sounds.flatMap((s) => s.examples ?? []),
    ...resolved.contrasts.flatMap((c) => (c.pairs ?? []).flat()),
  ];
  const out = new Map<string, string>();
  for (const w of [...fromModel, ...fallback]) {
    const tokens = tokenize(w.trim(), lang);
    if (tokens.length !== 1) continue;
    if (!out.has(tokens[0].norm)) out.set(tokens[0].norm, tokens[0].text);
    if (out.size >= 5) break;
  }
  return [...out.values()];
}

/** Generate a tailored practice text for the learner's weak spots and persist it. */
export async function generatePracticeText(input: WeakSpotInput, userId?: string): Promise<GeneratedText> {
  const resolved = await resolveWeakSpots(input, userId);
  let generated: Omit<GeneratedText, "id" | "at">;

  if (!hasOpenAi()) {
    generated = fallbackGenerate(input.lang, input.level, resolved);
  } else {
    const { system, user } = buildPrompt(input.lang, input.level, resolved);
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openAiModel(),
        temperature: 0.75,
        max_tokens: 320,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI text generation failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    let parsed: {
      text?: string;
      meaning?: string | null;
      roman?: string | null;
      focus?: string;
      targets?: string[];
      words?: string[];
    } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("OpenAI returned invalid JSON.");
    }

    let cleanText = (parsed.text ?? "").trim().replace(/^["“«]+|["”»]+$/g, "").trim();
    // Keep it to one short take even when the model overshoots. A cut sentence no longer matches
    // its translation or romanisation, so those are dropped with it.
    const overshot = cleanText.length > 0 && !isShort(cleanText, input.lang);
    if (overshot) cleanText = splitShort(cleanText, input.lang)[0]?.text ?? "";
    if (!cleanText) {
      generated = fallbackGenerate(input.lang, input.level, resolved);
    } else {
      const fallbackTargets = [
        ...resolved.words.slice(0, 3).map((w) => w.text),
        ...resolved.sounds.slice(0, 2).map((s) => `/${s.ipa}/`),
        ...resolved.contrasts.slice(0, 1).map((c) => c.contrast),
      ];
      generated = {
        lang: input.lang,
        level: input.level,
        text: cleanText.slice(0, SHORT.chars),
        meaning:
          !overshot && input.lang !== "en" && typeof parsed.meaning === "string" && parsed.meaning.trim()
            ? parsed.meaning.trim()
            : undefined,
        roman:
          !overshot && NON_LATIN.has(input.lang) && typeof parsed.roman === "string" && parsed.roman.trim()
            ? parsed.roman.trim()
            : undefined,
        focus:
          typeof parsed.focus === "string" && parsed.focus.trim()
            ? parsed.focus.trim()
            : "Designed to target your weakest words and sounds in connected speech.",
        targets:
          Array.isArray(parsed.targets) && parsed.targets.length > 0
            ? parsed.targets.map((t) => String(t).trim()).filter(Boolean).slice(0, 4)
            : fallbackTargets,
        words: drillWords(input.lang, parsed.words, resolved),
      };
    }
  }

  const item: GeneratedText = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...generated,
    at: Date.now(),
  };

  if (userId) {
    await db()
      .execute({
        sql: `INSERT INTO generated_text (id, user_id, lang, level, text, meaning, roman, focus, targets, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          item.id,
          userId,
          item.lang,
          item.level,
          item.text,
          item.meaning ?? null,
          item.roman ?? null,
          item.focus,
          JSON.stringify(item.targets),
          item.at,
        ],
      })
      .catch((err) => console.error("generated_text write failed", err));
  }

  return item;
}

export async function listGeneratedTexts(userId: string, lang: string): Promise<GeneratedText[]> {
  const rows = await query<{
    id: string;
    lang: string;
    level: LevelId;
    text: string;
    meaning: string | null;
    roman: string | null;
    focus: string;
    targets: string;
    created_at: number;
  }>(
    "SELECT id, lang, level, text, meaning, roman, focus, targets, created_at FROM generated_text WHERE user_id = ? AND lang = ? ORDER BY created_at DESC LIMIT 30",
    [userId, lang],
  );
  return rows.map((r) => {
    let targets: string[] = [];
    try {
      targets = JSON.parse(r.targets) as string[];
    } catch {
      targets = [];
    }
    return {
      id: r.id,
      lang: r.lang,
      level: r.level,
      text: r.text,
      meaning: r.meaning ?? undefined,
      roman: r.roman ?? undefined,
      focus: r.focus,
      targets,
      at: r.created_at,
    };
  });
}

/** True when a text was generated by SayClear's weak-spot generator. */
export async function isGeneratedText(lang: string, text: string): Promise<boolean> {
  const row = await first<{ id: string }>(
    "SELECT id FROM generated_text WHERE lang = ? AND text = ? LIMIT 1",
    [lang, text.trim()],
  );
  return Boolean(row);
}

export interface OpenAiWordAssessment {
  index?: number;
  text: string;
  score: number;
  errorType: string;
  expectedIpa?: string;
  heardIpa?: string;
  heard?: string;
  errorCategory?: string;
  diagnosis?: string;
  fix?: string;
  stressIssue?: string;
  phonemes: PhonemeResult[];
}

export interface OpenAiAssessment {
  overallFeedback?: string;
  words: OpenAiWordAssessment[];
}

/**
 * Multimodal phonetic & articulatory pronunciation diagnosis via OpenAI audio model.
 * Listens directly to the learner's 16 kHz WAV recording and provides phoneme-level IPA scores,
 * expected vs heard IPA, and specific articulatory instructions on what went wrong and how to fix it.
 */
export async function assessWithOpenAi(
  wav: Blob,
  text: string,
  lang: string,
): Promise<OpenAiAssessment> {
  const language = getLanguage(lang);
  const tokens = tokenize(text, lang);
  const soundGuides = soundsFor(lang)
    .slice(0, 14)
    .map((s) => `/${s.symbol}/ (${s.name}): ${s.watch}`)
    .join("; ");

  const base64Audio = Buffer.from(await wav.arrayBuffer()).toString("base64");

  const prompt = [
    `You are an expert clinical phonetician evaluating a learner speaking ${language.name} (${language.native}, code "${lang}").`,
    `Target script: "${text}"`,
    `Tokenised target words (${tokens.length}): ${tokens.map((t, i) => `[${i}] "${t.text}"`).join(", ")}`,
    soundGuides ? `Signature ${language.name} sound difficulties to listen for: ${soundGuides}` : "",
    "",
    "Listen carefully to the learner's audio recording and evaluate pronunciation against a native-speaker standard.",
    "IMPORTANT: Accept any genuine native regional dialect or variety of the language (for example Stockholm, Småland, Skåne or Gothenburg in Swedish; US, UK, Australian or Irish in English) as full native quality (95-100). Penalize only genuine non-native foreign accent interference, phoneme substitutions, wrong vowel length/quality, or unnatural stress.",
    "Do NOT inflate scores just because a word is recognizable from context.",
    "For each target word in order, provide:",
    '- "index": integer word index matching the tokenised list',
    '- "text": target word string',
    '- "score": integer 0..100 (95-100 = indistinguishable native speech including regional native dialects; 82-94 = near-native with faint accent coloration; 64-81 = understandable with a clear foreign accent or vowel/consonant drift; 38-63 = marked mispronunciation, phoneme substitution, wrong vowel length, or misplaced stress; 0-37 = severe mispronunciation, wrong word, or omitted)',
    '- "errorType": "None" | "Mispronunciation" | "Omission" | "Unclear" | "Stress" | "VowelQuality" | "ConsonantSubstitution" | "FinalConsonant" | "Tone"',
    "",
    "IMPORTANT FOR SPEED: For any word with score >= 88 and errorType \"None\", ONLY output {\"index\", \"text\", \"score\", \"errorType\"} and OMIT all other fields.",
    "ONLY for words with score < 88 (or errorType !== \"None\"), also include:",
    '- "expectedIpa": target IPA transcription without slashes (e.g. "θɪŋk")',
    '- "heardIpa": actual IPA produced by the speaker without slashes (e.g. "sɪŋk")',
    '- "heard": if it sounded like a different word, that word',
    '- "errorCategory": short label (e.g. "Voiceless th (/θ/ → /s/)")',
    '- "diagnosis": concise 1-sentence explanation of what changed acoustically/articulatorily',
    '- "fix": concise 1-sentence physical articulatory instruction (tongue, lips, jaw, voicing)',
    '- "stressIssue": optional note if syllable stress or tone was misplaced',
    '- "phonemes": array of { "ipa": string, "heardIpa"?: string, "score": integer 0..100, "issue"?: string, "tip"?: string }',
    "",
    'Also provide top-level "overallFeedback": 1-2 sentences of specific phonetic coaching.',
    'Respond with compact valid JSON ONLY, no markdown fences: { "overallFeedback": string, "words": [...] }',
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openAiAudioModel(),
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "input_audio", input_audio: { data: base64Audio, format: "wav" } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI audio assessment failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const raw = (data.choices?.[0]?.message?.content ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(raw) as {
    overallFeedback?: string;
    words?: {
      index?: number;
      text?: string;
      word?: string;
      score?: number;
      errorType?: string;
      expectedIpa?: string | null;
      heardIpa?: string | null;
      heard?: string | null;
      errorCategory?: string | null;
      diagnosis?: string | null;
      fix?: string | null;
      stressIssue?: string | null;
      phonemes?: {
        ipa?: string;
        heardIpa?: string | null;
        score?: number;
        issue?: string | null;
        tip?: string | null;
      }[];
    }[];
  };

  const normScore = (raw: unknown, fallback = 75) => {
    const n = Number(raw ?? fallback);
    if (!Number.isFinite(n)) return fallback;
    const scaled = n > 0 && n <= 1 ? n * 100 : n;
    return Math.max(0, Math.min(100, Math.round(scaled)));
  };

  return {
    overallFeedback:
      typeof parsed.overallFeedback === "string" && parsed.overallFeedback.trim()
        ? parsed.overallFeedback.trim()
        : undefined,
    words: (parsed.words ?? []).map((w, i) => {
      const wordScore = normScore(w.score, 75);
      return {
        index: typeof w.index === "number" ? w.index : i,
        text: String(w.text ?? w.word ?? tokens[i]?.text ?? ""),
        score: wordScore,
        errorType: String(w.errorType ?? "None"),
        expectedIpa: w.expectedIpa ? String(w.expectedIpa).replace(/^\/|\/$/g, "") : undefined,
        heardIpa: w.heardIpa ? String(w.heardIpa).replace(/^\/|\/$/g, "") : undefined,
        heard: w.heard ? String(w.heard) : undefined,
        errorCategory: w.errorCategory ? String(w.errorCategory) : undefined,
        diagnosis: w.diagnosis ? String(w.diagnosis) : undefined,
        fix: w.fix ? String(w.fix) : undefined,
        stressIssue: w.stressIssue ? String(w.stressIssue) : undefined,
        phonemes: (w.phonemes ?? [])
          .filter((p) => p && typeof p.ipa === "string" && p.ipa.trim().length > 0)
          .map((p) => ({
            ipa: String(p.ipa).replace(/^\/|\/$/g, "").trim(),
            heardIpa:
              p.heardIpa && String(p.heardIpa).replace(/^\/|\/$/g, "").trim() !== String(p.ipa).replace(/^\/|\/$/g, "").trim()
                ? String(p.heardIpa).replace(/^\/|\/$/g, "").trim()
                : undefined,
            score: normScore(p.score, wordScore),
            issue: p.issue ? String(p.issue) : undefined,
            tip: p.tip ? String(p.tip) : undefined,
          })),
      };
    }),
  };
}
