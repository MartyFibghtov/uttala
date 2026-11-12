import { getUser, unauthorized } from "@/lib/server/account";
import { getLeague, getPrefs, listClasses, savePrefs } from "@/lib/server/community";
import type { CommunityPrefs } from "@/lib/types";

/** League standing, classes and sharing preferences for the signed-in learner. */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const [prefs, league, classes] = await Promise.all([getPrefs(user.id), getLeague(user.id), listClasses(user.id)]);
  return Response.json({ prefs, league, classes });
}

export async function PATCH(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Partial<CommunityPrefs> = {};
  if (typeof body?.handle === "string") patch.handle = body.handle.slice(0, 40);
  if (typeof body?.league === "boolean") patch.league = body.league;
  if (typeof body?.reminders === "boolean") patch.reminders = body.reminders;
  const saved = await savePrefs(user.id, patch);
  if ("error" in saved) return Response.json(saved, { status: 400 });
  return Response.json(saved);
}
