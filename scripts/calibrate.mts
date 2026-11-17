/**
 * Scoring calibration check.
 *
 * For each language, reads library sentences and single words as:
 *   - native: a native voice reads the text (should score high);
 *   - accent-XX: the text respelled the way a heavily accented XX speaker says it, written in
 *     XX spelling and read by an XX voice (should score clearly lower);
 *   - errors: the text with two or three typical learner mispronunciations respelled in, read by
 *     the native voice. The changed words are known, so we measure how many the scorer catches.
 * plus a silent clip (should be rejected as "no speech").
 * Respellings come from OpenAI once and are cached with the audio.
 * Every clip goes through the real assess() pipeline, so the numbers match production.
 *
 * Usage:
 *   pnpm calibrate                 # default languages
 *   pnpm calibrate es de           # chosen languages
 *   ENV_FILE=.env.prod pnpm calibrate
 *
 * Needs ffmpeg, ELEVENLABS_API_KEY and (for phoneme scores) AZURE_SPEECH_KEY/REGION.
 * Generated audio is cached in .data/calibration so reruns only pay for scoring.
 * Exits with code 1 when a language misses the targets below.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const envFile = process.env.ENV_FILE ?? ".env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);
delete process.env.VERCEL; // use the local database file for any cache lookups

const { assess, NoSpeechError } = await import("../src/lib/server/assess");
const { pickVoice, synthesize } = await import("../src/lib/server/elevenlabs");
const { textsFor } = await import("../src/lib/languages");
const { normalize, tokenize } = await import("../src/lib/text");
const { SCORE_SCALE } = await import("../src/lib/levels");

/** Targets a fair scorer must meet. */
const TARGET = { nativeMin: 90, accentedMax: 75, gapMin: 15, errorCatchMin: 0.7 };
const SENTENCES = 4;
const WORDS = 2;
/** Accents to simulate per target language: speakers whose first language is this. */
const ACCENTS: Record<string, string[]> = {
  en: ["ru", "es"],
  es: ["ru", "en"],
  de: ["ru", "en"],
  ru: ["en", "es"],
  sv: ["ru", "en"],
  fr: ["ru", "en"],
};
const DEFAULT_LANGS = ["en", "es", "de", "ru", "sv"];

const CACHE = ".data/calibration";
mkdirSync(CACHE, { recursive: true });

type Condition = "native" | "errors" | `accent-${string}`;
interface Row {
  lang: string;
  condition: Condition;
  text: string;
  accuracy: number;
  intelligibility: number;
  low: string[];
  /** Per-word detail so scoring variants can be compared offline without new API calls. */
  words?: { text: string; score: number; status: string; heard?: string; phonemes?: { ipa: string; score: number; heard?: string }[] }[];
  changed?: string[];
  /** For "errors": the deliberately mispronounced words and whether each was flagged. */
  caught?: [string, boolean][];
}

async function clip(spoken: string, lang: string, speakerLang: string): Promise<{ wav: Buffer; seconds: number }> {
  const id = createHash("sha256").update(`${lang}|${speakerLang}|${spoken}`).digest("hex").slice(0, 16);
  const wavPath = `${CACHE}/${lang}-${speakerLang}-${id}.wav`;
  if (!existsSync(wavPath)) {
    const voice = await pickVoice(speakerLang, "intermediate");
    const tts = await synthesize(spoken, voice, false, speakerLang);
    const src = `${CACHE}/tmp-${id}`;
    writeFileSync(src, Buffer.from(tts.audio, "base64"));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", wavPath]);
  }
  const wav = readFileSync(wavPath);
  return { wav, seconds: (wav.length - 44) / 32000 };
}

const NAMES: Record<string, string> = { en: "English", es: "Spanish", de: "German", ru: "Russian", sv: "Swedish", fr: "French" };
const RESPELL = `${CACHE}/respell.json`;
const respellCache: Record<string, { spoken: string; changed?: unknown[] }> = existsSync(RESPELL)
  ? JSON.parse(readFileSync(RESPELL, "utf8"))
  : {};

async function ask(prompt: string): Promise<{ spoken: string; changed?: unknown[] }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(data.choices[0].message.content);
}

