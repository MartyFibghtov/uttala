import { isLanguage, isLibraryText } from "@/lib/languages";
import { PLANS } from "@/lib/plans";
import { consumeAnalysis, getAccess, getUser, refundAnalysis, unauthorized } from "@/lib/server/account";
import { assess, demoResult, NoSpeechError } from "@/lib/server/assess";
import { awardPoints } from "@/lib/server/community";
import { hasElevenLabs } from "@/lib/server/elevenlabs";
import { isGeneratedText } from "@/lib/server/openai";
import { SHORT } from "@/lib/short";
import { tokenize } from "@/lib/text";

export const maxDuration = 60;

// Practice is one word or one short sentence at a time, so takes are short and cheap to score.
// 16 kHz mono PCM is 32 kB a second; allow a second of slack over the recorder's own cut-off.
const MAX_AUDIO_BYTES = 44 + (SHORT.seconds + 1) * 32_000;
const MAX_TEXT = SHORT.chars;

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const text = String(form?.get("text") ?? "").trim();
  const lang = String(form?.get("lang") ?? "");

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

  const singleWord = tokenize(text, lang).length === 1;
  if (!entitlements.customText && !singleWord && !isLibraryText(lang, text) && !(await isGeneratedText(lang, text))) {
    return Response.json(
      { error: "Practising with your own text is part of Plus.", upgrade: "customText" },
      { status: 403 },
    );
  }
  if (!(await consumeAnalysis(user.id, entitlements.dailyAnalyses))) {
    return Response.json(
      {
        error: `You have used all ${entitlements.dailyAnalyses} of today's recordings on the ${PLANS[access.plan].name} plan.`,
        upgrade: "limit",
      },
      { status: 402 },
    );
  }

  // 16 kHz, 16-bit mono WAV with a 44-byte header.
  const duration = Math.max(0, (audio.size - 44) / 32000);

  try {
    const result = hasElevenLabs()
      ? await assess(audio, text, lang, duration, entitlements.phonemes)
      : demoResult(text, lang, duration);
    // Points for the league and class boards. Fire-and-forget so response returns immediately.
    void awardPoints(user.id, result.scores.accuracy).catch((err) => console.error("points failed", err));
    return Response.json(result);
  } catch (err) {
    if (err instanceof NoSpeechError) {
      await refundAnalysis(user.id);
      return Response.json({ error: err.message, noSpeech: true }, { status: 422 });
    }
    console.error("assess failed", err);
    await refundAnalysis(user.id);
    return Response.json(
      { error: "We could not analyse that recording. It did not count against today's allowance; please try again." },
      { status: 502 },
    );
  }
}
