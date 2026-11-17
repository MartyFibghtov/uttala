/**
 * Real-speech check of the scoring scale, with no human in the loop.
 *
 *   npm run realset -- [harvest|score|all] [langs...]
 *
 * Two sources:
 * - YouTube: native news broadcasts and learners in speaking-exam videos (IELTS, telc, DELE, TRKI, SFI).
 *   Each video is cut to a few minutes, transcribed with speaker labels, and split into single-speaker
 *   sentences from the dominant speaker (the candidate in an exam video). Labels are weak: a news
 *   segment is assumed native and an exam segment non-native.
 * - speechocean762 (Apache-2.0): English sentences by Mandarin speakers with expert accuracy ratings 0–10,
 *   prepared as .data/realset/so762/meta.json plus WAVs (see docs/research.md).
 *
 * Everything is cached under .data/realset (gitignored). Audio is used for evaluation only and never committed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

process.loadEnvFile(process.env.ENV_FILE ?? ".env.local");
delete process.env.VERCEL;
// Raw engine scores: this script measures where native speech lands before calibration.
process.env.SCORE_RAW = "1";

const { assess, NoSpeechError } = await import("../src/lib/server/assess");

const ROOT = ".data/realset";
const YT = `${ROOT}/yt`;
mkdirSync(YT, { recursive: true });

type Group = "native" | "learner";
const SOURCES: Record<string, Record<Group, string[]>> = {
  en: {
    native: ["BBC News at Six full bulletin", "PBS NewsHour full episode"],
    learner: ["IELTS speaking test band 6 full", "IELTS speaking test band 5 real exam"],
  },
  de: {
    native: ["tagesschau 20 Uhr ganze Sendung", "ZDF heute journal ganze Sendung"],
    learner: ["telc B1 mündliche Prüfung Beispiel", "Goethe Zertifikat B1 Sprechen Prüfung Beispiel"],
  },
  es: {
    native: ["Telediario RTVE completo", "Noticias Antena 3 completo"],
    learner: ["DELE B1 prueba oral ejemplo candidato", "DELE A2 expresión oral examen ejemplo"],
  },
  ru: {
    native: ["Новости Первый канал выпуск полностью", "Вести 20:00 выпуск полностью"],
    learner: ["ТРКИ устная часть пример иностранец", "иностранец говорит по-русски интервью"],
  },
  sv: {
    native: ["SVT Rapport hela sändningen", "Aktuellt SVT hela sändningen"],
    learner: ["SFI muntligt prov exempel", "svenska som andraspråk muntligt prov exempel"],
  },
};
const VIDEOS_PER_QUERY = 2;
const SEGMENTS_PER_VIDEO = 4;

// Run yt-dlp through uv so it uses a self-contained Python (Homebrew's can break on OpenSSL upgrades).
const YTDLP = (process.env.YTDLP ?? "uvx -q yt-dlp").split(" ");
const ytdlp = (args: string[], opts: Parameters<typeof execFileSync>[2]) =>
  execFileSync(YTDLP[0], [...YTDLP.slice(1), ...args], opts);

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

function wavFromPcm(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(16000, 24);
  h.writeUInt32LE(32000, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function search(query: string): { id: string; title: string }[] {
  const out = ytdlp(
    ["--flat-playlist", "--print", "%(id)s\t%(title)s\t%(duration)s", `ytsearch${VIDEOS_PER_QUERY * 3}:${query}`],
    { encoding: "utf8" },
  ) as string;
  return out
    .trim()
    .split("\n")
    .map((l) => l.split("\t"))
    .filter(([, , d]) => Number(d) >= 240 && Number(d) <= 4000)
    .slice(0, VIDEOS_PER_QUERY)
    .map(([id, title]) => ({ id, title }));
}

/** Minutes 1–4 of the video as 16 kHz mono PCM WAV (skips intros and title music). */
function download(id: string): string | null {
  const wav = `${YT}/${id}.wav`;
  if (existsSync(wav)) return wav;
  try {
    ytdlp(
      ["-q", "--no-warnings", "-f", "ba", "--download-sections", "*60-240", "-o", `${YT}/${id}.%(ext)s`, `https://www.youtube.com/watch?v=${id}`],
      { stdio: "ignore" },
    );
    const src = readdirSync(YT).find((f) => f.startsWith(`${id}.`) && !f.endsWith(".wav") && !f.endsWith(".json"));
    if (!src) return null;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${YT}/${src}`, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", wav]);
    return wav;
  } catch {
    return null;
  }
}

interface ScribeWord {
  text: string;
  start: number;
  end: number;
  type: string;
  speaker_id?: string;
}

async function scribe(wavPath: string, lang: string): Promise<ScribeWord[]> {
  const cache = wavPath.replace(/\.wav$/, ".scribe.json");
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("file", new Blob([new Uint8Array(readFileSync(wavPath))], { type: "audio/wav" }), "a.wav");
  form.append("language_code", lang);
  form.append("timestamps_granularity", "word");
  form.append("diarize", "true");
  form.append("tag_audio_events", "false");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
    body: form,
  });
  if (!res.ok) throw new Error(`scribe ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const words = ((await res.json()) as { words: ScribeWord[] }).words.filter((w) => w.type === "word");
  writeFileSync(cache, JSON.stringify(words));
  return words;
}

interface Segment {
  text: string;
  start: number;
  end: number;
}

/** Sentences of 5–14 words by the dominant speaker, without long pauses inside. */
function segments(words: ScribeWord[]): Segment[] {
  const time = new Map<string, number>();
  for (const w of words) time.set(w.speaker_id ?? "x", (time.get(w.speaker_id ?? "x") ?? 0) + (w.end - w.start));
  const main = [...time.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const out: Segment[] = [];
  let cur: ScribeWord[] = [];
  const flush = () => {
    const n = cur.length;
    const dur = n ? cur[n - 1].end - cur[0].start : 0;
    if (n >= 5 && n <= 14 && dur >= 2 && dur <= 9) {
      out.push({ text: cur.map((w) => w.text).join(" "), start: cur[0].start, end: cur[n - 1].end });
    }
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if ((w.speaker_id ?? "x") !== main || (prev && w.start - prev.end > 0.6)) flush();
    if ((w.speaker_id ?? "x") !== main) continue;
    cur.push(w);
    if (/[.!?…]$/.test(w.text) || cur.length >= 14) flush();
  }
  flush();
  // Spread picks across the excerpt rather than taking the first few.
  const step = Math.max(1, Math.floor(out.length / SEGMENTS_PER_VIDEO));
  return out.filter((_, i) => i % step === 0).slice(0, SEGMENTS_PER_VIDEO);
}

export function slice(wavPath: string, seg: Segment): Buffer {
  const pcm = readFileSync(wavPath).subarray(44);
  const from = Math.max(0, Math.floor((seg.start - 0.15) * 16000)) * 2;
  const to = Math.min(pcm.length, Math.ceil((seg.end + 0.25) * 16000) * 2);
  return wavFromPcm(pcm.subarray(from, to));
}

interface Scored {
  accuracy: number;
  intelligibility: number;
  depth?: string;
  words: { text: string; score: number; status: string; heard?: string; phonemes?: { ipa: string; score: number; heardIpa?: string }[] }[];
}

interface Row extends Scored {
  source: "youtube" | "so762";
  lang: string;
  group: Group;
  video?: string;
  title?: string;
  text: string;
  /** Where the clip came from, so other checks can cut the same audio. */
  start?: number;
  end?: number;
  file?: string;
  /** Expert accuracy rating 0–10 (speechocean762 only). */
  human?: number;
  humanWords?: unknown;
}

async function scoreClip(wav: Buffer, text: string, lang: string): Promise<Scored | null> {
  const cache = `${ROOT}/scores/${lang}-${hash(text + wav.length)}.json`;
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));
  mkdirSync(`${ROOT}/scores`, { recursive: true });
  const seconds = (wav.length - 44) / 32000;
  const r = await assess(new Blob([new Uint8Array(wav)], { type: "audio/wav" }), text, lang, seconds, true);
  if (r.warnings.length) return null; // an engine was unavailable; not representative
  const out: Scored = {
    accuracy: r.scores.accuracy,
    intelligibility: r.scores.intelligibility,
    depth: r.depth,
    words: r.words.map((w) => ({
      text: w.text,
      score: w.score,
      status: w.status,
      heard: w.heard,
      phonemes: w.phonemesMeasured ? w.phonemes?.map((p) => ({ ipa: p.ipa, score: p.score, heardIpa: p.heardIpa })) : undefined,
    })),
  };
  writeFileSync(cache, JSON.stringify(out));
  return out;
}

