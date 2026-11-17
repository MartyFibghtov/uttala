/**
 * Evaluate the strict sound measures (src/lib/gop.ts) on the real-speech set, plus synthetic stress tests.
 *
 *   npm run gopcheck
 *
 * Groups:
 * - real clips from realset.mts (speechocean762 with expert ratings, YouTube natives and learners);
 * - "say-native": a macOS system voice reading in its own language (a second native, not the reference voice);
 * - "say-foreign": a macOS voice of another language reading the text with its own sound system, a stand-in
 *   for someone who cannot speak the language. These must score low.
 *
 * Logits are cached under .data/realset/logits so feature changes rerun in seconds.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { AutoFeatureExtractor, AutoModelForCTC, env } from "@huggingface/transformers";
import { nonPhoneIds, strictFeatures, type Logits } from "../src/lib/gop";

process.loadEnvFile(process.env.ENV_FILE ?? ".env.local");
delete process.env.VERCEL;
const { pickVoice, synthesize } = await import("../src/lib/server/elevenlabs");
const { compareSounds, decodeCtc } = await import("../src/lib/phone-compare");
const { timeTokens, tokenize } = await import("../src/lib/text");
const { trackPitch } = await import("../src/lib/audio");
const { compareProsody } = await import("../src/lib/prosody");
const { learnerWordSpans, soundOwners } = await import("../src/lib/deductions");
const { FRAME_SECONDS } = await import("../src/lib/phone-compare");

const ROOT = ".data/realset";
const REFS = `${ROOT}/refs`;
const LOGITS = `${ROOT}/logits`;
const SAY = `${ROOT}/say`;
for (const d of [REFS, LOGITS, SAY]) mkdirSync(d, { recursive: true });
const MODEL = "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";
env.cacheDir = `${process.env.HOME}/.cache/hf-transformers-js`;
const hash = (s: string | Buffer) => createHash("sha256").update(s).digest("hex").slice(0, 16);

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
const vocab = JSON.parse(readFileSync(`${REFS}/vocab.json`, "utf8")) as Record<string, number>;
const tokens: string[] = [];
for (const [k, v] of Object.entries(vocab)) tokens[v] = k;
const skip = nonPhoneIds(tokens);
const blank = vocab["<pad>"];

async function logitsOf(wav: Buffer): Promise<Logits> {
  const file = `${LOGITS}/${hash(wav)}.bin`;
  if (existsSync(file)) {
    const buf = readFileSync(file);
    const frames = buf.readUInt32LE(0);
    const size = buf.readUInt32LE(4);
    return { data: new Float32Array(buf.buffer.slice(buf.byteOffset + 8, buf.byteOffset + buf.length)), frames, vocab: size };
  }
  const { logits } = await model(await fe(pcmOf(wav)));
  const [, frames, size] = logits.dims as number[];
  const data = Float32Array.from(logits.data as Float32Array);
  const head = Buffer.alloc(8);
  head.writeUInt32LE(frames, 0);
  head.writeUInt32LE(size, 4);
  writeFileSync(file, Buffer.concat([head, Buffer.from(data.buffer)]));
  return { data, frames, vocab: size };
}

const voices = new Map<string, string>();
async function reference(text: string, lang: string) {
  const key = `${REFS}/${lang}-${hash(text)}`;
  if (!existsSync(`${key}.json`)) {
    console.log(`\n(new reference ${lang}: ${text.slice(0, 40)})`);
    if (!voices.has(lang)) voices.set(lang, await pickVoice(lang, "intermediate"));
    const tts = await synthesize(text, voices.get(lang)!, false, lang);
    writeFileSync(`${key}.mp3`, Buffer.from(tts.audio, "base64"));
    writeFileSync(`${key}.json`, JSON.stringify(tts.chars));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${key}.mp3`, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", `${key}.wav`]);
  }
  return { wav: readFileSync(`${key}.wav`), chars: JSON.parse(readFileSync(`${key}.json`, "utf8")) };
}

function say(voice: string, text: string): Buffer {
  const key = `${SAY}/${hash(voice + "\n" + text)}`;
  if (!existsSync(`${key}.wav`)) {
    execFileSync("say", ["-v", voice, "-o", `${key}.aiff`, text]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${key}.aiff`, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", `${key}.wav`]);
  }
  return readFileSync(`${key}.wav`);
}

const NATIVE_VOICE: Record<string, string> = { en: "Eddy (English (US))", de: "Anna", es: "Eddy (Spanish (Spain))", sv: "Alva" };
const FOREIGN_VOICES: Record<string, string[]> = {
  en: ["Eddy (Italian (Italy))", "Eddy (French (France))", "Eddy (German (Germany))"],
  de: ["Eddy (English (US))", "Eddy (Italian (Italy))"],
  es: ["Eddy (English (US))", "Eddy (French (France))"],
  sv: ["Eddy (English (US))", "Eddy (German (Germany))"],
};
const SAY_TEXTS_PER_LANG = 12;

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
  accuracy: number;
  words: { text: string; status: string }[];
}
/** Labels from the listening tool (keyed lang-video-centiseconds); they override the search-based group. */
const LABELS: Record<string, { label: string }> = existsSync(`${ROOT}/labels.json`)
  ? JSON.parse(readFileSync(`${ROOT}/labels.json`, "utf8"))
  : {};
