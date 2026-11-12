import type Stripe from "stripe";
import { ready } from "@/lib/server/auth";
import { claimEvent, handleEvent, releaseEvent, stripe, stripeEnabled } from "@/lib/server/stripe";

/** Stripe calls this whenever a subscription, payment or dispute changes. */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!stripeEnabled() || !secret) return new Response("Webhook is not configured.", { status: 503 });
  if (!signature) return new Response("Missing signature.", { status: 400 });

  let event: Stripe.Event;
  try {
    // The signature covers the exact bytes Stripe sent, so read the raw body.
    event = await stripe().webhooks.constructEventAsync(await request.text(), signature, secret);
  } catch {
    return new Response("Invalid signature.", { status: 400 });
  }

  await ready();
  if (!(await claimEvent(event.id))) return Response.json({ received: true, duplicate: true });
  try {
    await handleEvent(event);
  } catch (err) {
    // Let Stripe retry: forget that we saw this event and report failure.
    console.error(`webhook ${event.type} ${event.id} failed`, err);
    await releaseEvent(event.id);
    return new Response("Handler failed.", { status: 500 });
  }
  return Response.json({ received: true });
}
