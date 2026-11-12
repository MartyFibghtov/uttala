import { getUser, unauthorized } from "@/lib/server/account";
import { stripeEnabled, syncUser } from "@/lib/server/stripe";

/**
 * Refresh this user's plan from Stripe right after checkout, so the page
 * does not have to wait for the webhook. The webhook remains the mechanism
 * that keeps plans correct over time.
 */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  if (stripeEnabled()) {
    try {
      await syncUser(user.id);
    } catch (err) {
      console.error("billing sync failed", err);
      return Response.json({ error: "Could not refresh your plan." }, { status: 502 });
    }
  }
  return Response.json({ ok: true });
}
