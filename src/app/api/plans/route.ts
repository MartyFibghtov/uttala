import { connection } from "next/server";
import { googleEnabled } from "@/lib/server/auth";
import { hasAzure } from "@/lib/server/azure";
import { stripeEnabled } from "@/lib/server/stripe";

/** Public: which optional capabilities this deployment has switched on. */
export async function GET() {
  await connection();
  return Response.json({ billing: stripeEnabled(), phonemes: hasAzure(), google: googleEnabled() });
}
