import { connection } from "next/server";
import { query } from "@/lib/server/db";

/** Liveness and database check for the host's healthcheck. */
export async function GET() {
  await connection(); // dynamic: never prerendered at build time
  try {
    await query("SELECT 1");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
