import { getUser, unauthorized } from "@/lib/server/account";
import { getClass, leaveOrDeleteClass } from "@/lib/server/community";

type Context = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ error: "Class not found." }, { status: 404 });

/** Roster and this week's board. Only the teacher and members can see it. */
export async function GET(request: Request, { params }: Context) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const detail = await getClass(user.id, (await params).id);
  return detail ? Response.json(detail) : notFound();
}

/** Teacher: delete the class, or remove one member with `?member=`. Member: leave. */
export async function DELETE(request: Request, { params }: Context) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const member = new URL(request.url).searchParams.get("member") ?? undefined;
  const done = await leaveOrDeleteClass(user.id, (await params).id, member);
  return done ? Response.json({ ok: true }) : notFound();
}
