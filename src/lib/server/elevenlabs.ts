import { createHash } from "node:crypto";
import type { LevelId } from "../levels";
import { tokenize } from "../text";
import type { TimedChar, TtsResponse, Voice, VoiceRole } from "../types";
import { db, first } from "./db";

const BASE = process.env.ELEVENLABS_API_BASE ?? "https://api.elevenlabs.io";
const key = () => process.env.ELEVENLABS_API_KEY ?? "";

export const hasElevenLabs = () => key().length > 0;

class ElevenLabsError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function fail(res: Response, what: string): Promise<never> {
  const body = await res.text().catch(() => "");
  throw new ElevenLabsError(`ElevenLabs ${what} failed (${res.status}): ${body.slice(0, 300)}`, res.status);
}

const isTransientError = (err: unknown): boolean =>
  err instanceof ElevenLabsError ? err.status === 429 || err.status >= 500 : true;

async function retryTransient<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransientError(err)) throw err;
    await new Promise((r) => setTimeout(r, 400));
    return fn();
  }
}

const ROLE_BY_USE_CASE: Record<string, VoiceRole> = {
  conversational: "everyday",
  informative_educational: "teacher",
  narrative_story: "storyteller",
  entertainment_tv: "presenter",
  advertisement: "presenter",
  news: "presenter",
  social_media: "creator",
  characters_animation: "character",
};

/** "Max - Elearning and Documentary" -> "Max" */
const shortName = (name: string) => name.split(/\s[-–|]\s|,|\s\(/)[0].trim() || name;

const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  en: "en",
  eng: "en",
  english: "en",
  es: "es",
  spa: "es",
  spanish: "es",
  español: "es",
  espanol: "es",
  fr: "fr",
  fra: "fr",
  fre: "fr",
  french: "fr",
  français: "fr",
  francais: "fr",
  de: "de",
  deu: "de",
  ger: "de",
  german: "de",
  deutsch: "de",
  it: "it",
  ita: "it",
  italian: "it",
  italiano: "it",
  pt: "pt",
  por: "pt",
  portuguese: "pt",
  português: "pt",
  portugues: "pt",
  nl: "nl",
  nld: "nl",
  dut: "nl",
  dutch: "nl",
  nederlands: "nl",
  sv: "sv",
  swe: "sv",
  swedish: "sv",
  svenska: "sv",
  pl: "pl",
  pol: "pl",
  polish: "pl",
  polski: "pl",
  uk: "uk",
  ukr: "uk",
  ukrainian: "uk",
  ru: "ru",
  rus: "ru",
  russian: "ru",
  tr: "tr",
  tur: "tr",
  turkish: "tr",
  türkçe: "tr",
  turkce: "tr",
  ja: "ja",
  jpn: "ja",
  japanese: "ja",
  zh: "zh",
  zho: "zh",
  chi: "zh",
  cmn: "zh",
  chinese: "zh",
  mandarin: "zh",
  ko: "ko",
  kor: "ko",
  korean: "ko",
  ar: "ar",
  ara: "ar",
  arabic: "ar",
  hi: "hi",
  hin: "hi",
  hindi: "hi",
};

const ACCENT_TO_CODE: [RegExp, string][] = [
  [/\b(american|us|british|uk|english|australian|irish|scottish|welsh|canadian|new zealand|kiwi|south african|transatlantic|southern|midwestern|cockney)\b/i, "en"],
  [/\b(spanish|castilian|mexican|latin american|colombian|argentin\w*|chilean|peruvian|venezuelan|andalusian|madrid)\b/i, "es"],
  [/\b(french|parisian|quebec\w*|belgian french|swiss french)\b/i, "fr"],
  [/\b(german|austrian|swiss german|bavarian|berlin)\b/i, "de"],
  [/\b(italian|roman|milanese|tuscan|neapolitan|sicilian)\b/i, "it"],
  [/\b(portuguese|brazilian|paulista|carioca|lisbon)\b/i, "pt"],
  [/\b(dutch|flemish|netherlandic|amsterdam)\b/i, "nl"],
  [/\b(swedish|stockholm|scanian|gothenburg)\b/i, "sv"],
  [/\b(polish|warsaw|krakow)\b/i, "pl"],
  [/\b(ukrainian|kyiv|lviv)\b/i, "uk"],
  [/\b(russian|moscow|petersburg)\b/i, "ru"],
  [/\b(turkish|istanbul|ankara)\b/i, "tr"],
  [/\b(japanese|tokyo|kansai|osaka|kyoto)\b/i, "ja"],
  [/\b(chinese|mandarin|beijing|taiwan\w*|shanghai)\b/i, "zh"],
  [/\b(korean|seoul|busan)\b/i, "ko"],
  [/\b(arabic|egyptian|levantine|gulf|saudi|moroccan|lebanese|jordanian|syrian|emirati)\b/i, "ar"],
  [/\b(hindi|hindustani|delhi|mumbai)\b/i, "hi"],
];

