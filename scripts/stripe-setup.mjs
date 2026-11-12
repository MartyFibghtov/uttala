// Creates (or updates) the Stripe products, prices, billing portal settings and,
// optionally, the webhook endpoint that Uttala needs. Safe to run repeatedly.
//
//   pnpm stripe:setup                                  products, prices, portal
//   pnpm stripe:setup --webhook https://your.site      also registers the webhook
//
// Reads STRIPE_SECRET_KEY from the environment or .env.local. Run it once against
// a sandbox and once against live mode.
//
// Keep the amounts and event list in sync with src/lib/plans.ts and
// WEBHOOK_EVENTS in src/lib/server/stripe.ts.

import { existsSync, readFileSync } from "node:fs";
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^\s*(STRIPE_SECRET_KEY)\s*=\s*(.+?)\s*$/.exec(line);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY (in .env.local or the environment) first.");
  process.exit(1);
}
const stripe = new Stripe(key);
const live = key.includes("_live_");
console.log(`Stripe ${live ? "LIVE" : "test"} mode\n`);

const PLANS = [
  {
    id: "uttala_plus",
    plan: "plus",
    name: "Uttala Plus",
    description: "60 analysed recordings a day, your own texts, rhythm and melody feedback, choice of voices.",
    month: 999,
    year: 7999,
  },
  {
    id: "uttala_pro",
    plan: "pro",
    name: "Uttala Pro",
    description: "Everything in Plus, sound-by-sound scoring and 250 analysed recordings a day.",
    month: 1999,
    year: 14999,
  },
];

const WEBHOOK_EVENTS = [
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
];

async function ensureProduct(p) {
  try {
    await stripe.products.retrieve(p.id);
    await stripe.products.update(p.id, { name: p.name, description: p.description, active: true });
    console.log(`product ${p.id}: updated`);
  } catch (err) {
    if (err?.code !== "resource_missing") throw err;
    await stripe.products.create({ id: p.id, name: p.name, description: p.description });
    console.log(`product ${p.id}: created`);
  }
}

async function ensurePrice(p, interval) {
  const lookup = `uttala_${p.plan}_${interval}ly`;
  const amount = p[interval];
  const existing = (await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 })).data[0];
  if (existing && existing.unit_amount === amount && existing.recurring?.interval === interval) {
    console.log(`price ${lookup}: ok (${existing.id})`);
    return existing.id;
  }
  // Prices are immutable: create a new one and move the lookup key to it.
  const price = await stripe.prices.create({
    product: p.id,
    currency: "usd",
    unit_amount: amount,
    recurring: { interval },
    lookup_key: lookup,
    transfer_lookup_key: true,
  });
  if (existing) await stripe.prices.update(existing.id, { active: false });
  console.log(`price ${lookup}: created (${price.id})${existing ? ", old price archived" : ""}`);
  return price.id;
}

const products = [];
for (const p of PLANS) {
  await ensureProduct(p);
  const prices = [await ensurePrice(p, "month"), await ensurePrice(p, "year")];
  products.push({ product: p.id, prices });
}

// Let subscribers switch plan, update their card and cancel by themselves.
const portalSettings = {
  business_profile: { headline: "Manage your Uttala subscription" },
  features: {
    customer_update: { enabled: true, allowed_updates: ["email", "address", "name"] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
      products,
    },
  },
};
const portals = await stripe.billingPortal.configurations.list({ limit: 100 });
const mine = portals.data.find((c) => c.metadata?.app === "uttala");
const portal = mine
  ? await stripe.billingPortal.configurations.update(mine.id, portalSettings)
  : await stripe.billingPortal.configurations.create({ ...portalSettings, metadata: { app: "uttala" } });
console.log(`billing portal: ${mine ? "updated" : "created"} (${portal.id})`);

const flag = process.argv.indexOf("--webhook");
let webhookSecret = null;
if (flag > -1) {
  const base = process.argv[flag + 1];
  if (!base?.startsWith("https://")) {
    console.error("\n--webhook needs your site's https:// address, e.g. --webhook https://uttala.example");
    process.exit(1);
  }
  const url = `${base.replace(/\/$/, "")}/api/stripe/webhook`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = endpoints.data.find((e) => e.url === url);
  if (existing) {
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: WEBHOOK_EVENTS });
    console.log(`webhook ${url}: events updated (signing secret unchanged; find it in the Stripe Dashboard)`);
  } else {
    const created = await stripe.webhookEndpoints.create({ url, enabled_events: WEBHOOK_EVENTS });
    webhookSecret = created.secret;
    console.log(`webhook ${url}: created`);
  }
}

console.log("\nAdd these to your environment:");
console.log(`STRIPE_PORTAL_CONFIGURATION=${portal.id}`);
if (webhookSecret) {
  console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}   <- shown only once; store it as a secret`);
} else if (flag === -1) {
  console.log("STRIPE_WEBHOOK_SECRET=…   from `stripe listen` locally, or re-run with --webhook https://your.site");
}
