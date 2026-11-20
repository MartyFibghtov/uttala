import { getUser, unauthorized } from "@/lib/server/account";
import { query } from "@/lib/server/db";

/** Everything we hold about the signed-in learner, as one JSON download. */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const rows = (sql: string) => query(sql, [user.id]);

  const [account, profile, subscription, usage, state, points, community, owned, member, texts] = await Promise.all([
    rows('SELECT id, name, email, "emailVerified" AS email_verified, "createdAt" AS created_at FROM user WHERE id = ?'),
    rows("SELECT lang, level, onboarded, updated_at FROM profile WHERE user_id = ?"),
    rows("SELECT plan, billing_interval, status, period_end, cancel_at_period_end, trial_used, updated_at FROM subscription WHERE user_id = ?"),
    rows("SELECT day, analyses, voice_chars FROM usage WHERE user_id = ? ORDER BY day"),
    rows("SELECT data, updated_at FROM user_state WHERE user_id = ?"),
    rows("SELECT day, points, analyses, score_sum FROM points WHERE user_id = ? ORDER BY day"),
    rows("SELECT handle, league, reminders, updated_at FROM community WHERE user_id = ?"),
    rows("SELECT id, name, code, created_at FROM classroom WHERE owner_id = ?"),
    rows("SELECT classroom_id, joined_at FROM classroom_member WHERE user_id = ?"),
    rows("SELECT id, lang, level, text, meaning, roman, focus, targets, created_at FROM generated_text WHERE user_id = ? ORDER BY created_at"),
  ]);

  let progress: unknown = null;
  const raw = (state[0] as { data?: string } | undefined)?.data;
  if (raw) {
    try {
      progress = JSON.parse(raw);
    } catch {
      progress = raw;
    }
  }

  return new Response(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        account: account[0] ?? { id: user.id, name: user.name, email: user.email },
        profile: profile[0] ?? null,
        subscription: subscription[0] ?? null,
        dailyUsage: usage,
        progress,
        points,
        community: community[0] ?? null,
        classroomsOwned: owned,
        classroomMemberships: member,
        generatedTexts: texts,
        note: "Recordings are analysed and discarded; no audio is stored.",
      },
      null,
      2,
    ),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="sayclear-data.json"',
        "cache-control": "no-store",
      },
    },
  );
}
