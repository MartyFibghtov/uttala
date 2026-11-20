import { getUser, unauthorized } from "@/lib/server/account";
import { BodyTooLargeError, readBodyLimited } from "@/lib/server/body";
import { BusyError, phoneModel, runPhoneModel } from "@/lib/server/phone-model";

export const maxDuration = 60;

// 16 kHz mono: about 13 seconds is the longest take (practice is one short sentence).
const MAX_SAMPLES = 210_000;
const RATE = { windowMs: 60_000, max: 30 }; // two calls per rated recording (learner and reference)
const MAX_INFLIGHT = 2;
const inflight = new Map<string, number>();
const TIMEOUT_MS = 40_000;

const hits = new Map<string, number[]>();
function limited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE.windowMs);
  if (recent.length >= RATE.max) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE.windowMs)) hits.delete(k);
  return false;
}

/** Float32 samples from raw little-endian Float32 PCM, or from a 16 kHz mono 16-bit WAV. */
function decode(body: ArrayBuffer): Float32Array | string {
  const bytes = new Uint8Array(body);
  if (bytes.length > 4 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF") {
    const view = new DataView(body);
    let pos = 12;
    let format: { channels: number; rate: number; bits: number; tag: number } | null = null;
    while (pos + 8 <= bytes.length) {
      const id = String.fromCharCode(...bytes.subarray(pos, pos + 4));
      const size = view.getUint32(pos + 4, true);
      if (id === "fmt ") {
        format = { tag: view.getUint16(pos + 8, true), channels: view.getUint16(pos + 10, true), rate: view.getUint32(pos + 12, true), bits: view.getUint16(pos + 22, true) };
      } else if (id === "data") {
        if (!format || format.tag !== 1 || format.channels !== 1 || format.rate !== 16000 || format.bits !== 16) {
          return "WAV must be 16 kHz mono 16-bit PCM.";
        }
        const n = Math.min(size, bytes.length - pos - 8) >> 1;
        if (n > MAX_SAMPLES) return "Recording is too long.";
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) out[i] = view.getInt16(pos + 8 + i * 2, true) / 32768;
        return out;
      }
      pos += 8 + size + (size & 1);
    }
    return "No audio in the WAV file.";
  }
  if (bytes.length % 4 !== 0) return "Expected 16 kHz mono Float32 samples.";
  if (bytes.length / 4 > MAX_SAMPLES) return "Recording is too long.";
  return new Float32Array(body.slice(0));
}

/** Warm-up: loads the model if needed and returns its sound inventory. */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  try {
    const { tokens } = await phoneModel();
    return Response.json({ tokens }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return Response.json({ error: "The sound model is not available." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  if (limited(user.id)) return Response.json({ error: "Too many sound checks. Try again in a minute." }, { status: 429 });

  if ((inflight.get(user.id) ?? 0) >= MAX_INFLIGHT) {
    return Response.json({ error: "Too many sound checks at once. Try again shortly." }, { status: 429 });
  }
  inflight.set(user.id, (inflight.get(user.id) ?? 0) + 1);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let bytes: Uint8Array;
    try {
      bytes = await readBodyLimited(request, MAX_SAMPLES * 4 + 1024);
    } catch (err) {
      if (err instanceof BodyTooLargeError) return Response.json({ error: "Recording is too long." }, { status: 413 });
      return Response.json({ error: "No audio received." }, { status: 400 });
    }
    if (bytes.byteLength < 3200) return Response.json({ error: "No audio received." }, { status: 400 });
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const samples = decode(body);
    if (typeof samples === "string") return Response.json({ error: samples }, { status: samples.includes("long") ? 413 : 400 });

    const { tokens } = await phoneModel();
    const out = await Promise.race([
      runPhoneModel(samples),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
      }),
    ]);
    const data = Buffer.from(out.data.buffer, out.data.byteOffset, out.data.byteLength).toString("base64");
    return Response.json({ tokens, frames: out.frames, vocab: out.vocab, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BusyError) return Response.json({ error: "The sound model is busy. Try again shortly." }, { status: 503, headers: { "Retry-After": "5" } });
    console.error("sound-check failed:", err);
    return Response.json({ error: "The sound check failed." }, { status: 503 });
  } finally {
    clearTimeout(timer);
    const left = (inflight.get(user.id) ?? 1) - 1;
    if (left > 0) inflight.set(user.id, left);
    else inflight.delete(user.id);
  }
}
