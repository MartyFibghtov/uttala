import { isLanguage, isLibraryText } from "@/lib/languages";
import { isLevel } from "@/lib/levels";
import { consumeVoiceChars, getAccess, getUser, unauthorized } from "@/lib/server/account";
import { cachedSpeech, hasElevenLabs, pickVoice, synthesize } from "@/lib/server/elevenlabs";
import { isGeneratedText } from "@/lib/server/openai";
import { tokenize } from "@/lib/text";

export const maxDuration = 60;

/** Reference reading of a text, with per-character timings. */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  if (!hasElevenLabs()) {
    return Response.json({ error: "The reference voice is not available right now." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as
    | { text?: string; lang?: string; voiceId?: string; level?: string }
    | null;
  const text = (body?.text ?? "").trim();
  const lang = body?.lang ?? "";
  if (!text || text.length > 600) {
    return Response.json({ error: "Text must be 1–600 characters." }, { status: 400 });
  }
  if (!isLanguage(lang)) {
    return Response.json({ error: "Unsupported language." }, { status: 400 });
  }

  const access = await getAccess(user.id);
  const { entitlements } = access;
  const singleWord = tokenize(text, lang).length === 1;
  const library = isLibraryText(lang, text) || singleWord;
  const generated = !library && (await isGeneratedText(lang, text));
  if (!library && !generated && !entitlements.customText) {
    return Response.json(
      { error: "Practising with your own text is part of Plus.", upgrade: "customText" },
      { status: 403 },
    );
  }

  try {
    const level = isLevel(body?.level) ? body.level : access.level;
    const voice = await pickVoice(lang, level, entitlements.voiceChoice ? body?.voiceId : undefined);
    const cached = await cachedSpeech(voice, text, lang);
    if (cached) return Response.json(cached);

    // Library texts are generated once and stored for everyone; other texts count against a daily allowance.
    if (!library && !generated && !(await consumeVoiceChars(user.id, text.length, entitlements.dailyVoiceChars))) {
      return Response.json(
        { error: "You have reached today's limit for new reference readings. It resets at midnight UTC." },
        { status: 429 },
      );
    }
    return Response.json(await synthesize(text, voice, library || generated, lang));
  } catch (err) {
    console.error("tts failed", err);
    return Response.json({ error: "We could not load the reference voice. Please try again." }, { status: 502 });
  }
}