function normalizeLangCode(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;
  if (LANGUAGE_NAME_TO_CODE[cleaned]) return LANGUAGE_NAME_TO_CODE[cleaned];
  const base = cleaned.split(/[-_]/)[0];
  if (base && LANGUAGE_NAME_TO_CODE[base]) return LANGUAGE_NAME_TO_CODE[base];
  return null;
}

function langFromAccent(accent?: string | null): string | null {
  if (!accent) return null;
  for (const [pattern, code] of ACCENT_TO_CODE) {
    if (pattern.test(accent)) return code;
  }
  return null;
}

interface VoiceMeta {
  verified: Set<string>;
  category: string;
  supportsV4: boolean;
}

let voiceCache: { at: number; voices: Voice[]; metaByVoice: Map<string, VoiceMeta> } | null = null;

export async function listVoices(): Promise<Voice[]> {
  if (voiceCache && Date.now() - voiceCache.at < 10 * 60_000) return voiceCache.voices;
  const res = await fetch(`${BASE}/v2/voices?page_size=100`, {
    headers: { "xi-api-key": key() },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) await fail(res, "voice list");
  const data = (await res.json()) as {
    voices: {
      voice_id: string;
      name: string;
      category?: string | null;
      high_quality_base_model_ids?: string[] | null;
      preview_url?: string | null;
      labels?: Record<string, string>;
      fine_tuning?: { language?: string | null } | null;
      verified_languages?: { language: string; locale?: string | null; accent?: string | null; preview_url?: string | null }[];
    }[];
  };
  // Prefer studio/professional/premade voices and exclude personal instant clones when studio voices exist,
  // since instant clones can carry poor recording quality or flat prosody.
  const nonCloned = data.voices.filter((v) => v.category !== "cloned");
  const sourceVoices = nonCloned.length > 0 ? nonCloned : data.voices;

  const metaByVoice = new Map<string, VoiceMeta>();
  const voices: Voice[] = sourceVoices.map((v) => {
    // Strictly determine the speaker's own native language. Never mark a voice as native
    // across all of its multilingual `verified_languages` entries, which carry a foreign accent.
    const nativeLang =
      normalizeLangCode(v.labels?.language) ??
      normalizeLangCode(v.fine_tuning?.language) ??
      langFromAccent(v.labels?.accent) ??
      (v.verified_languages?.length === 1 ? normalizeLangCode(v.verified_languages[0].language) : null);

    const langs = nativeLang ? [nativeLang] : [];

    const verified = new Set<string>(langs);
    for (const l of v.verified_languages ?? []) {
      const code = normalizeLangCode(l.language) ?? normalizeLangCode(l.locale);
      if (code) verified.add(code);
    }
    const hqModels = v.high_quality_base_model_ids ?? [];
    metaByVoice.set(v.voice_id, {
      verified,
      category: v.category ?? "",
      supportsV4: hqModels.some((m) => m.includes("eleven_v4")),
    });

    return {
      id: v.voice_id,
      name: shortName(v.name),
      langs,
      role: ROLE_BY_USE_CASE[v.labels?.use_case ?? ""] ?? "everyday",
      accent: v.labels?.accent,
      gender: v.labels?.gender,
      age: v.labels?.age?.replace("_", " "),
      previewUrl: v.preview_url ?? undefined,
    };
  });
  voiceCache = { at: Date.now(), voices, metaByVoice };
  return voices;
}

function voiceQualityRank(meta: VoiceMeta | undefined, lang: string): number {
  if (!meta) return 0;
  let score = 0;
  if (meta.category === "professional") score += 4;
  else if (meta.category === "premade") score += 2;
  if (meta.supportsV4) score += 2;
  if (meta.verified.has(lang)) score += 1;
  return score;
}

/**
 * The voice to use for reference speech: native to `lang` when a studio voice is available,
 * otherwise a verified multilingual studio voice, preferring clear teacher/everyday roles.
 */
export async function pickVoice(lang: string, level: LevelId, voiceId?: string): Promise<string> {
  const voices = await listVoices();
  const native = voices.filter((v) => v.langs.includes(lang));
  if (voiceId && native.some((v) => v.id === voiceId)) return voiceId;

  const metaMap = voiceCache?.metaByVoice;
  const verifiedFallback =
    native.length > 0
      ? native
      : voices.filter((v) => metaMap?.get(v.id)?.verified.has(lang));
  const pool = verifiedFallback.length ? verifiedFallback : voices;
  const rankedPool = [...pool].sort(
    (a, b) => voiceQualityRank(metaMap?.get(b.id), lang) - voiceQualityRank(metaMap?.get(a.id), lang),
  );
  const wanted: VoiceRole[] = level === "beginner" ? ["teacher", "everyday"] : ["everyday", "teacher"];
  const chosen = wanted.map((r) => rankedPool.find((v) => v.role === r)).find(Boolean) ?? rankedPool[0];
  if (!chosen) throw new Error("No voices available on this ElevenLabs account.");
  return chosen.id;
}

const memory = new Map<string, TtsResponse>();

export const ttsModel = () => process.env.ELEVENLABS_TTS_MODEL ?? "eleven_v4";

const modelSupportsLanguageCode = (model: string) =>
  model.includes("turbo_v2_5") ||
  model.includes("flash_v2_5") ||
  model.includes("v3") ||
  model.includes("v4");

const cacheKey = (voice: string, text: string, lang = "en", isolated = false) =>
  createHash("sha256")
    .update(`${isolated ? "v5" : "v4"}|${ttsModel()}|${lang}|${voice}|${text}`)
    .digest("hex");

/** Look for an already generated reading: this server's memory first, then the database. */
export async function cachedSpeech(voice: string, text: string, lang = "en"): Promise<TtsResponse | null> {
  const { isolated } = prepareTtsPrompt(text, lang);
  const k = cacheKey(voice, text, lang, isolated);
  const hit = memory.get(k);
  if (hit) return hit;
  const row = await first<{ audio: string; chars: string }>("SELECT audio, chars FROM tts_cache WHERE key = ?", [k]);
  if (!row) return null;
  const out: TtsResponse = { audio: row.audio, mime: "audio/mpeg", chars: JSON.parse(row.chars), voiceId: voice };
  remember(k, out);
  return out;
}

function remember(k: string, value: TtsResponse) {
  if (memory.size > 200) memory.delete(memory.keys().next().value as string);
  memory.set(k, value);
}

const NATIVE_CITATION_CONTEXT: Record<string, string> = {
  en: "Dictionary pronunciation guide. Speak the following standalone word clearly:",
  es: "Guía de pronunciación. Pronuncia claramente la siguiente palabra:",
  fr: "Guide de prononciation. Prononcez clairement le mot suivant :",
  de: "Ausspracheführer. Sprich das folgende Wort deutlich aus:",
  it: "Guida alla pronuncia. Pronuncia chiaramente la seguente parola:",
  pt: "Guia de pronúncia. Pronuncie claramente a seguinte palavra:",
  nl: "Uitspraakgids. Spreek het volgende woord duidelijk uit:",
  sv: "Uttalsguide. Uttala följande ord tydligt:",
  pl: "Przewodnik wymowy. Wymów wyraźnie następujące słowo:",
  uk: "Словникова вимова. Чітко вимовте наступне слово:",
  ru: "Словарь произношения. Чётко произнесите следующее слово:",
  tr: "Telaffuz rehberi. Aşağıdaki kelimeyi net bir şekilde söyleyin:",
  ja: "発音ガイド。次の単語をはっきりと発音してください：",
  zh: "发音指南。请清晰地读出以下词语：",
  ko: "발음 가이드. 다음 단어를 명확하게 발음하세요:",
  ar: "دليل النطق. انطق الكلمة التالية بوضوح:",
  hi: "उच्चारण मार्गदर्शिका। निम्नलिखित शब्द का स्पष्ट उच्चारण करें:",
};

/**
 * Prepare text for synthesis so single words / isolated drill items are spoken with
 * complete, standalone dictionary citation intonation without abbreviation expansion.
 */
function prepareTtsPrompt(text: string, lang = "en"): {
  promptText: string;
  isolated: boolean;
} {
  const trimmed = text.trim().replace(/^[,;:\-–—]+|[,;:\-–—]+$/g, "").trim() || text.trim();
  const tokens = tokenize(trimmed, lang);
  const hasTerminalPunct = /[.!?。！？।؟]$/.test(trimmed);
  const isolated = tokens.length <= 2 && (tokens.length === 1 || (!hasTerminalPunct && trimmed.length <= 24));

  if (!isolated) {
    return { promptText: text, isolated: false };
  }

  return {
    promptText: trimmed,
    isolated: true,
  };
}

/**
 * Generate reference audio with per-character timings.
 * `persist` stores the result in the database; use it for the built-in
 * library, whose size is bounded, so each text is only ever paid for once.
 */
export async function synthesize(text: string, voice: string, persist: boolean, lang = "en"): Promise<TtsResponse> {
  const { promptText, isolated } = prepareTtsPrompt(text, lang);
  const model = ttsModel();

  const payload: Record<string, unknown> = {
    text: promptText,
    model_id: model,
  };

  if (modelSupportsLanguageCode(model)) {
    payload.language_code = lang;
  }

  const isV3 = model.includes("v3");
  const supportsStyleAndBoost = model.includes("multilingual_v2");

  if (isolated) {
    // High stability and native-language prosodic framing prevent
    // rising/hanging mid-sentence intonation or foreign-accent bleed on isolated drill words.
    payload.voice_settings = {
      stability: isV3 ? 1.0 : 0.85,
      similarity_boost: 0.82,
      ...(supportsStyleAndBoost ? { style: 0.0, use_speaker_boost: true } : {}),
    };
    if (!isV3) {
      payload.previous_text = NATIVE_CITATION_CONTEXT[lang] ?? NATIVE_CITATION_CONTEXT.en;
      if (!/\d/.test(promptText)) {
        payload.apply_text_normalization = "off";
      }
    }
  } else {
    // Moderate stability gives sentences natural lexical stress, question pitch rises, and cadence
    // instead of a flat monotone reading.
    payload.voice_settings = {
      stability: isV3 ? 0.5 : 0.45,
      similarity_boost: 0.78,
      ...(supportsStyleAndBoost ? { style: 0.15, use_speaker_boost: true } : {}),
    };
  }

  const res = await fetch(
    `${BASE}/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) await fail(res, "text-to-speech");
  const data = (await res.json()) as {
    audio_base64: string;
    alignment: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    } | null;
  };
  const a = data.alignment;
  const chars: TimedChar[] = a
    ? a.characters.map((c, i) => ({
        c,
        s: a.character_start_times_seconds[i],
        e: a.character_end_times_seconds[i],
      }))
    : [];

  const out: TtsResponse = { audio: data.audio_base64, mime: "audio/mpeg", chars, voiceId: voice };
  const k = cacheKey(voice, text, lang, isolated);
  remember(k, out);
  if (persist) {
    void db()
      .execute({
        sql: "INSERT OR REPLACE INTO tts_cache (key, voice_id, audio, chars, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [k, voice, out.audio, JSON.stringify(chars), Date.now()],
      })
      .catch((err) => console.error("tts cache write failed", err));
  }
  return out;
}

export interface ForcedAlignment {
  chars: TimedChar[];
  words: { text: string; start: number; end: number; loss: number }[];
  loss: number;
}

/** Align the known target text to the learner's audio. */
export async function forcedAlign(audio: Blob, text: string): Promise<ForcedAlignment> {
  return retryTransient(async () => {
    const form = new FormData();
    form.append("file", audio, "speech.wav");
    form.append("text", text);
    const res = await fetch(`${BASE}/v1/forced-alignment`, {
      method: "POST",
      headers: { "xi-api-key": key() },
      body: form,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) await fail(res, "forced alignment");
    const data = (await res.json()) as {
      characters: { text: string; start: number; end: number }[];
      words: { text: string; start: number; end: number; loss?: number }[];
      loss?: number;
    };
    return {
      chars: data.characters.map((c) => ({ c: c.text, s: c.start, e: c.end })),
      words: data.words.map((w) => ({ ...w, loss: w.loss ?? 0 })),
      loss: data.loss ?? 0,
    };
  });
}

export interface Transcript {
  text: string;
  words: { text: string; start: number; end: number; logprob?: number }[];
}

/** Open transcription: what a listener with no script actually hears. */
export async function transcribe(audio: Blob, lang: string): Promise<Transcript> {
  return retryTransient(async () => {
    const form = new FormData();
    form.append("file", audio, "speech.wav");
    form.append("model_id", process.env.ELEVENLABS_STT_MODEL ?? "scribe_v2");
    form.append("language_code", lang);
    form.append("timestamps_granularity", "word");
    form.append("tag_audio_events", "false");
    form.append("diarize", "false");
    const res = await fetch(`${BASE}/v1/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": key() },
      body: form,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) await fail(res, "speech-to-text");
    const data = (await res.json()) as {
      text: string;
      words?: { text: string; start: number; end: number; type?: string; logprob?: number }[];
    };
    const wordItems = (data.words ?? []).filter((w) => !w.type || w.type === "word");
    const words =
      wordItems.length === 0 && data.text?.trim()
        ? tokenize(data.text, lang).map((t) => ({ text: t.text, start: 0, end: 0 }))
        : wordItems;
    return {
      text: data.text,
      words,
    };
  });
}
