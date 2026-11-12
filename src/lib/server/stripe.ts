import Stripe from "stripe";
import { lookupKey, PAID_PLANS, parseLookupKey, TRIAL_DAYS, type Interval, type PlanId } from "../plans";
import { db, first } from "./db";

let client: Stripe | undefined;

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Payments are not configured.");
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY, { appInfo: { name: "Uttala" } }));
}

export interface SubscriptionRow {
  user_id: string;
  customer_id: string | null;
  subscription_id: string | null;
  plan: PlanId;
  billing_interval: Interval | null;
  status: string | null;
  period_end: number | null;
  cancel_at_period_end: number;
  trial_used: number;
  flagged: number;
}

export const getSubscriptionRow = (userId: string) =>
  first<SubscriptionRow>("SELECT * FROM subscription WHERE user_id = ?", [userId]);

/** Statuses that keep paid features on. `past_due` is a grace period while Stripe retries the card. */
const ENTITLED = new Set(["active", "trialing", "past_due"]);

export function planOf(row: SubscriptionRow | undefined): PlanId {
  return row && row.status && ENTITLED.has(row.status) ? row.plan : "free";
}

let priceCache: { at: number; ids: Map<string, string> } | null = null;

async function priceId(plan: PlanId, interval: Interval): Promise<string> {
  if (!priceCache || Date.now() - priceCache.at > 10 * 60_000) {
    const keys = PAID_PLANS.flatMap((p) => [lookupKey(p, "month"), lookupKey(p, "year")]);
    const prices = await stripe().prices.list({ lookup_keys: keys, active: true, limit: 20 });
    priceCache = {
      at: Date.now(),
      ids: new Map(prices.data.flatMap((p) => (p.lookup_key ? [[p.lookup_key, p.id] as const] : []))),
    };
  }
  const id = priceCache.ids.get(lookupKey(plan, interval));
  if (!id) throw new Error(`No Stripe price found for ${lookupKey(plan, interval)}. Run "pnpm stripe:setup".`);
  return id;
}

