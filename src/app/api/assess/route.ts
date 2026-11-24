import { isLanguage, isLibraryText } from "@/lib/languages";
import { isLevel } from "@/lib/levels";
import { PLANS } from "@/lib/plans";
import {
  consumeAnalysis,
  consumeOnboardingAnalysis,
  getAccess,
  getUser,
  refundAnalysis,
  refundOnboardingAnalysis,
  unauthorized,
} from "@/lib/server/account";
import { assess, demoResult, NoSpeechError } from "@/lib/server/assess";
import { BodyTooLargeError, readBodyLimited } from "@/lib/server/body";
import { awardPoints } from "@/lib/server/community";
import { first } from "@/lib/server/db";
import { hasElevenLabs } from "@/lib/server/elevenlabs";
import { isGeneratedText } from "@/lib/server/openai";
import { SHORT } from "@/lib/short";
import { tokenize } from "@/lib/text";

export const maxDuration = 60;

// Practice is one word or one short sentence at a time, so takes are short and cheap to score.
// 16 kHz mono PCM is 32 kB a second; allow a second of slack over the recorder's own cut-off.
const MAX_AUDIO_BYTES = 44 + (SHORT.seconds + 1) * 32_000;
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024; // audio plus the text, language and level fields
const MAX_TEXT = SHORT.chars;

const secondsUntilUtcMidnight = () => {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
};

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  let form: FormData | null = null;
  try {
    const bytes = await readBodyLimited(request, MAX_BODY_BYTES);
    const contentType = request.headers.get("content-type");
    if (contentType) form = await new Response(bytes as BodyInit, { headers: { "content-type": contentType } }).formData().catch(() => null);
  } catch (err) {
    if (err instanceof BodyTooLargeError) return Response.json({ error: "Recording is too long." }, { status: 413 });
  }
  const audio = form?.get("audio");
  const text = String(form?.get("text") ?? "").trim();
  const lang = String(form?.get("lang") ?? "");
  const levelField = form?.get("level");
  if (levelField !== null && levelField !== undefined && !isLevel(String(levelField))) {
    return Response.json({ error: "Unsupported level." }, { status: 400 });
  }

  if (!(audio instanceof Blob) || audio.size < 1000) {
    return Response.json({ error: "No audio received." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Recording is too long." }, { status: 413 });
  }
  if (!text || text.length > MAX_TEXT) {
    return Response.json({ error: `Text must be 1–${MAX_TEXT} characters.` }, { status: 400 });
  }
  if (!isLanguage(lang)) {
    return Response.json({ error: "Unsupported language." }, { status: 400 });
  }

  const access = await getAccess(user.id);
  const { entitlements } = access;
  const countsAgainstDaily = access.onboarded;

  const singleWord = tokenize(text, lang).length === 1;
  if (!entitlements.customText && !singleWord && !isLibraryText(lang, text) && !(await isGeneratedText(lang, text))) {
    return Response.json(
      { error: "Practising with your own text is part of Plus.", upgrade: "customText" },
      { status: 403 },
    );
  }
  // Cost safety: an optional ceiling on analyses across all learners, checked before any paid engine is called.
  const globalCap = Number(process.env.GLOBAL_DAILY_ANALYSES_CAP ?? 0);
  if (globalCap > 0) {
    const total = await first<{ n: number | null }>("SELECT SUM(analyses) AS n FROM usage WHERE day = ?", [
      new Date().toISOString().slice(0, 10),
    ]);
    if (Number(total?.n ?? 0) >= globalCap) {
      return Response.json(
        {
          error:
            "SayClear is at capacity for today, so we cannot analyse more recordings right now. This one did not use your allowance. Please come back tomorrow; listening and drills still work.",
          capacity: true,
        },
        { status: 503, headers: { "Retry-After": String(secondsUntilUtcMidnight()) } },
      );
    }
  }
  if (countsAgainstDaily) {
    if (!(await consumeAnalysis(user.id, entitlements.dailyAnalyses))) {
      return Response.json(
        {
          error: `You have used all ${entitlements.dailyAnalyses} of today's recordings on the ${PLANS[access.plan].name} plan.`,
          upgrade: "limit",
        },
        { status: 429, headers: { "Retry-After": String(secondsUntilUtcMidnight()) } },
      );
    }
  } else if (!(await consumeOnboardingAnalysis(user.id))) {
    return Response.json(
      { error: "Finish your quick setup to keep recording in the app." },
      { status: 429 },
    );
  }

  // 16 kHz, 16-bit mono WAV with a 44-byte header.
  const duration = Math.max(0, (audio.size - 44) / 32000);
  const refund = () => (countsAgainstDaily ? refundAnalysis(user.id) : refundOnboardingAnalysis(user.id));

  try {
    const result = hasElevenLabs()
      ? await assess(audio, text, lang, duration, entitlements.phonemes)
      : demoResult(text, lang, duration);
    // Points for the league and class boards. Fire-and-forget so response returns immediately.
    void awardPoints(user.id, result.scores.accuracy).catch((err) => console.error("points failed", err));
    return Response.json(result);
  } catch (err) {
    if (err instanceof NoSpeechError) {
      console.warn("assess no-speech", { lang, words: tokenize(text, lang).length, duration: Math.round(duration * 10) / 10 });
      await refund();
      return Response.json({ error: err.message, noSpeech: true }, { status: 422 });
    }
    console.error("assess failed", { lang, duration: Math.round(duration * 10) / 10 }, err);
    await refund();
    return Response.json(
      {
        error:
          "The speech service did not answer, so that recording could not be analysed. It did not count against today's allowance; please try again in a moment.",
      },
      { status: 502 },
    );
  }
}
