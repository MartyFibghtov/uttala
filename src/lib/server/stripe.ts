import Stripe from "stripe";
import { lookupKey, PAID_PLANS, parseLookupKey, TRIAL_DAYS, type Interval, type PlanId } from "../plans";
import { db, first } from "./db";

let client: Stripe | undefined;

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Payments are not configured.");
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY, {
    appInfo: { name: "SayClear" },
    maxNetworkRetries: 2,
    timeout: 20_000,
    ...apiBaseConfig(process.env.STRIPE_API_BASE),
  }));
}

/**
 * Optional STRIPE_API_BASE (e.g. http://127.0.0.1:12111) points the client at a
 * local mock server for end-to-end tests. Inert when unset or invalid.
 */
function apiBaseConfig(base: string | undefined): { protocol?: "http" | "https"; host?: string; port?: number } {
  if (!base) return {};
  try {
    const u = new URL(base);
    const protocol = u.protocol === "https:" ? "https" : "http";
    return { protocol, host: u.hostname, port: u.port ? Number(u.port) : protocol === "https" ? 443 : 80 };
  } catch {
    console.error("STRIPE_API_BASE is not a valid URL; ignoring it.");
    return {};
  }
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

/**
 * Statuses that keep paid features on. `past_due` is a grace period while Stripe retries the card.
 * Everything else (incomplete, incomplete_expired, unpaid, paused, canceled) is treated as free.
 */
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

// Fixed per release (not random per call) so idempotent replays send identical parameters.
const CHECKOUT_LABEL = "sayclear_checkout_qvhzmtrk";

/** An error whose message is safe to show to the user. */
export class BillingError extends Error {}

/**
 * One-way ledger of emails that have used a trial, so deleting the account (and its
 * Stripe customer) and re-registering does not earn a second trial. Only an HMAC of the
 * lowercased email is stored; it cannot be reversed without BETTER_AUTH_SECRET.
 */
let ledgerReady: Promise<unknown> | undefined;

async function ledger() {
  ledgerReady ??= db()
    .execute("CREATE TABLE IF NOT EXISTS trial_ledger (email_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL)")
    .catch((e) => {
      ledgerReady = undefined;
      throw e;
    });
  await ledgerReady;
}

async function emailHash(email: string): Promise<string | null> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function recordTrial(email: string | null | undefined): Promise<void> {
  try {
    const hash = email ? await emailHash(email) : null;
    if (!hash) return;
    await ledger();
    await db().execute({ sql: "INSERT OR IGNORE INTO trial_ledger (email_hash, created_at) VALUES (?, ?)", args: [hash, Date.now()] });
  } catch (err) {
    console.error("trial ledger write failed", err);
  }
}

async function recordTrialFor(customerId: string): Promise<void> {
  const c = await stripe().customers.retrieve(customerId).catch(() => null);
  if (c && !c.deleted) await recordTrial(c.email);
}

async function inLedger(email: string): Promise<boolean> {
  const hash = await emailHash(email);
  if (!hash) return false;
  await ledger();
  return !!(await first("SELECT 1 AS x FROM trial_ledger WHERE email_hash = ?", [hash]));
}

/** Cheap check for the UI (no Stripe calls): the same row and ledger rules checkout applies first. */
export async function trialOffered(trialUsed: boolean, email: string): Promise<boolean> {
  if (trialUsed) return false;
  try {
    return !(await inLedger(email));
  } catch {
    return true;
  }
}

/**
 * The free trial is once per person: not if this customer had one, and not if
 * another Stripe customer with the same email did (covers re-registering).
 */
async function trialAvailable(row: SubscriptionRow, email: string): Promise<boolean> {
  if (row.trial_used) return false;
  const emails = [...new Set([email, email.toLowerCase()])];
  // Best effort: a failed lookup must not block a sale, so it fails open.
  try {
    if (await inLedger(email)) return false;
    return await noTrialElsewhere(row, emails);
  } catch (err) {
    console.error("trial lookup failed", err);
    return true;
  }
}

async function noTrialElsewhere(row: SubscriptionRow, emails: string[]): Promise<boolean> {
  for (const e of emails) {
    const others = await stripe().customers.list({ email: e, limit: 10 });
    for (const c of others.data) {
      if (c.id === row.customer_id) continue;
      const subs = await stripe().subscriptions.list({ customer: c.id, status: "all", limit: 10 });
      if (subs.data.some((s) => s.trial_start !== null)) return false;
    }
  }
  return true;
}

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
  let row = await ensureCustomer(user);
  // Our copy may be behind the webhook; ask Stripe before deciding anything.
  await syncCustomer(row.customer_id as string);
  row = (await getSubscriptionRow(user.id)) ?? row;

  if (row.flagged) throw new BillingError("Billing is unavailable for this account. Please contact support.");
  if (planOf(row) !== "free" || row.status === "paused") return portalUrl(user.id, origin);
  if (row.status === "unpaid" && row.subscription_id) {
    // A dead subscription must not linger next to the new one.
    await stripe().subscriptions.cancel(row.subscription_id).catch(() => undefined);
  }

  const withTrial = await trialAvailable(row, user.email);
  const price = await priceId(plan, interval);
  const tax = process.env.STRIPE_AUTOMATIC_TAX === "true";
  // Double-click guard: identical requests within a minute share one Checkout Session.
  const idempotencyKey = `checkout-${user.id}-${price}-${withTrial ? "t" : "n"}-${tax ? "x" : "-"}-${Math.floor(Date.now() / 60_000)}`;

  const session = await stripe().checkout.sessions.create(
    {
      mode: "subscription",
      customer: row.customer_id as string,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      // Always collect a card up front: higher trial-to-paid conversion, and
      // Stripe can charge at trial end and send its trial-ending reminder emails.
      payment_method_collection: "always",
      subscription_data: {
        metadata: { user_id: user.id },
        ...(withTrial
          ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } } }
          : {}),
      },
      custom_text: {
        submit: {
          message: withTrial
            ? `Your ${TRIAL_DAYS}-day free trial starts today. We charge your card when it ends unless you cancel first. Cancel any time from your account.`
            : "Your subscription renews automatically. Cancel any time from your account.",
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      customer_update: { address: "auto", name: "auto" },
      ...(tax ? { automatic_tax: { enabled: true }, tax_id_collection: { enabled: true } } : {}),
      // Prices carry SEK/EUR currency_options, so Checkout localises by itself. Adaptive Pricing is opt-in.
      ...(process.env.STRIPE_ADAPTIVE_PRICING === "true" ? { adaptive_pricing: { enabled: true } } : {}),
      integration_identifier: CHECKOUT_LABEL,
      success_url: `${origin}/account?checkout=success`,
      cancel_url: `${origin}/account?checkout=cancelled`,
    },
    { idempotencyKey },
  );
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
  // Fallback for prices created by hand: the setup script names products sayclear_plus / sayclear_pro.
  const product = typeof price?.product === "string" ? price.product : price?.product?.id;
  const plan = PAID_PLANS.find((p) => product === `sayclear_${p}` || product === `uttala_${p}`);
  const every = price?.recurring?.interval;
  const interval: Interval | null = every === "month" ? "month" : every === "year" ? "year" : null;
  return { plan: plan ?? "free", interval };
}