/** The text as a heavily accented `l1` speaker pronounces it, written in `l1` spelling. */
async function accented(text: string, lang: string, l1: string): Promise<string> {
  const key = `accent|${lang}|${l1}|${text}`;
  respellCache[key] ??= await ask(
    `A beginner whose first language is ${NAMES[l1]} reads this ${NAMES[lang]} text aloud with a heavy ${NAMES[l1]} accent, ` +
      `using ${NAMES[l1]} sounds in place of ${NAMES[lang]} sounds that ${NAMES[l1]} lacks. ` +
      `Write exactly what they say, spelled in ordinary ${NAMES[l1]} spelling so that a ${NAMES[l1]} text-to-speech voice reproduces that accent. ` +
      `Keep every word, in order. Reply as JSON {"spoken": "..."}.\n\nText: ${text}`,
  );
  writeFileSync(RESPELL, JSON.stringify(respellCache, null, 1));
  return respellCache[key].spoken;
}

/** The text with two or three typical learner mispronunciations respelled in, and which words changed. */
async function withErrors(text: string, lang: string): Promise<{ spoken: string; changed: string[] }> {
  const key = `errors2|${lang}|${text}`;
  respellCache[key] ??= await ask(
    `Take this ${NAMES[lang]} text and respell two or three words (one, if it is a single word) so that a ${NAMES[lang]} ` +
      `text-to-speech voice reading the new spelling makes a clear, typical learner pronunciation mistake on exactly those words: ` +
      `a wrong vowel, a substituted consonant, or a dropped sound. The mistake must change how the word SOUNDS, not only how it is written. ` +
      `Spellings a native reader would pronounce the same way do not count (for example Russian unstressed о written as а, ` +
      `English "frends" for "friends", German "Froinde" for "Freunde", Swedish "kafe" for "kaffe", Spanish "cosinar" for "cocinar"). ` +
      `Leave every other word exactly as written. For each changed word give its IPA before and after; they must differ. ` +
      `Reply as JSON {"spoken": "<the respelled text>", "changed": [{"word": "<original spelling>", "ipaBefore": "...", "ipaAfter": "..."}]}.\n\nText: ${text}`,
  );
  writeFileSync(RESPELL, JSON.stringify(respellCache, null, 1));
  const r = respellCache[key] as unknown as { spoken: string; changed?: { word: string; ipaBefore: string; ipaAfter: string }[] };
  const changed = (r.changed ?? []).filter((c) => c.ipaBefore.replace(/[ˈˌ.]/g, "") !== c.ipaAfter.replace(/[ˈˌ.]/g, "")).map((c) => c.word);
  return { spoken: r.spoken, changed };
}

function silence(seconds: number): Buffer {
  const path = `${CACHE}/silence-${seconds}.wav`;
  if (!existsSync(path)) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", String(seconds), "-sample_fmt", "s16", path]);
  }
  return readFileSync(path);
}

