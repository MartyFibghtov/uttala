import { getUser, unauthorized } from "@/lib/server/account";
import { portalUrl, stripeEnabled } from "@/lib/server/stripe";

/** Link to Stripe's customer portal: change plan, update card, cancel, download invoices. */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  if (!stripeEnabled()) return Response.json({ error: "Payments are not available yet." }, { status: 503 });
  try {
    const origin = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
    return Response.json({ url: await portalUrl(user.id, origin) });
  } catch (err) {
    console.error("portal failed", err);
    return Response.json({ error: "We could not open billing. Please try again." }, { status: 502 });
  }
}
