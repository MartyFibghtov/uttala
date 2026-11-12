import { isLanguage } from "@/lib/languages";
import { isLevel } from "@/lib/levels";
import { getAccess, getUser, unauthorized } from "@/lib/server/account";
import {
  generatePracticeText,
  listGeneratedTexts,
  type ProsodyFocus,
  type WeakContrastTarget,
  type WeakSoundTarget,
  type WeakWordTarget,
} from "@/lib/server/openai";

export const maxDuration = 60;

const VALID_PROSODY = new Set<ProsodyFocus>(["rhythm", "intonation", "fluency"]);

/** List texts previously generated for this learner's weak spots. */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") ?? "en";
  if (!isLanguage(lang)) return Response.json({ error: "Unsupported language." }, { status: 400 });
  const items = await listGeneratedTexts(user.id, lang);
  return Response.json({ items });
}

/** Generate a new practice text tailored to the learner's weak words, sounds and contrasts. */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as {
    lang?: string;
    level?: string;
    words?: WeakWordTarget[];
    sounds?: WeakSoundTarget[];
    contrasts?: WeakContrastTarget[];
    prosody?: string[];
    customFocus?: string;
    avoid?: string[];
    selectedOnly?: boolean;
  } | null;

  const lang = body?.lang ?? "";
  if (!isLanguage(lang)) {
    return Response.json({ error: "Unsupported language." }, { status: 400 });
  }

  const access = await getAccess(user.id);
  const level = isLevel(body?.level) ? body.level : access.level;

  const words = Array.isArray(body?.words)
    ? body.words
        .filter((w) => w && typeof w.text === "string" && w.text.trim().length > 0)
        .slice(0, 10)
        .map((w) => ({
          text: w.text.trim().slice(0, 60),
          heard: typeof w.heard === "string" ? w.heard.trim().slice(0, 60) : undefined,
          avg: typeof w.avg === "number" ? w.avg : undefined,
        }))
    : undefined;

  const sounds = Array.isArray(body?.sounds)
    ? body.sounds
        .filter((s) => s && typeof s.ipa === "string" && s.ipa.trim().length > 0)
        .slice(0, 8)
        .map((s) => ({
          ipa: s.ipa.trim().slice(0, 30),
          name: typeof s.name === "string" ? s.name.trim().slice(0, 80) : undefined,
          how: typeof s.how === "string" ? s.how.trim().slice(0, 300) : undefined,
          watch: typeof s.watch === "string" ? s.watch.trim().slice(0, 300) : undefined,
          examples: Array.isArray(s.examples)
            ? s.examples.filter((e): e is string => typeof e === "string").slice(0, 6)
            : undefined,
          avg: typeof s.avg === "number" ? s.avg : undefined,
        }))
    : undefined;

  const contrasts = Array.isArray(body?.contrasts)
    ? body.contrasts
        .filter((c) => c && typeof c.contrast === "string" && c.contrast.trim().length > 0)
        .slice(0, 5)
        .map((c) => ({
          contrast: c.contrast.trim().slice(0, 40),
          accuracy: typeof c.accuracy === "number" ? c.accuracy : undefined,
        }))
    : undefined;

  const prosody = Array.isArray(body?.prosody)
    ? body.prosody.filter((p): p is ProsodyFocus => VALID_PROSODY.has(p as ProsodyFocus))
    : undefined;

  const customFocus =
    typeof body?.customFocus === "string" && body.customFocus.trim().length > 0
      ? body.customFocus.trim().slice(0, 240)
      : undefined;

  const avoid = Array.isArray(body?.avoid)
    ? body.avoid.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 12)
    : undefined;

  try {
    const generated = await generatePracticeText(
      {
        lang,
        level,
        words,
        sounds,
        contrasts,
        prosody,
        customFocus,
        avoid,
        selectedOnly: Boolean(body?.selectedOnly),
      },
      user.id,
    );
    return Response.json(generated);
  } catch (err) {
    console.error("generate failed", err);
    return Response.json(
      { error: "Could not generate a practice text right now. Please try again." },
      { status: 502 },
    );
  }
}
