import type { Frame, Page } from "@playwright/test";
import Stripe from "stripe";
// Plain Playwright test: the shared fixture's fake X-Forwarded-For would also be sent to Stripe, which blocks it.
import { expect, test } from "@playwright/test";
import { finishOnboarding, PASSWORD, signUp } from "../helpers";
import { readDotenv } from "../live/env";

/**
 * Real Stripe test mode, end to end: hosted Checkout (card 4242) → trial on Plus via the real webhook →
 * billing portal opens → switch to Pro and cancel (Stripe API, as the portal would) → the app follows each
 * webhook → deleting the account deletes the Stripe customer.
 */
const stripe = new Stripe(readDotenv().STRIPE_SECRET_KEY ?? "");

/** Reload /account until the text appears: webhooks arrive a moment after the redirect. */
async function expectOnAccount(page: Page, text: RegExp) {
  await expect(async () => {
    await page.goto("/account");
    await expect(page.locator("main")).toContainText(text, { timeout: 3_000 });
  }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 3_000] });
}

async function payOnHostedCheckout(page: Page) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await expect(page.locator("body")).toContainText(/7 days free/);
  // Hosted Checkout renders the form in an iframe; find the frame that holds the card field.
  let form: Frame | undefined;
  await expect(async () => {
    for (const f of page.frames()) {
      if (await f.getByRole("textbox", { name: "Card number" }).count()) form = f;
    }
    expect(form).toBeTruthy();
  }).toPass({ timeout: 30_000 });
  const f = form!;
  await f.getByRole("textbox", { name: "Card number" }).fill("4242 4242 4242 4242");
  await f.getByRole("textbox", { name: /Expiration/ }).fill("12 / 34");
  await f.getByRole("textbox", { name: "Security code" }).fill("123");
  await f.getByRole("textbox", { name: "Name on card" }).fill("Test Learner");
  const postal = f.getByRole("textbox", { name: /Postal|ZIP/i });
  if (await postal.count()) await postal.first().fill("11122");
  await f.getByRole("button", { name: /Start trial|Subscribe/ }).click();
}

test("real Stripe: trial checkout, portal, plan switch, cancel, delete", async ({ page }) => {
  const email = `sayclear-e2e-${Date.now()}@example.com`;
  await signUp(page, { email });
  await finishOnboarding(page);

  await page.goto("/account");
  await page.getByRole("button", { name: /Try Plus free for 7 days/ }).click();
  await payOnHostedCheckout(page);
  await page.waitForURL(/\/account\?checkout=success/, { timeout: 90_000 });
  await expectOnAccount(page, /Plus plan/);
  await expect(page.locator("main")).toContainText(/Free trial\. Your first payment is on/);

  // The real subscription: trialing on the Plus monthly price, card on file.
  const customer = (await stripe.customers.list({ email, limit: 1 })).data[0];
  expect(customer, "Stripe customer for the learner").toBeTruthy();
  const sub = (await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 1 })).data[0];
  expect(sub.status).toBe("trialing");
  expect(sub.items.data[0].price.lookup_key).toBe("sayclear_plus_monthly");
  expect(sub.default_payment_method ?? customer.invoice_settings.default_payment_method).toBeTruthy();

  // A trial is once per person: the app no longer offers one.
  const me = await (await page.request.get("/api/me")).json();
  expect(me.trialAvailable).toBe(false);

  // Billing portal opens on Stripe for this customer.
  await page.getByRole("button", { name: /Manage billing/ }).click();
  await page.waitForURL(/billing\.stripe\.com/, { timeout: 60_000 });
  await expect(page.locator("body")).toContainText(/SayClear Plus/, { timeout: 30_000 });

  // Switch to Pro, then cancel at period end, as the portal does; the app follows the webhooks.
  const pro = (await stripe.prices.list({ lookup_keys: ["sayclear_pro_monthly"], active: true, limit: 1 })).data[0];
  await stripe.subscriptions.update(sub.id, {
    items: [{ id: sub.items.data[0].id, price: pro.id }],
    proration_behavior: "none",
  });
  await expectOnAccount(page, /Pro plan/);
  await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
  await expectOnAccount(page, /Cancelled\. You keep Pro until/);

  // Deleting the account deletes the Stripe customer too.
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByLabel(/Confirm with your password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Delete everything" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  const gone = await stripe.customers.retrieve(customer.id);
  expect(gone.deleted).toBe(true);
});
