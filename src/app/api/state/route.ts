import { getUser, unauthorized } from "@/lib/server/account";
import { BodyTooLargeError, readBodyLimited } from "@/lib/server/body";
import { db, first } from "@/lib/server/db";

const MAX_BYTES = 600_000;
const WRITES_PER_MINUTE = 60;
const writes = new Map<string, { count: number; resetAt: number }>();

/** In-memory per-user limit on saves (per server instance). */
function tooManyWrites(userId: string): boolean {
  const now = Date.now();
  if (writes.size > 5000) for (const [k, v] of writes) if (v.resetAt <= now) writes.delete(k);
  const w = writes.get(userId);
  if (!w || w.resetAt <= now) {
    writes.set(userId, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  return ++w.count > WRITES_PER_MINUTE;
}

/** The learner's saved progress (history and drill list), as one document. */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const row = await first<{ data: string; updated_at: number }>(
    "SELECT data, updated_at FROM user_state WHERE user_id = ?",
    [user.id],
  );
  let data: unknown = null;
  try {
    data = row ? JSON.parse(row.data) : null;
  } catch {
    data = null;
  }
  return Response.json(
    { data, updatedAt: data ? row?.updated_at ?? 0 : 0 },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  if (tooManyWrites(user.id)) {
    return Response.json({ error: "Too many saves. Try again in a minute." }, { status: 429, headers: { "retry-after": "60" } });
  }
  let raw: string;
  try {
    raw = new TextDecoder().decode(await readBodyLimited(request, MAX_BYTES));
  } catch (err) {
    if (err instanceof BodyTooLargeError) return Response.json({ error: "Progress data is too large." }, { status: 413 });
    return Response.json({ error: "Invalid data." }, { status: 400 });
  }
  let data: unknown;
  try {
    data = (JSON.parse(raw) as { data?: unknown }).data;
  } catch {
    return Response.json({ error: "Invalid data." }, { status: 400 });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return Response.json({ error: "Invalid data." }, { status: 400 });
  const updatedAt = Date.now();
  await db().execute({
    sql: `INSERT INTO user_state (user_id, data, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [user.id, JSON.stringify(data), updatedAt],
  });
  return Response.json({ updatedAt });
}
