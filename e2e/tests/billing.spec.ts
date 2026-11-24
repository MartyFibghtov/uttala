import { expect, test } from "../fixtures";
import { signUpAndOnboard } from "../helpers";

test.describe.configure({ mode: "serial" });

test("upgrade to Plus (trial), unlock Plus features, switch plan and cancel in the portal, delete account", async ({ page }) => {
  const { email } = await signUpAndOnboard(page);

  // Free: own text locked.
  expect((await page.request.post("/api/tts", { data: { text: "My very own unusual sentence here.", lang: "en" } })).status()).toBe(403);

  await page.goto("/account");
  await page.getByRole("button", { name: /Try Plus free for 7 days/ }).click();
  await page.waitForURL(/__mock\/checkout/);
  await expect(page.locator("#plan")).toContainText(/sayclear_plus_/);
  await expect(page.locator("body")).toContainText(/7-day free trial/);
  await page.getByRole("button", { name: "Pay" }).click();
  await page.waitForURL(/\/account\?checkout=success/);

  await expect(page.getByRole("main").getByText("Plus plan")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("body")).toContainText(/Free trial\. Your first payment is on/);
  await expect(page.locator("body")).toContainText(/of 60/);

  // Plus feature unlocked: own text reference voice, with a custom text.
  const tts = await page.request.post("/api/tts", { data: { text: "My very own unusual sentence here.", lang: "en" } });
  expect(tts.status()).toBe(200);
  const j = await tts.json();
  expect(j.audio.length).toBeGreaterThan(100);

  // Portal: switch to Pro, then cancel.
  await page.getByRole("button", { name: /Manage billing/ }).click();
  await page.waitForURL(/__mock\/portal/);
  await page.getByRole("button", { name: "Switch to Pro" }).click();
  await page.waitForURL(/\/account/);
  await expect(page.getByRole("main").getByText("Pro plan")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /Manage billing/ }).click();
  await page.getByRole("button", { name: "Cancel plan" }).click();
  await page.waitForURL(/\/account/);
  await expect(page.locator("body")).toContainText(/Cancelled\. You keep Pro until/, { timeout: 20_000 });

  // Delete account (also deletes the Stripe customer).
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByLabel(/Confirm with your password/).fill("correct-horse-battery-1");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in/);

  // The account is gone: signing in fails.
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill("correct-horse-battery-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("public /pricing starts checkout for a signed-in user; signed out still goes to sign-up", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("link", { name: /Try Plus free for 7 days/ })).toHaveAttribute("href", "/sign-up");
  await signUpAndOnboard(page);
  await page.goto("/pricing");
  const req = page.waitForRequest((r) => r.url().endsWith("/api/billing/checkout") && r.method() === "POST");
  await page.getByRole("button", { name: /Try Plus free for 7 days/ }).click();
  const body = (await req).postDataJSON();
  expect(body).toMatchObject({ plan: "plus" });
  await page.waitForURL(/__mock\/checkout/);
});

test("free user without subscription deletes account", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/account");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByLabel(/Confirm with your password/).fill("correct-horse-battery-1");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await page.waitForURL((u) => u.pathname === "/");
});
