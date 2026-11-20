import { isLanguage } from "@/lib/languages";
import { isLevel } from "@/lib/levels";
import { buildMe, getUser, saveProfile, unauthorized } from "@/lib/server/account";
import type { Profile } from "@/lib/types";

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  return Response.json(await buildMe(user), { headers: { "cache-control": "no-store" } });
}

/** Update language, level or onboarding state. */
export async function PATCH(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const patch: Partial<Profile> = {};
  if (body && "lang" in body) {
    if (!isLanguage(body.lang)) return Response.json({ error: "Unsupported language." }, { status: 400 });
    patch.lang = body.lang;
  }
  if (body && "level" in body) {
    if (!isLevel(body.level)) return Response.json({ error: "Unknown level." }, { status: 400 });
    patch.level = body.level;
  }
  if ("onboarded" in body) {
    if (typeof body.onboarded !== "boolean") return Response.json({ error: "Invalid request." }, { status: 400 });
    patch.onboarded = body.onboarded;
  }
  return Response.json(await saveProfile(user.id, patch));
}
