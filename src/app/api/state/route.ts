import { getUser, unauthorized } from "@/lib/server/account";
import { db, first } from "@/lib/server/db";

const MAX_BYTES = 600_000;

/** The learner's saved progress (history and drill list), as one document. */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const row = await first<{ data: string; updated_at: number }>(
    "SELECT data, updated_at FROM user_state WHERE user_id = ?",
    [user.id],
  );
  return Response.json(row ? { data: JSON.parse(row.data), updatedAt: row.updated_at } : { data: null, updatedAt: 0 });
}

export async function PUT(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return Response.json({ error: "Progress data is too large." }, { status: 413 });
  let data: unknown;
  try {
    data = (JSON.parse(raw) as { data?: unknown }).data;
  } catch {
    return Response.json({ error: "Invalid data." }, { status: 400 });
  }
  if (!data || typeof data !== "object") return Response.json({ error: "Invalid data." }, { status: 400 });
  const updatedAt = Date.now();
  await db().execute({
    sql: `INSERT INTO user_state (user_id, data, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [user.id, JSON.stringify(data), updatedAt],
  });
  return Response.json({ updatedAt });
}