const [mode = "all", ...langArgs] = process.argv.slice(2);
const langs = langArgs.length ? langArgs : Object.keys(SOURCES);
const rows: Row[] = [];

for (const lang of langs) {
  for (const group of ["native", "learner"] as Group[]) {
    for (const query of SOURCES[lang][group]) {
      const listCache = `${YT}/search-${hash(query)}.json`;
      let found: { id: string; title: string }[];
      if (existsSync(listCache)) found = JSON.parse(readFileSync(listCache, "utf8"));
      else {
        try {
          found = search(query);
        } catch (err) {
          console.error(`search failed: ${query}: ${(err as Error).message.slice(0, 120)}`);
          continue;
        }
        writeFileSync(listCache, JSON.stringify(found));
      }
      for (const v of found) {
        const wavPath = download(v.id);
        if (!wavPath) {
          console.error(`download failed: ${v.id} ${v.title}`);
          continue;
        }
        let segs: Segment[];
        try {
          segs = segments(await scribe(wavPath, lang));
        } catch (err) {
          console.error(`transcription failed: ${v.id}: ${(err as Error).message}`);
          continue;
        }
        if (mode === "harvest") {
          console.log(`${lang} ${group} ${v.id} ${segs.length} segments  ${v.title.slice(0, 70)}`);
          continue;
        }
        for (const seg of segs) {
          try {
            const r = await scoreClip(slice(wavPath, seg), seg.text, lang);
            if (r) rows.push({ source: "youtube", lang, group, video: v.id, title: v.title, text: seg.text, start: seg.start, end: seg.end, ...r });
            process.stdout.write(".");
          } catch (err) {
            if (!(err instanceof NoSpeechError)) console.error(`\nscore failed: ${(err as Error).message}`);
          }
        }
      }
    }
  }
}

const soMeta = `${ROOT}/so762/meta.json`;
if (mode !== "harvest" && langs.includes("en") && existsSync(soMeta)) {
  const meta = JSON.parse(readFileSync(soMeta, "utf8")) as { file: string; text: string; accuracy: number; words: unknown }[];
  for (const m of meta) {
    try {
      const text = m.text.toLowerCase().replace(/(^|\s)i(?=\s|$)/g, "$1I");
      const r = await scoreClip(readFileSync(`${ROOT}/so762/${m.file}`), text, "en");
      if (r) rows.push({ source: "so762", lang: "en", group: "learner", text, file: m.file, human: m.accuracy, humanWords: m.words, ...r });
      process.stdout.write("o");
    } catch (err) {
      if (!(err instanceof NoSpeechError)) console.error(`\nso762 failed: ${(err as Error).message}`);
    }
  }
}

if (mode !== "harvest") {
  const out = `${ROOT}/rows-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`;
  writeFileSync(out, JSON.stringify(rows));
  console.log(`\n${rows.length} rows → ${out}`);
}
