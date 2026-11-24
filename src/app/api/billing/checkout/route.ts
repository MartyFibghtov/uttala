import { PAID_PLANS, type Interval, type PlanId } from "@/lib/plans";
import { configuredOrigin } from "@/lib/site";
import { getUser, unauthorized } from "@/lib/server/account";
import { BillingError, checkoutUrl, stripeEnabled } from "@/lib/server/stripe";

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  if (!stripeEnabled()) return Response.json({ error: "Payments are not available yet." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { plan?: string; interval?: string } | null;
  const plan = PAID_PLANS.find((p) => p === body?.plan) as PlanId | undefined;
  const interval = body?.interval === "month" || body?.interval === "year" ? (body.interval as Interval) : undefined;
  if (!plan || !interval) return Response.json({ error: "Choose a plan first." }, { status: 400 });

  try {
    const origin = configuredOrigin(request);
    return Response.json({ url: await checkoutUrl(user, plan, interval, origin) });
  } catch (err) {
    if (err instanceof BillingError) return Response.json({ error: err.message }, { status: 403 });
    console.error("checkout failed", err);
    return Response.json({ error: "We could not start the checkout. Please try again." }, { status: 502 });
  }
}
