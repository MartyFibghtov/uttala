import { timingSafeEqual } from "node:crypto";
import { ready } from "@/lib/server/auth";
import { sendReminders } from "@/lib/server/community";

export const maxDuration = 60;

/**
 * Daily job: email learners who asked for reminders and have gone quiet.
 * Call it with `Authorization: Bearer $CRON_SECRET`. Disabled until the secret is set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Reminders are not configured." }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }
  await ready();
  return Response.json(await sendReminders());
}
