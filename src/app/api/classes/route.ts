import { getUser, unauthorized } from "@/lib/server/account";
import { createClass } from "@/lib/server/community";

/** Create a class. The creator becomes its teacher. */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const created = await createClass(user.id, typeof body?.name === "string" ? body.name : "");
  if ("error" in created) return Response.json(created, { status: 400 });
  return Response.json(created);
}