const GROUP_OF_LABEL: Record<string, string> = { native: "native", teacher: "native", light: "light", heavy: "heavy" };
const rows = readdirSync(ROOT)
  .filter((f) => f.startsWith("rows-"))
  .flatMap((f) => JSON.parse(readFileSync(`${ROOT}/${f}`, "utf8")) as Row[]);

interface Clip {
  source: string;
  lang: string;
  group: string;
  text: string;
  human?: number;
  azure?: number;
  voice?: string;
  /** Group before relabelling. */
  was?: string;
  words?: { text: string; status: string }[];
  audio: () => Buffer;
}
const clips: Clip[] = rows.flatMap((r) => {
  const label = r.source === "youtube" ? LABELS[`${r.lang}-${r.video}-${Math.round((r.start ?? 0) * 100)}`]?.label : undefined;
  if (label === "bad") return [];
  return [{
  source: r.source,
  lang: r.lang,
  group: label ? GROUP_OF_LABEL[label] : r.group,
  was: r.group,
  words: r.words,
  text: r.text,
  human: r.human,
  azure: r.accuracy,
  audio: () =>
    r.source === "so762"
      ? readFileSync(`${ROOT}/so762/${r.file}`)
      : sliceSeconds(readFileSync(`${ROOT}/yt/${r.video}.wav`), r.start ?? 0, r.end ?? 0),
  }];
});
// The learner's own recordings: .data/realset/user/<name>.wav + <name>.json {lang, label, text}.
const USER = `${ROOT}/user`;
if (existsSync(USER))
  for (const f of readdirSync(USER).filter((f) => f.endsWith(".wav"))) {
    const name = f.slice(0, -4);
    const meta = JSON.parse(readFileSync(`${USER}/${name}.json`, "utf8"));
    const engine = existsSync(`${USER}/${name}.engine.json`) ? JSON.parse(readFileSync(`${USER}/${name}.engine.json`, "utf8")) : null;
    clips.push({
      source: "user",
      lang: meta.lang,
      group: GROUP_OF_LABEL[meta.label] ?? meta.label,
      text: meta.text,
      azure: engine?.scores.accuracy,
      words: engine?.words,
      audio: () => readFileSync(`${USER}/${f}`),
    });
  }
for (const [lang, native] of Object.entries(NATIVE_VOICE)) {
  const texts = [...new Set(rows.filter((r) => r.lang === lang).map((r) => r.text))]
    .filter((t) => t.split(/\s+/).length >= 4)
    .slice(0, SAY_TEXTS_PER_LANG);
  for (const text of texts) {
    clips.push({ source: "say", lang, group: "say-native", text, voice: native, audio: () => say(native, text) });
    for (const v of FOREIGN_VOICES[lang]) clips.push({ source: "say", lang, group: "say-foreign", text, voice: v, audio: () => say(v, text) });
  }
}

/** Times (seconds) of the reference's sounds, in the order strictFeatures uses them. */
function greedyTimes(R: Logits): number[] {
  return decodeCtc(R.data, R.frames, R.vocab, tokens).map((p) => p.t);
}

const out: unknown[] = [];
for (const c of clips) {
  try {
    const ref = await reference(c.text, c.lang);
    const [L, R] = [await logitsOf(c.audio()), await logitsOf(ref.wav)];
    const f = strictFeatures(L, R, blank, skip);
    if (!f) throw new Error("alignment failed");
    const spans = timeTokens(ref.chars, tokenize(c.text, c.lang), c.lang);
    const greedy = compareSounds(
      decodeCtc(R.data, R.frames, R.vocab, tokens),
      spans,
      decodeCtc(L.data, L.frames, L.vocab, tokens),
    );
    const { phones, spans: soundSpans, ...features } = f;
    // Evidence for deduction scoring: every expected sound with its word, the engine's word verdicts,
    // and prosody with the learner's word timings taken from the forced alignment.
    const refTimes = greedyTimes(R);
    const owners = soundOwners(refTimes, spans);
    const userSpans = learnerWordSpans(soundSpans, owners, spans.length, FRAME_SECONDS);
    const pros = compareProsody(userSpans, spans, trackPitch(pcmOf(c.audio())), trackPitch(pcmOf(ref.wav)));
    out.push({
      ...c,
      audio: undefined,
      words: undefined,
      match: greedy.match,
      ...features,
      nPhones: phones.length,
      evidence: {
        lang: c.lang,
        sounds: phones.map((p, i) => ({ word: owners[i], ref: tokens[p.id], rival: tokens[p.rival] ?? "?", lpr: Math.round(p.lpr * 100) / 100 })),
        words: c.words?.map((w) => ({ text: w.text, status: w.status })) ?? [],
        rhythm: pros.rhythm,
        intonation: pros.intonation,
        hesitations: pros.hesitations,
        pace: pros.pace,
      },
    });
    process.stdout.write(".");
  } catch (err) {
    console.error(`\n${c.lang} ${c.group} ${c.text.slice(0, 40)}: ${(err as Error).message}`);
  }
}
const file = `${ROOT}/gopcheck-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`;
writeFileSync(file, JSON.stringify(out));
console.log(`\n${out.length} clips → ${file}`);