/** Find or create the Stripe customer that belongs to this user. */
async function ensureCustomer(user: { id: string; email: string; name: string }): Promise<SubscriptionRow> {
  const existing = await getSubscriptionRow(user.id);
  if (existing?.customer_id) return existing;
  const customer = await stripe().customers.create(
    { email: user.email, name: user.name || undefined, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await db().execute({
    sql: `INSERT INTO subscription (user_id, customer_id, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET customer_id = excluded.customer_id, updated_at = excluded.updated_at`,
    args: [user.id, customer.id, Date.now()],
  });
  return (await getSubscriptionRow(user.id)) as SubscriptionRow;
}

const randomLetters = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => String.fromCharCode(97 + (b % 26))).join("");

/**
 * Where to send the user to pay. People who already subscribe go to the
 * billing portal instead, so nobody ends up with two subscriptions.
 */
export async function checkoutUrl(
  user: { id: string; email: string; name: string },
  plan: PlanId,
  interval: Interval,
  origin: string,
): Promise<string> {
  const row = await ensureCustomer(user);
  if (planOf(row) !== "free") return portalUrl(user.id, origin);

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: row.customer_id as string,
    line_items: [{ price: await priceId(plan, interval), quantity: 1 }],
    subscription_data: row.trial_used ? {} : { trial_period_days: TRIAL_DAYS },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    customer_update: { address: "auto", name: "auto" },
    ...(process.env.STRIPE_AUTOMATIC_TAX === "true" ? { automatic_tax: { enabled: true } } : {}),
    integration_identifier: `uttala_checkout_${randomLetters(8)}`,
    success_url: `${origin}/account?checkout=success`,
    cancel_url: `${origin}/account?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout link.");
  return session.url;
}

export async function portalUrl(userId: string, origin: string): Promise<string> {
  const row = await getSubscriptionRow(userId);
  if (!row?.customer_id) throw new Error("There is no billing account for this user yet.");
  const session = await stripe().billingPortal.sessions.create({
    customer: row.customer_id,
    return_url: `${origin}/account`,
    ...(process.env.STRIPE_PORTAL_CONFIGURATION ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION } : {}),
  });
  return session.url;
}

function planOfSubscription(sub: Stripe.Subscription): { plan: PlanId; interval: Interval | null } {
  const price = sub.items.data[0]?.price;
  const byKey = parseLookupKey(price?.lookup_key);
  if (byKey) return byKey;
  // Fallback for prices created by hand: the setup script names products uttala_plus / uttala_pro.
  const product = typeof price?.product === "string" ? price.product : price?.product?.id;
  const plan = PAID_PLANS.find((p) => product === `uttala_${p}`);
  const every = price?.recurring?.interval;
  const interval: Interval | null = every === "month" ? "month" : every === "year" ? "year" : null;
  return { plan: plan ?? "free", interval };
}

/** Copy the customer's current subscription from Stripe into our database. Stripe is the source of truth. */
export async function syncCustomer(customerId: string): Promise<void> {
  const subs = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  const current =
    subs.data.find((s) => s.status === "active" || s.status === "trialing") ??
    subs.data.find((s) => s.status === "past_due") ??
    subs.data[0];
  const hadTrial = subs.data.some((s) => s.trial_start !== null) ? 1 : 0;

  if (!current) {
    await db().execute({
      sql: `UPDATE subscription SET subscription_id = NULL, plan = 'free', billing_interval = NULL, status = NULL,
            period_end = NULL, cancel_at_period_end = 0, updated_at = ? WHERE customer_id = ?`,
      args: [Date.now(), customerId],
    });
    return;
  }
  const { plan, interval } = planOfSubscription(current);
  const item = current.items.data[0];
  await db().execute({
    sql: `UPDATE subscription SET subscription_id = ?, plan = ?, billing_interval = ?, status = ?, period_end = ?,
          cancel_at_period_end = ?, trial_used = MAX(trial_used, ?), updated_at = ? WHERE customer_id = ?`,
    args: [
      current.id,
      plan,
      interval,
      current.status,
      item?.current_period_end ?? null,
      current.cancel_at_period_end || current.cancel_at ? 1 : 0,
      hadTrial,
      Date.now(),
      customerId,
    ],
  });
}

export async function syncUser(userId: string): Promise<void> {
  const row = await getSubscriptionRow(userId);
  if (row?.customer_id) await syncCustomer(row.customer_id);
}

/** Cancel everything and delete the Stripe customer when an account is deleted. */
export async function deleteCustomerFor(userId: string): Promise<void> {
  const row = await getSubscriptionRow(userId);
  if (!row?.customer_id || !stripeEnabled()) return;
  // Deleting a customer cancels its subscriptions immediately.
  await stripe().customers.del(row.customer_id);
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

async function customerOfCharge(charge: string | Stripe.Charge | null): Promise<string | null> {
  if (!charge) return null;
  const full = typeof charge === "string" ? await stripe().charges.retrieve(charge) : charge;
  return idOf(full.customer);
}

async function flag(customerId: string) {
  await db().execute({
    sql: "UPDATE subscription SET flagged = 1, updated_at = ? WHERE customer_id = ?",
    args: [Date.now(), customerId],
  });
}

/** Stop future renewals for a customer whose payment is disputed or suspected fraudulent. */
async function stopRenewals(customerId: string) {
  const subs = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  for (const s of subs.data) {
    if (["active", "trialing", "past_due"].includes(s.status) && !s.cancel_at_period_end) {
      await stripe().subscriptions.update(s.id, { cancel_at_period_end: true });
    }
  }
}

/** Events the webhook endpoint must be subscribed to. */
export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "radar.early_fraud_warning.created",
  "customer.deleted",
] as const;

/** Apply one verified webhook event. Safe to run more than once for the same event. */
export async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "invoice.paid":
    case "invoice.payment_failed": {
      const customer = idOf(event.data.object.customer);
      if (customer) await syncCustomer(customer);
      return;
    }
    case "charge.refunded": {
      const customer = idOf(event.data.object.customer);
      if (customer) await syncCustomer(customer);
      return;
    }
    case "charge.dispute.created": {
      const customer = await customerOfCharge(event.data.object.charge);
      if (!customer) return;
      console.warn(`Stripe dispute ${event.data.object.id} for customer ${customer}: renewals stopped.`);
      await flag(customer);
      await stopRenewals(customer);
      await syncCustomer(customer);
      return;
    }
    case "radar.early_fraud_warning.created": {
      const customer = await customerOfCharge(event.data.object.charge);
      if (!customer) return;
      console.warn(`Stripe early fraud warning ${event.data.object.id} for customer ${customer}: renewals stopped.`);
      await flag(customer);
      await stopRenewals(customer);
      await syncCustomer(customer);
      return;
    }
    case "customer.deleted": {
      await db().execute({
        sql: `UPDATE subscription SET customer_id = NULL, subscription_id = NULL, plan = 'free', status = NULL,
              billing_interval = NULL, period_end = NULL, cancel_at_period_end = 0, updated_at = ? WHERE customer_id = ?`,
        args: [Date.now(), event.data.object.id],
      });
      return;
    }
    default:
      return;
  }
}

/** Returns false when this event was already processed. */
export async function claimEvent(eventId: string): Promise<boolean> {
  const res = await db().execute({
    sql: "INSERT OR IGNORE INTO stripe_event (id, created_at) VALUES (?, ?)",
    args: [eventId, Date.now()],
  });
  return res.rowsAffected > 0;
}

export async function releaseEvent(eventId: string): Promise<void> {
  await db().execute({ sql: "DELETE FROM stripe_event WHERE id = ?", args: [eventId] });
}