async function score(lang: string, text: string, wav: Buffer, seconds: number) {
  return assess(new Blob([new Uint8Array(wav)], { type: "audio/wav" }), text, lang, seconds, true);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (n: number) => (Number.isNaN(n) ? "  – " : n.toFixed(0).padStart(4));

const langs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_LANGS;
const rows: Row[] = [];
const failures: string[] = [];
let degradedCount = 0;

for (const lang of langs) {
  const sentences = textsFor(lang, "intermediate").slice(0, SENTENCES).map((p) => p.text);
  const words = sentences
    .flatMap((s) => tokenize(s, lang).map((t) => t.text))
    .filter((w) => w.length >= 5)
    .slice(0, WORDS);
  const texts = [...sentences, ...words];
  const conditions: Condition[] = ["native", "errors", ...(ACCENTS[lang] ?? ["en"]).map((l) => `accent-${l}` as Condition)];
  const clear = SCORE_SCALE.clear;

  for (const text of texts) {
    for (const condition of conditions) {
      try {
        let spoken = text;
        let speakerLang = lang;
        let changed: string[] = [];
        if (condition === "errors") ({ spoken, changed } = await withErrors(text, lang));
        else if (condition !== "native") {
          speakerLang = condition.slice("accent-".length);
          spoken = await accented(text, lang, speakerLang);
        }
        const { wav, seconds } = await clip(spoken, lang, speakerLang);
        const r = await score(lang, text, wav, seconds);
        const changedNorm = new Set(changed.map((c) => normalize(c, lang)));
        if (r.warnings.length) {
          // An engine was unavailable; these numbers do not reflect the normal pipeline.
          degradedCount++;
          console.error(`\n${lang} ${condition} "${text.slice(0, 40)}": degraded (${r.warnings.join(" ")}) – excluded`);
          continue;
        }
        rows.push({
          lang,
          condition,
          text,
          accuracy: r.scores.accuracy,
          intelligibility: r.scores.intelligibility,
          low: r.words.filter((w) => w.score < clear).map((w) => `${w.text}:${w.score}`),
          words: r.words.map((w) => ({ text: w.text, score: w.score, status: w.status, heard: w.heard, phonemes: w.phonemes })),
          changed: condition === "errors" ? changed : undefined,
          caught:
            condition === "errors"
              ? r.words.filter((w) => changedNorm.has(normalize(w.text, lang))).map((w) => [`${w.text}:${w.score}`, w.score < clear])
              : undefined,
        });
        process.stdout.write(".");
      } catch (err) {
        console.error(`\n${lang} ${condition} "${text.slice(0, 40)}": ${(err as Error).message}`);
      }
    }
  }

  try {
    await score(lang, sentences[0], silence(2), 2);
    failures.push(`${lang}: silence was scored instead of rejected`);
  } catch (err) {
    if (!(err instanceof NoSpeechError)) failures.push(`${lang}: silence raised ${(err as Error).message}`);
  }
}

console.log("\n\nlang  condition       acc  intel   (sentences | words)");
for (const lang of langs) {
  const conditions = [...new Set(rows.filter((r) => r.lang === lang).map((r) => r.condition))];
  const isWord = (r: Row) => tokenize(r.text, lang).length === 1;
  for (const c of conditions) {
    const rs = rows.filter((r) => r.lang === lang && r.condition === c);
    console.log(
      `${lang.padEnd(5)} ${c.padEnd(14)} ${fmt(mean(rs.map((r) => r.accuracy)))} ${fmt(mean(rs.map((r) => r.intelligibility)))}   (${fmt(mean(rs.filter((r) => !isWord(r)).map((r) => r.accuracy)))} |${fmt(mean(rs.filter(isWord).map((r) => r.accuracy)))})`,
    );
  }
  const native = mean(rows.filter((r) => r.lang === lang && r.condition === "native").map((r) => r.accuracy));
  const accented = mean(rows.filter((r) => r.lang === lang && r.condition.startsWith("accent-")).map((r) => r.accuracy));
  const caught = rows.filter((r) => r.lang === lang && r.caught).flatMap((r) => r.caught ?? []);
  const catchRate = caught.length ? caught.filter(([, c]) => c).length / caught.length : NaN;
  console.log(`${lang.padEnd(5)} errors caught  ${caught.filter(([, c]) => c).length}/${caught.length}   missed: ${caught.filter(([, c]) => !c).map(([w]) => w).join(", ") || "-"}`);
  if (!(catchRate >= TARGET.errorCatchMin)) failures.push(`${lang}: caught ${(catchRate * 100).toFixed(0)}% of planted errors < ${TARGET.errorCatchMin * 100}%`);
  if (!(native >= TARGET.nativeMin)) failures.push(`${lang}: native accuracy ${native.toFixed(0)} < ${TARGET.nativeMin}`);
  if (!(accented <= TARGET.accentedMax)) failures.push(`${lang}: accented accuracy ${accented.toFixed(0)} > ${TARGET.accentedMax}`);
  if (!(native - accented >= TARGET.gapMin)) failures.push(`${lang}: native–accented gap ${(native - accented).toFixed(0)} < ${TARGET.gapMin}`);
}

const reportPath = `${CACHE}/report-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`;
writeFileSync(reportPath, JSON.stringify({ target: TARGET, rows, failures }, null, 1));
console.log(`\nDetails: ${reportPath}${degradedCount ? `  (${degradedCount} clips excluded: an engine was unavailable)` : ""}`);
if (failures.length) {
  console.log(`\nFAILED (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nAll languages within targets.");
