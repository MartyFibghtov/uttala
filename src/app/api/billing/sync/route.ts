import { getUser, unauthorized } from "@/lib/server/account";
import { stripeEnabled, syncUser } from "@/lib/server/stripe";

/**
 * Refresh this user's plan from Stripe right after checkout, so the page
 * does not have to wait for the webhook. The webhook remains the mechanism
 * that keeps plans correct over time.
 */
const lastSync = new Map<string, number>();

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  if (stripeEnabled()) {
    // The success page polls; keep one user from hammering Stripe (per server instance).
    const now = Date.now();
    if (now - (lastSync.get(user.id) ?? 0) < 2000) return Response.json({ ok: true, throttled: true });
    lastSync.set(user.id, now);
    if (lastSync.size > 5000) lastSync.clear();
    try {
      await syncUser(user.id);
    } catch (err) {
      console.error("billing sync failed", err);
      return Response.json({ error: "Could not refresh your plan." }, { status: 502 });
    }
  }
  return Response.json({ ok: true });
}