const LIVE = new Set(["active", "trialing"]);
const RANK = ["active", "trialing", "past_due", "unpaid", "paused", "incomplete", "incomplete_expired", "canceled"];

/** Copy the customer's current subscription from Stripe into our database. Stripe is the source of truth. */
export async function syncCustomer(customerId: string): Promise<void> {
  const subs = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  // Best status first, newest first within a status (the API lists newest first and sort is stable).
  const ranked = [...subs.data].sort((a, b) => RANK.indexOf(a.status) - RANK.indexOf(b.status));
  const current = ranked[0];
  const hadTrial = subs.data.some((s) => s.trial_start !== null) ? 1 : 0;

  // Two paid subscriptions can only come from a double checkout. Keep the oldest, cancel the rest.
  const live = subs.data.filter((s) => LIVE.has(s.status)).sort((a, b) => a.created - b.created);
  for (const extra of live.slice(1)) {
    console.warn(`Duplicate subscription ${extra.id} for customer ${customerId}: cancelling it (refund manually if charged).`);
    await stripe().subscriptions.cancel(extra.id, { prorate: true }).catch((e) => console.error("cancel duplicate failed", e));
  }
  const keep = live[0] ?? current;

  if (!keep) {
    await db().execute({
      sql: `UPDATE subscription SET subscription_id = NULL, plan = 'free', billing_interval = NULL, status = NULL,
            period_end = NULL, cancel_at_period_end = 0, updated_at = ? WHERE customer_id = ?`,
      args: [Date.now(), customerId],
    });
    return;
  }
  if (hadTrial) await recordTrialFor(customerId);
  const { plan, interval } = planOfSubscription(keep);
  if (plan === "free" && LIVE.has(keep.status)) console.error(`Subscription ${keep.id} has an unrecognised price.`);
  // In current API versions the period lives on the items, not the subscription.
  const ends = keep.items.data.map((i) => i.current_period_end).filter((n) => typeof n === "number");
  await db().execute({
    sql: `UPDATE subscription SET subscription_id = ?, plan = ?, billing_interval = ?, status = ?, period_end = ?,
          cancel_at_period_end = ?, trial_used = MAX(trial_used, ?), updated_at = ? WHERE customer_id = ?`,
    args: [
      keep.id,
      plan,
      interval,
      keep.status,
      ends.length ? Math.min(...ends) : null,
      keep.cancel_at_period_end || keep.cancel_at ? 1 : 0,
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
  // Remember (as a one-way hash) that this email used a trial before its history disappears.
  if (row.trial_used) await recordTrialFor(row.customer_id);
  // Deleting a customer cancels its subscriptions immediately. Already gone counts as done.
  try {
    await stripe().customers.del(row.customer_id);
  } catch (err) {
    if ((err as { code?: string })?.code !== "resource_missing") throw err;
  }
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

/** End access now for a customer whose payment is disputed or suspected fraudulent. */
async function stopRenewals(customerId: string) {
  const subs = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  for (const s of subs.data) {
    if (["active", "trialing", "past_due", "unpaid", "paused"].includes(s.status)) {
      await stripe().subscriptions.cancel(s.id);
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
      console.warn(`Stripe dispute ${event.data.object.id} for customer ${customer}: subscription cancelled.`);
      await flag(customer);
      await stopRenewals(customer);
      await syncCustomer(customer);
      return;
    }
    case "radar.early_fraud_warning.created": {
      const customer = await customerOfCharge(event.data.object.charge);
      if (!customer) return;
      console.warn(`Stripe early fraud warning ${event.data.object.id} for customer ${customer}: subscription cancelled.`);
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

/**
 * Event dedupe. Handlers only copy Stripe's current state, so running one twice is
 * harmless; we therefore record an event only AFTER it succeeded. A crash mid-handler
 * leaves it unrecorded and Stripe's retry processes it again.
 */
export async function isProcessed(eventId: string): Promise<boolean> {
  return !!(await first<{ id: string }>("SELECT id FROM stripe_event WHERE id = ?", [eventId]));
}

export async function markProcessed(eventId: string): Promise<void> {
  await db().execute({
    sql: "INSERT OR IGNORE INTO stripe_event (id, created_at) VALUES (?, ?)",
    args: [eventId, Date.now()],
  });
  if (Math.random() < 0.01) {
    // Stripe retries for at most 3 days; keep a month.
    await db().execute({ sql: "DELETE FROM stripe_event WHERE created_at < ?", args: [Date.now() - 30 * 86_400_000] });
  }
}
