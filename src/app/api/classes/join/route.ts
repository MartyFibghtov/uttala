import { getUser, unauthorized } from "@/lib/server/account";
import { joinClass } from "@/lib/server/community";

/** Join a class with the code its teacher shared. */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const joined = await joinClass(user.id, typeof body?.code === "string" ? body.code.slice(0, 20) : "");
  if ("error" in joined) return Response.json(joined, { status: 400 });
  return Response.json(joined);
}
