/**
 * Evaluate the sound-by-sound check (src/lib/phone-compare.ts) on the real-speech set from realset.mts.
 *
 *   npm run phonecheck [rows-file]
 *
 * For every clip: synthesise the native reference of the same text, run the multilingual phone
 * recogniser on both, compare. Writes .data/realset/phonecheck-*.json for analysis.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { AutoFeatureExtractor, AutoModelForCTC, env } from "@huggingface/transformers";

process.loadEnvFile(process.env.ENV_FILE ?? ".env.local");
delete process.env.VERCEL;

const { pickVoice, synthesize } = await import("../src/lib/server/elevenlabs");
const { timeTokens, tokenize } = await import("../src/lib/text");
const { compareSounds, decodeCtc } = await import("../src/lib/phone-compare");

const ROOT = ".data/realset";
const REFS = `${ROOT}/refs`;
mkdirSync(REFS, { recursive: true });
const MODEL = "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";
env.cacheDir = `${process.env.HOME}/.cache/hf-transformers-js`;

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

function pcmOf(wav: Buffer): Float32Array {
  const body = wav.subarray(44, wav.length - ((wav.length - 44) % 2));
  const pcm = new Int16Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.length));
  return Float32Array.from(pcm, (v) => v / 32768);
}

function sliceSeconds(wav: Buffer, start: number, end: number): Buffer {
  const pcm = wav.subarray(44);
  const from = Math.max(0, Math.floor((start - 0.15) * 16000)) * 2;
  const to = Math.min(pcm.length, Math.ceil((end + 0.25) * 16000) * 2);
  const h = Buffer.from(wav.subarray(0, 44));
  h.writeUInt32LE(36 + (to - from), 4);
  h.writeUInt32LE(to - from, 40);
  return Buffer.concat([h, pcm.subarray(from, to)]);
}

const fe = await AutoFeatureExtractor.from_pretrained(MODEL);
const model = await AutoModelForCTC.from_pretrained(MODEL, { dtype: "q4" });
const vocabPath = `${REFS}/vocab.json`;
if (!existsSync(vocabPath)) writeFileSync(vocabPath, await (await fetch(`https://huggingface.co/${MODEL}/resolve/main/vocab.json`)).text());
const vocab = JSON.parse(readFileSync(vocabPath, "utf8")) as Record<string, number>;
const tokens: string[] = [];
for (const [k, v] of Object.entries(vocab)) tokens[v] = k;

async function phones(pcm: Float32Array) {
  const inputs = await fe(pcm);
  const { logits } = await model(inputs);
  const [, frames, size] = logits.dims as number[];
  return decodeCtc(logits.data as Float32Array, frames, size, tokens);
}

const voices = new Map<string, string>();
async function reference(text: string, lang: string) {
  const key = `${REFS}/${lang}-${hash(text)}`;
  if (!existsSync(`${key}.json`)) {
    if (!voices.has(lang)) voices.set(lang, await pickVoice(lang, "intermediate"));
    const tts = await synthesize(text, voices.get(lang)!, false, lang);
    writeFileSync(`${key}.mp3`, Buffer.from(tts.audio, "base64"));
    writeFileSync(`${key}.json`, JSON.stringify(tts.chars));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${key}.mp3`, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", `${key}.wav`]);
  }
  return { wav: readFileSync(`${key}.wav`), chars: JSON.parse(readFileSync(`${key}.json`, "utf8")) };
}

interface Row {
  source: string;
  lang: string;
  group: string;
  video?: string;
  file?: string;
  start?: number;
  end?: number;
  text: string;
  human?: number;
  humanWords?: { accuracy: number }[];
  accuracy: number;
  words: { score: number }[];
}

const rowsFile =
  process.argv[2] ??
  `${ROOT}/${readdirSync(ROOT)
    .filter((f) => f.startsWith("rows-"))
    .sort()
    .pop()}`;
const rows = JSON.parse(readFileSync(rowsFile, "utf8")) as Row[];
const out: unknown[] = [];

for (const r of rows) {
  try {
    const learner =
      r.source === "so762"
        ? readFileSync(`${ROOT}/so762/${r.file}`)
        : sliceSeconds(readFileSync(`${ROOT}/yt/${r.video}.wav`), r.start ?? 0, r.end ?? 0);
    const ref = await reference(r.text, r.lang);
    const spans = timeTokens(ref.chars, tokenize(r.text, r.lang), r.lang);
    const check = compareSounds(await phones(pcmOf(ref.wav)), spans, await phones(pcmOf(learner)));
    out.push({
      source: r.source,
      lang: r.lang,
      group: r.group,
      text: r.text,
      human: r.human,
      humanWords: r.humanWords?.map((w) => w.accuracy),
      azure: r.accuracy,
      azureWords: r.words.map((w) => w.score),
      match: check.match,
      words: check.words.map((w) => ({ match: w.match, ref: w.ref.join(""), heard: w.heard.join(""), issues: w.issues })),
    });
    process.stdout.write(".");
  } catch (err) {
    console.error(`\n${r.lang} ${r.text.slice(0, 40)}: ${(err as Error).message}`);
  }
}

const file = `${ROOT}/phonecheck-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`;
writeFileSync(file, JSON.stringify(out));
console.log(`\n${out.length} clips → ${file}`);
