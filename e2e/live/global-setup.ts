import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { textsFor } from "../../src/lib/languages";
import { readDotenv } from "./env";

const TMP = path.resolve(__dirname, "../.tmp");
export const LIVE_WAV = path.join(TMP, "live-speech.wav");
export const LIVE_META = path.join(TMP, "live-speech.json");

/** Real speech: one ElevenLabs TTS call (raw 16 kHz PCM) for the first built-in English intermediate sentence. */
export default async function globalSetup() {
  mkdirSync(TMP, { recursive: true });
  const sentence = textsFor("en", "intermediate")[0].text;
  const key = readDotenv().ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY missing from .env.local");
  const voice = "21m00Tcm4TlvDq8ikWAM"; // Rachel, a stock voice
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=pcm_16000`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text: sentence, model_id: "eleven_multilingual_v2" }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const pcm = Buffer.from(await res.arrayBuffer());
  const seconds = pcm.length / 32000;
  // Raw PCM -> WAV via a header, then 2 s of trailing silence so the looped fake microphone is quiet after the sentence.
  const tail = Buffer.alloc(32000 * 2);
  const data = Buffer.concat([pcm, tail]);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(LIVE_WAV, Buffer.concat([h, data]));
  writeFileSync(LIVE_META, JSON.stringify({ sentence, seconds }));
}
